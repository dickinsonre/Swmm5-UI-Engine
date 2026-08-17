/**
 * LID parity gate — automated, REAL engine regression gate.
 *
 * The patched SWMM5 WASM build (client/public/swmm_engine.*) writes ONE
 * consolidated `.lid` file covering every LID unit. An engine rebuild that
 * quietly changed LID math or output layout would leave that file looking
 * plausible while the numbers drift. This suite catches that by comparing the
 * REAL consolidated `.lid` the patched WASM engine produced against the STOCK
 * SWMM 5.2.4 engine's golden per-unit report files, value-for-value, via the
 * reused `checkLidParity` in scripts/parity-lid.cjs.
 *
 * Two DIFFERENT engines sit on the two sides of the comparison:
 *   - consolidated.lid  ← patched SWMM5 WASM (scripts/gen-lid-fixture.cjs)
 *   - bc_s1.txt, pp_s2.txt, gr_s3.txt, rb_s4.txt  ← stock native runswmm
 * so a PASS genuinely proves the patched engine still agrees with stock LID
 * results. (The previous version reconstructed the `.lid` from the same
 * goldens it compared against — self-fulfilling, could never detect drift.)
 *
 * The gate runs the CURRENT engine artifact live (~50ms) rather than trusting a
 * stored file, so it catches:
 *   - the patched WASM build changing LID math (values drift away from stock);
 *   - the patched WASM build changing consolidated .lid layout (columns /
 *     row keys) — parse/row-count mismatches;
 *   - a WASM rebuild landed WITHOUT regenerating the committed fixture — the
 *     live output stops being byte-identical to consolidated.lid;
 *   - stock-engine drift — it re-runs the native runswmm binary on the fixture
 *     and asserts its per-unit reports still match the committed goldens.
 *
 * Offline, deterministic, fast: nothing is rebuilt or downloaded. The committed
 * consolidated.lid is kept as provenance and a diagnostic baseline; regenerate
 * it with `node scripts/gen-lid-fixture.cjs` after an intentional engine
 * rebuild (see tests/fixtures/golden-lid/README.md).
 *
 * Run: npx tsx tests/lid-parity.test.ts
 */

import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { parseLidReport } from '../client/src/components/swmm/LidViewerDialog';

const require = createRequire(import.meta.url);
// The comparison logic under test — reused, not re-implemented.
const { checkLidParity, GOLDEN } = require('../scripts/parity-lid.cjs') as {
  checkLidParity: (opts: {
    lidText: string;
    readGolden: (name: string) => string;
    golden?: Record<string, string>;
    log?: (m: string) => void;
  }) => { pass: boolean; messages: string[] };
  GOLDEN: Record<string, string>;
};

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = join(HERE, 'fixtures', 'golden-lid');
const CONSOLIDATED_LID = join(GOLDEN_DIR, 'consolidated.lid');
const FIXTURE_INP = join(HERE, 'fixtures', 'lid_test.inp');
const STOCK_BIN = join(HERE, '..', 'swmm-engine', 'runswmm');

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const readGolden = (name: string) => readFileSync(join(GOLDEN_DIR, name), 'utf8');
const DATA_ROW = /^\s*\d{2}\/\d{2}\/\d{4}/;

function goldenDataRows(name: string): string[] {
  return readGolden(name).split('\n').filter((l) => DATA_ROW.test(l));
}

// ---------------------------------------------------------------------------
console.log('\nfixtures exist and are non-trivial');
{
  const files = readdirSync(GOLDEN_DIR);
  for (const file of Object.values(GOLDEN)) {
    check(`golden fixture present: ${file}`, files.includes(file));
    check(`golden fixture has data rows: ${file}`, goldenDataRows(file).length > 50, goldenDataRows(file).length);
  }
  check('parity map covers all four LID types (BC/PP/GR/RB)', Object.keys(GOLDEN).length === 4, Object.keys(GOLDEN));
  check('REAL consolidated .lid fixture present (from patched WASM)', files.includes('consolidated.lid'));
}

