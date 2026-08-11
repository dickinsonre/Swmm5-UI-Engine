// Batch-run metric extraction and cross-engine comparison.
// Ported/adapted from the user's BatchSWMMRunner project (engineComparison.ts
// + reportParser.ts), trimmed to the engines available in this app.

export interface BatchParsedMetrics {
  runoffContinuityError?: number;
  routingContinuityError?: number;
  totalPrecipitation?: number;
  surfaceRunoff?: number;
  nodesFlooded?: number;
  flowRoutingMethod?: string;
  infiltrationMethod?: string;
  totalInflow?: number;
  totalOutflow?: number;
  floodingLoss?: number;
  reportWarnings?: string[];
  reportErrors?: string[];
}

export interface BatchFileResult {
  fileName: string;
  status: 'success' | 'failed' | 'cancelled';
  error?: string;
  processingTime?: number; // seconds
  /** True when the full .rpt text is retained in the caller's report cache. */
  hasReport?: boolean;
  /** Caller-side key for looking up the cached report text. */
  cacheKey?: string;
  engineVersion?: string;
  parsedMetrics?: BatchParsedMetrics;
}

export type BatchEngineId = 'local' | 'wasm' | 'wasm6' | 'wasm6dev' | 'remote';

export const BATCH_ENGINE_LABELS: Record<BatchEngineId, string> = {
  local: 'Local 5.2.4',
  wasm: 'WASM 5.2.4',
  wasm6: 'SWMM6 rel WASM',
  wasm6dev: 'SWMM6 dev WASM',
  remote: 'Remote 5.2.4',
};

export interface EngineRun {
  engine: BatchEngineId;
  label: string;
  results: BatchFileResult[];
}

const MAX_REPORT_ISSUES = 100;

export function extractReportIssues(reportContent: string): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];
  for (const rawLine of reportContent.split('\n')) {
    const line = rawLine.trim();
    if (/^WARNING\b/i.test(line)) {
      if (warnings.length < MAX_REPORT_ISSUES) warnings.push(line);
    } else if (/^ERROR\b/i.test(line)) {
      if (errors.length < MAX_REPORT_ISSUES) errors.push(line);
    }
  }
  return { warnings, errors };
}

export function extractEngineVersion(reportContent: string): string | undefined {
  const m = reportContent.match(/(?:EPA STORM WATER MANAGEMENT MODEL|OPENSWMM ENGINE) - VERSION\s+([\d.a-z-]+)(?:\s*\(Build\s+([\d.]+)\))?/i);
  if (m) return m[2] || m[1];
  return undefined;
}

export function parseReportMetrics(reportContent: string): BatchParsedMetrics {
  const metrics: BatchParsedMetrics = {};

  const runoffCE = reportContent.match(/Runoff Quantity Continuity[\s\S]*?Continuity Error \(%\)\s*\.+\s*([-\d.]+)/i);
  if (runoffCE) metrics.runoffContinuityError = parseFloat(runoffCE[1]);

  const routingCE = reportContent.match(/Flow Routing Continuity[\s\S]*?Continuity Error \(%\)\s*\.+\s*([-\d.]+)/i);
  if (routingCE) metrics.routingContinuityError = parseFloat(routingCE[1]);

  const precip = reportContent.match(/Total Precipitation\s*\.+\s*([\d.]+)/i);
  if (precip) metrics.totalPrecipitation = parseFloat(precip[1]);

  const runoff = reportContent.match(/Surface Runoff\s*\.+\s*([\d.]+)/i);
  if (runoff) metrics.surfaceRunoff = parseFloat(runoff[1]);

  const floodingMatch = reportContent.match(/Flooding was detected at (\d+) node/i);
  if (floodingMatch) {
    metrics.nodesFlooded = parseInt(floodingMatch[1], 10);
  } else if (/No nodes were flooded/i.test(reportContent)) {
    metrics.nodesFlooded = 0;
  }

  const routingMethod = reportContent.match(/Flow Routing Method\s*\.+\s*(\S+)/i);
  if (routingMethod) metrics.flowRoutingMethod = routingMethod[1];

  const infiltration = reportContent.match(/Infiltration Method\s*\.+\s*(\S+)/i);
  if (infiltration) metrics.infiltrationMethod = infiltration[1];

  const wetInflow = reportContent.match(/Wet Weather Inflow\s*\.+\s*([\d.]+)/i);
  if (wetInflow) metrics.totalInflow = parseFloat(wetInflow[1]);

  const extOutflow = reportContent.match(/External Outflow\s*\.+\s*([\d.]+)/i);
  if (extOutflow) metrics.totalOutflow = parseFloat(extOutflow[1]);

  const floodLoss = reportContent.match(/Flooding Loss\s*\.+\s*([\d.]+)/i);
  if (floodLoss) metrics.floodingLoss = parseFloat(floodLoss[1]);

  const issues = extractReportIssues(reportContent);
  if (issues.warnings.length > 0) metrics.reportWarnings = issues.warnings;
  if (issues.errors.length > 0) metrics.reportErrors = issues.errors;

  return metrics;
}

// ---------------------------------------------------------------------------
// Cross-engine comparison

export interface MetricComparison {
  key: string;
  label: string;
  values: (number | undefined)[];
  differs: boolean;
  maxDelta: number | undefined;
}

