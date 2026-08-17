/**
 * .rpt report-parsing regression guard (task #82).
 *
 * The .rpt parsers feed summary numbers, continuity errors, engine insights and
 * critical-element lists into the UI. They must behave across SWMM5 (EPA 5.2.4)
 * and SWMM6 (OpenSWMM) report layouts, which differ. These tests pin the sharp
 * edges that have caused real bugs:
 *
 *   1. Section headings carry trailing column labels, so they must be matched
 *      startsWith-style ("Runoff Quantity Continuity     acre-feet   inches").
 *   2. The "****" underline row beneath a boxed heading must NOT terminate the
 *      section — parsing has to continue past it to the content rows.
 *   3. "Time-Step Critical Elements" mixes Node and Link rows in one list; both
 *      kinds must be picked up, and an empty list must not leak rows from the
 *      next section (a real cross-section leak bug fixed alongside this suite).
 *
 * Also covered: continuity-error extraction, routing time-step summary fields,
 * warning/error line collection, engine-version extraction, and graceful
 * handling of truncated/malformed reports (no crash, no invented values).
 *
 * Fixtures reuse the real SWMM5/SWMM6 reports in tests/fixtures where possible
 * (batch-swmm5.rpt / batch-swmm6.rpt, the same layouts scatter-compare uses),
 * plus a diagnostic-heavy dynamic-wave report for the populated element lists
 * the batch fixtures don't contain. Asserted values equal the numbers present
 * in the fixture text.
 *
 * Run: npx tsx tests/rpt-parsing.test.ts
 */

import fs from 'node:fs';
import { parseRptEngineMetrics } from '../client/src/lib/engine-insights';
import { extractContinuityErrors } from '../client/src/lib/sim-time';
import {
  parseReportMetrics, extractReportIssues, extractEngineVersion,
} from '../client/src/lib/batch-compare';
import { parseRptToResults } from '../client/src/lib/swmm-engine';
import { createEmptyProject } from '../client/src/lib/swmm-types';

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const near = (a: number | null | undefined, b: number, tol = 1e-9) =>
  a != null && Math.abs(a - b) < tol;

const RPT5 = fs.readFileSync('tests/fixtures/batch-swmm5.rpt', 'utf8');
const RPT6 = fs.readFileSync('tests/fixtures/batch-swmm6.rpt', 'utf8');

// A dynamic-wave report with POPULATED diagnostic lists. The batch fixtures run
// KINWAVE with clean models ("None"/"No errors."/"All links are stable."), so
// they cannot exercise the mixed Node+Link critical-element path or the
// continuity/nonconverging node lists. This layout follows the EPA SWMM 5.2
// report writer verbatim (boxed "****" headings, "Id (pct%)" element rows).
const RPT_DIAG = `
  EPA STORM WATER MANAGEMENT MODEL - VERSION 5.2 (Build 5.2.4)
  ------------------------------------------------------------

  Dynamic-wave diagnostics fixture
  WARNING 04: minimum elevation drop used for Conduit C7
  WARNING 02: maximum depth increased for Node J12

  ****************
  Analysis Options
  ****************
  Flow Units ............... CFS
  Flow Routing Method ...... DYNWAVE
  Variable Time Step ....... YES
  Routing Time Step ........ 30.00 sec

  **************************        Volume         Depth
  Runoff Quantity Continuity     acre-feet        inches
  **************************     ---------       -------
  Total Precipitation ......         5.120         3.400
  Surface Runoff ...........         3.870         2.570
  Continuity Error (%) .....        -0.512

  **************************        Volume        Volume
  Flow Routing Continuity        acre-feet      10^6 gal
  **************************     ---------     ---------
  Wet Weather Inflow .......         3.870         1.261
  External Outflow .........         3.640         1.186
  Flooding Loss ............         0.210         0.068
  Continuity Error (%) .....         2.315

  *************************
  Highest Continuity Errors
  *************************
  Node J12 (4.83%)
  Node J7 (2.11%)

  ***************************
  Time-Step Critical Elements
  ***************************
  Link C7 (35.42%)
  Node J12 (18.90%)
  Link C3 (6.25%)

  ********************************
  Highest Flow Instability Indexes
  ********************************
  Link C7 (122)
  Link C3 (41)

  *********************************
  Most Frequent Nonconverging Nodes
  *********************************
  Node J12 (12.40%)
  Node J7 (3.20%)

  *************************
  Routing Time Step Summary
  *************************
  Minimum Time Step           :     2.35 sec
  Average Time Step           :    18.72 sec
  Maximum Time Step           :    30.00 sec
  % of Time in Steady State   :     0.00
  Average Iterations per Step :     3.14
  % of Steps Not Converging   :     7.80

  *********************
  Node Flooding Summary
  *********************

  Flooding refers to all water that overflows a node, whether it ponds or not.
  --------------------------------------------------------------------------
                                                             Total   Maximum
  Flooding was detected at 2 nodes.

  Analysis begun on:  Mon Aug 10 21:04:50 2026
  Analysis ended on:  Mon Aug 10 21:05:12 2026
  Total elapsed time: 00:00:22
`;

