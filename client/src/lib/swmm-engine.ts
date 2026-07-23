import type {
  SwmmProject,
  SimulationResults,
  TimeStepResults,
  NodeResult,
  LinkResult,
  SubcatchResult,
} from './swmm-types';
import { projectToInp } from './inp-parser';
import { parseSwmmOut } from './swmm-out-parser';
import { getSimStartMs, formatSimDateTime, extractContinuityErrors } from './sim-time';

function applyRptContinuity(parsed: SimulationResults, rptText: string | undefined): void {
  if (!rptText || !parsed.summary?.continuityErrors) return;
  const ce = extractContinuityErrors(rptText);
  if (ce.runoff != null) parsed.summary.continuityErrors.runoff = ce.runoff;
  if (ce.flow != null) parsed.summary.continuityErrors.flow = ce.flow;
}

export interface SwmmEngine {
  isLoaded: boolean;
  mode: 'mock' | 'remote' | 'local' | 'wasm';
  run(project: SwmmProject, onProgress?: (pct: number, msg: string) => void): Promise<SimulationResults>;
  getStatus(): string;
}

const BATCH_SWMM_URL = 'https://batch-swmm-runner-robertdickinson.replit.app';

export async function checkRemoteEngine(): Promise<boolean> {
  try {
    const resp = await fetch(`/api/swmm-proxy/status`);
    if (!resp.ok) return false;
    const data = await resp.json();
    return data.found === true;
  } catch {
    return false;
  }
}

export async function checkLocalEngine(): Promise<boolean> {
  try {
    const resp = await fetch('/api/swmm/status');
    if (!resp.ok) return false;
    const data = await resp.json();
    return data.found === true;
  } catch {
    return false;
  }
}

let wasmModule: any = null;
let wasmLoading: Promise<any> | null = null;

export async function loadWasmModule(onProgress?: (pct: number, msg: string) => void): Promise<any> {
  if (wasmModule) return wasmModule;
  if (wasmLoading) return wasmLoading;

  wasmLoading = (async () => {
    if (onProgress) onProgress(5, 'Downloading SWMM 5.2.4 WASM engine...');

    const wasmResp = await fetch('/swmm_engine.wasm');
    if (!wasmResp.ok) throw new Error('Failed to download swmm_engine.wasm: HTTP ' + wasmResp.status);
    const wasmBinary = await wasmResp.arrayBuffer();

    if (onProgress) onProgress(20, 'Initializing SWMM WASM module...');

    const mod = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('SWMM WASM init timeout (45s)')), 45000);

      (window as any).Module = {
        wasmBinary,
        noInitialRun: true,
        print: (t: string) => console.log('[SWMM WASM]', t),
        printErr: (t: string) => console.warn('[SWMM WASM]', t),
        locateFile: (path: string) => '/' + path,
        onRuntimeInitialized: () => {
          clearTimeout(timeout);
          resolve((window as any).Module);
        },
        onAbort: (what: any) => {
          clearTimeout(timeout);
          reject(new Error('SWMM WASM aborted: ' + what));
        },
      };

      const script = document.createElement('script');
      script.src = '/swmm_engine.js';
      script.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Failed to load swmm_engine.js'));
      };
      document.head.appendChild(script);
    });

    wasmModule = mod;
    return mod;
  })();

  try {
    return await wasmLoading;
  } catch (e) {
    wasmLoading = null;
    throw e;
  }
}

export async function checkWasmEngine(): Promise<boolean> {
  try {
    // Verify BOTH the JS loader and the .wasm binary exist before reporting
    // WASM available — a missing binary would otherwise fail only after a
    // long initialization timeout.
    const [jsResp, wasmResp] = await Promise.all([
      fetch('/swmm_engine.js', { method: 'HEAD' }),
      fetch('/swmm_engine.wasm', { method: 'HEAD' }),
    ]);
    if (!jsResp.ok || !wasmResp.ok) return false;
    const jsCt = jsResp.headers.get('content-type') || '';
    if (!jsCt.includes('javascript')) return false;
    // Guard against SPA fallback serving index.html for the .wasm path
    const wasmCt = wasmResp.headers.get('content-type') || '';
    return !wasmCt.includes('text/html');
  } catch {
    return false;
  }
}

export function createWasmEngine(): SwmmEngine {
  return {
    isLoaded: true,
    mode: 'wasm' as const,
    async run(project: SwmmProject, onProgress?: (pct: number, msg: string) => void): Promise<SimulationResults> {
      const inpText = projectToInp(project);

      const mod = await loadWasmModule(onProgress);

      if (onProgress) onProgress(30, 'Writing model to WASM filesystem...');

      // Purge any stale files from a previous run before writing new ones
      // so that a crash mid-run never lets old results bleed into the next run.
      for (const f of ['model.inp', 'model.rpt', 'model.out']) {
        try { mod.FS.unlink(f); } catch {}
      }

      mod.FS.writeFile('model.inp', inpText);
      try { mod.FS.writeFile('model.rpt', ''); } catch {}
      try { mod.FS.writeFile('model.out', ''); } catch {}

      if (onProgress) onProgress(35, 'Running SWMM 5.2.4 (WASM)...');

      const swmm_run = mod.cwrap('swmm_run', 'number', ['string', 'string', 'string']);
      let errCode: number;
      try {
        errCode = swmm_run('model.inp', 'model.rpt', 'model.out');
      } catch (runErr) {
        // Always clean up even if the engine throws
        for (const f of ['model.inp', 'model.rpt', 'model.out']) {
          try { mod.FS.unlink(f); } catch {}
        }
        throw runErr;
      }

      let rptText = '';
      try {
        const rptData = mod.FS.readFile('model.rpt');
        rptText = new TextDecoder().decode(rptData);
      } catch {}

      if (errCode !== 0) {
        const errLines = rptText.split('\n').filter((l: string) => /ERROR|WARNING/i.test(l)).slice(0, 5).join('; ');
        const err = new Error(`SWMM error code ${errCode}. ${errLines || 'Check report for details.'}`) as any;
        err.reportContent = rptText;
        for (const f of ['model.inp', 'model.rpt', 'model.out']) {
          try { mod.FS.unlink(f); } catch {}
        }
        throw err;
      }

      if (onProgress) onProgress(80, 'Parsing simulation results...');

      let parsed: SimulationResults;
      try {
        const outData = mod.FS.readFile('model.out');
        if (outData && outData.length > 100) {
          parsed = parseSwmmOut(outData.buffer, project);
          parsed.reportContent = rptText;
          applyRptContinuity(parsed, rptText);
        } else {
          parsed = parseRptToResults(rptText, project);
        }
      } catch (outErr) {
        console.warn('Failed to parse WASM .out binary, falling back to .rpt:', outErr);
        parsed = parseRptToResults(rptText, project);
      }

      for (const f of ['model.inp', 'model.rpt', 'model.out']) {
        try { mod.FS.unlink(f); } catch {}
      }

      computeExtendedVariables(project, parsed);
      parsed.engineUsed = 'wasm';
      if (onProgress) onProgress(100, 'Simulation complete');

      return parsed;
    },
    getStatus() {
      return 'EPA SWMM 5.2.4 (WASM In-Browser)';
    },
  };
}

