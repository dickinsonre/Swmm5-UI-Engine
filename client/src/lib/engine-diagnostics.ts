import type { SwmmProject, SimulationResults } from './swmm-types';
import { parseInpFile } from './inp-parser';
import {
  createLocalEngine,
  createWasmEngine,
  createWasm6Engine,
  createRemoteEngine,
  createMockEngine,
  loadWasmModule,
  checkWasm6Engine,
} from './swmm-engine';

export type EngineId = 'local' | 'wasm' | 'wasm6' | 'wasm6dev' | 'remote' | 'mock';

export interface EngineStatus {
  engine: EngineId;
  ready: boolean;
  version: string;
  detail: string;
  checkedAt: number;
}

export interface RunProvenance {
  engine: EngineId;
  startedAt: number;
  finishedAt: number;
  runtimeMs: number;
  timeStepCount: number;
  reportingSteps: number;
  totalDuration: number;
  routingModel: string;
  continuityErrors: { runoff: number; flow: number; quality: number };
  outputBytes: number;
  warningCount: number;
}

export const ENGINE_LABELS: Record<EngineId, string> = {
  local: 'Local (server binary)',
  wasm: 'SWMM 5.2.4 WASM (in-browser)',
  wasm6: 'OpenSWMM 6 rel WASM (in-browser)',
  wasm6dev: 'OpenSWMM 6 dev WASM (in-browser)',
  remote: 'Remote (BatchSWMM cloud)',
  mock: 'Mock (synthetic)',
};

export const ENGINE_COLORS: Record<EngineId, string> = {
  local: '#2a8a4a',
  wasm: '#e88a1a',
  wasm6: '#8a4ae2',
  wasm6dev: '#c24ae2',
  remote: '#2c6eb5',
  mock: '#6b6b7b',
};

let statusCache: EngineStatus[] | null = null;

async function probeLocal(): Promise<EngineStatus> {
  const checkedAt = Date.now();
  try {
    const resp = await fetch('/api/swmm/status');
    if (!resp.ok) {
      return { engine: 'local', ready: false, version: '—', detail: `Status endpoint returned HTTP ${resp.status}`, checkedAt };
    }
    const data = await resp.json();
    if (data.found === true) {
      return { engine: 'local', ready: true, version: '5.2.4', detail: 'Executable probe passed', checkedAt };
    }
    return { engine: 'local', ready: false, version: '—', detail: 'Binary missing or not executable on server', checkedAt };
  } catch (e: any) {
    return { engine: 'local', ready: false, version: '—', detail: `Probe failed: ${e.message}`, checkedAt };
  }
}

async function probeWasm(): Promise<EngineStatus> {
  const checkedAt = Date.now();
  try {
    const jsResp = await fetch('/swmm_engine.js', { method: 'HEAD' });
    const jsOk = jsResp.ok && (jsResp.headers.get('content-type') || '').includes('javascript');
    if (!jsOk) {
      return { engine: 'wasm', ready: false, version: '—', detail: 'swmm_engine.js not served', checkedAt };
    }
    const wasmResp = await fetch('/swmm_engine.wasm', { method: 'HEAD' });
    if (!wasmResp.ok) {
      return { engine: 'wasm', ready: false, version: '—', detail: 'swmm_engine.wasm not served', checkedAt };
    }
    // Real module initialization (downloads + instantiates the WASM runtime).
    const mod = await loadWasmModule();
    let version = '5.2.4';
    try {
      const getVersion = mod.cwrap('swmm_getVersion', 'number', []);
      const v = getVersion();
      if (v > 0) {
        const major = Math.floor(v / 10000);
        const minor = Math.floor((v % 10000) / 1000);
        const patch = v % 1000;
        version = `${major}.${minor}.${patch}`;
      }
    } catch {}
    return { engine: 'wasm', ready: true, version, detail: 'Module initialization passed', checkedAt };
  } catch (e: any) {
    return { engine: 'wasm', ready: false, version: '—', detail: `Initialization failed: ${e.message}`, checkedAt };
  }
}

async function probeWasm6(variant: 'wasm6' | 'wasm6dev'): Promise<EngineStatus> {
  const checkedAt = Date.now();
  const version = variant === 'wasm6dev' ? '6.0 develop' : '6.0.0-alpha.3';
  try {
    const ok = await checkWasm6Engine(variant);
    if (!ok) {
      return { engine: variant, ready: false, version: '—', detail: 'OpenSWMM 6 WASM artifacts not served', checkedAt };
    }
    return { engine: variant, ready: true, version, detail: 'Engine artifacts served (fresh instance created per run)', checkedAt };
  } catch (e: any) {
    return { engine: variant, ready: false, version: '—', detail: `Probe failed: ${e.message}`, checkedAt };
  }
}

