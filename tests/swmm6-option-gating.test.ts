/**
 * SWMM6-only [OPTIONS] must never ship as live lines in a SWMM5-target .inp.
 *
 * Stock EPA SWMM 5.2.4 dies with ERROR 205 on any of the SWMM6-only option
 * keywords (and on a handful of SWMM6-only VALUES for otherwise-valid keys:
 * FLOW_ROUTING FV, SURCHARGE_METHOD DYNAMIC_SLOT). So on a SWMM5 write the
 * writer carries them across as inert `;;SWMM6 KEY value` comments and emits a
 * SWMM5-legal fallback where the key itself is core. On a SWMM6 write they are
 * real option lines.
 *
 * The `;;SWMM6` carrier is structured data, NOT a user comment — the parser
 * must swallow it (so it isn't re-preserved and duplicated on the next save)
 * and recover it into project.swmm6Options. This suite pins:
 *   1. SWMM5 write: every SWMM6-only option appears ONLY as a `;;SWMM6` carrier,
 *      never as a live option line.
 *   2. SWMM6 write: those same options are real, live option lines.
 *   3. Round-trip stability: parse -> write -> parse -> write is idempotent —
 *      no growth/duplication of `;;SWMM6` markers, no loss of settings.
 *   4. A SWMM5 file that never had SWMM6 options gains none.
 *
 * The SWMM6-only key set is enumerated from the production single source of
 * truth (SWMM6_ONLY_OPTION_KEYS), so a newly added key is covered here for
 * free. The two value-based cases are pinned explicitly.
 *
 * Run: npx tsx tests/swmm6-option-gating.test.ts
 */