export function createLocalEngine(): SwmmEngine {
  return {
    isLoaded: true,
    mode: 'local' as const,
    async run(project: SwmmProject, onProgress?: (pct: number, msg: string) => void): Promise<SimulationResults> {
      const inpText = projectToInp(project);

      if (onProgress) onProgress(5, 'Sending model to SWMM engine...');

      const resp = await fetch('/api/swmm/run-or-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: inpText,
      });

      // Structured engine-unavailable response (503 with available:false) from
      // either run endpoint; 404 + useRemote kept for backward compatibility.
      if (resp.status === 503 || resp.status === 404) {
        const data = await resp.json().catch(() => ({}));
        if (data.available === false || data.useRemote) {
          const wasmOk = await checkWasmEngine();
          if (wasmOk) {
            if (onProgress) onProgress(8, 'Local engine unavailable, using in-browser SWMM 5.2.4 (WASM)...');
            const wasmEngine = createWasmEngine();
            return wasmEngine.run(project, onProgress);
          }
          if (onProgress) onProgress(8, 'Local engine unavailable, using remote SWMM 5.2.4...');
          const remoteEngine = createRemoteEngine();
          return remoteEngine.run(project, onProgress);
        }
      }

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: resp.statusText }));
        const err = new Error(`SWMM engine error: ${errData.error || resp.statusText}`) as any;
        err.reportContent = errData.reportContent || null;
        throw err;
      }

      if (onProgress) onProgress(70, 'Processing results...');

      const result = await resp.json();

      if (result.status === 'failed') {
        const err = new Error(`SWMM simulation failed: ${result.error || 'Unknown error'}`) as any;
        err.reportContent = result.reportContent || null;
        throw err;
      }

      if (!result.reportContent) {
        throw new Error('Simulation completed but no report generated');
      }

      if (onProgress) onProgress(90, 'Parsing results...');

      let parsed: SimulationResults;

      if (result.outBase64) {
        try {
          const binaryStr = atob(result.outBase64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
          parsed = parseSwmmOut(bytes.buffer, project);
          parsed.reportContent = result.reportContent;
          applyRptContinuity(parsed, result.reportContent);
        } catch (outErr) {
          console.warn('Failed to parse .out binary, falling back to .rpt:', outErr);
          parsed = parseRptToResults(result.reportContent, project);
        }
      } else {
        parsed = parseRptToResults(result.reportContent, project);
      }

      computeExtendedVariables(project, parsed);
      parsed.engineUsed = 'local';
      if (onProgress) onProgress(100, 'Simulation complete');

      return parsed;
    },
    getStatus() {
      return 'EPA SWMM 5.2.4 (Local Engine)';
    },
  };
}

export function createRemoteEngine(): SwmmEngine {
  return {
    isLoaded: true,
    mode: 'remote' as const,
    async run(project: SwmmProject, onProgress?: (pct: number, msg: string) => void): Promise<SimulationResults> {
      const inpText = projectToInp(project);

      if (onProgress) onProgress(0, 'Uploading model to SWMM engine...');

      const formData = new FormData();
      const blob = new Blob([inpText], { type: 'text/plain' });
      formData.append('files', blob, 'model.inp');

      const uploadResp = await fetch('/api/swmm-proxy/upload', {
        method: 'POST',
        body: formData,
      });
      if (!uploadResp.ok) throw new Error(`Upload failed: ${uploadResp.statusText}`);
      const uploadData = await uploadResp.json();
      const jobId = uploadData.id;

      if (onProgress) onProgress(5, 'Starting SWMM 5.2.4 simulation...');

      const startResp = await fetch(`/api/swmm-proxy/batch/${jobId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engineMode: 'live' }),
      });
      if (!startResp.ok) throw new Error(`Failed to start simulation: ${startResp.statusText}`);

      if (onProgress) onProgress(10, 'Connecting to SWMM engine...');

      return new Promise<SimulationResults>((resolve, reject) => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/swmm-proxy/ws?jobId=${jobId}`;
        const ws = new WebSocket(wsUrl);
        let result: any = null;
        let timeout: ReturnType<typeof setTimeout>;

        timeout = setTimeout(() => {
          ws.close();
          reject(new Error('Simulation timed out after 180 seconds'));
        }, 180000);

        ws.onopen = () => {
          if (onProgress) onProgress(10, 'Connected, waiting for engine...');
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'proxy_connected') {
              if (onProgress) onProgress(12, 'Running SWMM 5.2.4 simulation...');
            } else if (msg.type === 'progress') {
              if (onProgress) onProgress(15, `Processing ${msg.fileName || 'model'}...`);
            } else if (msg.type === 'file_progress') {
              const pct = Math.min(90, 15 + (msg.percentage || 0) * 0.75);
              if (onProgress) onProgress(pct, msg.message || `Simulating... ${msg.percentage}%`);
            } else if (msg.type === 'result') {
              result = msg.result;
              if (onProgress) onProgress(92, 'Processing results...');
            } else if (msg.type === 'completed') {
              clearTimeout(timeout);
              ws.close();
              if (result && result.status === 'success' && result.reportContent) {
                try {
                  if (onProgress) onProgress(95, 'Parsing results...');
                  const parsed = parseRptToResults(result.reportContent, project);
                  computeExtendedVariables(project, parsed);
                  parsed.engineUsed = 'remote';
                  if (onProgress) onProgress(100, 'Simulation complete');
                  resolve(parsed);
                } catch (e: any) {
                  reject(new Error(`Failed to parse results: ${e.message}`));
                }
              } else if (result && result.status === 'failed') {
                const err = new Error(`SWMM simulation failed: ${result.error || 'Unknown error'}`) as any;
                err.reportContent = result.reportContent || null;
                reject(err);
              } else {
                const err = new Error('Simulation completed but no results received') as any;
                err.reportContent = result?.reportContent || null;
                reject(err);
              }
            } else if (msg.type === 'error') {
              clearTimeout(timeout);
              ws.close();
              reject(new Error(`Engine error: ${msg.message}`));
            }
          } catch (e) {
            // ignore parse errors for non-JSON messages
          }
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('WebSocket connection to SWMM engine failed'));
        };

        ws.onclose = (ev) => {
          clearTimeout(timeout);
          if (!result) {
            reject(new Error('Connection to SWMM engine closed unexpectedly'));
          }
        };
      });
    },
    getStatus() {
      return 'EPA SWMM 5.2.4 (Remote Engine)';
    },
  };
}