// ---------------------------------------------------------------------------
console.log('\nSharp edge #1 — headings matched startsWith past trailing column labels');
{
  // The continuity heading lines in the fixtures carry unit labels
  // ("Runoff Quantity Continuity     acre-feet        inches"). If the parser
  // required exact equality it would find no block and report zero rows.
  const m5 = parseRptEngineMetrics(RPT5);
  const runoff = m5.continuity.find(c => c.key === 'runoff');
  const routing = m5.continuity.find(c => c.key === 'routing');
  check('SWMM5 runoff continuity block found despite trailing labels', !!runoff, m5.continuity.map(c => c.key));
  check('SWMM5 routing continuity block found', !!routing);
  check('SWMM5 runoff error % == fixture -0.114', near(runoff?.errorPct, -0.114), runoff?.errorPct);
  check('SWMM5 routing error % == fixture 0.072', near(routing?.errorPct, 0.072), routing?.errorPct);
}

// ---------------------------------------------------------------------------
console.log('\nSharp edge #2 — the "****" underline beneath a heading does not end the section');
{
  // In both layouts the heading is boxed: label row then a "****" underline,
  // THEN the content rows. Parsing must skip that underline and read the rows.
  const m5 = parseRptEngineMetrics(RPT5);
  const runoff = m5.continuity.find(c => c.key === 'runoff')!;
  const routing = m5.continuity.find(c => c.key === 'routing')!;
  // batch-swmm5.rpt: 5 runoff rows (Total Precip..Final Storage), 11 routing rows.
  check('SWMM5 runoff rows survived the underline (5 rows)', runoff.rows.length === 5, runoff.rows.length);
  check('SWMM5 first runoff row is Total Precipitation = 0.937 / 2.250',
    runoff.rows[0].label === 'Total Precipitation' && runoff.rows[0].v1 === '0.937' && runoff.rows[0].v2 === '2.250',
    runoff.rows[0]);
  check('SWMM5 routing rows survived the underline (11 rows)', routing.rows.length === 11, routing.rows.length);
  check('SWMM5 routing includes Flooding Loss row',
    routing.rows.some(r => r.label === 'Flooding Loss' && r.v1 === '0.000'), routing.rows);

  // Same guarantee on the SWMM6 layout (different engine banner / spacing).
  const m6 = parseRptEngineMetrics(RPT6);
  const runoff6 = m6.continuity.find(c => c.key === 'runoff')!;
  check('SWMM6 runoff rows survived the underline (5 rows)', runoff6.rows.length === 5, runoff6.rows.length);
  check('SWMM6 runoff error % == fixture -0.114', near(runoff6.errorPct, -0.114), runoff6.errorPct);
}

