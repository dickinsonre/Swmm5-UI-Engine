import type { SwmmProject, SimulationResults } from './swmm-types';

export interface RunSnapshot {
  fileName: string;
  capturedAt: string;
  engineUsed: string;
  timeSteps: number;
  metrics: Record<string, number>;
}

export interface MetricDef {
  key: string;
  label: string;
  higherIsWorse: boolean;
  defaultPassPct: number;
  defaultReviewPct: number;
  absEpsilon: number;
}

export interface ToleranceSet {
  [key: string]: { passPct: number; reviewPct: number };
}

export type CompareStatus = 'Pass' | 'Review' | 'Fail' | 'N/A';

export interface CompareRow {
  key: string;
  label: string;
  baseline: number | null;
  revised: number | null;
  diff: number | null;
  pctChange: number | null;
  status: CompareStatus;
}

export const REGRESSION_METRICS: MetricDef[] = [
  { key: 'peakOutfallInflow', label: 'Peak Outfall Inflow', higherIsWorse: false, defaultPassPct: 5, defaultReviewPct: 10, absEpsilon: 1e-4 },
  { key: 'totalOutfallVolume', label: 'Total Outfall Volume (approx)', higherIsWorse: false, defaultPassPct: 5, defaultReviewPct: 10, absEpsilon: 1e-3 },
  { key: 'peakFloodingRate', label: 'Peak Flooding Rate', higherIsWorse: true, defaultPassPct: 5, defaultReviewPct: 15, absEpsilon: 1e-4 },
  { key: 'totalFloodingVolume', label: 'Total Flooding Volume (approx)', higherIsWorse: true, defaultPassPct: 5, defaultReviewPct: 15, absEpsilon: 1e-3 },
  { key: 'floodedNodeCount', label: 'Flooded Node Count', higherIsWorse: true, defaultPassPct: 0, defaultReviewPct: 10, absEpsilon: 0.5 },
  { key: 'maxNodeDepth', label: 'Max Node Depth', higherIsWorse: true, defaultPassPct: 5, defaultReviewPct: 10, absEpsilon: 1e-3 },
  { key: 'maxNodeHead', label: 'Max Node Head', higherIsWorse: true, defaultPassPct: 2, defaultReviewPct: 5, absEpsilon: 1e-3 },
  { key: 'maxLinkFlow', label: 'Max Link Flow', higherIsWorse: false, defaultPassPct: 5, defaultReviewPct: 10, absEpsilon: 1e-4 },
  { key: 'maxLinkVelocity', label: 'Max Link Velocity', higherIsWorse: true, defaultPassPct: 5, defaultReviewPct: 15, absEpsilon: 1e-3 },
  { key: 'maxLinkCapacity', label: 'Max Link Capacity (d/D)', higherIsWorse: true, defaultPassPct: 5, defaultReviewPct: 10, absEpsilon: 1e-3 },
  { key: 'surchargedLinkCount', label: 'Surcharged Link Count (≥95%)', higherIsWorse: true, defaultPassPct: 0, defaultReviewPct: 10, absEpsilon: 0.5 },
  { key: 'continuityRunoff', label: 'Runoff Continuity Error (%)', higherIsWorse: true, defaultPassPct: 10, defaultReviewPct: 50, absEpsilon: 0.05 },
  { key: 'continuityFlow', label: 'Flow Continuity Error (%)', higherIsWorse: true, defaultPassPct: 10, defaultReviewPct: 50, absEpsilon: 0.05 },
];

export function getDefaultTolerances(): ToleranceSet {
  const t: ToleranceSet = {};
  for (const m of REGRESSION_METRICS) {
    t[m.key] = { passPct: m.defaultPassPct, reviewPct: m.defaultReviewPct };
  }
  return t;
}