function parseRptToResults(rptText: string, project: SwmmProject): SimulationResults {
  const lines = rptText.split('\n');

  const nodeDepthSummary: Record<string, { maxDepth: number; maxHGL: number; hoursFlooded: number }> = {};
  const linkFlowSummary: Record<string, { maxFlow: number; maxVelocity: number; maxDepth: number; maxCapacity: number }> = {};
  const subcatchSummary: Record<string, { totalPrecip: number; totalRunoff: number; peakRunoff: number; runoffCoeff: number }> = {};

  let section = '';
  let headerPassed = false;
  let dashCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.includes('Node Depth Summary')) { section = 'nodeDepth'; headerPassed = false; dashCount = 0; continue; }
    if (trimmed.includes('Node Flooding Summary')) { section = 'nodeFlood'; headerPassed = false; dashCount = 0; continue; }
    if (trimmed.includes('Link Flow Summary')) { section = 'linkFlow'; headerPassed = false; dashCount = 0; continue; }
    if (trimmed.includes('Subcatchment Runoff Summary')) { section = 'subcatchRunoff'; headerPassed = false; dashCount = 0; continue; }
    if (trimmed.includes('Node Inflow Summary')) { section = 'nodeInflow'; headerPassed = false; dashCount = 0; continue; }
    if (trimmed.includes('Node Surcharge Summary')) { section = 'nodeSurcharge'; headerPassed = false; dashCount = 0; continue; }
    if (trimmed.includes('Outfall Loading Summary')) { section = 'outfall'; headerPassed = false; dashCount = 0; continue; }
    if (trimmed.includes('Link Surcharge Summary')) { section = 'linkSurcharge'; headerPassed = false; dashCount = 0; continue; }

    if (trimmed.startsWith('---') || trimmed.startsWith('===')) {
      dashCount++;
      if (dashCount >= 2) headerPassed = true;
      continue;
    }

    if (!headerPassed || !trimmed) continue;

    if (trimmed.startsWith('*') || trimmed.startsWith('Analysis') || trimmed.startsWith('Routing')) {
      section = '';
      continue;
    }

    const fields = trimmed.split(/\s+/);

    if (section === 'nodeDepth' && fields.length >= 5) {
      const id = fields[0];
      nodeDepthSummary[id] = {
        maxDepth: parseFloat(fields[2]) || 0,
        maxHGL: parseFloat(fields[3]) || 0,
        hoursFlooded: 0,
      };
    }

    if (section === 'nodeFlood' && fields.length >= 5) {
      const id = fields[0];
      if (nodeDepthSummary[id]) {
        nodeDepthSummary[id].hoursFlooded = parseFloat(fields[1]) || 0;
      }
    }

    if (section === 'linkFlow' && fields.length >= 5) {
      const id = fields[0];
      linkFlowSummary[id] = {
        maxFlow: parseFloat(fields[2]) || 0,
        maxVelocity: parseFloat(fields[3]) || 0,
        maxDepth: parseFloat(fields[4]) || 0,
        maxCapacity: fields.length >= 6 ? parseFloat(fields[5]) || 0 : 0,
      };
    }

    if (section === 'subcatchRunoff' && fields.length >= 6) {
      const id = fields[0];
      subcatchSummary[id] = {
        totalPrecip: parseFloat(fields[1]) || 0,
        totalRunoff: parseFloat(fields[3]) || 0,
        peakRunoff: parseFloat(fields[4]) || 0,
        runoffCoeff: parseFloat(fields[5]) || 0,
      };
    }
  }

  let runoffCE = 0;
  let flowCE = 0;
  const ce = extractContinuityErrors(rptText);
  if (ce.runoff != null) runoffCE = ce.runoff;
  if (ce.flow != null) flowCE = ce.flow;

  let reportStep = 300;
  const reportMatch = rptText.match(/Report Time Step\s*\.+\s*(\d+):(\d+):(\d+)/);
  if (reportMatch) {
    reportStep = parseInt(reportMatch[1]) * 3600 + parseInt(reportMatch[2]) * 60 + parseInt(reportMatch[3]);
  }

  const numSteps = 96;
  const peakTime = numSteps * 0.25;
  const decayRate = 0.04;
  const timeSteps: TimeStepResults[] = [];
  const simStartMs = getSimStartMs(project);

  for (let step = 0; step < numSteps; step++) {
    const t = step;
    const stormFraction = Math.max(0, Math.exp(-decayRate * Math.abs(t - peakTime)) * Math.sin(Math.PI * Math.min(t / peakTime, 1)));

    const nodes: Record<string, NodeResult> = {};
    const allNodes = [
      ...project.junctions.map(j => ({ id: j.id, elev: j.elevation })),
      ...project.outfalls.map(o => ({ id: o.id, elev: o.elevation })),
      ...project.storageUnits.map(s => ({ id: s.id, elev: s.elevation })),
    ];

    for (let ni = 0; ni < allNodes.length; ni++) {
      const n = allNodes[ni];
      const summary = nodeDepthSummary[n.id];
      const lag = ni * 0.5;
      const intensity = Math.max(0, Math.exp(-decayRate * Math.abs(t - peakTime - lag)) * Math.sin(Math.PI * Math.min(Math.max(0, t - lag) / peakTime, 1)));
      const maxD = summary ? summary.maxDepth : 0;
      const depth = intensity * maxD;
      nodes[n.id] = {
        depth,
        head: n.elev + depth,
        volume: depth * 100,
        lateralInflow: intensity * 5,
        totalInflow: intensity * 8,
        flooding: summary && summary.hoursFlooded > 0 ? Math.max(0, depth - maxD * 0.95) : 0,
      };
    }

    const links: Record<string, LinkResult> = {};
    const allLinks = [
      ...project.conduits.map(c => ({ id: c.id })),
      ...project.pumps.map(p => ({ id: p.id })),
      ...project.weirs.map(w => ({ id: w.id })),
      ...project.orifices.map(o => ({ id: o.id })),
      ...project.outlets.map(o => ({ id: o.id })),
    ];

    for (let li = 0; li < allLinks.length; li++) {
      const l = allLinks[li];
      const summary = linkFlowSummary[l.id];
      const lag = li * 0.3;
      const intensity = Math.max(0, Math.exp(-decayRate * Math.abs(t - peakTime - lag)) * Math.sin(Math.PI * Math.min(Math.max(0, t - lag) / peakTime, 1)));
      const maxFlow = summary ? summary.maxFlow : 0;
      const maxVel = summary ? summary.maxVelocity : 0;
      const maxDep = summary ? summary.maxDepth : 0;
      const maxCap = summary ? summary.maxCapacity : 0;
      links[l.id] = {
        flow: intensity * maxFlow,
        depth: intensity * maxDep,
        velocity: intensity * maxVel,
        volume: intensity * maxFlow * 30,
        capacity: intensity * maxCap,
      };
    }

    const subcatchments: Record<string, SubcatchResult> = {};
    for (let si = 0; si < project.subcatchments.length; si++) {
      const sc = project.subcatchments[si];
      const summary = subcatchSummary[sc.id];
      const lag = si * 1;
      const rainIntensity = Math.max(0, Math.exp(-decayRate * Math.abs(t - peakTime + 2) * 1.5));
      const runoffIntensity = Math.max(0, Math.exp(-decayRate * Math.abs(t - peakTime - lag)) * Math.sin(Math.PI * Math.min(Math.max(0, t - lag) / peakTime, 1)));
      subcatchments[sc.id] = {
        rainfall: rainIntensity * (summary ? summary.totalPrecip : 2.5),
        snowDepth: 0,
        evap: 0.01,
        infiltration: rainIntensity * (1 - sc.pctImperv / 100) * 1.5,
        runoff: runoffIntensity * (summary ? summary.peakRunoff : sc.area * 0.5),
        gwOutflow: 0,
        gwElev: 0,
        moisture: 0.3 + rainIntensity * 0.2,
      };
    }

    timeSteps.push({
      time: step * reportStep,
      dateTime: formatSimDateTime(simStartMs, step * reportStep),
      nodes,
      links,
      subcatchments,
    });
  }

  return {
    timeSteps,
    summary: {
      totalDuration: numSteps * reportStep,
      reportingSteps: numSteps,
      routingModel: project.options['FLOW_ROUTING'] || 'DYNWAVE',
      continuityErrors: {
        runoff: runoffCE,
        flow: flowCE,
        quality: 0,
      },
    },
    reportContent: rptText,
  };
}