// ---------------------------------------------------------------------------
console.log('\nSharp edge #3 — critical-element list mixes Node and Link rows');
{
  const d = parseRptEngineMetrics(RPT_DIAG);
  const crit = d.timeStepCriticalElements;
  check('critical-elements list has 3 rows', crit.length === 3, crit);
  check('first critical element is Link C7 @ 35.42%',
    crit[0]?.kind === 'link' && crit[0]?.id === 'C7' && near(crit[0]?.pct, 35.42), crit[0]);
  check('second critical element is Node J12 @ 18.90% (Node row kept)',
    crit[1]?.kind === 'node' && crit[1]?.id === 'J12' && near(crit[1]?.pct, 18.90), crit[1]);
  check('third critical element is Link C3 @ 6.25%',
    crit[2]?.kind === 'link' && crit[2]?.id === 'C3' && near(crit[2]?.pct, 6.25), crit[2]);
  check('list contains BOTH a node and a link',
    crit.some(e => e.kind === 'node') && crit.some(e => e.kind === 'link'), crit.map(e => e.kind));
}

// ---------------------------------------------------------------------------
console.log('\nCross-section leak — empty list must not steal the next section\'s rows');
{
  // Regression: batch-swmm6.rpt has an empty "Time-Step Critical Elements"
  // ("None") immediately followed by "Highest Flow Instability Indexes" whose
  // "Link C1 (1)" row matches the same shape. The critical-element scan used to
  // run past the section boundary and report C1 as a critical element.
  const m6 = parseRptEngineMetrics(RPT6);
  check('SWMM6 empty critical-element list stays empty', m6.timeStepCriticalElements.length === 0, m6.timeStepCriticalElements);
  check('SWMM6 empty continuity-error node list stays empty', m6.highestContinuityNodes.length === 0, m6.highestContinuityNodes);
  check('SWMM6 empty nonconverging-node list stays empty', m6.nonconvergingNodes.length === 0, m6.nonconvergingNodes);
  // ...but the instability list in the same fixture IS populated and must still parse.
  check('SWMM6 instability link C1 still parsed', m6.instabilityLinks.length === 1 && m6.instabilityLinks[0].id === 'C1', m6.instabilityLinks);
  check('SWMM6 instability index == fixture 1', m6.instabilityLinks[0]?.index === 1, m6.instabilityLinks[0]);
}

// ---------------------------------------------------------------------------
console.log('\nDiagnostic element lists — populated node lists');
{
  const d = parseRptEngineMetrics(RPT_DIAG);
  check('highest continuity errors: 2 nodes', d.highestContinuityNodes.length === 2, d.highestContinuityNodes);
  check('worst continuity node J12 @ 4.83%',
    d.highestContinuityNodes[0]?.id === 'J12' && near(d.highestContinuityNodes[0]?.pct, 4.83), d.highestContinuityNodes[0]);
  check('nonconverging nodes: 2 nodes', d.nonconvergingNodes.length === 2, d.nonconvergingNodes);
  check('worst nonconverging node J12 @ 12.40%',
    d.nonconvergingNodes[0]?.id === 'J12' && near(d.nonconvergingNodes[0]?.pct, 12.40), d.nonconvergingNodes[0]);
  check('instability links: 2 links', d.instabilityLinks.length === 2, d.instabilityLinks);
  check('worst instability link C7 index 122',
    d.instabilityLinks[0]?.id === 'C7' && d.instabilityLinks[0]?.index === 122, d.instabilityLinks[0]);
}