export function extractRunSnapshot(project: SwmmProject, results: SimulationResults, fileName: string): RunSnapshot {
  const outfallIds = new Set(project.outfalls.map(o => o.id));
  const steps = results.timeSteps;

  let peakOutfallInflow = 0;
  let totalOutfallVolume = 0;
  let peakFloodingRate = 0;
  let totalFloodingVolume = 0;
  const floodedNodes = new Set<string>();
  let maxNodeDepth = 0;
  let maxNodeHead = -Infinity;
  let maxLinkFlow = 0;
  let maxLinkVelocity = 0;
  let maxLinkCapacity = 0;
  const surchargedLinks = new Set<string>();

  for (let i = 0; i < steps.length; i++) {
    const ts = steps[i];
    const dtSec = i > 0 ? Math.max(0, ts.time - steps[i - 1].time) : 0;

    let outfallSum = 0;
    let floodSum = 0;
    for (const [id, n] of Object.entries(ts.nodes)) {
      if (outfallIds.has(id)) outfallSum += Math.abs(n.totalInflow || 0);
      const fl = n.flooding || 0;
      if (fl > 1e-6) {
        floodSum += fl;
        floodedNodes.add(id);
        if (fl > peakFloodingRate) peakFloodingRate = fl;
      }
      if (n.depth > maxNodeDepth) maxNodeDepth = n.depth;
      if (typeof n.head === 'number' && n.head > maxNodeHead) maxNodeHead = n.head;
    }
    peakOutfallInflow = Math.max(peakOutfallInflow, outfallSum);
    totalOutfallVolume += outfallSum * dtSec;
    totalFloodingVolume += floodSum * dtSec;

    for (const [id, l] of Object.entries(ts.links)) {
      const q = Math.abs(l.flow || 0);
      if (q > maxLinkFlow) maxLinkFlow = q;
      const v = Math.abs(l.velocity || 0);
      if (v > maxLinkVelocity) maxLinkVelocity = v;
      const c = l.capacity || 0;
      if (c > maxLinkCapacity) maxLinkCapacity = c;
      if (c >= 0.95) surchargedLinks.add(id);
    }
  }

  return {
    fileName,
    capturedAt: new Date().toISOString(),
    engineUsed: results.engineUsed || 'unknown',
    timeSteps: steps.length,
    metrics: {
      peakOutfallInflow,
      totalOutfallVolume,
      peakFloodingRate,
      totalFloodingVolume,
      floodedNodeCount: floodedNodes.size,
      maxNodeDepth,
      maxNodeHead: maxNodeHead === -Infinity ? 0 : maxNodeHead,
      maxLinkFlow,
      maxLinkVelocity,
      maxLinkCapacity,
      surchargedLinkCount: surchargedLinks.size,
      continuityRunoff: Math.abs(results.summary?.continuityErrors?.runoff ?? 0),
      continuityFlow: Math.abs(results.summary?.continuityErrors?.flow ?? 0),
    },
  };
}

export function compareSnapshots(baseline: RunSnapshot, revised: RunSnapshot, tolerances: ToleranceSet): CompareRow[] {
  return REGRESSION_METRICS.map(def => {
    const b = baseline.metrics[def.key];
    const r = revised.metrics[def.key];
    if (b === undefined || r === undefined || !isFinite(b) || !isFinite(r)) {
      return { key: def.key, label: def.label, baseline: b ?? null, revised: r ?? null, diff: null, pctChange: null, status: 'N/A' as CompareStatus };
    }
    const diff = r - b;
    const pctChange = Math.abs(b) > 1e-12 ? (diff / Math.abs(b)) * 100 : null;
    const tol = tolerances[def.key] || { passPct: def.defaultPassPct, reviewPct: def.defaultReviewPct };
    // Signed "worsening": positive means the metric moved in the bad direction.
    const worsening = def.higherIsWorse ? diff : -diff;

    let status: CompareStatus;
    if (Math.abs(diff) <= def.absEpsilon) {
      status = 'Pass';
    } else if (pctChange === null) {
      // Baseline is ~0 but revised differs beyond epsilon: a genuine regression
      // (worsening) fails outright; an unexpected improvement warrants review.
      status = worsening > 0 ? 'Fail' : 'Review';
    } else {
      const worseningPct = def.higherIsWorse ? pctChange : -pctChange;
      if (worseningPct <= 0) {
        // Improvement: never Fail, but flag large unexpected changes for review.
        status = Math.abs(pctChange) <= tol.reviewPct ? 'Pass' : 'Review';
      } else if (worseningPct <= tol.passPct) {
        status = 'Pass';
      } else if (worseningPct <= tol.reviewPct) {
        status = 'Review';
      } else {
        status = 'Fail';
      }
    }
    return { key: def.key, label: def.label, baseline: b, revised: r, diff, pctChange, status };
  });
}

export function comparisonToCsv(rows: CompareRow[], baseline: RunSnapshot, revised: RunSnapshot, tolerances: ToleranceSet): string {
  const lines: string[] = [];
  lines.push(`# SWMM5-UI Regression Comparison`);
  lines.push(`# Baseline: ${baseline.fileName} (${baseline.engineUsed}, ${baseline.timeSteps} steps, captured ${baseline.capturedAt})`);
  lines.push(`# Revised: ${revised.fileName} (${revised.engineUsed}, ${revised.timeSteps} steps, captured ${revised.capturedAt})`);
  lines.push('Metric,Baseline,Revised,Difference,PctChange,PassTol(%),ReviewTol(%),Status');
  for (const row of rows) {
    const tol = tolerances[row.key];
    lines.push([
      `"${row.label}"`,
      row.baseline !== null ? row.baseline.toPrecision(6) : '',
      row.revised !== null ? row.revised.toPrecision(6) : '',
      row.diff !== null ? row.diff.toPrecision(6) : '',
      row.pctChange !== null ? row.pctChange.toFixed(2) : '',
      tol ? tol.passPct : '',
      tol ? tol.reviewPct : '',
      row.status,
    ].join(','));
  }
  return lines.join('\n');
}