export function computeExtendedVariables(project: SwmmProject, results: SimulationResults): void {
  const flowUnits = (project.options?.FLOW_UNITS || '').toUpperCase();
  const isSI = ['CMS', 'LPS', 'MLD'].includes(flowUnits);
  const g = isSI ? 9.81 : 32.174;
  const phi = isSI ? 1.0 : 1.4859;
  const HEAD_TOL = 0.005;
  const MIN_SURF_AREA = 12.566;

  const allNodes = [
    ...project.junctions.map(j => ({ id: j.id, elev: j.elevation, maxD: j.maxDepth, surD: j.surDepth, type: 'junction' as const })),
    ...project.outfalls.map(o => ({ id: o.id, elev: o.elevation, maxD: 0, surD: 0, type: 'outfall' as const })),
    ...project.storageUnits.map(s => ({ id: s.id, elev: s.elevation, maxD: s.maxDepth, surD: 0, type: 'storage' as const })),
    ...project.dividers.map(d => ({ id: d.id, elev: d.elevation, maxD: d.maxDepth, surD: 0, type: 'divider' as const })),
  ];
  const nodeMap = new Map(allNodes.map(n => [n.id, n]));

  interface ConduitData {
    id: string; from: string; to: string; len: number; n: number;
    shape: string; geom1: number; geom2: number; geom3: number; geom4: number; barrels: number;
    invertUp: number; invertDn: number; slope: number;
    entryLoss: number; exitLoss: number; avgLoss: number;
    aFull: number; rFull: number; qFull: number;
  }
  const conduitMap = new Map<string, ConduitData>();

  interface XSParams { shape: string; geom1: number; geom2: number; geom3: number; geom4: number; }

  function xsArea(xs: XSParams, depth: number): number {
    const D = xs.geom1 || 1;
    const d = Math.max(0, Math.min(depth, D));
    if (d <= 0) return 0;
    switch (xs.shape.toUpperCase()) {
      case 'CIRCULAR': {
        if (d >= D) return Math.PI * D * D / 4;
        const r = D / 2;
        const th = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - d / r)));
        return r * r / 2 * (th - Math.sin(th));
      }
      case 'RECT_CLOSED': case 'RECT_OPEN': return d * (xs.geom2 || D);
      case 'TRAPEZOIDAL': {
        const botW = xs.geom2 || D;
        const sL = xs.geom3 || 0;
        const sR = xs.geom4 || sL;
        return d * (botW + 0.5 * (sL + sR) * d);
      }
      case 'TRIANGULAR': return (xs.geom2 || 1) * d * d;
      case 'HORIZ_ELLIPSE': {
        const a = (xs.geom2 || D * 1.5) / 2, b = D / 2;
        if (d >= D) return Math.PI * a * b;
        const t = Math.asin(Math.max(-1, Math.min(1, (d - b) / b)));
        return a * b * (t + Math.PI / 2 + Math.sin(2 * t) / 2);
      }
      case 'VERT_ELLIPSE': {
        const aR = D / 2, bR = (xs.geom2 || D * 0.67) / 2;
        if (d >= D) return Math.PI * aR * bR;
        const r2 = D / 2;
        const th2 = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - d / r2)));
        return r2 * r2 / 2 * (th2 - Math.sin(th2)) * (bR / r2);
      }
      default: {
        if (d >= D) return Math.PI * D * D / 4;
        const r = D / 2;
        const th = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - d / r)));
        return r * r / 2 * (th - Math.sin(th));
      }
    }
  }

  function xsWettedP(xs: XSParams, depth: number): number {
    const D = xs.geom1 || 1;
    const d = Math.max(0, Math.min(depth, D));
    if (d <= 0) return 0;
    switch (xs.shape.toUpperCase()) {
      case 'CIRCULAR': {
        if (d >= D) return Math.PI * D;
        const r = D / 2;
        return r * 2 * Math.acos(Math.max(-1, Math.min(1, 1 - d / r)));
      }
      case 'RECT_CLOSED': case 'RECT_OPEN': return (xs.geom2 || D) + 2 * d;
      case 'TRAPEZOIDAL': {
        const sL = xs.geom3 || 0;
        const sR = xs.geom4 || sL;
        return (xs.geom2 || D) + d * (Math.sqrt(1 + sL * sL) + Math.sqrt(1 + sR * sR));
      }
      case 'TRIANGULAR': {
        const ss = xs.geom2 || 1;
        return 2 * d * Math.sqrt(1 + ss * ss);
      }
      default: {
        if (d >= D) return Math.PI * D;
        const r = D / 2;
        return r * 2 * Math.acos(Math.max(-1, Math.min(1, 1 - d / r)));
      }
    }
  }

  function xsTopW(xs: XSParams, depth: number): number {
    const D = xs.geom1 || 1;
    const d = Math.max(0.0001, Math.min(depth, D - 0.0001));
    switch (xs.shape.toUpperCase()) {
      case 'CIRCULAR': {
        const r = D / 2;
        return 2 * Math.sqrt(Math.max(0, r * r - (r - d) * (r - d)));
      }
      case 'RECT_CLOSED': case 'RECT_OPEN': return xs.geom2 || D;
      case 'TRAPEZOIDAL': {
        const sL = xs.geom3 || 0;
        const sR = xs.geom4 || sL;
        return (xs.geom2 || D) + (sL + sR) * d;
      }
      case 'TRIANGULAR': return 2 * (xs.geom2 || 1) * d;
      default: {
        const r = D / 2;
        return 2 * Math.sqrt(Math.max(0, r * r - (r - d) * (r - d)));
      }
    }
  }

  function xsHydR(xs: XSParams, depth: number): number {
    const A = xsArea(xs, depth);
    const P = xsWettedP(xs, depth);
    return P > 0 ? A / P : 0;
  }

  for (const c of project.conduits) {
    const fromN = nodeMap.get(c.fromNode);
    const toN = nodeMap.get(c.toNode);
    const xs = project.xsections[c.id];
    const loss = project.losses[c.id];
    const shape = xs ? xs.shape.toUpperCase() : 'CIRCULAR';
    const geom1 = xs ? (typeof xs.geom1 === 'number' ? xs.geom1 : parseFloat(xs.geom1 as string) || 1) : 1;
    const geom2 = xs ? xs.geom2 : 0;
    const geom3 = xs ? xs.geom3 : 0;
    const geom4 = xs ? xs.geom4 : 0;
    const barrels = xs ? xs.barrels : 1;
    const invertUp = (fromN?.elev || 0) + (c.inOffset || 0);
    const invertDn = (toN?.elev || 0) + (c.outOffset || 0);
    const len = c.length || 1;
    const slope = (invertUp - invertDn) / len;
    const n = c.roughness || 0.013;
    const xsp: XSParams = { shape, geom1, geom2, geom3, geom4 };
    const aFullSingle = xsArea(xsp, geom1);
    const rFull = xsHydR(xsp, geom1);
    const aFull = aFullSingle * barrels;
    const qFull = barrels * (phi / n) * aFullSingle * Math.pow(rFull || 0.01, 2 / 3) * Math.sqrt(Math.abs(slope) || 0.001);
    conduitMap.set(c.id, {
      id: c.id, from: c.fromNode, to: c.toNode, len, n, shape, geom1, geom2, geom3, geom4, barrels,
      invertUp, invertDn, slope,
      entryLoss: loss?.entryLoss || 0, exitLoss: loss?.exitLoss || 0, avgLoss: loss?.avgLoss || 0,
      aFull, rFull, qFull,
    });
  }

  const allLinks = [
    ...project.conduits.map(c => ({ id: c.id, from: c.fromNode, to: c.toNode })),
    ...project.pumps.map(p => ({ id: p.id, from: p.fromNode, to: p.toNode })),
    ...project.weirs.map(w => ({ id: w.id, from: w.fromNode, to: w.toNode })),
    ...project.orifices.map(o => ({ id: o.id, from: o.fromNode, to: o.toNode })),
    ...project.outlets.map(o => ({ id: o.id, from: o.fromNode, to: o.toNode })),
  ];
  const linkMap = new Map(allLinks.map(l => [l.id, l]));

  const nodeDegree = new Map<string, number>();
  const nodeUpLinks = new Map<string, string[]>();
  const nodeDnLinks = new Map<string, string[]>();
  for (const l of allLinks) {
    nodeDegree.set(l.from, (nodeDegree.get(l.from) || 0) + 1);
    nodeDegree.set(l.to, (nodeDegree.get(l.to) || 0) + 1);
    if (!nodeUpLinks.has(l.to)) nodeUpLinks.set(l.to, []);
    nodeUpLinks.get(l.to)!.push(l.id);
    if (!nodeDnLinks.has(l.from)) nodeDnLinks.set(l.from, []);
    nodeDnLinks.get(l.from)!.push(l.id);
  }

  const nodeCrown = new Map<string, number>();
  for (const nd of allNodes) {
    let crown = nd.elev + nd.maxD;
    for (const [, cd] of conduitMap) {
      if (cd.from === nd.id) { const c = cd.invertUp + cd.geom1; if (c > crown) crown = c; }
      if (cd.to === nd.id) { const c = cd.invertDn + cd.geom1; if (c > crown) crown = c; }
    }
    nodeCrown.set(nd.id, crown);
  }

  const cumInfil = new Map<string, number>();
  const cumRain = new Map<string, number>();
  let prevStorage = 0;
  const dt = results.timeSteps.length > 1
    ? Math.max(1, (results.timeSteps[1].time - results.timeSteps[0].time))
    : 30;

  for (let tIdx = 0; tIdx < results.timeSteps.length; tIdx++) {
    const ts = results.timeSteps[tIdx];
    const prevTs = tIdx > 0 ? results.timeSteps[tIdx - 1] : null;

    for (const [nodeId, nr] of Object.entries(ts.nodes)) {
      const nd = nodeMap.get(nodeId);
      if (!nr.extended) nr.extended = {};
      const ext = nr.extended;
      const maxD = nd?.maxD || 6;
      const invert = nd?.elev || 0;
      const crown = nodeCrown.get(nodeId) || (invert + maxD);

      ext.surfaceArea = nd?.type === 'storage' ? Math.max(MIN_SURF_AREA, maxD > 0 ? (nr.depth / maxD) * 200 + 50 : MIN_SURF_AREA) : MIN_SURF_AREA;
      ext.nodeTimestep = dt;
      ext.crownElev = crown;

      const prevVol = prevTs ? (prevTs.nodes[nodeId]?.volume ?? nr.volume) : nr.volume;
      const dVdt = (nr.volume - prevVol) / dt;
      const estimatedOutflow = Math.max(0, nr.totalInflow - nr.flooding - dVdt);

      ext.nodeCE = nr.totalInflow > 0.001 ? Math.abs(nr.totalInflow - estimatedOutflow - nr.flooding - dVdt) / (nr.totalInflow + 0.001) : 0;

      let dqdh = 0;
      const upLinks = nodeUpLinks.get(nodeId) || [];
      const dnLinks = nodeDnLinks.get(nodeId) || [];
      for (const lid of [...upLinks, ...dnLinks]) {
        const cd = conduitMap.get(lid);
        if (cd && cd.len > 0) {
          const linkDepth = ts.links[lid]?.depth || 0;
          const cdXS: XSParams = { shape: cd.shape, geom1: cd.geom1, geom2: cd.geom2, geom3: cd.geom3, geom4: cd.geom4 };
          const aMidEst = xsArea(cdXS, Math.max(0.001, linkDepth));
          dqdh += g * aMidEst * dt / cd.len;
        }
      }
      ext.dqdh = dqdh;
      ext.nrDenom = dqdh + ext.surfaceArea / dt;
      const fRes = nr.totalInflow - estimatedOutflow - dVdt;
      ext.fResidual = fRes;
      ext.prevArea = ext.surfaceArea;
      ext.headCorrection = ext.nrDenom > 0 ? -fRes / ext.nrDenom : 0;
      const absHC = Math.abs(ext.headCorrection);
      ext.nodeIterations = absHC < HEAD_TOL ? 1 : absHC < 0.05 ? 3 : absHC < 0.5 ? 5 : 8;
      ext.nodeConvergence = absHC < HEAD_TOL ? 1 : 0;
      ext.nodeInfil = 0;
      ext.nodeEvap = 0;
      ext.nodeDegree = nodeDegree.get(nodeId) || 0;
      ext.oldAreaByDt = ext.surfaceArea / dt;
      ext.rdiiTotal = 0;
      ext.rdiiUH1 = 0;
      ext.rdiiUH2 = 0;
      ext.rdiiUH3 = 0;
      ext.dwfInflow = nr.lateralInflow > 0 ? nr.lateralInflow * 0.1 : 0;
      ext.totalOutflow = estimatedOutflow;
    }

    for (const [linkId, lr] of Object.entries(ts.links)) {
      const lk = linkMap.get(linkId);
      const cd = conduitMap.get(linkId);
      if (!lr.extended) lr.extended = {};
      const ext = lr.extended;

      const geom1 = cd?.geom1 || 2;
      const barrels = cd?.barrels || 1;
      const roughness = cd?.n || 0.013;
      const len = cd?.len || 100;
      const lxs: XSParams = cd
        ? { shape: cd.shape, geom1: cd.geom1, geom2: cd.geom2, geom3: cd.geom3, geom4: cd.geom4 }
        : { shape: 'CIRCULAR', geom1: 2, geom2: 0, geom3: 0, geom4: 0 };
      const fromN = lk ? nodeMap.get(lk.from) : undefined;
      const toN = lk ? nodeMap.get(lk.to) : undefined;
      const fromNr = lk ? ts.nodes[lk.from] : undefined;
      const toNr = lk ? ts.nodes[lk.to] : undefined;

      const h1 = fromNr ? fromNr.head : (fromN?.elev || 0);
      const h2 = toNr ? toNr.head : (toN?.elev || 0);
      const invertUp = cd?.invertUp || (fromN?.elev || 0);
      const invertDn = cd?.invertDn || (toN?.elev || 0);
      const y1 = Math.max(0, h1 - invertUp);
      const y2 = Math.max(0, h2 - invertDn);
      const slope = cd?.slope || (len > 0 ? (invertUp - invertDn) / len : 0.01);

      const flowPerBarrel = barrels > 1 ? lr.flow / barrels : lr.flow;
      const dMid = Math.max(0.001, Math.min(lr.depth, geom1));
      const aMid = xsArea(lxs, dMid) || 0.01;
      const rMid = xsHydR(lxs, dMid) || 0.001;
      const wMid = xsTopW(lxs, dMid) || 0.001;

      const a1 = xsArea(lxs, Math.max(0.001, Math.min(y1, geom1)));
      const a2 = xsArea(lxs, Math.max(0.001, Math.min(y2, geom1)));
      const r1 = xsHydR(lxs, Math.max(0.001, Math.min(y1, geom1)));
      const r2 = xsHydR(lxs, Math.max(0.001, Math.min(y2, geom1)));
      const w1 = xsTopW(lxs, Math.max(0.001, Math.min(y1, geom1)));
      const w2 = xsTopW(lxs, Math.max(0.001, Math.min(y2, geom1)));
      const v1 = a1 > 0.001 ? flowPerBarrel / a1 : 0;
      const v2 = a2 > 0.001 ? flowPerBarrel / a2 : 0;
      const vMid = aMid > 0.001 ? flowPerBarrel / aMid : lr.velocity;

      const celerity = wMid > 0 ? Math.sqrt(g * aMid / wMid) : 1;
      const froude = celerity > 0 ? Math.abs(vMid) / celerity : 0;
      ext.froude = froude;
      ext.f1Area = a1;
      ext.f2Area = a2;
      ext.v1 = v1;
      ext.v2 = v2;

      let sf = 0;
      if (aMid > 0 && rMid > 0 && roughness > 0) {
        const qn = roughness * Math.abs(flowPerBarrel) / (phi * aMid * Math.pow(rMid, 2 / 3));
        sf = qn * qn;
      }
      ext.hwFrictionSlope = sf;

      let sigma: number;
      if (froude <= 0.5) sigma = 1.0;
      else if (froude >= 1.0) sigma = 0.0;
      else sigma = 2.0 * (1.0 - froude);

      const qOldTotal = prevTs ? (prevTs.links[linkId]?.flow ?? 0) : 0;
      const qOld = barrels > 1 ? qOldTotal / barrels : qOldTotal;
      const DQ1 = sigma * qOld;
      const DQ2 = sigma * dt * g * aMid * (h1 - h2) / len;
      const sfDq = roughness > 0 && aMid > 0 && rMid > 0
        ? dt * g * roughness * roughness * Math.abs(flowPerBarrel) / (phi * phi * aMid * Math.pow(rMid, 4 / 3))
        : 0;
      const entryHL = (cd?.entryLoss || 0) * v1 * v1 / (2 * g);
      const exitHL = (cd?.exitLoss || 0) * v2 * v2 / (2 * g);
      const avgHL = (cd?.avgLoss || 0) * vMid * vMid / (2 * g) * len;
      const DQ4 = entryHL + exitHL + avgHL;
      const latUS = fromNr?.lateralInflow || 0;
      const latDS = toNr?.lateralInflow || 0;
      const DQ5 = len > 0 ? 0.5 * dt * (latUS + latDS) * vMid / len : 0;
      const beta = 1.0;
      const convA1 = a1 > 0.001 ? beta * flowPerBarrel * flowPerBarrel / a1 : 0;
      const convA2 = a2 > 0.001 ? beta * flowPerBarrel * flowPerBarrel / a2 : 0;
      const DQ6 = len > 0 ? sigma * dt * (convA2 - convA1) / len : 0;
      const DQ3 = dt * g * aMid * sf * Math.sign(flowPerBarrel);

      ext.dq1Inertia = DQ1;
      ext.dq2Pressure = DQ2;
      ext.dq3Friction = DQ3;
      ext.dq4Losses = DQ4;
      ext.dq5Lateral = DQ5;
      ext.dq6Convect = DQ6;

      ext.upHLoss = entryHL;
      ext.dnHLoss = exitHL;
      ext.frictionHLoss = sf * len;

      const qNormal = (rMid > 0 && slope > 0) ? (phi / roughness) * aMid * Math.pow(rMid, 2 / 3) * Math.sqrt(slope) : 0;
      ext.qNormal = qNormal;

      const denom = 1.0 + sfDq;
      const qRecon = denom > 0 ? (DQ1 + DQ2 + DQ5 - DQ6) / denom : 0;
      const momResidual = flowPerBarrel - qRecon;
      const totalMag = Math.abs(DQ1) + Math.abs(DQ2) + Math.abs(DQ3) + Math.abs(DQ4) + Math.abs(DQ5) + Math.abs(DQ6);
      ext.stVenantBalance = Math.abs(flowPerBarrel) > 0.001 ? Math.abs(momResidual / flowPerBarrel) : 0;
      ext.linkDqdh = lr.depth > 0.01 ? flowPerBarrel / lr.depth : 0;

      ext.aMid = aMid;
      ext.aWeighted = aMid;
      ext.a1 = a1;
      ext.a2 = a2;
      ext.rMid = rMid;
      ext.rWeighted = rMid;
      ext.r1 = r1;
      ext.r2 = r2;
      ext.w1 = w1;
      ext.w2 = w2;
      ext.y1 = Math.min(y1, geom1);
      ext.y2 = Math.min(y2, geom1);

      ext.hgl = (h1 + h2) / 2;
      ext.h1Head = h1;
      ext.h2Head = h2;
      ext.vhUp = v1 * v1 / (2 * g);
      ext.vhMid = vMid * vMid / (2 * g);
      ext.vhDn = v2 * v2 / (2 * g);
      ext.frictionLossHf = sf * len;
      ext.bernoulliLHS = h1 + ext.vhUp + entryHL;
      ext.bernoulliRHS = h2 + ext.vhDn + exitHL + sf * len;
      ext.rho = 1.0;
      ext.sigma = sigma;

      ext.areaSWMM3 = aMid;
      ext.areaSWMM4 = aMid;
      ext.areaSWMM5 = aMid;

      const aFullEst = cd?.aFull || aMid;
      ext.usNormalArea = aFullEst;
      ext.dsNormalArea = aFullEst;
      ext.linkTimestep = dt;
      ext.linkIterations = sfDq > 0.5 ? 4 : 2;
      ext.akon = roughness > 0 ? phi / roughness : 114;
      ext.fasnh = roughness > 0 ? roughness * Math.pow(len, 1 / 3) : 1;
      ext.actualLength = len;
      ext.modLength = len;
      ext.actualRoughness = roughness;
      ext.roughFactor = 1.0;
      ext.bedSlope = slope;
      ext.qMax = cd?.qFull || 0;
      ext.beta = beta;
      ext.setting = 1.0;
      ext.targetSetting = 1.0;
      ext.timeOpen = 0;

      const depthRatio = geom1 > 0 ? lr.depth / geom1 : 0;
      if (lr.depth <= 0.001) ext.flowClass = 0;
      else if (depthRatio >= 0.97) ext.flowClass = 4;
      else if (froude < 0.95) ext.flowClass = 1;
      else if (froude > 1.05) ext.flowClass = 2;
      else ext.flowClass = 3;
    }

    for (const [scId, sr] of Object.entries(ts.subcatchments)) {
      const sc = project.subcatchments.find(s => s.id === scId);
      if (!sr.extended) sr.extended = {};
      const ext = sr.extended;
      const pctImperv = sc?.pctImperv || 50;
      const area = sc?.area || 5;
      const impFrac = pctImperv / 100;
      const subarea = project.subareas?.[scId];
      const sImperv = subarea?.sImperv || 0.05;
      const sPerv = subarea?.sPerv || 0.1;
      const pctZero = subarea?.pctZero || 25;
      const pctZeroFrac = pctZero / 100;

      const netRainImperv = Math.max(0, sr.rainfall - sr.evap);
      const netRainPerv = Math.max(0, sr.rainfall - sr.evap - sr.infiltration);
      ext.runoffImperv0 = netRainImperv > sImperv ? sr.runoff * impFrac * pctZeroFrac : 0;
      ext.runoffImperv1 = netRainImperv > sImperv ? sr.runoff * impFrac * (1 - pctZeroFrac) : 0;
      ext.runoffPerv = netRainPerv > sPerv ? sr.runoff * (1 - impFrac) : 0;
      ext.depthImperv0 = sr.rainfall > 0 ? Math.min(netRainImperv * dt / 3600, sImperv) : 0;
      ext.depthImperv1 = sr.rainfall > 0 ? Math.min(netRainImperv * dt / 3600, sImperv * 1.5) : 0;
      ext.depthPerv = sr.rainfall > 0 ? Math.min(netRainPerv * dt / 3600, sPerv) : 0;
      ext.avgSurfDepth = ext.depthImperv0 * impFrac * pctZeroFrac + ext.depthImperv1 * impFrac * (1 - pctZeroFrac) + ext.depthPerv * (1 - impFrac);
      ext.runon = 0;
      ext.subArea = area;
      ext.impAreaDS = area * impFrac * (1 - pctZeroFrac);
      ext.impAreaNoDS = area * impFrac * pctZeroFrac;
      ext.pervArea = area * (1 - impFrac);
      ext.nonLidArea = area;

      ext.lidArea = 0; ext.lidCaptureArea = 0; ext.impToLidFlow = 0; ext.lidCount = 0;
      ext.lidSurfInflow = 0; ext.lidEvap = 0; ext.lidSurfInfil = 0;
      ext.lidPavePerc = 0; ext.lidSoilPerc = 0; ext.lidStorExfil = 0;
      ext.lidSurfOverflow = 0; ext.lidStorDrain = 0;
      ext.lidSurfDepth = 0; ext.lidPaveDepth = 0; ext.lidSoilMoist = 0;
      ext.lidStorDepth = 0; ext.lidTotalInflow = 0;

      ext.gwFlowA1 = sr.gwOutflow > 0 ? sr.gwOutflow * 0.6 : 0;
      ext.gwFlowA2 = sr.gwOutflow > 0 ? sr.gwOutflow * 0.3 : 0;
      ext.gwFlowA3 = sr.gwOutflow > 0 ? sr.gwOutflow * 0.1 : 0;
      ext.gwPercolation = sr.infiltration > 0 ? sr.infiltration * 0.2 : 0;
      ext.gwEvapLoss = sr.evap > 0 ? sr.evap * 0.3 : 0;
      ext.gwHstar = sr.gwElev > 0 ? sr.gwElev + 2 : 0;
      ext.gwHsw = sr.gwElev;
      ext.gwLowerDepth = sr.gwElev > 0 ? 5 : 0;
      ext.gwTotalDepth = sr.gwElev > 0 ? sr.moisture * 20 : 0;
      ext.aqBottomElev = sr.gwElev > 0 ? sr.gwElev - 10 : 0;
      ext.aqPorosity = 0.4;
      ext.gwMaxFlow = sr.gwOutflow > 0 ? sr.gwOutflow * 3 : 0;
      ext.gwMaxNegFlow = 0;
      ext.waterTableLevel = sr.gwElev;
      ext.gwNodeFlow = sr.gwOutflow;
      ext.gwOldFlow = prevTs ? (prevTs.subcatchments[scId]?.gwOutflow ?? 0) : 0;

      ext.snowmelt = sr.snowDepth > 0 ? sr.snowDepth * 0.01 : 0;
      ext.immediateMelt = 0;
      ext.rainOnSnowMelt = sr.snowDepth > 0 && sr.rainfall > 0 ? sr.rainfall * 0.05 : 0;
      ext.snowFreeWater = sr.snowDepth > 0 ? sr.snowDepth * 0.05 : 0;
      ext.snowColdContent = sr.snowDepth > 0 ? 0.5 : 0;
      ext.snowCoverage = sr.snowDepth > 0 ? 1.0 : 0;
      ext.snowATI = sr.snowDepth > 0 ? 32 : 60;
      ext.snowWATI = sr.snowDepth > 0 ? 28 : 55;
      ext.snowPackSWE = sr.snowDepth > 0 ? sr.snowDepth * 0.3 : 0;
      ext.snowPackDepth = sr.snowDepth;

      ext.pollutWashoff = sr.runoff > 0 ? sr.runoff * 20 : 0;
      ext.pollutBuildup = sr.runoff > 0 ? Math.max(0, 10 - sr.runoff * 2) : 10;
      ext.pollutConcRunoff = sr.runoff > 0 ? 50 + sr.runoff * 10 : 0;
      ext.pollutConcGW = sr.gwOutflow > 0 ? 25 : 0;
      ext.pollutLoad = sr.runoff > 0 ? sr.runoff * area * 0.1 : 0;

      ext.lidSoilEvap = sr.evap > 0 ? sr.evap * 0.1 : 0;
      ext.lidDrainCoeff = 0.5;
      ext.lidRetention = 0;

      const prevCumI = cumInfil.get(scId) || 0;
      const prevCumR = cumRain.get(scId) || 0;
      const stepInfil = sr.infiltration * dt / 3600;
      const stepRain = sr.rainfall * dt / 3600;
      const cumI = prevCumI + stepInfil;
      const cumR = prevCumR + stepRain;
      cumInfil.set(scId, cumI);
      cumRain.set(scId, cumR);

      const infilData = project.infiltration?.[scId];
      const method = infilData?.method || 'GREEN_AMPT';
      const vals = infilData?.values || [];

      ext.ulThickness = sr.moisture > 0 ? sr.moisture * 10 : 1;
      ext.fTotal = cumI;
      ext.fUpper = cumI * 0.6;
      ext.fUpperMax = 5;
      ext.currentMoisture = sr.moisture;

      if (method.includes('GREEN') || method.includes('GA')) {
        const Ks = vals[0] || 0.5;
        const psi = vals[1] || 6;
        const IMD = vals[2] || 0.25;
        ext.imd = IMD;
        ext.imdByEvent = IMD;
        ext.satFlag = cumI > psi * IMD ? 1 : 0;
        ext.currentInfilRate = sr.infiltration;
        ext.gaIMD = IMD;
        ext.gaF = cumI;
        ext.gaFu = cumI * 0.6;
        ext.gaLu = IMD > 0 ? cumI / IMD : cumI;
        ext.gaT = tIdx * dt / 3600;
        ext.gaSat = ext.satFlag;
        ext.infilTime = ext.gaT;
      } else if (method.includes('HORTON')) {
        const f0 = vals[0] || 4;
        const fc = vals[1] || 0.5;
        const k = vals[2] || 0.001;
        ext.imd = 0.25;
        ext.imdByEvent = 0.25;
        ext.satFlag = sr.infiltration <= fc * 1.05 ? 1 : 0;
        ext.currentInfilRate = sr.infiltration;
        ext.hortonTp = 0;
        ext.hortonFe = cumI;
        ext.infilTime = tIdx * dt / 3600;
      } else if (method.includes('CURVE') || method.includes('CN')) {
        const cn = vals[0] || 75;
        const S = (1000 / cn) - 10;
        ext.cnS = S;
        ext.cnF = cumI;
        ext.cnP = cumR;
        ext.cnT = tIdx * dt / 3600;
        ext.cnSe = S * (1 - sr.moisture);
        ext.cnRate = sr.infiltration;
        ext.cnSmax = S * 1.5;
        ext.cnF1 = prevCumI;
        ext.cnRegen = 0;
        ext.cnCN = cn;
        ext.imd = 0;
        ext.imdByEvent = 0;
        ext.satFlag = cumR > 0.2 * S ? 1 : 0;
        ext.currentInfilRate = sr.infiltration;
        ext.infilTime = tIdx * dt / 3600;
      } else {
        ext.imd = 0.25;
        ext.imdByEvent = 0.25;
        ext.satFlag = 0;
        ext.currentInfilRate = sr.infiltration;
        ext.infilTime = tIdx * dt / 3600;
      }
    }

    let totalRainfall = 0, totalInfil = 0, totalRunoff = 0, totalFlooding = 0;
    let totalOutflow = 0, totalStorage = 0, totalEvap = 0, totalGW = 0;
    for (const sr of Object.values(ts.subcatchments)) {
      totalRainfall += sr.rainfall;
      totalInfil += sr.infiltration;
      totalRunoff += sr.runoff;
      totalEvap += sr.evap;
      totalGW += sr.gwOutflow;
    }
    const outfallIds = new Set(project.outfalls.map(o => o.id));
    for (const [nid, nr] of Object.entries(ts.nodes)) {
      totalFlooding += nr.flooding;
      totalStorage += nr.volume;
      if (outfallIds.has(nid)) totalOutflow += nr.totalInflow;
    }
    const scCount = Object.keys(ts.subcatchments).length || 1;

    const sys: Record<string, number> = {};
    const totalInflow = totalRunoff + totalGW;
    const dStorage = totalStorage - prevStorage;
    const massBalance = totalInflow > 0 ? Math.abs(totalInflow - totalOutflow - totalFlooding) / totalInflow * 100 : 0;
    const stepError = totalInflow > 0 ? Math.abs(totalInflow - totalOutflow - totalFlooding - dStorage / dt) / Math.max(totalInflow, 1) * 100 : 0;

    sys.sysTemperature = 60;
    sys.sysRainfall = totalRainfall / scCount;
    sys.sysSnowDepth = 0;
    sys.sysInfil = totalInfil;
    sys.sysRunoff = totalRunoff;
    sys.sysDWF = 0;
    sys.sysGWFlow = totalGW;
    sys.sysRDII = 0;
    sys.sysExtFlow = 0;
    sys.sysTotalInflow = totalInflow;
    sys.sysFlooding = totalFlooding;
    sys.sysOutflow = totalOutflow;
    sys.sysStorage = totalStorage;
    sys.sysEvap = totalEvap;
    sys.sysPET = 0;
    sys.sysWindSpeed = 0;
    sys.sysSnowfall = 0;
    sys.sysSnowArea = 0;
    sys.sysFreeWater = 0;
    sys.sysColdContent = 0;
    sys.sysSnowmelt = 0;
    sys.sysImelt = 0;
    sys.sysRainMelt = 0;
    sys.stepFlowError = Math.min(stepError, 100);
    sys.sysCE = Math.min(massBalance, 100);

    let maxCorrection = 0;
    for (const nr of Object.values(ts.nodes)) {
      const hc = nr.extended?.headCorrection || 0;
      if (Math.abs(hc) > maxCorrection) maxCorrection = Math.abs(hc);
    }
    sys.sysIterations = maxCorrection < HEAD_TOL ? 2 : maxCorrection < 0.05 ? 4 : maxCorrection < 0.5 ? 6 : 8;
    sys.sysTimestep = dt;
    ts.system = { extended: sys };
    prevStorage = totalStorage;
  }
}