async function probeRemote(): Promise<EngineStatus> {
  const checkedAt = Date.now();
  try {
    // Remote-only endpoint: always queries the cloud API, never answered by the local engine.
    const resp = await fetch('/api/swmm-proxy/remote-status');
    if (!resp.ok) {
      return { engine: 'remote', ready: false, version: '—', detail: `Proxy returned HTTP ${resp.status}`, checkedAt };
    }
    const data = await resp.json();
    if (data.found === true) {
      let version = '5.2.4';
      if (typeof data.apiVersion === 'number') {
        const v = data.apiVersion;
        version = `${Math.floor(v / 10000)}.${Math.floor((v % 10000) / 1000)}.${v % 1000}`;
      }
      return { engine: 'remote', ready: true, version, detail: 'Cloud API reachable', checkedAt };
    }
    return { engine: 'remote', ready: false, version: '—', detail: data.error ? `Unreachable: ${data.error}` : 'Cloud API reports not found', checkedAt };
  } catch (e: any) {
    return { engine: 'remote', ready: false, version: '—', detail: `Probe failed: ${e.message}`, checkedAt };
  }
}

function probeMock(): EngineStatus {
  return {
    engine: 'mock',
    ready: true,
    version: 'n/a',
    detail: 'Always available (synthetic results for testing)',
    checkedAt: Date.now(),
  };
}

export async function probeAllEngines(force = false): Promise<EngineStatus[]> {
  if (!force && statusCache) return statusCache;
  const [local, wasm, wasm6, wasm6dev, remote] = await Promise.all([probeLocal(), probeWasm(), probeWasm6('wasm6'), probeWasm6('wasm6dev'), probeRemote()]);
  statusCache = [local, wasm, wasm6, wasm6dev, remote, probeMock()];
  return statusCache;
}

export function getCachedEngineStatuses(): EngineStatus[] | null {
  return statusCache;
}

export function buildProvenance(
  results: SimulationResults,
  fallbackEngine: EngineId,
  startedAt: number,
  finishedAt: number
): RunProvenance {
  const report = results.reportContent || '';
  const warningCount = (report.match(/WARNING/g) || []).length;
  return {
    engine: results.engineUsed || fallbackEngine,
    startedAt,
    finishedAt,
    runtimeMs: finishedAt - startedAt,
    timeStepCount: results.timeSteps.length,
    reportingSteps: results.summary.reportingSteps,
    totalDuration: results.summary.totalDuration,
    routingModel: results.summary.routingModel,
    continuityErrors: results.summary.continuityErrors,
    outputBytes: report.length,
    warningCount,
  };
}

// ---------------------------------------------------------------------------
// Self-test: a tiny bundled model run through every available engine.
// ---------------------------------------------------------------------------

export const SELF_TEST_INP = `[TITLE]
Engine self-test model

[OPTIONS]
FLOW_UNITS           CFS
INFILTRATION         HORTON
FLOW_ROUTING         KINWAVE
START_DATE           01/01/2024
START_TIME           00:00:00
REPORT_START_DATE    01/01/2024
REPORT_START_TIME    00:00:00
END_DATE             01/01/2024
END_TIME             02:00:00
SWEEP_START          01/01
SWEEP_END            12/31
DRY_DAYS             0
REPORT_STEP          00:05:00
WET_STEP             00:05:00
DRY_STEP             01:00:00
ROUTING_STEP         0:00:30
ALLOW_PONDING        NO
INERTIAL_DAMPING     PARTIAL
VARIABLE_STEP        0.75
LENGTHENING_STEP     0
MIN_SURFAREA         12.557
NORMAL_FLOW_LIMITED  BOTH
SKIP_STEADY_STATE    NO
FORCE_MAIN_EQUATION  H-W
LINK_OFFSETS         DEPTH
MIN_SLOPE            0

[RAINGAGES]
RG1              INTENSITY 0:05     1.0      TIMESERIES TS1

[SUBCATCHMENTS]
S1               RG1              J1               5        50       500      0.5      0

[SUBAREAS]
S1               0.01       0.1        0.05       0.05       25         OUTLET

[INFILTRATION]
S1               3.0        0.5        4.0        7          0

[JUNCTIONS]
J1               100        4          0          0          0
J2               98         4          0          0          0

[OUTFALLS]
O1               95         FREE                        NO

[CONDUITS]
C1               J1               J2               400        0.013      0          0          0          0
C2               J2               O1               400        0.013      0          0          0          0

[XSECTIONS]
C1               CIRCULAR     1.5              0          0          0          1
C2               CIRCULAR     1.5              0          0          0          1

[TIMESERIES]
TS1              0:00       0.5
TS1              0:15       1.0
TS1              0:30       0.75
TS1              0:45       0.25
TS1              1:00       0.0

[REPORT]
INPUT      NO
CONTROLS   NO
SUBCATCHMENTS ALL
NODES ALL
LINKS ALL

[COORDINATES]
J1               0                0
J2               500              0
O1               1000             0

[POLYGONS]
S1               -200             200
S1               0                200
S1               0                400
S1               -200             400
`;

export interface SelfTestResult {
  engine: EngineId;
  status: 'passed' | 'failed' | 'unavailable' | 'skipped';
  detail: string;
  runtimeMs: number | null;
  peakOutfallFlow: number | null;
  flowContinuityError: number | null;
}

