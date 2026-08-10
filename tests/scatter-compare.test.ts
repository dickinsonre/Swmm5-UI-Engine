/**
 * Per-element scatter comparison tests: .rpt summary-table extraction,
 * time-series parsing (SWMM5 and SWMM6 header layouts, both section-title
 * forms), and worst-disagreement overlay ranking/merging.
 * Run with: npx tsx tests/scatter-compare.test.ts
 */

import { extractScatterValues, rSquared } from '../client/src/lib/summary-scatter';
import { parseTimeSeries, buildWorstOverlays } from '../client/src/lib/series-overlays';

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`, detail !== undefined ? JSON.stringify(detail) : ''); }
}
function approx(a: number | undefined, b: number, eps = 1e-9) {
  return a !== undefined && Math.abs(a - b) <= eps;
}

// ---------------------------------------------------------------------------
// Fixtures — column layouts copied verbatim from real runswmm 5.2.4 output
// (Greenville model) and the SWMM6/OpenSWMM report writer.

const SUMMARY_5 = `
  Subcatchment Runoff Summary
  ------------------------------------------------------------------------------------------------------------------------------
                            Total      Total      Total      Total     Imperv       Perv      Total       Total     Peak  Runoff
                           Precip      Runon       Evap      Infil     Runoff     Runoff     Runoff      Runoff   Runoff   Coeff
  Subcatchment                 in         in         in         in         in         in         in    10^6 gal      CFS
  ------------------------------------------------------------------------------------------------------------------------------
  S1                         2.65       0.00       0.00       1.16       0.00       1.49       1.49        0.16     4.66   0.561
  S2                         2.65       0.00       0.00       1.16       0.00       1.20       1.20        0.11     3.10   0.453

  Node Depth Summary
  ---------------------------------------------------------------------------------
                                 Average  Maximum  Maximum  Time of Max
                                   Depth    Depth      HGL   Occurrence
  Node                 Type         Feet     Feet     Feet  days hr:min
  ---------------------------------------------------------------------------------
  J1                   JUNCTION     0.44     1.10    97.60     0  01:05
  O1                   OUTFALL      0.30     0.75    85.75     0  01:06

  Link Flow Summary
  -----------------------------------------------------------------------------
                                 Maximum  Time of Max   Maximum    Max/    Max/
                                  |Flow|   Occurrence   |Veloc|    Full    Full
  Link                 Type          CFS  days hr:min    ft/sec    Flow   Depth
  -----------------------------------------------------------------------------
  C1                   CONDUIT      4.60     0  01:05      5.09    0.31    0.42
  C2                   CONDUIT     -3.20     0  01:10      4.10    0.25    0.38
  W1                   WEIR        14.89     0  13:16                      0.26
  OR1                  ORIFICE      7.00     0  00:55                      0.06
  OR2                  ORIFICE      0.08     0  14:23                          
  P1                   PUMP         3.28     0  15:29              0.94
  D1                   DUMMY        0.06     0  07:00
`;

// Node Depth Summary without the Maximum HGL column (heads fall back to depth).
const SUMMARY_NO_HGL = `
  Node Depth Summary
  ---------------------------------------------------------------------------------
                                 Average  Maximum  Time of Max
                                   Depth    Depth   Occurrence
  Node                 Type         Feet     Feet  days hr:min
  ---------------------------------------------------------------------------------
  J1                   JUNCTION     0.44     1.10     0  01:05
`;

// SWMM5 time-series layout: column names on line 1, "Date Time <units>" on line 2.
function series5(nodeDepths: number[], linkFlows: number[], linkDepths: number[]) {
  const stamp = (i: number) => `01/01/1997 ${String(i).padStart(2, '0')}:05:00`;
  return `
  ************************
  Node Time Series Results
  ************************
  
  <<< Node J1 >>>
  ----------------------------------------------------------------------------------------------------------------------------
                           Inflow  Flooding     Depth      Head
  Date        Time            CFS       CFS      feet      feet
  ----------------------------------------------------------------
${nodeDepths.map((d, i) => `   ${stamp(i)}      0.013     0.000     ${d.toFixed(3)}   708.946`).join('\n')}

  ************************
  Link Time Series Results
  ************************
  
  <<< Link C1 >>>
  ----------------------------------------------------------------------------------------------------------------------------
                             Flow  Velocity     Depth  Capacity/
  Date        Time            CFS    ft/sec      feet   Setting 
  ----------------------------------------------------------------
${linkFlows.map((f, i) => `   ${stamp(i)}      ${f.toFixed(3)}     0.500     ${(linkDepths[i] ?? 0).toFixed(3)}     0.100`).join('\n')}
`;
}

// SWMM6/OpenSWMM layout: "Results Time Series" title form and Date in the
// first header line ("Date  Time  <names>" / "Day  Hour:Min  <units>").
const SERIES_6 = `
  **************************
  Link Results Time Series
  **************************
  
  <<< Link C1 >>>
  Date        Time         Flow  Velocity     Depth
  Day         Hour:Min      CMS       m/s         m
  ----------------------------------------------------------------
   01/01/1997 00:05:00      1.100     0.500     0.100
   01/01/1997 00:10:00      2.200     0.600     0.200