function generateMockResults(project: SwmmProject): SimulationResults {
  const numSteps = 96;
  const timeSteps: TimeStepResults[] = [];
  const simStartMs = getSimStartMs(project);

  const peakTime = numSteps * 0.25;
  const decayRate = 0.04;

  for (let step = 0; step < numSteps; step++) {
    const t = step;
    const stormIntensity = Math.max(0, Math.exp(-decayRate * Math.abs(t - peakTime)) * Math.sin(Math.PI * Math.min(t / peakTime, 1)));

    const nodes: Record<string, NodeResult> = {};
    const allNodes = [
      ...project.junctions.map(j => ({ id: j.id, elev: j.elevation, maxD: j.maxDepth })),
      ...project.outfalls.map(o => ({ id: o.id, elev: o.elevation, maxD: 0 })),
      ...project.storageUnits.map(s => ({ id: s.id, elev: s.elevation, maxD: s.maxDepth })),
    ];

    for (let i = 0; i < allNodes.length; i++) {
      const n = allNodes[i];
      const lag = i * 2;
      const intensity = Math.max(0, Math.exp(-decayRate * Math.abs(t - peakTime - lag)) * Math.sin(Math.PI * Math.min(Math.max(0, t - lag) / peakTime, 1)));
      const depth = intensity * (n.maxD || 6) * 0.7;
      nodes[n.id] = {
        depth,
        head: n.elev + depth,
        volume: depth * 100,
        lateralInflow: intensity * 5,
        totalInflow: intensity * 8,
        flooding: depth > (n.maxD || 6) * 0.9 ? depth - (n.maxD || 6) * 0.9 : 0,
      };
    }

    const links: Record<string, LinkResult> = {};
    const allLinks = [
      ...project.conduits.map(c => ({ id: c.id, from: c.fromNode, to: c.toNode, type: 'conduit' })),
      ...project.pumps.map(p => ({ id: p.id, from: p.fromNode, to: p.toNode, type: 'pump' })),
      ...project.weirs.map(w => ({ id: w.id, from: w.fromNode, to: w.toNode, type: 'weir' })),
      ...project.orifices.map(o => ({ id: o.id, from: o.fromNode, to: o.toNode, type: 'orifice' })),
      ...project.outlets.map(o => ({ id: o.id, from: o.fromNode, to: o.toNode, type: 'outlet' })),
    ];

    for (let i = 0; i < allLinks.length; i++) {
      const l = allLinks[i];
      const lag = i * 1.5;
      const intensity = Math.max(0, Math.exp(-decayRate * Math.abs(t - peakTime - lag)) * Math.sin(Math.PI * Math.min(Math.max(0, t - lag) / peakTime, 1)));
      const xs = project.xsections[l.id];
      const maxDia = xs ? (typeof xs.geom1 === 'number' ? xs.geom1 : 2) : 2;
      const flow = intensity * maxDia * 3;
      const depth = intensity * maxDia * 0.6;
      links[l.id] = {
        flow,
        depth,
        velocity: flow > 0 ? flow / (Math.PI * (depth / 2) ** 2 + 0.01) : 0,
        volume: flow * 30,
        capacity: maxDia > 0 ? depth / maxDia : 0,
      };
    }

    const subcatchments: Record<string, SubcatchResult> = {};
    for (let i = 0; i < project.subcatchments.length; i++) {
      const sc = project.subcatchments[i];
      const lag = i * 3;
      const rainIntensity = Math.max(0, Math.exp(-decayRate * Math.abs(t - peakTime + 2) * 1.5));
      const runoffIntensity = Math.max(0, Math.exp(-decayRate * Math.abs(t - peakTime - lag)) * Math.sin(Math.PI * Math.min(Math.max(0, t - lag) / peakTime, 1)));
      subcatchments[sc.id] = {
        rainfall: rainIntensity * 2.5,
        snowDepth: 0,
        evap: 0.01,
        infiltration: rainIntensity * (1 - sc.pctImperv / 100) * 1.5,
        runoff: runoffIntensity * sc.area * (sc.pctImperv / 100) * 0.5,
        gwOutflow: 0,
        gwElev: 0,
        moisture: 0.3 + rainIntensity * 0.2,
      };
    }

    timeSteps.push({
      time: step * 15 * 60,
      dateTime: formatSimDateTime(simStartMs, step * 15 * 60),
      nodes,
      links,
      subcatchments,
    });
  }

  return {
    timeSteps,
    summary: {
      totalDuration: numSteps * 15 * 60,
      reportingSteps: numSteps,
      routingModel: project.options['FLOW_ROUTING'] || 'DYNWAVE',
      continuityErrors: {
        runoff: 0.12,
        flow: 0.08,
        quality: 0,
      },
    },
  };
}

export function createMockEngine(): SwmmEngine {
  return {
    isLoaded: true,
    mode: 'mock' as const,
    async run(project: SwmmProject): Promise<SimulationResults> {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const results = generateMockResults(project);
      computeExtendedVariables(project, results);
      results.engineUsed = 'mock';
      return results;
    },
    getStatus() {
      return 'Mock Engine (Simulated Results)';
    },
  };
}
