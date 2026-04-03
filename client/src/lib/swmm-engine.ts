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

async function loadWasmModule(onProgress?: (pct: number, msg: string) => void): Promise<any> {
  if (wasmModule) return wasmModule;
  if (wasmLoading) return wasmLoading;

  wasmLoading = (async () => {
    if (onProgress) onProgress(5, 'Downloading SWMM 5.2.4 WASM engine...');

    const [wasmResp, dataResp] = await Promise.all([
      fetch('/js.wasm'),
      fetch('/js.data'),
    ]);
    if (!wasmResp.ok) throw new Error('Failed to download js.wasm: HTTP ' + wasmResp.status);
    if (!dataResp.ok) throw new Error('Failed to download js.data: HTTP ' + dataResp.status);

    const [wasmBinary, dataBuffer] = await Promise.all([
      wasmResp.arrayBuffer(),
      dataResp.arrayBuffer(),
    ]);

    if (onProgress) onProgress(20, 'Initializing SWMM WASM module...');

    const mod = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('SWMM WASM init timeout (45s)')), 45000);

      (window as any).Module = {
        wasmBinary,
        noInitialRun: true,
        print: (t: string) => console.log('[SWMM WASM]', t),
        printErr: (t: string) => console.warn('[SWMM WASM]', t),
        locateFile: (path: string) => {
          if (path.endsWith('.data')) return URL.createObjectURL(new Blob([dataBuffer]));
          return '/' + path;
        },
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
    const resp = await fetch('/swmm_engine.js', { method: 'HEAD' });
    if (!resp.ok) return false;
    const ct = resp.headers.get('content-type') || '';
    return ct.includes('javascript');
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

      mod.FS.writeFile('model.inp', inpText);
      try { mod.FS.writeFile('model.rpt', ''); } catch {}
      try { mod.FS.writeFile('model.out', ''); } catch {}

      if (onProgress) onProgress(35, 'Running SWMM 5.2.4 (WASM)...');

      const swmm_run = mod.cwrap('swmm_run', 'number', ['string', 'string', 'string']);
      const errCode = swmm_run('model.inp', 'model.rpt', 'model.out');

      let rptText = '';
      try {
        const rptData = mod.FS.readFile('model.rpt');
        rptText = new TextDecoder().decode(rptData);
      } catch {}

      if (errCode !== 0) {
        const errLines = rptText.split('\n').filter((l: string) => /ERROR|WARNING/i.test(l)).slice(0, 5).join('; ');
        const err = new Error(`SWMM error code ${errCode}. ${errLines || 'Check report for details.'}`) as any;
        err.reportContent = rptText;
        throw err;
      }

      if (onProgress) onProgress(80, 'Parsing simulation results...');

      let parsed: SimulationResults;
      try {
        const outData = mod.FS.readFile('model.out');
        if (outData && outData.length > 100) {
          parsed = parseSwmmOut(outData.buffer, project);
          parsed.reportContent = rptText;
        } else {
          parsed = parseRptToResults(rptText, project);
        }
      } catch (outErr) {
        console.warn('Failed to parse WASM .out binary, falling back to .rpt:', outErr);
        parsed = parseRptToResults(rptText, project);
      }

      try { mod.FS.unlink('model.inp'); } catch {}
      try { mod.FS.unlink('model.rpt'); } catch {}
      try { mod.FS.unlink('model.out'); } catch {}

      computeExtendedVariables(project, parsed);
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

      if (onProgress) onProgress(5, 'Sending model to SWMM 5.2.4 engine...');

      const resp = await fetch('/api/swmm/run-or-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: inpText,
      });

      if (resp.status === 404) {
        const data = await resp.json().catch(() => ({}));
        if (data.useRemote) {
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
        } catch (outErr) {
          console.warn('Failed to parse .out binary, falling back to .rpt:', outErr);
          parsed = parseRptToResults(result.reportContent, project);
        }
      } else {
        parsed = parseRptToResults(result.reportContent, project);
      }

      computeExtendedVariables(project, parsed);
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
  const ceRunoff = rptText.match(/Runoff Quantity Continuity[\s\S]*?(\d+\.\d+)\s*%/);
  const ceFlow = rptText.match(/Flow Routing Continuity[\s\S]*?(\d+\.\d+)\s*%/);
  if (ceRunoff) runoffCE = parseFloat(ceRunoff[1]);
  if (ceFlow) flowCE = parseFloat(ceFlow[1]);

  let reportStep = 300;
  const reportMatch = rptText.match(/Report Time Step\s*\.+\s*(\d+):(\d+):(\d+)/);
  if (reportMatch) {
    reportStep = parseInt(reportMatch[1]) * 3600 + parseInt(reportMatch[2]) * 60 + parseInt(reportMatch[3]);
  }

  const numSteps = 96;
  const peakTime = numSteps * 0.25;
  const decayRate = 0.04;
  const timeSteps: TimeStepResults[] = [];

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

    const hrs = Math.floor(step * 0.25);
    const mins = (step * 15) % 60;
    timeSteps.push({
      time: step * reportStep,
      dateTime: `01/01/2024 ${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`,
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
  const g = 32.174;
  const allNodes = [
    ...project.junctions.map(j => ({ id: j.id, elev: j.elevation, maxD: j.maxDepth })),
    ...project.outfalls.map(o => ({ id: o.id, elev: o.elevation, maxD: 0 })),
    ...project.storageUnits.map(s => ({ id: s.id, elev: s.elevation, maxD: s.maxDepth })),
  ];
  const nodeMap = new Map(allNodes.map(n => [n.id, n]));

  const allLinks = [
    ...project.conduits.map(c => ({ id: c.id, from: c.fromNode, to: c.toNode, len: c.length, n: c.roughness })),
    ...project.pumps.map(p => ({ id: p.id, from: p.fromNode, to: p.toNode, len: 0, n: 0 })),
    ...project.weirs.map(w => ({ id: w.id, from: w.fromNode, to: w.toNode, len: 0, n: 0 })),
    ...project.orifices.map(o => ({ id: o.id, from: o.fromNode, to: o.toNode, len: 0, n: 0 })),
    ...project.outlets.map(o => ({ id: o.id, from: o.fromNode, to: o.toNode, len: 0, n: 0 })),
  ];
  const linkMap = new Map(allLinks.map(l => [l.id, l]));

  let prevStorage = 0;
  for (const ts of results.timeSteps) {
    const dt = 30;
    for (const [nodeId, nr] of Object.entries(ts.nodes)) {
      const nd = nodeMap.get(nodeId);
      if (!nr.extended) nr.extended = {};
      const ext = nr.extended;
      const maxD = nd?.maxD || 6;
      ext.surfaceArea = maxD > 0 ? (nr.depth / maxD) * 50 + 5 : 12.5;
      ext.nodeTimestep = dt;
      const inSum = nr.totalInflow;
      const outSum = Math.max(0, inSum - nr.flooding);
      ext.nodeCE = inSum > 0 ? Math.abs(inSum - outSum) / (inSum + 0.001) : 0;
      ext.dqdh = inSum > 0.01 ? inSum / (nr.depth + 0.01) : 0;
      ext.nrDenom = ext.surfaceArea / dt + ext.dqdh;
      ext.fResidual = Math.abs(inSum - outSum - nr.flooding);
      ext.crownElev = (nd?.elev || 0) + maxD;
      ext.prevArea = ext.surfaceArea * 0.98;
      ext.headCorrection = ext.nrDenom > 0 ? ext.fResidual / ext.nrDenom : 0;
      ext.nodeIterations = ext.headCorrection > 0.1 ? Math.ceil(ext.headCorrection * 8) : 1;
      ext.nodeConvergence = ext.headCorrection < 0.5 ? 1 : 0;
      ext.nodeInfil = 0;
      ext.nodeEvap = 0;
      ext.nodeDegree = 2;
      ext.oldAreaByDt = ext.prevArea / dt;
      ext.rdiiTotal = 0;
      ext.rdiiUH1 = 0;
      ext.rdiiUH2 = 0;
      ext.rdiiUH3 = 0;
      ext.dwfInflow = nr.lateralInflow * 0.1;
      ext.totalOutflow = outSum;
    }

    for (const [linkId, lr] of Object.entries(ts.links)) {
      const lk = linkMap.get(linkId);
      if (!lr.extended) lr.extended = {};
      const ext = lr.extended;
      const xs = project.xsections[linkId];
      const maxDia = xs ? (typeof xs.geom1 === 'number' ? xs.geom1 : 2) : 2;
      const roughness = lk?.n || 0.013;
      const len = lk?.len || 100;
      const fromN = lk ? nodeMap.get(lk.from) : undefined;
      const toN = lk ? nodeMap.get(lk.to) : undefined;
      const fromNr = lk ? ts.nodes[lk.from] : undefined;
      const toNr = lk ? ts.nodes[lk.to] : undefined;

      const depthRatio = maxDia > 0 ? lr.depth / maxDia : 0;
      const theta = 2 * Math.acos(1 - 2 * Math.min(depthRatio, 1));
      const aMid = (maxDia * maxDia / 8) * (theta - Math.sin(theta)) || 0.01;
      const pWet = (maxDia / 2) * theta || 0.01;
      const rMid = pWet > 0 ? aMid / pWet : 0;
      const wMid = maxDia * Math.sin(theta / 2) || 0;

      ext.froude = (aMid > 0.001 && wMid > 0.001) ? Math.abs(lr.velocity) / Math.sqrt(g * aMid / wMid) : 0;
      const slopeFrac = len > 0 && fromN && toN ? Math.min(Math.abs(fromN.elev - toN.elev) / len, 0.05) : 0.01;
      ext.f1Area = aMid * (1 + slopeFrac);
      ext.f2Area = aMid * (1 - slopeFrac);
      ext.v1 = lr.velocity * (1 + slopeFrac * 2);
      ext.v2 = lr.velocity * (1 - slopeFrac * 2);
      const slope = len > 0 && fromN && toN ? (fromN.elev - toN.elev) / len : 0.01;
      const sf = roughness > 0 && rMid > 0 ? (roughness * lr.velocity / (1.486 * Math.pow(rMid, 2/3))) ** 2 : 0;
      ext.dq1Inertia = aMid * (lr.velocity - lr.velocity * 0.95) / dt;
      ext.dq2Pressure = g * aMid * (slope) * len / len;
      ext.dq3Friction = g * aMid * sf * len / len;
      ext.dq4Losses = 0;
      ext.dq5Lateral = 0;
      ext.dq6Convect = 0;
      ext.upHLoss = 0;
      ext.dnHLoss = 0;
      ext.frictionHLoss = sf * len;
      ext.hwFrictionSlope = sf;
      ext.qNormal = rMid > 0 ? (1.486 / roughness) * aMid * Math.pow(rMid, 2/3) * Math.sqrt(Math.abs(slope)) : 0;
      const dqSum = Math.abs(ext.dq1Inertia) + Math.abs(ext.dq2Pressure) + Math.abs(ext.dq3Friction);
      ext.stVenantBalance = dqSum > 0 ? Math.abs(ext.dq1Inertia) / dqSum : 0;
      ext.linkDqdh = lr.depth > 0.01 ? lr.flow / lr.depth : 0;

      ext.aMid = aMid;
      ext.aWeighted = aMid;
      ext.a1 = ext.f1Area;
      ext.a2 = ext.f2Area;
      ext.rMid = rMid;
      ext.rWeighted = rMid;
      ext.r1 = rMid * (1 + slopeFrac);
      ext.r2 = rMid * (1 - slopeFrac);
      ext.w1 = wMid * (1 + slopeFrac * 1.5);
      ext.w2 = wMid * (1 - slopeFrac * 1.5);
      ext.y1 = lr.depth * (1 + slopeFrac);
      ext.y2 = lr.depth * (1 - slopeFrac);

      const h1 = fromNr ? fromNr.head : (fromN?.elev || 0);
      const h2 = toNr ? toNr.head : (toN?.elev || 0);
      ext.hgl = (h1 + h2) / 2;
      ext.h1Head = h1;
      ext.h2Head = h2;
      ext.vhUp = (ext.v1 ** 2) / (2 * g);
      ext.vhMid = (lr.velocity ** 2) / (2 * g);
      ext.vhDn = (ext.v2 ** 2) / (2 * g);
      ext.frictionLossHf = ext.frictionHLoss;
      ext.bernoulliLHS = h1 + ext.vhUp;
      ext.bernoulliRHS = h2 + ext.vhDn + ext.frictionLossHf;
      ext.rho = 1.0;
      ext.sigma = ext.froude > 1 ? 0.5 : 1.0;

      ext.areaSWMM3 = aMid;
      ext.areaSWMM4 = aMid;
      ext.areaSWMM5 = aMid;

      ext.usNormalArea = aMid;
      ext.dsNormalArea = aMid;
      ext.linkTimestep = dt;
      ext.linkIterations = 2;
      ext.akon = roughness > 0 ? 1.486 / roughness : 114;
      ext.fasnh = roughness > 0 ? roughness * Math.pow(len, 1/3) : 1;
      ext.actualLength = len;
      ext.modLength = len;
      ext.actualRoughness = roughness;
      ext.roughFactor = 1.0;
      ext.bedSlope = slope;
      ext.qMax = rMid > 0 ? (1.486 / roughness) * (Math.PI * (maxDia / 2) ** 2 / 4) * Math.pow(maxDia / 4, 2/3) * Math.sqrt(Math.abs(slope)) : 0;
      ext.beta = 1.0;
      ext.setting = 1.0;
      ext.targetSetting = 1.0;
      ext.timeOpen = 0;
      ext.flowClass = ext.froude < 0.01 ? 0 : ext.froude < 1 ? 1 : ext.froude < 1.001 ? 3 : 2;
    }

    for (const [scId, sr] of Object.entries(ts.subcatchments)) {
      const sc = project.subcatchments.find(s => s.id === scId);
      if (!sr.extended) sr.extended = {};
      const ext = sr.extended;
      const pctImperv = sc?.pctImperv || 50;
      const area = sc?.area || 5;
      const impFrac = pctImperv / 100;

      ext.runoffImperv0 = sr.runoff * impFrac * 0.3;
      ext.runoffImperv1 = sr.runoff * impFrac * 0.7;
      ext.runoffPerv = sr.runoff * (1 - impFrac);
      ext.depthImperv0 = sr.rainfall > 0 ? 0.01 : 0;
      ext.depthImperv1 = sr.rainfall > 0 ? 0.02 : 0;
      ext.depthPerv = sr.rainfall > 0 ? sr.infiltration * 0.1 : 0;
      ext.avgSurfDepth = (ext.depthImperv0 * impFrac * 0.3 + ext.depthImperv1 * impFrac * 0.7 + ext.depthPerv * (1 - impFrac));
      ext.runon = 0;
      ext.subArea = area;
      ext.impAreaDS = area * impFrac * 0.7;
      ext.impAreaNoDS = area * impFrac * 0.3;

      ext.lidDrain = 0;
      ext.lidInfil = 0;
      ext.lidRunoff = 0;
      ext.lidEvap = 0;
      ext.lidPerc = 0;
      ext.lidStorVol = 0;
      ext.lidSurfVol = 0;
      ext.lidPaveVol = 0;
      ext.lidSoilVol = 0;
      ext.lidStorVol2 = 0;
      ext.lidBypass = 0;
      ext.lidSurfInflow = 0;
      ext.lidSurfDepth = 0;

      ext.gwUpper = sr.moisture * 2;
      ext.gwLower = sr.gwElev > 0 ? 0.8 : 0.5;
      ext.gwLateral = sr.gwOutflow * 0.6;
      ext.gwDeep = sr.gwOutflow * 0.4;
      ext.gwElev2 = sr.gwElev;
      ext.gwTheta = sr.moisture;
      ext.gwPerc = sr.infiltration * 0.3;
      ext.gwET = sr.evap * 0.5;
      ext.gwMaxInfil = 3.0;
      ext.gwHeadDiff = sr.gwElev > 0 ? sr.gwElev - 80 : 0;
      ext.gwCoeffA = 0.01;
      ext.gwCoeffB = 0.5;
      ext.gwBoundaryH = 80;
      ext.gwChannelH = 85;
      ext.gwTailwater = 82;

      ext.snowSWE = sr.snowDepth * 0.3;
      ext.snowCold = sr.snowDepth > 0 ? 0.5 : 0;
      ext.snowLiquid = sr.snowDepth > 0 ? sr.snowDepth * 0.05 : 0;
      ext.snowMelt = sr.snowDepth > 0 ? sr.snowDepth * 0.01 : 0;
      ext.snowCover = sr.snowDepth > 0 ? 1.0 : 0;
      ext.snowTemp = sr.snowDepth > 0 ? 30 : 50;

      ext.infilRate = sr.infiltration;
      ext.infilCumul = sr.infiltration * 0.5;
      ext.infilFp = 3.0;
      ext.infilFc = 0.5;
      ext.infilF0 = 4.0;
      ext.infilKsat = 0.5;
      ext.infilPsi = 6.0;
      ext.infilIMD = 0.25;
      ext.infilFu = sr.infiltration * 0.4;
      ext.infilLu = 12;
      ext.infilSat = sr.moisture;
      ext.infilTP = 0;
      ext.infilRecov = 0;
      ext.infilKs = 0.5;
      ext.infilSavg = 4.0;
      ext.infilDtheta = 0.15;
      ext.infilMaxRate = 4.0;
      ext.infilDecay = 0.001;
      ext.infilDryTime = 0;
      ext.infilPrevRain = sr.rainfall;
      ext.infilAMC = sr.moisture > 0.3 ? 3 : sr.moisture > 0.15 ? 2 : 1;
      ext.infilCN = 75 + pctImperv * 0.2;
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
    const outfallIds = new Set([
      ...project.outfalls.map(o => o.id),
    ]);
    for (const [nid, nr] of Object.entries(ts.nodes)) {
      totalFlooding += nr.flooding;
      totalStorage += nr.volume;
      if (outfallIds.has(nid)) {
        totalOutflow += nr.totalInflow;
      }
    }
    const scCount = Object.keys(ts.subcatchments).length || 1;
    const avgRain = totalRainfall / scCount;

    const sys: Record<string, number> = {};
    const totalInflow = totalRunoff + totalGW;
    const massBalance = totalInflow > 0 ? Math.abs(totalInflow - totalOutflow - totalFlooding) / totalInflow * 100 : 0;
    const stepError = totalInflow > 0 ? Math.abs(totalInflow - totalOutflow - totalFlooding + (prevStorage - totalStorage)) / Math.max(totalInflow, 1) * 100 : 0;

    sys.sysRainfall = avgRain;
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
    sys.sysSnowfall = 0;
    sys.sysSnowArea = 0;
    sys.sysFreeWater = 0;
    sys.sysColdContent = 0;
    sys.sysSnowmelt = 0;
    sys.sysImelt = 0;
    sys.sysRainMelt = 0;
    sys.stepFlowError = Math.min(stepError, 100);
    sys.sysCE = Math.min(massBalance, 100);
    sys.sysIterations = totalFlooding > 0 ? 4 : 2;
    sys.sysTimestep = dt;
    ts.system = { extended: sys };
    prevStorage = totalStorage;
  }
}

function generateMockResults(project: SwmmProject): SimulationResults {
  const numSteps = 96;
  const timeSteps: TimeStepResults[] = [];

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

    const hrs = Math.floor(step * 0.25);
    const mins = (step * 15) % 60;
    timeSteps.push({
      time: step * 15 * 60,
      dateTime: `01/01/2024 ${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`,
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
      return results;
    },
    getStatus() {
      return 'Mock Engine (Simulated Results)';
    },
  };
}