`;

// ---------------------------------------------------------------------------
console.log('extractScatterValues — SWMM5 summary tables');
{
  const v = extractScatterValues(SUMMARY_5);
  check('peak flows for all link rows (incl. weir/orifice/pump/dummy)', v.flows.size === 7, [...v.flows.keys()]);
  check('negative flow stored as |flow|', approx(v.flows.get('C2'), 3.2));
  check('conduit max/full depth from column 7', approx(v.linkDepths.get('C1'), 0.42));
  check('weir max/full depth captured', approx(v.linkDepths.get('W1'), 0.26));
  check('orifice max/full depth captured', approx(v.linkDepths.get('OR1'), 0.06));
  check('orifice row with blank depth skipped', !v.linkDepths.has('OR2'));
  check('pump max/full FLOW not misread as depth', !v.linkDepths.has('P1'));
  check('dummy link has no depth ratio', !v.linkDepths.has('D1'));
  check('heads use Maximum HGL column', v.headsLabel === 'Maximum HGL' && approx(v.heads.get('J1'), 97.6));
  check('node depths always use Maximum Depth column', approx(v.nodeDepths.get('J1'), 1.1));
  check('peak subcatchment runoff from column 9', approx(v.runoff.get('S1'), 4.66) && approx(v.runoff.get('S2'), 3.1));
}

console.log('extractScatterValues — report without HGL column');
{
  const v = extractScatterValues(SUMMARY_NO_HGL);
  check('headsLabel falls back to Maximum Depth', v.headsLabel === 'Maximum Depth');
  check('heads equal max depth when HGL missing', approx(v.heads.get('J1'), 1.1) && approx(v.nodeDepths.get('J1'), 1.1));
}

console.log('parseTimeSeries — SWMM5 layout ("<Type> Time Series Results")');
{
  const ts = parseTimeSeries(series5([0.1, 0.2, 0.3], [1, 2, 3], [0.5, 0.6, 0.7]));
  check('two series parsed', ts.length === 2, ts.map(t => t.title));
  const node = ts.find(t => /node/i.test(t.title))!;
  const link = ts.find(t => /link/i.test(t.title))!;
  check('node columns exclude Date/Time', JSON.stringify(node.columns) === JSON.stringify(['Inflow', 'Flooding', 'Depth', 'Head']));
  check('node units exclude Date/Time', JSON.stringify(node.units) === JSON.stringify(['CFS', 'CFS', 'feet', 'feet']));
  check('link columns parsed', JSON.stringify(link.columns) === JSON.stringify(['Flow', 'Velocity', 'Depth', 'Capacity/']));
  check('all data rows kept', node.data.length === 3 && link.data.length === 3);
  check('values aligned to columns', approx(node.data[1].values[2], 0.2) && approx(link.data[2].values[0], 3));
}

console.log('parseTimeSeries — SWMM6 layout ("<Type> Results Time Series", Date-first header)');
{
  const ts = parseTimeSeries(SERIES_6);
  check('series parsed', ts.length === 1, ts.map(t => t.title));
  check('columns exclude Date/Time', JSON.stringify(ts[0]?.columns) === JSON.stringify(['Flow', 'Velocity', 'Depth']));
  check('units exclude Day/Hour:Min', JSON.stringify(ts[0]?.units) === JSON.stringify(['CMS', 'm/s', 'm']));
  check('data parsed', ts[0]?.data.length === 2 && approx(ts[0]?.data[1].values[0], 2.2));
}

console.log('rSquared');
{
  check('perfect fit → 1', approx(rSquared([{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 6 }]), 1));
  check('single point → undefined', rSquared([{ x: 1, y: 1 }]) === undefined);
  check('zero variance → undefined', rSquared([{ x: 1, y: 5 }, { x: 2, y: 5 }]) === undefined);
}

console.log('buildWorstOverlays — ranking, merging, and missing-series reasons');
{
  const rptA = SUMMARY_5 + series5([0.1, 0.2, 0.3], [1, 2, 3], [0.5, 0.6, 0.7]);
  const rptB = SUMMARY_5 + series5([0.1, 0.25, 0.35], [1, 2.5, 3.5], [0.5, 0.65, 0.75]);
  const vA = extractScatterValues(rptA);
  // Force known disagreements: C1 flow differs most; J1 depth differs.
  const vB = extractScatterValues(rptB);
  vB.flows.set('C1', (vB.flows.get('C1') || 0) + 100);
  vB.nodeDepths.set('J1', (vB.nodeDepths.get('J1') || 0) + 5);
  const overlays = buildWorstOverlays(rptA, rptB, vA, vB);
  const flow = overlays.find(o => o.id === 'worst-flow')!;
  const depth = overlays.find(o => o.id === 'worst-node-depth')!;
  const linkDepth = overlays.find(o => o.id === 'worst-link-depth')!;
  check('three overlays built', overlays.length === 3, overlays.map(o => o.id));
  check('worst flow picks element with series (C1)', flow.name === 'C1');
  check('flow rows merged on shared timestamps', flow.rows !== null && flow.rows.length === 3);
  check('merged row carries both engines', flow.rows !== null && approx(flow.rows[1].a, 2) && approx(flow.rows[1].b, 2.5));
  check('worst node depth is J1 with rows', depth.name === 'J1' && depth.rows !== null && depth.rows.length === 3);
  check('link depth overlay picks conduit with series', linkDepth.name === 'C1' && linkDepth.rows !== null);

  // Reports whose summaries disagree but contain no time series at all.
  const noSeries = buildWorstOverlays(SUMMARY_5, SUMMARY_5, vA, vB);
  check('no time series → reason "none"', noSeries.every(o => o.rows === null && o.reason === 'none'), noSeries.map(o => o.reason));

  // Worst element (weir W1) has no series, but other series exist → falls
  // back to the worst element that HAS series, or reports missing-link.
  const vB2 = extractScatterValues(rptB);
  vB2.linkDepths.set('W1', 99); // W1 disagrees most but only C1 has a series
  const fallback = buildWorstOverlays(rptA, rptB, vA, vB2);
  const ld = fallback.find(o => o.id === 'worst-link-depth')!;
  check('falls back to worst element with series', ld.name === 'C1' && ld.rows !== null);
}

console.log(`\nscatter-compare: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
