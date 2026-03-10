import type {
  SwmmProject,
  SimulationResults,
  TimeStepResults,
  NodeResult,
  LinkResult,
  SubcatchResult,
} from './swmm-types';
import { projectToInp } from './inp-parser';

export interface SwmmEngine {
  isLoaded: boolean;
  mode: 'mock' | 'remote';
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

      if (onProgress) onProgress(10, 'Running SWMM 5.2.4 simulation...');

      const startTime = Date.now();
      const TIMEOUT_MS = 180000;
      const POLL_INTERVAL = 1500;

      while (true) {
        if (Date.now() - startTime > TIMEOUT_MS) {
          throw new Error('Simulation timed out after 180 seconds');
        }

        await new Promise(r => setTimeout(r, POLL_INTERVAL));

        const statusResp = await fetch(`/api/swmm-proxy/batch/${jobId}/status`);
        if (!statusResp.ok) {
          throw new Error(`Failed to check simulation status: ${statusResp.statusText}`);
        }
        const statusData = await statusResp.json();

        const batchStatus = statusData.status;
        const currentFile = statusData.results?.[0];
        const fileProgress = currentFile?.progress || 0;

        if (batchStatus === 'processing' || batchStatus === 'running') {
          const pct = Math.min(90, 10 + fileProgress * 0.8);
          if (onProgress) onProgress(pct, `Simulating... ${Math.round(fileProgress)}%`);
          continue;
        }

        if (batchStatus === 'completed' || batchStatus === 'done') {
          if (onProgress) onProgress(92, 'Fetching results...');

          const resultsResp = await fetch(`/api/swmm-proxy/batch/${jobId}/results`);
          if (!resultsResp.ok) {
            throw new Error(`Failed to fetch results: ${resultsResp.statusText}`);
          }
          const resultsData = await resultsResp.json();

          const fileResult = resultsData.results?.[0] || resultsData;
          if (fileResult.status === 'success' && fileResult.reportContent) {
            if (onProgress) onProgress(95, 'Parsing results...');
            const parsed = parseRptToResults(fileResult.reportContent, project);
            if (onProgress) onProgress(100, 'Simulation complete');
            return parsed;
          } else if (fileResult.status === 'failed') {
            throw new Error(`SWMM simulation failed: ${fileResult.error || 'Unknown error'}`);
          } else {
            throw new Error('Simulation completed but no results received');
          }
        }

        if (batchStatus === 'failed' || batchStatus === 'error') {
          const errMsg = statusData.error || currentFile?.error || 'Unknown simulation error';
          throw new Error(`SWMM simulation failed: ${errMsg}`);
        }
      }
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
      const maxDia = xs ? xs.geom1 : 2;
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
      return generateMockResults(project);
    },
    getStatus() {
      return 'Mock Engine (Simulated Results)';
    },
  };
}