// ---------------------------------------------------------------------------
console.log('\nRouting time-step summary fields');
{
  const m5 = parseRptEngineMetrics(RPT5);
  check('SWMM5 min step == 30.00 sec', near(m5.timeStep.minSec, 30), m5.timeStep.minSec);
  check('SWMM5 avg step == 30.00 sec', near(m5.timeStep.avgSec, 30), m5.timeStep.avgSec);
  check('SWMM5 max step == 30.00 sec', near(m5.timeStep.maxSec, 30), m5.timeStep.maxSec);
  check('SWMM5 avg iterations == 1.63', near(m5.timeStep.avgIterations, 1.63), m5.timeStep.avgIterations);
  check('SWMM5 % not converging == 0.00', near(m5.timeStep.pctNotConverging, 0), m5.timeStep.pctNotConverging);

  const d = parseRptEngineMetrics(RPT_DIAG);
  check('DYNWAVE min step == 2.35 sec', near(d.timeStep.minSec, 2.35), d.timeStep.minSec);
  check('DYNWAVE avg step == 18.72 sec', near(d.timeStep.avgSec, 18.72), d.timeStep.avgSec);
  check('DYNWAVE % not converging == 7.80', near(d.timeStep.pctNotConverging, 7.80), d.timeStep.pctNotConverging);
  check('DYNWAVE requested step read from Analysis Options == 30', near(d.timeStep.requestedSec, 30), d.timeStep.requestedSec);
  check('DYNWAVE variable step flag == true', d.timeStep.variableStep === true, d.timeStep.variableStep);

  // SWMM6 reports a Time-Step Frequencies table SWMM5 omits.
  const m6 = parseRptEngineMetrics(RPT6);
  check('SWMM6 parsed 5 timestep-frequency rows', m6.timeStep.frequencies.length === 5, m6.timeStep.frequencies.length);
  check('SWMM6 first frequency bucket == 100.00%', near(m6.timeStep.frequencies[0]?.pct, 100), m6.timeStep.frequencies[0]);
  check('SWMM5 has no frequency table', m5.timeStep.frequencies.length === 0, m5.timeStep.frequencies.length);
}

// ---------------------------------------------------------------------------
console.log('\nAnalysis options');
{
  const m5 = parseRptEngineMetrics(RPT5);
  const flowUnits = m5.analysisOptions.find(o => o.label.trim() === 'Flow Units');
  const routing = m5.analysisOptions.find(o => o.label.trim() === 'Flow Routing Method');
  check('SWMM5 analysis options parsed', m5.analysisOptions.length > 5, m5.analysisOptions.length);
  check('SWMM5 Flow Units == CFS', flowUnits?.value === 'CFS', flowUnits);
  check('SWMM5 Flow Routing Method == KINWAVE', routing?.value === 'KINWAVE', routing);
}

// ---------------------------------------------------------------------------
console.log('\nContinuity-error extraction (sim-time helper feeding the summary)');
{
  const ce5 = extractContinuityErrors(RPT5);
  check('SWMM5 runoff CE == -0.114', near(ce5.runoff, -0.114), ce5.runoff);
  check('SWMM5 flow CE == 0.072', near(ce5.flow, 0.072), ce5.flow);

  const ce6 = extractContinuityErrors(RPT6);
  check('SWMM6 runoff CE == -0.114', near(ce6.runoff, -0.114), ce6.runoff);
  check('SWMM6 flow CE == -0.006', near(ce6.flow, -0.006), ce6.flow);

  const ceD = extractContinuityErrors(RPT_DIAG);
  check('DYNWAVE runoff CE == -0.512', near(ceD.runoff, -0.512), ceD.runoff);
  check('DYNWAVE flow CE == 2.315 (positive, distinct from runoff)', near(ceD.flow, 2.315), ceD.flow);
}

// ---------------------------------------------------------------------------
console.log('\nSummary metric extraction (batch-compare parser)');
{
  const mm5 = parseReportMetrics(RPT5);
  check('SWMM5 runoff CE metric == -0.114', near(mm5.runoffContinuityError, -0.114), mm5.runoffContinuityError);
  check('SWMM5 routing CE metric == 0.072', near(mm5.routingContinuityError, 0.072), mm5.routingContinuityError);
  check('SWMM5 total precipitation == 0.937', near(mm5.totalPrecipitation, 0.937), mm5.totalPrecipitation);
  check('SWMM5 surface runoff == 0.523', near(mm5.surfaceRunoff, 0.523), mm5.surfaceRunoff);
  check('SWMM5 flow routing method == KINWAVE', mm5.flowRoutingMethod === 'KINWAVE', mm5.flowRoutingMethod);
  check('SWMM5 infiltration method == HORTON', mm5.infiltrationMethod === 'HORTON', mm5.infiltrationMethod);
  check('SWMM5 "No nodes were flooded" => nodesFlooded 0', mm5.nodesFlooded === 0, mm5.nodesFlooded);

  const mmD = parseReportMetrics(RPT_DIAG);
  check('DYNWAVE routing method == DYNWAVE', mmD.flowRoutingMethod === 'DYNWAVE', mmD.flowRoutingMethod);
  check('DYNWAVE "Flooding was detected at 2 nodes" => nodesFlooded 2', mmD.nodesFlooded === 2, mmD.nodesFlooded);
  check('DYNWAVE flooding loss == 0.210', near(mmD.floodingLoss, 0.210), mmD.floodingLoss);
}

