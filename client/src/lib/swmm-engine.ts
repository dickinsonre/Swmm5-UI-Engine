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
  run(project: SwmmProject): Promise<SimulationResults>;
  getStatus(): string;
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
    async run(project: SwmmProject): Promise<SimulationResults> {
      await new Promise(resolve => setTimeout(resolve, 1500));
      return generateMockResults(project);
    },
    getStatus() {
      return 'Mock Engine (WASM not loaded)';
    },
  };
}

export async function createWasmEngine(): Promise<SwmmEngine> {
  try {
    const wasmModule = await loadSwmmWasm();
    if (wasmModule) {
      return {
        isLoaded: true,
        async run(project: SwmmProject): Promise<SimulationResults> {
          const inpText = projectToInp(project);
          return runSwmmWasm(wasmModule, inpText);
        },
        getStatus() {
          return 'SWMM5 WASM Engine';
        },
      };
    }
  } catch (e) {
    console.warn('WASM engine not available, falling back to mock:', e);
  }
  return createMockEngine();
}

async function loadSwmmWasm(): Promise<any> {
  return null;
}

async function runSwmmWasm(_module: any, _inpText: string): Promise<SimulationResults> {
  throw new Error('WASM engine not implemented');
}