// ---------------------------------------------------------------------------
// THE PARITY GATE. Compare the REAL consolidated `.lid` written by the patched
// SWMM5 WASM engine against the stock engine's golden per-unit reports.
// ---------------------------------------------------------------------------
console.log('\nLIVE patched-WASM run matches stock per-unit goldens (PARITY GATE)');
// The gate runs the CURRENT engine artifact, so a WASM rebuild that changes
// LID math or layout fails here immediately — regenerating the committed
// fixture is not required for the gate to bite. The WASM run costs ~50ms.
const { runWasmAndGetLid } = require('../scripts/gen-lid-fixture.cjs') as {
  runWasmAndGetLid: (opts?: { quiet?: boolean }) => Promise<string>;
};
let liveLid = '';
try {
  liveLid = await runWasmAndGetLid({ quiet: true });
  check('live WASM run produced a consolidated .lid', liveLid.length > 1000, liveLid.length);
  const { pass: liveVerdict, messages: liveMessages } = checkLidParity({ lidText: liveLid, readGolden });
  check('LIVE engine output matches stock goldens', liveVerdict === true, liveMessages.filter((m) => m.startsWith('FAIL')));
  check('live run reports all four units identical',
    liveMessages.filter((m) => m.startsWith('OK ')).length === 4,
    liveMessages.filter((m) => m.startsWith('OK ')));
} catch (e) {
  check('live WASM run succeeded', false, String(e));
}

// ---------------------------------------------------------------------------
console.log('\ncommitted fixture still reflects the current engine');
const lidText = readFileSync(CONSOLIDATED_LID, 'utf8');
{
  // If these diverge the engine was rebuilt without regenerating the fixture.
  check('committed consolidated.lid is byte-identical to the live run',
    liveLid !== '' && liveLid === lidText,
    { live: liveLid.length, committed: lidText.length });
}

// ---------------------------------------------------------------------------
console.log('\ncommitted consolidated .lid matches stock per-unit goldens');
{
  check('consolidated.lid is non-trivial', lidText.length > 1000, lidText.length);
  check('consolidated.lid has a [RESULTS] section', lidText.includes('[RESULTS]'));
  const { pass: verdict, messages } = checkLidParity({ lidText, readGolden });
  check('parity verdict is PASS (patched WASM == stock)', verdict === true, messages);
  check('final message line is "PARITY: PASS"', messages[messages.length - 1] === 'PARITY: PASS', messages.slice(-1));
  check('every unit reported identical', messages.filter((m) => m.startsWith('OK ')).length === 4,
    messages.filter((m) => m.startsWith('OK ')));
  check('no FAIL lines emitted', messages.every((m) => !m.startsWith('FAIL')), messages.filter((m) => m.startsWith('FAIL')));
}

// ---------------------------------------------------------------------------
console.log('\nclient parseLidReport handles the REAL ONE-file consolidated shape');
{
  const report = parseLidReport(lidText);
  check('report parsed (not null)', report !== null);
  if (report) {
    check('all four units parsed', report.units.length === 4, report.units.map((u) => u.key));
    const bySub = new Map(report.units.map((u) => [u.subcatch, u]));
    check('S1/BC parsed', bySub.get('S1')?.lid === 'BC', bySub.get('S1'));
    check('S2/PP parsed', bySub.get('S2')?.lid === 'PP', bySub.get('S2'));
    check('S3/GR parsed', bySub.get('S3')?.lid === 'GR', bySub.get('S3'));
    check('S4/RB parsed', bySub.get('S4')?.lid === 'RB', bySub.get('S4'));

    // Row counts must match the goldens exactly (proves date/time in one column
    // did not get split into two, which would double the column offsets).
    for (const [key, file] of Object.entries(GOLDEN)) {
      const sub = key.split('\t')[0];
      const u = bySub.get(sub);
      const expected = goldenDataRows(file).length;
      check(`${sub}: row count matches golden (${expected})`, u?.t.length === expected, { got: u?.t.length, expected });
    }

    // Each unit carries all 12 report variables, and the values are the golden
    // values — spot-check the first BC row (inflow col, index 0 in vars).
    const bc = bySub.get('S1');
    check('unit exposes 12 variables', bc?.vars.length === 12, bc?.vars.length);
    const firstBcGolden = goldenDataRows('bc_s1.txt')[0].trim().split(/\s+/);
    // vars[0] = inflow = golden token index 3 (after date,time,hours)
    check('parsed inflow[0] equals golden value', bc?.vars[0][0] === parseFloat(firstBcGolden[3]),
      { parsed: bc?.vars[0][0], golden: firstBcGolden[3] });
    // last var (storLevel) = golden token index 14
    check('parsed storLevel[0] equals golden value', bc?.vars[11][0] === parseFloat(firstBcGolden[14]),
      { parsed: bc?.vars[11][0], golden: firstBcGolden[14] });
    check('elapsed hours parsed', bc?.t[0] === parseFloat(firstBcGolden[2]), { parsed: bc?.t[0], golden: firstBcGolden[2] });
  }
}