export interface SelfTestSummary {
  results: SelfTestResult[];
  comparison: {
    checked: boolean;
    withinTolerance: boolean;
    detail: string;
  };
}

const SELF_TEST_TOLERANCE = 0.05; // 5% relative difference in peak flow
const MAX_CONTINUITY_ERROR = 5; // percent

function extractMetrics(results: SimulationResults): { peak: number; ce: number } {
  let peak = 0;
  for (const ts of results.timeSteps) {
    const flow = Math.abs(ts.links?.['C2']?.flow ?? 0);
    if (flow > peak) peak = flow;
  }
  // Prefer the authoritative report value when present
  const report = results.reportContent || '';
  const m = report.match(/^\s*C2\s+CONDUIT\s+([\d.]+)/m);
  if (m) {
    const rptPeak = parseFloat(m[1]);
    if (!isNaN(rptPeak) && rptPeak > 0) peak = rptPeak;
  }
  return { peak, ce: results.summary.continuityErrors.flow };
}

export async function runEngineSelfTest(
  statuses: EngineStatus[],
  onProgress?: (msg: string) => void
): Promise<SelfTestSummary> {
  const project: SwmmProject = parseInpFile(SELF_TEST_INP);
  const results: SelfTestResult[] = [];

  const engines: Array<{ id: EngineId; make: () => { run: (p: SwmmProject) => Promise<SimulationResults> } }> = [
    { id: 'local', make: createLocalEngine },
    { id: 'wasm', make: createWasmEngine },
    { id: 'wasm6', make: () => createWasm6Engine('wasm6') },
    { id: 'wasm6dev', make: () => createWasm6Engine('wasm6dev') },
    { id: 'remote', make: createRemoteEngine },
    { id: 'mock', make: createMockEngine },
  ];

  for (const { id, make } of engines) {
    const status = statuses.find(s => s.engine === id);
    if (!status || !status.ready) {
      results.push({
        engine: id,
        status: 'unavailable',
        detail: status ? status.detail : 'Not probed',
        runtimeMs: null,
        peakOutfallFlow: null,
        flowContinuityError: null,
      });
      continue;
    }
    if (onProgress) onProgress(`Running self-test on ${ENGINE_LABELS[id]}...`);
    const t0 = Date.now();
    try {
      const res = await make().run(project);
      const runtimeMs = Date.now() - t0;
      const { peak, ce } = extractMetrics(res);
      // Guard against silent fallback: local engine may internally delegate.
      if (id === 'local' && res.engineUsed && res.engineUsed !== 'local') {
        results.push({
          engine: id,
          status: 'failed',
          detail: `Fell back to ${res.engineUsed} engine instead of running locally`,
          runtimeMs,
          peakOutfallFlow: peak,
          flowContinuityError: ce,
        });
        continue;
      }
      const ceOk = Math.abs(ce) <= MAX_CONTINUITY_ERROR;
      results.push({
        engine: id,
        status: ceOk ? 'passed' : 'failed',
        detail: ceOk
          ? `Completed in ${(runtimeMs / 1000).toFixed(1)}s`
          : `Flow continuity error ${ce.toFixed(2)}% exceeds ${MAX_CONTINUITY_ERROR}%`,
        runtimeMs,
        peakOutfallFlow: peak,
        flowContinuityError: ce,
      });
    } catch (e: any) {
      results.push({
        engine: id,
        status: 'failed',
        detail: e.message || 'Run failed',
        runtimeMs: Date.now() - t0,
        peakOutfallFlow: null,
        flowContinuityError: null,
      });
    }
  }

  // Compare real engines (exclude mock — its results are synthetic).
  const real = results.filter(
    r => r.engine !== 'mock' && r.status === 'passed' && r.peakOutfallFlow !== null && r.peakOutfallFlow > 0
  );
  let comparison: SelfTestSummary['comparison'];
  if (real.length < 2) {
    comparison = {
      checked: false,
      withinTolerance: true,
      detail: real.length === 1
        ? `Only one real engine available (${ENGINE_LABELS[real[0].engine]}) — nothing to cross-check`
        : 'No real engines completed — nothing to cross-check',
    };
  } else {
    const peaks = real.map(r => r.peakOutfallFlow as number);
    const minP = Math.min(...peaks);
    const maxP = Math.max(...peaks);
    const relDiff = maxP > 0 ? (maxP - minP) / maxP : 0;
    const ok = relDiff <= SELF_TEST_TOLERANCE;
    comparison = {
      checked: true,
      withinTolerance: ok,
      detail: ok
        ? `Peak outfall flows agree within ${(relDiff * 100).toFixed(2)}% (tolerance ${SELF_TEST_TOLERANCE * 100}%)`
        : `Peak outfall flows differ by ${(relDiff * 100).toFixed(2)}% — exceeds ${SELF_TEST_TOLERANCE * 100}% tolerance`,
    };
  }

  return { results, comparison };
}
