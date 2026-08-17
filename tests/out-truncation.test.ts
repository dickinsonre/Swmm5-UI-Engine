/**
 * Long runs must be DECIMATED, never hard-cut.
 *
 * The .out parser holds at most MAX_LOADED_PERIODS reporting periods. Cutting
 * the series at that point silently drops the whole tail of a long run — a late
 * peak simply disappears with no signal to the user. Instead the parser samples
 * uniformly so the loaded series still spans the full simulation, always keeps
 * the final period, and reports what it did via
 * actualReportingSteps / loadedReportingSteps / isTruncated / samplingStride.
 *
 * Run: npx tsx tests/out-truncation.test.ts
 */

import { parseSwmmOut, MAX_LOADED_PERIODS } from '../client/src/lib/swmm-out-parser';
import { parseInpFile } from '../client/src/lib/inp-parser';

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const MAGIC = 516114522;
const REPORT_STEP = 60; // seconds

/**
 * Build a minimal but structurally valid SWMM .out: one node, no subcatchments,
 * no links, one node variable (depth) and one system variable. Node depth at
 * period p is simply p, so a decimated series is trivially verifiable and a
 * dropped tail is obvious.
 */
function buildOut(nPeriods: number): ArrayBuffer {
  const nSubcatch = 0, nNodes = 1, nLinks = 0, nPollutants = 0;
  const nSubcatchProps = 1, nNodeProps = 3, nLinkProps = 5;
  const nSubcatchVars = 8, nNodeVars = 6, nLinkVars = 5, nSysVars = 15;
  const nodeName = 'N1';

  const ints: Array<{ kind: 'i32' | 'f32' | 'f64' | 'str'; v: number | string }> = [];
  const i32 = (v: number) => ints.push({ kind: 'i32', v });
  const f32 = (v: number) => ints.push({ kind: 'f32', v });
  const f64 = (v: number) => ints.push({ kind: 'f64', v });
  const str = (v: string) => { i32(v.length); ints.push({ kind: 'str', v }); };

  i32(MAGIC); i32(51000);
  i32(0); i32(nSubcatch); i32(nNodes); i32(nLinks); i32(nPollutants);
  str(nodeName);

  // Interleaved input-property sections
  i32(nSubcatchProps); for (let i = 0; i < nSubcatchProps; i++) i32(1);
  i32(nNodeProps); for (let i = 0; i < nNodeProps; i++) i32(1);
  for (let i = 0; i < nNodes * nNodeProps; i++) f32(0);
  i32(nLinkProps); for (let i = 0; i < nLinkProps; i++) i32(1);

  // Reporting variable counts + codes
  i32(nSubcatchVars); for (let i = 0; i < nSubcatchVars; i++) i32(i);
  i32(nNodeVars); for (let i = 0; i < nNodeVars; i++) i32(i);
  i32(nLinkVars); for (let i = 0; i < nLinkVars; i++) i32(i);
  i32(nSysVars); for (let i = 0; i < nSysVars; i++) i32(i);

  f64(0); // report start (decimal date)
  i32(REPORT_STEP);

  // ---- serialize the header we have so far -------------------------------
  let headerBytes = 0;
  for (const t of ints) {
    headerBytes += t.kind === 'f64' ? 8 : t.kind === 'str' ? (t.v as string).length : 4;
  }

  const bytesPerStep = 8 + (nNodes * nNodeVars * 4) + (nSysVars * 4);
  const total = headerBytes + nPeriods * bytesPerStep + 6 * 4;
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  let o = 0;
  for (const t of ints) {
    if (t.kind === 'i32') { dv.setInt32(o, t.v as number, true); o += 4; }
    else if (t.kind === 'f32') { dv.setFloat32(o, t.v as number, true); o += 4; }
    else if (t.kind === 'f64') { dv.setFloat64(o, t.v as number, true); o += 8; }
    else { const s = t.v as string; for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); o += s.length; }
  }
  const startOfResults = o;

  for (let p = 0; p < nPeriods; p++) {
    dv.setFloat64(o, p, true); o += 8;
    // node vars: depth = p, rest 0
    dv.setFloat32(o, p, true); o += 4;
    for (let v = 1; v < nNodeVars; v++) { dv.setFloat32(o, 0, true); o += 4; }
    for (let v = 0; v < nSysVars; v++) { dv.setFloat32(o, 0, true); o += 4; }
  }

  // Closing records: [...][startOfResults][nPeriods][errorCode][magic]
  dv.setInt32(total - 6 * 4, 0, true);
  dv.setInt32(total - 5 * 4, 0, true);
  dv.setInt32(total - 4 * 4, startOfResults, true);
  dv.setInt32(total - 3 * 4, nPeriods, true);
  dv.setInt32(total - 2 * 4, 0, true);
  dv.setInt32(total - 1 * 4, MAGIC, true);
  return buf;
}