// ---------------------------------------------------------------------------
console.log('\nperturbed REAL .lid is reported as a FAILURE (gate cannot silently pass)');
{
  // Corrupt exactly one variable in one row of one unit of the REAL fixture.
  const perturbed = perturbOneValue(lidText);
  check('perturbation actually changed the text', perturbed !== lidText);
  const { pass: verdict, messages } = checkLidParity({ lidText: perturbed, readGolden });
  check('parity verdict is FAIL on perturbed input', verdict === false, messages.slice(-1));
  check('final message line is "PARITY: FAIL"', messages[messages.length - 1] === 'PARITY: FAIL', messages.slice(-1));
  check('a DIFF/FAIL line names the drifting unit', messages.some((m) => /DIFF|rows differ/.test(m)), messages);
}

// ---------------------------------------------------------------------------
console.log('\nmissing / truncated units are caught');
{
  // Drop every S2/PP row → row-count mismatch must FAIL, not pass on the rest.
  const withoutPP = lidText.split('\n').filter((l) => !l.startsWith('S2\tPP\t1\t')).join('\n');
  const { pass: verdict, messages } = checkLidParity({ lidText: withoutPP, readGolden });
  check('dropping a whole unit FAILS parity', verdict === false, messages.slice(-1));
  check('row-count mismatch is reported', messages.some((m) => /S2\/PP\/1: row count 0/.test(m)), messages);

  // An extra unexpected unit must also FAIL (ensure a row separator first —
  // the real fixture may not end in a trailing newline).
  const extra = lidText.replace(/\n?$/, '\n') +
    'S9\tXX\t1\t08/01/2026 01:00:00\t1.000\t' + '0.000\t'.repeat(11) + '0.000\n';
  const r2 = checkLidParity({ lidText: extra, readGolden });
  check('an unexpected extra unit FAILS parity', r2.pass === false, r2.messages.slice(-1));
  check('extra unit is named', r2.messages.some((m) => /unexpected unit/.test(m)), r2.messages);
}

// ---------------------------------------------------------------------------
// Bonus REAL gate: the stock native engine still reproduces the committed
// per-unit goldens byte-for-byte. This catches stock-engine drift (the
// reference side of the parity comparison) without any rebuild — runswmm
// completes in well under a second. Skipped only if the binary is absent.
// ---------------------------------------------------------------------------
console.log('\nstock native runswmm still reproduces the committed per-unit goldens');
if (!existsSync(STOCK_BIN)) {
  console.log(`  (skipped: stock engine not present at ${STOCK_BIN})`);
} else {
  const dir = mkdtempSync(join(tmpdir(), 'lid-parity-'));
  try {
    writeFileSync(join(dir, 'model.inp'), readFileSync(FIXTURE_INP, 'utf8'));
    let ran = false;
    try {
      execFileSync(STOCK_BIN, ['model.inp', 'model.rpt', 'model.out'], { cwd: dir, stdio: 'ignore' });
      ran = true;
    } catch {
      // NEVER trust the exit code — verify by the produced files below.
      ran = true;
    }
    check('stock engine invoked', ran);
    // The per-unit report file names come from the fixture's [LID_USAGE] RptFile
    // column; GOLDEN maps each unit key to that same filename.
    for (const [key, file] of Object.entries(GOLDEN)) {
      const label = key.replace(/\t/g, '/');
      const produced = join(dir, file);
      if (!existsSync(produced)) {
        check(`stock engine wrote ${file} (${label})`, false);
        continue;
      }
      const got = readFileSync(produced, 'utf8');
      const golden = readGolden(file);
      // Byte-for-byte match catches any stock-engine drift in LID output.
      check(`stock ${file} matches committed golden byte-for-byte (${label})`, got === golden,
        got === golden ? undefined : { producedBytes: got.length, goldenBytes: golden.length });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Helper: flip one value in the first PP data row so the checker must object.
function perturbOneValue(text: string): string {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('S2\tPP\t1\t')) {
      const cols = lines[i].split('\t');
      // cols[5] is the first variable (inflow). Add a clear, non-rounding delta.
      const v = parseFloat(cols[5]);
      cols[5] = (v + 99).toFixed(3);
      lines[i] = cols.join('\t');
      return lines.join('\n');
    }
  }
  return text;
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
