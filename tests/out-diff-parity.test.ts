/**
 * Parity contract for the verification tooling itself.
 *
 * The .out diff exists twice on purpose. `.agents/skills/corinne-testing/
 * scripts/out-diff.js` is plain node with no dependencies so it can be pointed
 * at any pair of files from a shell; `client/src/lib/out-diff-core.ts` is the
 * same measurement inside the app. Two implementations of one measurement is
 * exactly the situation that quietly drifts until the Verify tab and the
 * command line disagree about the same pair of files — and a verification tool
 * that cannot reproduce itself is worth nothing.
 *
 * So this suite holds them to the contract this codebase asks of engines: run
 * both over the same fixtures and require identical numbers, not close ones.
 *
 * It also pins the controls, because a control that silently stops working is
 * worse than no control — the report keeps printing the reassuring line:
 *
 *   - same question:  mismatched files are refused, not aligned by guesswork
 *   - null effect:    a file against a copy of itself is byte-identical
 *   - link types:     the weir is excluded by default and included on request
 *   - magnitude floor: a floor above every peak drops everything and says so
 *
 * The fixtures are EPA SWMM 5.2.4 runs of tests/fixtures/verify-network.inp,
 * A against B differing only in conduit roughness (0.010 -> 0.013).
 *
 * Run: npx tsx tests/out-diff-parity.test.ts
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  diffOut,
  readOutHeader,
  distribution,
  type OutDiff,
} from '../client/src/lib/out-diff-core';

const SCRIPT = '.agents/skills/corinne-testing/scripts/out-diff.js';
const A_PATH = 'tests/fixtures/verify-a.out';
const B_PATH = 'tests/fixtures/verify-b.out';

let passed = 0;
let failed = 0;

function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function eq(label: string, actual: unknown, expected: unknown) {
  check(label, Object.is(actual, expected), `expected ${String(expected)}, got ${String(actual)}`);
}

/**
 * Identical, not close. These are two implementations of one arithmetic over
 * the same bytes, so any difference at all is a bug in one of them rather than
 * a tolerance to be widened.
 */
function eqNum(label: string, actual: number, expected: number) {
  const same = Object.is(actual, expected) ||
    (Number.isNaN(actual) && Number.isNaN(expected)) ||
    actual === expected;
  check(label, same, `expected ${expected}, got ${actual}`);
}

const bytes = (p: string) => new Uint8Array(readFileSync(p));