// ---------------------------------------------------------------------------
console.log('\nWarning / error line collection + engine version');
{
  const iss = extractReportIssues(RPT_DIAG);
  check('collected 2 warnings', iss.warnings.length === 2, iss.warnings);
  check('warning text preserved (WARNING 04 / Conduit C7)',
    iss.warnings.some(w => /WARNING 04/.test(w) && /C7/.test(w)), iss.warnings);
  check('no errors in a clean run', iss.errors.length === 0, iss.errors);

  const errRpt = '  ERROR 138: Node BadNode has initial depth greater than maximum depth.\n  WARNING 01: wet weather time step reduced\n';
  const issErr = extractReportIssues(errRpt);
  check('ERROR lines collected separately from warnings',
    issErr.errors.length === 1 && /ERROR 138/.test(issErr.errors[0]), issErr.errors);
  check('WARNING line collected alongside the error', issErr.warnings.length === 1, issErr.warnings);

  check('SWMM5 engine version reports build 5.2.4', extractEngineVersion(RPT5) === '5.2.4', extractEngineVersion(RPT5));
  check('SWMM6 engine version reports 6.0.0-alpha.3',
    extractEngineVersion(RPT6) === '6.0.0-alpha.3', extractEngineVersion(RPT6));
}

// ---------------------------------------------------------------------------
console.log('\nGraceful handling of truncated / malformed reports (no crash, no invented values)');
{
  const project = createEmptyProject();

  // Report cut off mid-heading, before any continuity error rows exist.
  const truncated = RPT5.slice(0, RPT5.indexOf('Continuity Error'));
  let res: ReturnType<typeof parseRptToResults> | null = null;
  let threw = false;
  try { res = parseRptToResults(truncated, project); } catch { threw = true; }
  check('truncated report does not throw', !threw && res != null);
  check('truncated report invents no continuity error (defaults to 0)',
    res!.summary.continuityErrors.runoff === 0 && res!.summary.continuityErrors.flow === 0,
    res!.summary.continuityErrors);
  check('truncated report marked report-summary fidelity', res!.fidelity === 'report-summary', res!.fidelity);

  // Empty / garbage input must not crash any parser and must not fabricate data.
  for (const junk of ['', '   \n  \n', 'not a swmm report at all\nrandom text']) {
    let ok = true;
    try {
      const em = parseRptEngineMetrics(junk);
      check(`engine metrics on junk (${JSON.stringify(junk).slice(0, 12)}...) yields empty lists`,
        em.continuity.length === 0 && em.timeStepCriticalElements.length === 0 &&
        em.instabilityLinks.length === 0 && em.highestContinuityNodes.length === 0, em);
      const rm = parseReportMetrics(junk);
      check(`report metrics on junk yields no continuity numbers`,
        rm.runoffContinuityError === undefined && rm.routingContinuityError === undefined, rm);
      const ce = extractContinuityErrors(junk);
      check(`continuity extraction on junk returns nulls`, ce.runoff === null && ce.flow === null, ce);
      check(`engine version undefined on junk`, extractEngineVersion(junk) === undefined, extractEngineVersion(junk));
    } catch {
      ok = false;
    }
    check(`no parser threw on junk (${JSON.stringify(junk).slice(0, 12)}...)`, ok);
  }

  // A malformed continuity block (missing its data rows) must yield the block
  // with a null error rather than an invented number.
  const malformed = [
    '  **************************',
    '  Runoff Quantity Continuity     acre-feet   inches',
    '  **************************',
    '  (report truncated here)',
  ].join('\n');
  const mm = parseRptEngineMetrics(malformed);
  const rb = mm.continuity.find(c => c.key === 'runoff');
  check('malformed continuity block found but errorPct is null (not fabricated)',
    !!rb && rb.errorPct === null, rb);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