const project = parseInpFile('[TITLE]\ntruncation fixture\n\n[JUNCTIONS]\nN1  100  0  0  0  0\n');

// ---------------------------------------------------------------------------
console.log('\nshort run — nothing is dropped');
{
  const n = 120;
  const r = parseSwmmOut(buildOut(n), project);
  check('all periods loaded', r.timeSteps.length === n, r.timeSteps.length);
  check('not flagged truncated', r.isTruncated === false);
  check('stride is 1', r.samplingStride === 1);
  check('actual count reported', r.actualReportingSteps === n);
  check('loaded count matches timeSteps', r.loadedReportingSteps === r.timeSteps.length);
  check('summary.reportingSteps matches timeSteps', r.summary.reportingSteps === n);
  check('duration is n * reportStep', r.summary.totalDuration === n * REPORT_STEP);
  check('first sample is period 0', r.timeSteps[0].nodes['N1'].depth === 0);
  check('last sample is period n-1', r.timeSteps[n - 1].nodes['N1'].depth === n - 1);
}

// ---------------------------------------------------------------------------
console.log('\nexactly at the cap — still untouched');
{
  const r = parseSwmmOut(buildOut(MAX_LOADED_PERIODS), project);
  check('no decimation at the cap', r.timeSteps.length === MAX_LOADED_PERIODS, r.timeSteps.length);
  check('not flagged truncated', r.isTruncated === false);
  check('stride is 1', r.samplingStride === 1);
}

// ---------------------------------------------------------------------------
console.log('\nlong run — decimated, not cut');
{
  const n = 12_345;
  const r = parseSwmmOut(buildOut(n), project);
  const stride = Math.ceil(n / MAX_LOADED_PERIODS); // 3

  check('flagged truncated', r.isTruncated === true);
  check('true period count preserved', r.actualReportingSteps === n, r.actualReportingSteps);
  check('stride reported', r.samplingStride === stride, r.samplingStride);
  check('loaded count within the cap (+ final period)', r.timeSteps.length <= MAX_LOADED_PERIODS + 1, r.timeSteps.length);
  check('loadedReportingSteps matches timeSteps', r.loadedReportingSteps === r.timeSteps.length);
  check('summary.reportingSteps matches timeSteps', r.summary.reportingSteps === r.timeSteps.length);

  // The whole point: the series must reach the END of the run.
  const last = r.timeSteps[r.timeSteps.length - 1];
  check('final period is loaded (tail not dropped)', last.nodes['N1'].depth === n - 1, last.nodes['N1'].depth);
  check('final sample carries the true end time', last.time === (n - 1) * REPORT_STEP, last.time);
  check('duration reflects the FULL run, not the loaded slice',
    r.summary.totalDuration === n * REPORT_STEP, r.summary.totalDuration);

  // Sampling must be uniform and correctly indexed (depth === period index).
  check('first sample is period 0', r.timeSteps[0].nodes['N1'].depth === 0);
  check('second sample is period `stride`', r.timeSteps[1].nodes['N1'].depth === stride, r.timeSteps[1].nodes['N1'].depth);
  check('third sample is period 2*stride', r.timeSteps[2].nodes['N1'].depth === 2 * stride);
  check('time follows the sampled period, not the array index',
    r.timeSteps[2].time === 2 * stride * REPORT_STEP, r.timeSteps[2].time);

  let uniform = true;
  for (let i = 1; i < r.timeSteps.length - 1; i++) {
    if (r.timeSteps[i].nodes['N1'].depth !== i * stride) { uniform = false; break; }
  }
  check('every interior sample lands on a stride boundary', uniform);

  // A hard cut would have stopped here; prove it didn't.
  check('coverage extends far beyond the old 5,000-step cut',
    last.nodes['N1'].depth > MAX_LOADED_PERIODS, last.nodes['N1'].depth);
}

