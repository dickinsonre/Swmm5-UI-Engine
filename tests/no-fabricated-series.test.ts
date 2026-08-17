/**
 * A .rpt report is a text SUMMARY: it carries peak/total maxima and continuity
 * errors, but NOT a per-time-step series. Earlier code synthesised a plausible
 * hydrograph (a fixed 96 reporting periods with exponential/sinusoidal shapes
 * scaled to the summary maxima) whenever no binary .out was available, feeding
 * users invented numbers dressed up as engine output.
 *
 * This suite pins the invariant on OBSERVABLE BEHAVIOUR: results built from
 * report text alone must expose NO time series, must not invent a reporting
 * period count, and any summary value present must be traceable to a number
 * actually printed in the .rpt. It then asserts the positive case — a real
 * .out yields a populated series — so the guard can't pass trivially by never
 * producing time steps at all.
 *
 * Run: npx tsx tests/no-fabricated-series.test.ts
 */

import { readFileSync } from 'node:fs';
import { parseRptToResults } from '../client/src/lib/swmm-engine';
import { parseSwmmOut } from '../client/src/lib/swmm-out-parser';
import { parseInpFile } from '../client/src/lib/inp-parser';
import { extractContinuityErrors } from '../client/src/lib/sim-time';

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) < tol;

// A realistic SWMM 5.2 report fixture: summary maxima + continuity errors,
// but (like every real .rpt) NO per-time-step table.
const rptText = readFileSync('tests/fixtures/batch-swmm5.rpt', 'utf8');
// Minimal project — the report-only path only reads FLOW_ROUTING from options.
const project = parseInpFile('[TITLE]\nreport-only fixture\n');

// ---------------------------------------------------------------------------
console.log('\nreport text alone — summary only, no fabricated series');
{
  const results = parseRptToResults(rptText, project);

  // The core invariant: NO time series is produced from report text.
  check('timeSteps is empty', results.timeSteps.length === 0, results.timeSteps.length);
  check('summary.reportingSteps is 0 (no invented period count)',
    results.summary.reportingSteps === 0, results.summary.reportingSteps);
  check('summary.totalDuration is 0 (no invented span)',
    results.summary.totalDuration === 0, results.summary.totalDuration);
  check('no loadedReportingSteps claimed', !results.loadedReportingSteps, results.loadedReportingSteps);
  check('no actualReportingSteps claimed', !results.actualReportingSteps, results.actualReportingSteps);

  // The specific historical failure mode: a fixed 96-period series scaled to
  // the summary maxima. Assert it can NEVER reappear.
  check('reportingSteps is NOT the historical fabricated 96',
    results.summary.reportingSteps !== 96, results.summary.reportingSteps);
  check('timeSteps.length is NOT the historical fabricated 96',
    results.timeSteps.length !== 96, results.timeSteps.length);

  // Fidelity is flagged so the UI can gate time-series features.
  check("fidelity is 'report-summary'", results.fidelity === 'report-summary', results.fidelity);

  // The raw report is carried through verbatim (real data, not derived).
  check('reportContent is the exact report text', results.reportContent === rptText);
}

// ---------------------------------------------------------------------------
console.log('\nsummary values are traceable to numbers printed in the report');
{
  const results = parseRptToResults(rptText, project);
  // Independently re-extract the continuity errors from the raw report and
  // require the results to match — no value may be invented.
  const printed = extractContinuityErrors(rptText);
  check('report actually prints a runoff continuity error', printed.runoff != null, printed.runoff);
  check('report actually prints a flow continuity error', printed.flow != null, printed.flow);

  check('summary runoff CE traces to the printed value',
    near(results.summary.continuityErrors.runoff, printed.runoff ?? NaN),
    { got: results.summary.continuityErrors.runoff, printed: printed.runoff });
  check('summary flow CE traces to the printed value',
    near(results.summary.continuityErrors.flow, printed.flow ?? NaN),
    { got: results.summary.continuityErrors.flow, printed: printed.flow });

  // The printed values must literally appear in the report body (traceability).
  check('runoff CE string is present verbatim in the report',
    rptText.includes(String(printed.runoff)), printed.runoff);
  check('flow CE string is present verbatim in the report',
    rptText.includes(String(printed.flow)), printed.flow);

  // A value the report never mentions must not be conjured.
  check('quality CE defaults to 0 (report has no WQ section)',
    results.summary.continuityErrors.quality === 0, results.summary.continuityErrors.quality);
}

// ---------------------------------------------------------------------------
console.log('\nno time-step object is manufactured for the model network');
{
  // Give the report-only path a project WITH network objects. Fabricating code
  // used to build per-node / per-link entries for every element; the summary
  // path must not, regardless of how many objects the model has.
  const inp = [
    '[TITLE]', 'network fixture', '',
    '[JUNCTIONS]', ';;Name Elev MaxDepth', 'J1 100 6', 'J2 99 6', '',
    '[OUTFALLS]', 'O1 90 FREE', '',
    '[CONDUITS]', ';;Name From To Len N', 'C1 J1 J2 400 0.01', 'C2 J2 O1 400 0.01', '',
    '[SUBCATCHMENTS]', 'S1 RG1 J1 2.0 50 400 0.5 0', '',
  ].join('\n');
  const netProject = parseInpFile(inp);
  const results = parseRptToResults(rptText, netProject);
  check('non-empty model still yields zero time steps', results.timeSteps.length === 0, results.timeSteps.length);
  check('non-empty model still reports 0 reporting steps', results.summary.reportingSteps === 0);
}

// ---------------------------------------------------------------------------
console.log('\npositive case — a real binary .out DOES populate the series');
{
  // Guard against a trivially-passing test: when genuine engine output exists,
  // the time series must be present and non-empty.
  const outPath = 'swmm-engine/Stormwater-Management-Model-5.2.4/tests/outfile/data/Example1.out';
  const inpPath = 'client/public/samples/User1.inp';
  const outBytes = readFileSync(outPath);
  const outProject = parseInpFile(readFileSync(inpPath, 'utf8'));

  const buf = outBytes.buffer.slice(outBytes.byteOffset, outBytes.byteOffset + outBytes.byteLength);
  const results = parseSwmmOut(buf as ArrayBuffer, outProject);

  check('binary .out yields a NON-empty time series', results.timeSteps.length > 0, results.timeSteps.length);
  check('reportingSteps equals the loaded series length',
    results.summary.reportingSteps === results.timeSteps.length,
    { reportingSteps: results.summary.reportingSteps, len: results.timeSteps.length });
  check('binary series has a real span (totalDuration > 0)', results.summary.totalDuration > 0, results.summary.totalDuration);
  // Each loaded period carries a real per-object snapshot (not an empty stub).
  const first = results.timeSteps[0];
  check('binary time step carries node/link/subcatch snapshots',
    !!first && (Object.keys(first.nodes).length + Object.keys(first.links).length + Object.keys(first.subcatchments).length) > 0,
    first ? { nodes: Object.keys(first.nodes).length, links: Object.keys(first.links).length } : null);

  // Sanity: this proves the empty-series assertions above weren't vacuous —
  // the same shape CAN carry a populated series when real data exists.
  check('report-only vs binary differ in series population',
    parseRptToResults(rptText, project).timeSteps.length === 0 && results.timeSteps.length > 0);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