import {
  parseInpFile,
  projectToInp,
  SWMM6_ONLY_OPTION_KEYS,
} from '../client/src/lib/inp-parser';

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`, detail !== undefined ? JSON.stringify(detail) : ''); }
}

// The SWMM6-only surface = every keyword from the production set, plus the two
// keys that are SWMM5-legal but carry a SWMM6-only VALUE. Enumerating from
// SWMM6_ONLY_OPTION_KEYS means a newly added keyword is exercised automatically.
const KEY_ONLY = [...SWMM6_ONLY_OPTION_KEYS];
const VALUE_CASES: Array<{ key: string; value: string }> = [
  { key: 'FLOW_ROUTING', value: 'FV' },
  { key: 'SURCHARGE_METHOD', value: 'DYNAMIC_SLOT' },
];

// Give every keyword a distinct, non-empty value so we can assert none are lost.
const keyValue = (k: string, i: number): string => String(i + 1);

/** Every SWMM6-only option line, as it would look verbatim in a SWMM6 file. */
function buildSwmm6OptionLines(): string[] {
  const lines = KEY_ONLY.map((k, i) => `${k.padEnd(24)} ${keyValue(k, i)}`);
  for (const { key, value } of VALUE_CASES) lines.push(`${key.padEnd(24)} ${value}`);
  return lines;
}

function buildInp(optionLines: string[]): string {
  return [
    '[TITLE]',
    'swmm6 option gating fixture',
    '',
    '[OPTIONS]',
    'FLOW_UNITS           CFS',
    ...optionLines,
    '',
    '[JUNCTIONS]',
    ';;Name  Elev  MaxDepth  InitDepth  SurDepth  Aponded',
    'J1      0     0         0          0         0',
    '',
  ].join('\n');
}

const countMarkers = (inp: string): number => (inp.match(/^\s*;;SWMM6\b/gm) || []).length;

// A live option line for KEY (case-insensitive, at column 0, value follows).
const hasLiveOption = (inp: string, key: string): boolean =>
  new RegExp(`^${key}\\b`, 'im').test(inp);
// The same option carried as an inert ;;SWMM6 comment.
const hasCarrier = (inp: string, key: string): boolean =>
  new RegExp(`^\\s*;;SWMM6\\s+${key}\\b`, 'im').test(inp);

// ---------------------------------------------------------------------------
console.log('\nfixture sanity — the production set is non-trivial and recovered');
{
  check('SWMM6_ONLY_OPTION_KEYS is non-empty', KEY_ONLY.length > 0, KEY_ONLY.length);
  const project = parseInpFile(buildInp(buildSwmm6OptionLines()));

  // Every keyword landed in swmm6Options and was pulled out of live options...
  for (const k of KEY_ONLY) {
    check(`parser routed ${k} into swmm6Options`,
      project.swmm6Options[k.toUpperCase()] !== undefined && project.options[k.toUpperCase()] === undefined,
      { swmm6: project.swmm6Options[k.toUpperCase()], live: project.options[k.toUpperCase()] });
  }
  // FLOW_ROUTING is a core key: its FV intent is restored into live options.
  check('FLOW_ROUTING FV restored into live options', project.options['FLOW_ROUTING'] === 'FV', project.options['FLOW_ROUTING']);
  check('FLOW_ROUTING not left dangling in swmm6Options', project.swmm6Options['FLOW_ROUTING'] === undefined);
  // SURCHARGE_METHOD DYNAMIC_SLOT is a SWMM6-only value → carried, not live.
  check('SURCHARGE_METHOD DYNAMIC_SLOT routed into swmm6Options',
    (project.swmm6Options['SURCHARGE_METHOD'] || '').toUpperCase() === 'DYNAMIC_SLOT'
      && project.options['SURCHARGE_METHOD'] === undefined,
    { swmm6: project.swmm6Options['SURCHARGE_METHOD'], live: project.options['SURCHARGE_METHOD'] });
}

// ---------------------------------------------------------------------------
console.log('\n(1) SWMM5 write — carrier only, never a live line');
{
  const project = parseInpFile(buildInp(buildSwmm6OptionLines()));
  const swmm5 = projectToInp(project, 'swmm5');

  for (const k of KEY_ONLY) {
    check(`${k}: carried as ;;SWMM6, not live`, hasCarrier(swmm5, k) && !hasLiveOption(swmm5, k),
      { carrier: hasCarrier(swmm5, k), live: hasLiveOption(swmm5, k) });
  }
  // FLOW_ROUTING: live line must be a SWMM5-legal fallback (DYNWAVE), never FV,
  // with the FV intent parked in a carrier.
  check('FLOW_ROUTING downgraded to DYNWAVE on SWMM5', /^FLOW_ROUTING\s+DYNWAVE\b/im.test(swmm5), swmm5.match(/^FLOW_ROUTING.*/im)?.[0]);
  check('FLOW_ROUTING FV never a live line on SWMM5', !/^FLOW_ROUTING\s+FV\b/im.test(swmm5));
  check('FLOW_ROUTING FV carried as ;;SWMM6', /^\s*;;SWMM6\s+FLOW_ROUTING\s+FV\b/im.test(swmm5));
  // SURCHARGE_METHOD DYNAMIC_SLOT: carrier only, no live DYNAMIC_SLOT line.
  check('SURCHARGE_METHOD DYNAMIC_SLOT carried, not live',
    /^\s*;;SWMM6\s+SURCHARGE_METHOD\s+DYNAMIC_SLOT\b/im.test(swmm5)
      && !/^SURCHARGE_METHOD\s+DYNAMIC_SLOT\b/im.test(swmm5));
}

// ---------------------------------------------------------------------------
console.log('\n(2) SWMM6 write — real option lines, no carriers');
{
  const project = parseInpFile(buildInp(buildSwmm6OptionLines()));
  const swmm6 = projectToInp(project, 'swmm6');

  for (const k of KEY_ONLY) {
    check(`${k}: live option line on SWMM6, no carrier`, hasLiveOption(swmm6, k) && !hasCarrier(swmm6, k),
      { live: hasLiveOption(swmm6, k), carrier: hasCarrier(swmm6, k) });
  }
  check('FLOW_ROUTING FV is a live line on SWMM6', /^FLOW_ROUTING\s+FV\b/im.test(swmm6));
  check('SURCHARGE_METHOD DYNAMIC_SLOT is a live line on SWMM6', /^SURCHARGE_METHOD\s+DYNAMIC_SLOT\b/im.test(swmm6));
  check('SWMM6 write emits zero ;;SWMM6 carriers', countMarkers(swmm6) === 0, countMarkers(swmm6));
}

// ---------------------------------------------------------------------------
console.log('\n(3) round-trip stability — no marker growth, no setting loss');
{
  // The expected marker count on a SWMM5 write: one per key-only option, one
  // per value-case (FLOW_ROUTING FV + SURCHARGE_METHOD DYNAMIC_SLOT).
  const expectedMarkers = KEY_ONLY.length + VALUE_CASES.length;

  let inp = projectToInp(parseInpFile(buildInp(buildSwmm6OptionLines())), 'swmm5');
  const first = countMarkers(inp);
  check('SWMM5 write carries exactly one marker per SWMM6-only option',
    first === expectedMarkers, { first, expectedMarkers });

  // parse -> write -> parse -> write, several times. Markers must not grow and
  // the carrier block must stay byte-identical across saves.
  const counts: number[] = [first];
  const snapshots: string[] = [inp];
  for (let i = 0; i < 4; i++) {
    inp = projectToInp(parseInpFile(inp), 'swmm5');
    counts.push(countMarkers(inp));
    snapshots.push(inp);
  }
  check('marker count never grows across repeated saves',
    counts.every(c => c === expectedMarkers), counts);
  check('SWMM5 output is byte-idempotent after the first save',
    snapshots.slice(1).every(s => s === snapshots[1]), { stable: snapshots.slice(1).every(s => s === snapshots[1]) });

  // No settings lost: a final re-parse recovers every value we started with.
  const finalProject = parseInpFile(inp);
  for (let i = 0; i < KEY_ONLY.length; i++) {
    const k = KEY_ONLY[i].toUpperCase();
    check(`${KEY_ONLY[i]}: value survives round-trips`,
      (finalProject.swmm6Options[k] || '').trim() === keyValue(KEY_ONLY[i], i),
      { got: finalProject.swmm6Options[k], want: keyValue(KEY_ONLY[i], i) });
  }
  check('FLOW_ROUTING FV intent survives round-trips', finalProject.options['FLOW_ROUTING'] === 'FV', finalProject.options['FLOW_ROUTING']);
  check('SURCHARGE_METHOD DYNAMIC_SLOT survives round-trips',
    (finalProject.swmm6Options['SURCHARGE_METHOD'] || '').toUpperCase() === 'DYNAMIC_SLOT',
    finalProject.swmm6Options['SURCHARGE_METHOD']);
}

// ---------------------------------------------------------------------------
console.log('\n(4) a clean SWMM5 file gains no SWMM6 options');
{
  const clean = [
    '[TITLE]',
    'plain swmm5 model',
    '',
    '[OPTIONS]',
    'FLOW_UNITS           CFS',
    'FLOW_ROUTING         DYNWAVE',
    'SURCHARGE_METHOD     EXTRAN',
    '',
    '[JUNCTIONS]',
    'J1      0     0         0          0         0',
    '',
  ].join('\n');
  const project = parseInpFile(clean);
  check('clean file parses to zero swmm6Options', Object.keys(project.swmm6Options).length === 0, Object.keys(project.swmm6Options));

  const swmm5 = projectToInp(project, 'swmm5');
  check('clean SWMM5 write has zero ;;SWMM6 markers', countMarkers(swmm5) === 0, countMarkers(swmm5));
  check('clean file keeps its legal SURCHARGE_METHOD EXTRAN', /^SURCHARGE_METHOD\s+EXTRAN\b/im.test(swmm5));
  check('clean file keeps FLOW_ROUTING DYNWAVE', /^FLOW_ROUTING\s+DYNWAVE\b/im.test(swmm5));

  // And it stays clean across a round-trip.
  const round = projectToInp(parseInpFile(swmm5), 'swmm5');
  check('clean file stays marker-free after a round-trip', countMarkers(round) === 0, countMarkers(round));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