// ---------------------------------------------------------------------------
console.log('\nboundary period counts');
{
  const r0 = parseSwmmOut(buildOut(0), project);
  check('0 periods: no time steps', r0.timeSteps.length === 0);
  check('0 periods: not truncated', r0.isTruncated === false);
  check('0 periods: actual count is 0', r0.actualReportingSteps === 0);

  const r1 = parseSwmmOut(buildOut(1), project);
  check('1 period: single step, no duplicate from the final-period append', r1.timeSteps.length === 1, r1.timeSteps.length);
  check('1 period: not truncated', r1.isTruncated === false);
  check('1 period: duration is one report step', r1.summary.totalDuration === REPORT_STEP);

  // Just over the cap: stride 2, and n odd so the final period is NOT on a
  // stride boundary — the append path must fire exactly once.
  const nOdd = MAX_LOADED_PERIODS + 1;
  const rOdd = parseSwmmOut(buildOut(nOdd), project);
  const lastOdd = rOdd.timeSteps[rOdd.timeSteps.length - 1];
  const penultOdd = rOdd.timeSteps[rOdd.timeSteps.length - 2];
  check('just-over-cap: truncated', rOdd.isTruncated === true);
  check('just-over-cap: stride 2', rOdd.samplingStride === 2, rOdd.samplingStride);
  check('just-over-cap: final period retained', lastOdd.nodes['N1'].depth === nOdd - 1, lastOdd.nodes['N1'].depth);
  check('just-over-cap: final period not duplicated', penultOdd.nodes['N1'].depth !== lastOdd.nodes['N1'].depth);
  check('just-over-cap: within cap + 1', rOdd.timeSteps.length <= MAX_LOADED_PERIODS + 1, rOdd.timeSteps.length);

  // Even period count with stride 2: the last stride boundary is n-2, so the
  // final period is appended and the closing gap is SHORTER than the stride.
  // Consumers must therefore never assume evenly spaced samples.
  const nEven = MAX_LOADED_PERIODS * 2;
  const rEven = parseSwmmOut(buildOut(nEven), project);
  const lastEven = rEven.timeSteps[rEven.timeSteps.length - 1];
  const penultEven = rEven.timeSteps[rEven.timeSteps.length - 2];
  check('even count: stride 2', rEven.samplingStride === 2, rEven.samplingStride);
  check('even count: final period retained', lastEven.nodes['N1'].depth === nEven - 1, lastEven.nodes['N1'].depth);
  check('even count: cap exceeded by at most the one appended sample',
    rEven.timeSteps.length === MAX_LOADED_PERIODS + 1, rEven.timeSteps.length);
  check('even count: closing gap is shorter than the stride (ragged tail)',
    lastEven.nodes['N1'].depth - penultEven.nodes['N1'].depth === 1,
    lastEven.nodes['N1'].depth - penultEven.nodes['N1'].depth);

  // Odd period count with stride 2: the final period IS a stride boundary, so
  // nothing is appended and the series is perfectly uniform.
  const nOnBoundary = MAX_LOADED_PERIODS * 2 - 1;
  const rBoundary = parseSwmmOut(buildOut(nOnBoundary), project);
  const lastB = rBoundary.timeSteps[rBoundary.timeSteps.length - 1];
  const penultB = rBoundary.timeSteps[rBoundary.timeSteps.length - 2];
  check('final period on a stride boundary: nothing appended',
    rBoundary.timeSteps.length === MAX_LOADED_PERIODS, rBoundary.timeSteps.length);
  check('final period on a stride boundary: last sample is the last period',
    lastB.nodes['N1'].depth === nOnBoundary - 1, lastB.nodes['N1'].depth);
  check('final period on a stride boundary: spacing stays uniform',
    lastB.nodes['N1'].depth - penultB.nodes['N1'].depth === rBoundary.samplingStride);
}

// ---------------------------------------------------------------------------
console.log('\nsampled dateTime strings track the sampled period');
{
  const n = 20_000;
  const r = parseSwmmOut(buildOut(n), project);
  const stride = r.samplingStride!;
  const distinct = new Set(r.timeSteps.slice(0, 50).map(ts => ts.dateTime));
  check('sampled dateTimes are distinct (not frozen on the array index)', distinct.size === 50, distinct.size);
  const spanSec = r.timeSteps[r.timeSteps.length - 1].time - r.timeSteps[0].time;
  check('loaded series spans the whole run', spanSec === (n - 1) * REPORT_STEP, spanSec);
  check('sample spacing equals stride * reportStep',
    r.timeSteps[1].time - r.timeSteps[0].time === stride * REPORT_STEP);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
