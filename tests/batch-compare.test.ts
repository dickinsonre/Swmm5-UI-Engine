/**
 * Batch cross-engine comparison tests: parseReportMetrics against real SWMM5
 * and SWMM6 .rpt fixtures, tolerance edges, duplicate-filename alignment by
 * occurrence, missing-engine results → status-mismatch, and the inconclusive
 * verdict when no metric is comparable.
 *
 * Fixtures in tests/fixtures/ were produced by running
 * tests/fixtures/batch-simple.inp through the real engines:
 *   - batch-swmm5.rpt: swmm-engine/runswmm (EPA SWMM 5.2.4 native binary)
 *   - batch-swmm6.rpt: client/public/wasm6 OpenSWMM 6 WASM engine
 *
 * Run with: npx tsx tests/batch-compare.test.ts
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  parseReportMetrics, extractEngineVersion, extractReportIssues,
  buildComparison,
  type BatchFileResult, type EngineRun, type BatchParsedMetrics,
} from '../client/src/lib/batch-compare';

const HERE = dirname(fileURLToPath(import.meta.url));
const RPT5 = readFileSync(join(HERE, 'fixtures', 'batch-swmm5.rpt'), 'utf8');
const RPT6 = readFileSync(join(HERE, 'fixtures', 'batch-swmm6.rpt'), 'utf8');

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
console.log('\nparseReportMetrics — real SWMM5 5.2.4 report');
{
  const m = parseReportMetrics(RPT5);
  check('runoff continuity error', approx(m.runoffContinuityError, -0.114), m);
  check('routing continuity error', approx(m.routingContinuityError, 0.072), m);
  check('total precipitation', approx(m.totalPrecipitation, 0.937), m);
  check('surface runoff', approx(m.surfaceRunoff, 0.523), m);
  check('total inflow (wet weather)', approx(m.totalInflow, 0.523), m);
  check('total outflow (external)', approx(m.totalOutflow, 0.523), m);
  check('flooding loss', approx(m.floodingLoss, 0), m);
  check('nodes flooded = 0 ("No nodes were flooded")', m.nodesFlooded === 0, m);
  check('flow routing method', m.flowRoutingMethod === 'KINWAVE', m);
  check('infiltration method', m.infiltrationMethod === 'HORTON', m);
  check('no warnings/errors captured', m.reportWarnings === undefined && m.reportErrors === undefined, m);
  check('engine version = build 5.2.4', extractEngineVersion(RPT5) === '5.2.4');
}

console.log('\nparseReportMetrics — real SWMM6 (OpenSWMM) report');
{
  const m = parseReportMetrics(RPT6);
  check('runoff continuity error', approx(m.runoffContinuityError, -0.114), m);
  check('routing continuity error', approx(m.routingContinuityError, -0.006), m);
  check('total precipitation', approx(m.totalPrecipitation, 0.938), m);
  check('surface runoff', approx(m.surfaceRunoff, 0.523), m);
  check('total inflow', approx(m.totalInflow, 0.523), m);
  check('total outflow', approx(m.totalOutflow, 0.523), m);
  check('nodes flooded = 0', m.nodesFlooded === 0, m);
  check('flow routing method', m.flowRoutingMethod === 'KINWAVE', m);
  check('engine version = 6.0.0-alpha.3', extractEngineVersion(RPT6) === '6.0.0-alpha.3');
}

console.log('\nextractReportIssues — WARNING/ERROR lines');
{
  const issues = extractReportIssues('  WARNING 03: negative offset\n  ERROR 209: undefined object\n  note: WARNING mid-line ignored ERROR too\n');
  check('one warning found', issues.warnings.length === 1 && issues.warnings[0].startsWith('WARNING 03'), issues);
  check('one error found', issues.errors.length === 1 && issues.errors[0].startsWith('ERROR 209'), issues);
}

// ---------------------------------------------------------------------------
// Comparison helpers

function ok(fileName: string, metrics: BatchParsedMetrics): BatchFileResult {
  return { fileName, status: 'success', parsedMetrics: metrics };
}
function run(engine: 'local' | 'wasm' | 'wasm6' | 'remote', results: BatchFileResult[]): EngineRun {
  return { engine, label: engine, results };
}
function cmp2(a: BatchParsedMetrics, b: BatchParsedMetrics) {
  return buildComparison([run('local', [ok('m.inp', a)]), run('wasm6', [ok('m.inp', b)])]).files[0];
}

console.log('\nTolerance edges — continuity error (absolute 0.05)');
{
  check('delta exactly 0.05 → match', cmp2({ runoffContinuityError: 0.10 }, { runoffContinuityError: 0.15 }).verdict === 'match');
  check('delta just over 0.05 → differs', cmp2({ runoffContinuityError: 0.10 }, { runoffContinuityError: 0.151 }).verdict === 'differs');
  check('sign flip within tolerance → match', cmp2({ routingContinuityError: -0.02 }, { routingContinuityError: 0.02 }).verdict === 'match');
  check('sign flip beyond tolerance → differs', cmp2({ routingContinuityError: -0.04 }, { routingContinuityError: 0.04 }).verdict === 'differs');
}

console.log('\nTolerance edges — relative 0.5% (surface runoff et al.)');
{
  check('0.5% relative delta exactly → match', cmp2({ surfaceRunoff: 100 }, { surfaceRunoff: 100.5 }).verdict === 'match');
  check('just over 0.5% → differs', cmp2({ surfaceRunoff: 100 }, { surfaceRunoff: 100.51 }).verdict === 'differs');
  check('both zero → match (no divide-by-zero blowup)', cmp2({ floodingLoss: 0 }, { floodingLoss: 0 }).verdict === 'match');
  check('nodesFlooded exact (tolerance 0): 1 vs 2 → differs', cmp2({ nodesFlooded: 1 }, { nodesFlooded: 2 }).verdict === 'differs');
  check('nodesFlooded equal → match', cmp2({ nodesFlooded: 3 }, { nodesFlooded: 3 }).verdict === 'match');
}

console.log('\nInformational metrics never flip the verdict');
{
  const f = cmp2(
    { surfaceRunoff: 1.0, reportWarnings: ['WARNING 1', 'WARNING 2'] },
    { surfaceRunoff: 1.0 },
  );
  check('warning-count difference still match', f.verdict === 'match', f.verdict);
  const g = buildComparison([
    run('local', [{ fileName: 'm.inp', status: 'success', processingTime: 1.2, parsedMetrics: { surfaceRunoff: 1 } }]),
    run('wasm6', [{ fileName: 'm.inp', status: 'success', processingTime: 99, parsedMetrics: { surfaceRunoff: 1 } }]),
  ]).files[0];
  check('run-time difference still match', g.verdict === 'match', g.verdict);
}

console.log('\nDuplicate file names aligned by occurrence');
{
  const summary = buildComparison([
    run('local', [ok('dup.inp', { surfaceRunoff: 1.0 }), ok('dup.inp', { surfaceRunoff: 2.0 })]),
    run('wasm6', [ok('dup.inp', { surfaceRunoff: 1.0 }), ok('dup.inp', { surfaceRunoff: 5.0 })]),
  ]);
  check('two comparison rows', summary.files.length === 2, summary.files.map(f => f.fileName));
  check('first occurrence keeps base name', summary.files[0].fileName === 'dup.inp');
  check('second occurrence renamed "(2)"', summary.files[1].fileName === 'dup.inp (2)');
  check('first occurrence matches', summary.files[0].verdict === 'match', summary.files[0].verdict);
  check('second occurrence differs (2.0 vs 5.0)', summary.files[1].verdict === 'differs', summary.files[1].verdict);
  check('counts: 1 match, 1 differ', summary.matchCount === 1 && summary.differCount === 1);
}

console.log('\nMissing engine results → status-mismatch');
{
  const summary = buildComparison([
    run('local', [ok('a.inp', { surfaceRunoff: 1 }), ok('b.inp', { surfaceRunoff: 2 })]),
    run('wasm6', [ok('a.inp', { surfaceRunoff: 1 })]), // b.inp missing entirely
  ]);
  const b = summary.files.find(f => f.fileName === 'b.inp')!;
  check('missing result flagged', b.statuses.includes('missing'), b.statuses);
  check('verdict is status-mismatch', b.verdict === 'status-mismatch');
  check('metrics never say match when one engine missing', summary.files.find(f => f.fileName === 'a.inp')!.verdict === 'match');
}

console.log('\nMixed statuses (failed / cancelled) → status-mismatch, never match');
{
  const failed: BatchFileResult = { fileName: 'm.inp', status: 'failed', error: 'boom' };
  const cancelled: BatchFileResult = { fileName: 'm.inp', status: 'cancelled' };
  const good = ok('m.inp', { surfaceRunoff: 1 });
  check('success vs failed', buildComparison([run('local', [good]), run('wasm6', [failed])]).files[0].verdict === 'status-mismatch');
  check('success vs cancelled', buildComparison([run('local', [good]), run('wasm6', [cancelled])]).files[0].verdict === 'status-mismatch');
  const bothFailed = buildComparison([run('local', [{ ...failed }]), run('wasm6', [{ ...failed }])]).files[0];
  check('both failed (no metrics) → inconclusive, not match', bothFailed.verdict === 'inconclusive', bothFailed.verdict);
}

console.log('\nAll metrics missing → inconclusive');
{
  const f = cmp2({}, {});
  check('empty metrics → inconclusive', f.verdict === 'inconclusive');
  const g = cmp2({ surfaceRunoff: 1 }, {}); // only one side has a value → not comparable
  check('single-sided metric → inconclusive', g.verdict === 'inconclusive', g.verdict);
  const h = cmp2({ flowRoutingMethod: 'KINWAVE' }, { flowRoutingMethod: 'DYNWAVE' }); // strings are not numeric metrics
  check('string-only metrics → inconclusive', h.verdict === 'inconclusive', h.verdict);
}

console.log('\nEnd-to-end: real SWMM5 vs SWMM6 fixture reports through buildComparison');
{
  const summary = buildComparison([
    run('local', [ok('batch-simple.inp', parseReportMetrics(RPT5))]),
    run('wasm6', [ok('batch-simple.inp', parseReportMetrics(RPT6))]),
  ]);
  const f = summary.files[0];
  check('verdict is match or differs (comparable, same status)', f.verdict === 'match' || f.verdict === 'differs', f.verdict);
  check('no status mismatch', !f.statusMismatch);
  const precip = f.metrics.find(m => m.key === 'totalPrecipitation')!;
  check('precip delta computed (0.937 vs 0.938)', approx(precip.maxDelta, 0.001, 1e-6), precip);
}

// ---------------------------------------------------------------------------
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