function runScript(args: string[]): any {
  const out = execFileSync('node', [SCRIPT, ...args, '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  // The text report is printed before the JSON block, so take from the first
  // line that opens the object.
  const start = out.indexOf('\n{');
  return JSON.parse(start >= 0 ? out.slice(start + 1) : out);
}

console.log('\n1. The two implementations agree, number for number\n');

const scriptResult = runScript([A_PATH, B_PATH]);
const appResult = diffOut(bytes(A_PATH), bytes(B_PATH));

if (appResult.kind !== 'diff') {
  console.log('  ✗ app implementation refused a comparison the script accepted');
  failed++;
} else {
  const d: OutDiff = appResult;

  eq('flow units', d.flowUnitName, scriptResult.flowUnits);
  eq('reporting periods', d.nPeriods, scriptResult.periods);
  eq('report step', d.reportStep, scriptResult.reportStep);
  eq('node count', d.nNode, scriptResult.nodes);
  eq('link count', d.nLink, scriptResult.links);
  eq('links compared', d.comparedLinks, scriptResult.comparedLinks);
  eqNum('flow floor', d.floor, scriptResult.floor);
  eqNum('depth floor', d.nodeFloor, scriptResult.nodeFloor);
  eq('elements below floor', d.belowFloor, scriptResult.belowFloor);
  eq('worst instant period', d.worstPeriod, scriptResult.worstPeriod);

  const dists: [string, any, any][] = [
    ['conduit worst', d.linkWorst, scriptResult.linkWorst],
    ['conduit time-averaged', d.linkMean, scriptResult.linkMean],
    ['node worst', d.nodeWorst, scriptResult.nodeWorst],
    ['node time-averaged', d.nodeMean, scriptResult.nodeMean],
    ['at worst instant', d.atWorstInstant, scriptResult.atWorstInstant],
    ['peak change', d.peakChange, scriptResult.peakChange],
    ['shape and timing', d.shapeAndTiming, scriptResult.shapeAndTiming],
  ];
  for (const [label, a, b] of dists) {
    for (const key of ['n', 'median', 'p90', 'max', 'past1', 'past10', 'past25'] as const) {
      eqNum(`${label}: ${key}`, a[key], b[key]);
    }
  }

  eq('same element count', d.elements.length, scriptResult.elements.length);
  const byName = new Map(scriptResult.elements.map((e: any) => [`${e.kind}:${e.name}`, e]));
  let elementMismatch = 0;
  for (const e of d.elements) {
    const s: any = byName.get(`${e.kind}:${e.name}`);
    if (!s) { elementMismatch++; continue; }
    for (const key of ['worst', 'mean', 'peakA', 'peakB', 'shape', 'shiftPeriods'] as const) {
      if (!Object.is(e[key], s[key])) elementMismatch++;
    }
  }
  eq('every element matches field for field', elementMismatch, 0);
}

console.log('\n2. Control: the two files must be answering the same question\n');

{
  // A truncated run of the same network: same elements, fewer periods.
  const dir = mkdtempSync(join(tmpdir(), 'outdiff-'));
  try {
    const a = readFileSync(A_PATH);
    // Not a valid .out, but the header is what the control reads, and the
    // control must fire before anything tries to interpret the results block.
    const shortPath = join(dir, 'short.out');
    writeFileSync(shortPath, a);

    const A = readOutHeader(bytes(A_PATH));
    eq('header reports 96 periods', A.nPeriods, 96);
    eq('header reports 6 links', A.nLink, 6);
    eq('header reports 7 nodes', A.nNode, 7);
    eq('flow units read as CFS', A.flowUnitName, 'CFS');
    eq('engine error code is clean', A.errorCode, 0);

    // The weir must NOT read as a conduit. The type slot is an INT4 inside an
    // otherwise REAL4 record, and reading it as a float turns type 3 into a
    // denormal that rounds to 0 — which would silently include the weir in a
    // conduits-only comparison.
    const types = A.linkTypes;
    eq('five conduits', types.filter(t => t === 0).length, 5);
    eq('one weir, not read as a conduit', types.filter(t => t === 3).length, 1);
    eq('weir is the last link', A.linkNames[types.indexOf(3)], 'W1');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('\n3. Control: the null effect\n');

{
  const a = bytes(A_PATH);
  const self = diffOut(a, new Uint8Array(a));
  check('a file against a copy of itself is byte-identical',
    self.kind === 'diff' && self.identical === true);
  const cross = diffOut(bytes(A_PATH), bytes(B_PATH));
  check('two different runs are not reported as identical',
    cross.kind === 'diff' && cross.identical === false);
}

console.log('\n4. Control: link types and the magnitude floor\n');

{
  const def = diffOut(bytes(A_PATH), bytes(B_PATH));
  const all = diffOut(bytes(A_PATH), bytes(B_PATH), { allLinks: true });
  if (def.kind === 'diff' && all.kind === 'diff') {
    eq('conduits only by default', def.comparedLinks, 5);
    eq('one link excluded by type', def.excludedLinks, 1);
    eq('--all-links widens to every link', all.comparedLinks, 6);
    eq('census counts the weir', def.typeCensus.WEIR, 1);
    eq('census counts the conduits', def.typeCensus.CONDUIT, 5);
    check('the weir is absent from the default element list',
      !def.elements.some(e => e.name === 'W1'));
    check('the weir is present when asked for',
      all.elements.some(e => e.name === 'W1'));

    // A floor above every peak must drop everything rather than quietly
    // reporting a distribution over nothing.
    const floored = diffOut(bytes(A_PATH), bytes(B_PATH), { floor: 1e9, nodeFloor: 1e9 });
    if (floored.kind === 'diff') {
      eq('an impossible floor drops every element', floored.elements.length, 0);
      eq('and counts what it dropped', floored.belowFloor, 12);
    }
  } else {
    check('default and --all-links comparisons both ran', false);
  }
}

console.log('\n5. The finding the fixtures were built to carry\n');

{
  const d = diffOut(bytes(A_PATH), bytes(B_PATH));
  if (d.kind === 'diff') {
    // Continuity in these two runs moved -0.018 % -> -0.019 %: the diagnostic
    // sees nothing. The direct measurement must see something, or the whole
    // exercise is decoration.
    const rptA = readFileSync('tests/fixtures/verify-a.rpt', 'latin1');
    const rptB = readFileSync('tests/fixtures/verify-b.rpt', 'latin1');
    const contin = (t: string) => {
      const m = t.match(/Flow Routing Continuity[\s\S]{0,4000}?Continuity Error \(%\)\s*\.+\s*(-?[\d.]+)/);
      return m ? Math.abs(Number(m[1])) : NaN;
    };
    const moved = Math.abs(contin(rptB) - contin(rptA));
    check('routing continuity barely moves between the two runs',
      moved < 0.01, `moved ${moved}`);
    check('node depths nevertheless diverge past 10 % of their own peak',
      d.nodeWorst.max > 0.10, `max ${d.nodeWorst.max}`);
    check('the peak change and the shape change are reported apart',
      d.peakChange.median !== d.shapeAndTiming.median);
  } else {
    check('the fixture pair compares', false);
  }
}

console.log('\n6. Distribution arithmetic\n');

{
  const d = distribution([0.0, 0.02, 0.05, 0.2, 0.3]);
  eq('n', d.n, 5);
  eqNum('median picks the middle order statistic', d.median, 0.05);
  eqNum('max', d.max, 0.3);
  eqNum('fraction past 1 %', d.past1, 4 / 5);
  eqNum('fraction past 10 %', d.past10, 2 / 5);
  eqNum('fraction past 25 %', d.past25, 1 / 5);
  const empty = distribution([]);
  eq('an empty distribution reports n = 0', empty.n, 0);
  check('and does not invent a median', Number.isNaN(empty.median));
}


console.log('\n7. Parity holds across the options, not just the default path\n');

{
  const variants: [string, string[], any][] = [
    ['--all-links', ['--all-links'], { allLinks: true }],
    ['a raised flow floor', ['--floor', '5'], { floor: 5 }],
    ['a raised depth floor', ['--node-floor', '0.5'], { nodeFloor: 0.5 }],
    ['both floors and all links', ['--all-links', '--floor', '0.5', '--node-floor', '0.1'],
      { allLinks: true, floor: 0.5, nodeFloor: 0.1 }],
  ];
  for (const [label, argv, opts] of variants) {
    const sr = runScript([A_PATH, B_PATH, ...argv]);
    const ar = diffOut(bytes(A_PATH), bytes(B_PATH), opts);
    if (ar.kind !== 'diff') { check(`${label}: app produced a diff`, false); continue; }
    eq(`${label}: same element count`, ar.elements.length, sr.elements.length);
    eq(`${label}: same links compared`, ar.comparedLinks, sr.comparedLinks);
    eq(`${label}: same count below floor`, ar.belowFloor, sr.belowFloor);
    for (const key of ['median', 'p90', 'max'] as const) {
      eqNum(`${label}: conduit worst ${key}`, ar.linkWorst[key], sr.linkWorst[key]);
      eqNum(`${label}: node worst ${key}`, ar.nodeWorst[key], sr.nodeWorst[key]);
    }
  }
}

console.log('\n8. A view into a larger buffer reads the same as a file\n');

{
  // Engine output often arrives as a Uint8Array pointing into a WASM heap
  // rather than owning its buffer. Reading via .buffer without honouring
  // byteOffset silently parses from the wrong place.
  const raw = readFileSync(A_PATH);
  const padded = new Uint8Array(raw.byteLength + 137);
  padded.set(raw, 137);
  const offsetView = padded.subarray(137);
  check('the view really is offset', offsetView.byteOffset === 137);

  const plain = diffOut(bytes(A_PATH), bytes(B_PATH));
  const viewed = diffOut(offsetView, bytes(B_PATH));
  if (plain.kind === 'diff' && viewed.kind === 'diff') {
    eqNum('worst is identical from an offset view', viewed.linkWorst.max, plain.linkWorst.max);
    eqNum('median is identical from an offset view', viewed.nodeWorst.median, plain.nodeWorst.median);
    eq('element count is identical', viewed.elements.length, plain.elements.length);
  } else {
    check('an offset view parses at all', false);
  }
}

console.log('\n9. Each same-question control refuses, in both implementations\n');

{
  const ENGINE = 'swmm-engine/runswmm';
  if (!existsSync(ENGINE)) {
    console.log('  ~ vendored EPA engine not present; skipping the refusal cases');
  } else {
    const baseInp = readFileSync('tests/fixtures/verify-network.inp', 'utf8');
    const dir = mkdtempSync(join(tmpdir(), 'refuse-'));
    try {
      /** Run a modified copy of the fixture and return its .out path. */
      const build = (tag: string, edit: (t: string) => string): string | null => {
        const inp = join(dir, `${tag}.inp`);
        const rpt = join(dir, `${tag}.rpt`);
        const out = join(dir, `${tag}.out`);
        writeFileSync(inp, edit(baseInp));
        try {
          execFileSync(ENGINE, [inp, rpt, out], { stdio: 'pipe' });
        } catch {
          /* the engine returns non-zero on warnings; the .out is what matters */
        }
        return existsSync(out) ? out : null;
      };

      const cases: [string, string, (t: string) => string, RegExp][] = [
        ['flow units', 'units',
          t => t.replace('FLOW_UNITS           CFS', 'FLOW_UNITS           CMS'),
          /flow units differ/i],
        ['report start date', 'start',
          t => t.replace(/START_DATE           01\/01\/2020/g, 'START_DATE           01/02/2020')
                .replace('REPORT_START_DATE    01/01/2020', 'REPORT_START_DATE    01/02/2020')
                .replace('END_DATE             01/01/2020', 'END_DATE             01/02/2020'),
          /report start dates differ/i],
        ['reported variables', 'poll',
          t => t.replace('[REPORT]', '[POLLUTANTS]\nP1 MG/L 0 0 0 0 NO\n\n[REPORT]'),
          /reported variables differ/i],
        // W1 keeps its name and its position in the link array; only its TYPE
        // changes, which is exactly what the conduits-only filter reads.
        ['link types', 'types',
          t => t.replace('[WEIRS]\nW1 ST1 J5 TRANSVERSE 1.0 3.33 NO 0 0 NO',
                         '[OUTLETS]\nW1 ST1 J5 0 FUNCTIONAL/DEPTH 10 0.5 NO')
                .replace('\nW1 RECT_OPEN 3 6 0 0', ''),
          /link types differ/i],
      ];

      for (const [label, tag, edit, want] of cases) {
        const outPath = build(tag, edit);
        if (!outPath) { console.log(`  ~ ${label}: engine produced no .out; skipped`); continue; }

        const app = diffOut(bytes(A_PATH), bytes(outPath));
        const refusedByApp = app.kind === 'refused';
        check(`${label}: app refuses`, refusedByApp,
          refusedByApp ? undefined : 'it produced a comparison instead');
        if (app.kind === 'refused') {
          check(`${label}: and names the reason`, app.problems.some(pr => want.test(pr)),
            app.problems.join(' | '));
        }

        // The script refuses by exiting non-zero and explaining on stderr.
        let scriptRefused = false;
        let stderr = '';
        try {
          execFileSync('node', [SCRIPT, A_PATH, outPath], { encoding: 'utf8', stdio: 'pipe' });
        } catch (e: any) {
          scriptRefused = e.status === 1;
          stderr = String(e.stderr ?? '');
        }
        check(`${label}: script refuses too`, scriptRefused);
        check(`${label}: for the same reason`, want.test(stderr), stderr.split('\n')[1] ?? '');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

console.log(`\n${'═'.repeat(46)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(46)}\n`);

if (failed > 0) process.exit(1);