export interface FileComparison {
  fileName: string;
  results: (BatchFileResult | undefined)[];
  statuses: (BatchFileResult['status'] | 'missing')[];
  statusMismatch: boolean;
  metrics: MetricComparison[];
  verdict: 'match' | 'differs' | 'status-mismatch' | 'inconclusive';
}

export interface ComparisonSummary {
  engines: { engine: BatchEngineId; label: string }[];
  files: FileComparison[];
  matchCount: number;
  differCount: number;
  statusMismatchCount: number;
  inconclusiveCount: number;
}

const NUMERIC_METRICS: { key: keyof BatchParsedMetrics; label: string; tolerance: number; relative?: boolean }[] = [
  { key: 'runoffContinuityError', label: 'Runoff continuity error (%)', tolerance: 0.05 },
  { key: 'routingContinuityError', label: 'Flow routing continuity error (%)', tolerance: 0.05 },
  { key: 'totalPrecipitation', label: 'Total precipitation', tolerance: 0.001, relative: true },
  { key: 'surfaceRunoff', label: 'Surface runoff', tolerance: 0.005, relative: true },
  { key: 'totalInflow', label: 'Total inflow', tolerance: 0.005, relative: true },
  { key: 'totalOutflow', label: 'Total outflow', tolerance: 0.005, relative: true },
  { key: 'floodingLoss', label: 'Flooding loss', tolerance: 0.005, relative: true },
  { key: 'nodesFlooded', label: 'Nodes flooded', tolerance: 0 },
];

function valuesDiffer(values: (number | undefined)[], tolerance: number, relative: boolean): { differs: boolean; maxDelta: number | undefined } {
  const present = values.filter((v): v is number => v !== undefined && Number.isFinite(v));
  if (present.length < 2) return { differs: false, maxDelta: undefined };
  const min = Math.min(...present);
  const max = Math.max(...present);
  const delta = max - min;
  if (relative) {
    const scale = Math.max(Math.abs(min), Math.abs(max), 1e-9);
    return { differs: delta / scale > tolerance, maxDelta: delta };
  }
  return { differs: delta > tolerance, maxDelta: delta };
}

/**
 * Align results by (fileName, occurrence) across engine runs and flag
 * differences. Warning/error counts and run time are informational only and
 * never flip the verdict.
 */
export function buildComparison(runs: EngineRun[]): ComparisonSummary {
  const engines = runs.map(r => ({ engine: r.engine, label: r.label }));

  const keyed = runs.map(run => {
    const counts = new Map<string, number>();
    const byKey = new Map<string, BatchFileResult>();
    for (const res of run.results) {
      const n = counts.get(res.fileName) ?? 0;
      counts.set(res.fileName, n + 1);
      byKey.set(`${res.fileName}\u0000${n}`, res);
    }
    return byKey;
  });

  const keys: string[] = [];
  const seen = new Set<string>();
  for (const byKey of keyed) {
    for (const key of byKey.keys()) {
      if (!seen.has(key)) { seen.add(key); keys.push(key); }
    }
  }

  const files: FileComparison[] = keys.map(key => {
    const [baseName, occStr] = key.split('\u0000');
    const occurrence = Number(occStr);
    const fileName = occurrence > 0 ? `${baseName} (${occurrence + 1})` : baseName;
    const results = keyed.map(byKey => byKey.get(key));
    const statuses = results.map(r => (r ? r.status : 'missing' as const));
    const presentStatuses = statuses.filter(s => s !== 'missing');
    const statusMismatch = new Set(presentStatuses).size > 1 || statuses.includes('missing');

    const metrics: MetricComparison[] = [];
    for (const spec of NUMERIC_METRICS) {
      const values = results.map(r => {
        const v = r?.parsedMetrics?.[spec.key];
        return typeof v === 'number' ? v : undefined;
      });
      const { differs, maxDelta } = valuesDiffer(values, spec.tolerance, !!spec.relative);
      metrics.push({ key: spec.key, label: spec.label, values, differs, maxDelta });
    }
    metrics.push({
      key: 'warningCount', label: 'Warnings (count)',
      values: results.map(r => r?.parsedMetrics?.reportWarnings?.length),
      differs: false, maxDelta: undefined,
    });
    metrics.push({
      key: 'errorCount', label: 'Report errors (count)',
      values: results.map(r => r?.parsedMetrics?.reportErrors?.length),
      differs: false, maxDelta: undefined,
    });
    metrics.push({
      key: 'processingTime', label: 'Run time (s)',
      values: results.map(r => r?.processingTime),
      differs: false, maxDelta: undefined,
    });

    const anyMetricDiffers = metrics.some(m => m.differs);
    const numericKeys = new Set(NUMERIC_METRICS.map(s => s.key as string));
    const anyComparable = metrics.some(m =>
      numericKeys.has(m.key) &&
      m.values.filter(v => v !== undefined && Number.isFinite(v)).length >= 2
    );
    const verdict: FileComparison['verdict'] = statusMismatch
      ? 'status-mismatch'
      : anyMetricDiffers ? 'differs'
      : anyComparable ? 'match'
      : 'inconclusive';

    return { fileName, results, statuses, statusMismatch, metrics, verdict };
  });

  return {
    engines,
    files,
    matchCount: files.filter(f => f.verdict === 'match').length,
    differCount: files.filter(f => f.verdict === 'differs').length,
    statusMismatchCount: files.filter(f => f.verdict === 'status-mismatch').length,
    inconclusiveCount: files.filter(f => f.verdict === 'inconclusive').length,
  };
}
