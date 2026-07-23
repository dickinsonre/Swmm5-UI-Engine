import type {
  SwmmProject,
  SimulationResults,
  TimeStepResults,
  NodeResult,
  LinkResult,
  SubcatchResult,
} from './swmm-types';
import { getSimStartMs, formatSimDateTime } from './sim-time';

const SUBCATCH_VARS = ['rainfall', 'snowDepth', 'evap', 'infiltration', 'runoff', 'gwOutflow', 'gwElev', 'moisture'] as const;
const NODE_VARS = ['depth', 'head', 'volume', 'lateralInflow', 'totalInflow', 'flooding'] as const;
const LINK_VARS = ['flow', 'depth', 'velocity', 'volume', 'capacity'] as const;

export function parseSwmmOut(buffer: ArrayBuffer, project: SwmmProject): SimulationResults {
  const view = new DataView(buffer);
  let offset = 0;

  function readInt32(): number {
    const v = view.getInt32(offset, true);
    offset += 4;
    return v;
  }

  function readFloat32(): number {
    const v = view.getFloat32(offset, true);
    offset += 4;
    return v;
  }

  function readFloat64(): number {
    const v = view.getFloat64(offset, true);
    offset += 8;
    return v;
  }

  const magic1 = readInt32();
  const version = readInt32();
  if (magic1 !== 516114522) {
    throw new Error(`Invalid SWMM .out file (magic: ${magic1})`);
  }

  const flowUnits = readInt32();
  const nSubcatch = readInt32();
  const nNodes = readInt32();
  const nLinks = readInt32();
  const nPollutants = readInt32();

  const subcatchNames: string[] = [];
  for (let i = 0; i < nSubcatch; i++) {
    const nameLen = readInt32();
    const bytes = new Uint8Array(buffer, offset, nameLen);
    subcatchNames.push(String.fromCharCode(...bytes));
    offset += nameLen;
  }

  const nodeNames: string[] = [];
  for (let i = 0; i < nNodes; i++) {
    const nameLen = readInt32();
    const bytes = new Uint8Array(buffer, offset, nameLen);
    nodeNames.push(String.fromCharCode(...bytes));
    offset += nameLen;
  }

  const linkNames: string[] = [];
  for (let i = 0; i < nLinks; i++) {
    const nameLen = readInt32();
    const bytes = new Uint8Array(buffer, offset, nameLen);
    linkNames.push(String.fromCharCode(...bytes));
    offset += nameLen;
  }

  const pollutantNames: string[] = [];
  for (let i = 0; i < nPollutants; i++) {
    const nameLen = readInt32();
    const bytes = new Uint8Array(buffer, offset, nameLen);
    pollutantNames.push(String.fromCharCode(...bytes));
    offset += nameLen;
  }

  for (let i = 0; i < nPollutants; i++) {
    readInt32();
  }

  // Input property sections are INTERLEAVED per object class:
  // count (INT4), property codes (INT4 each), then values (REAL4 each per object).
  const nSubcatchProps = readInt32();
  for (let i = 0; i < nSubcatchProps; i++) readInt32();
  for (let i = 0; i < nSubcatch * nSubcatchProps; i++) readFloat32();

  const nNodeProps = readInt32();
  for (let i = 0; i < nNodeProps; i++) readInt32();
  for (let i = 0; i < nNodes * nNodeProps; i++) readFloat32();

  const nLinkProps = readInt32();
  for (let i = 0; i < nLinkProps; i++) readInt32();
  for (let i = 0; i < nLinks * nLinkProps; i++) readFloat32();

  // Reporting variable counts + codes (subcatch, node, link, system).
  // These counts from the file are authoritative (they include pollutants).
  const nSubcatchVars = readInt32();
  for (let i = 0; i < nSubcatchVars; i++) readInt32();
  const nNodeVars = readInt32();
  for (let i = 0; i < nNodeVars; i++) readInt32();
  const nLinkVars = readInt32();
  for (let i = 0; i < nLinkVars; i++) readInt32();
  const nSysVars = readInt32();
  for (let i = 0; i < nSysVars; i++) readInt32();

  const reportStart = readFloat64();
  const reportStep = readInt32();

  let startOfResults = offset;

  // Cross-check with the closing records: the 4th-from-last INT4 is the
  // byte position where computed results begin. Prefer it when valid.
  const outputStartPos = view.getInt32(buffer.byteLength - 4 * 4, true);
  if (outputStartPos > 0 && outputStartPos < buffer.byteLength) {
    startOfResults = outputStartPos;
  }

  const bytesPerStep = 8 +
    (nSubcatch * nSubcatchVars * 4) +
    (nNodes * nNodeVars * 4) +
    (nLinks * nLinkVars * 4) +
    (nSysVars * 4);

  const nPeriods = view.getInt32(buffer.byteLength - 3 * 4, true);

  let actualPeriods = nPeriods;
  if (actualPeriods <= 0 || actualPeriods > 100000) {
    actualPeriods = Math.floor((buffer.byteLength - startOfResults - 6 * 4) / bytesPerStep);
  }
  if (actualPeriods <= 0) actualPeriods = 0;

  const maxPeriods = Math.min(actualPeriods, 5000);

  const timeSteps: TimeStepResults[] = [];
  const simStartMs = getSimStartMs(project);

  for (let p = 0; p < maxPeriods; p++) {
    offset = startOfResults + p * bytesPerStep;

    const dateVal = readFloat64();
    const timeSec = p * reportStep;

    const subcatchments: Record<string, SubcatchResult> = {};
    for (let s = 0; s < nSubcatch; s++) {
      const vals: number[] = [];
      for (let v = 0; v < nSubcatchVars; v++) vals.push(readFloat32());
      subcatchments[subcatchNames[s]] = {
        rainfall: vals[0] || 0,
        snowDepth: vals[1] || 0,
        evap: vals[2] || 0,
        infiltration: vals[3] || 0,
        runoff: vals[4] || 0,
        gwOutflow: vals[5] || 0,
        gwElev: vals[6] || 0,
        moisture: vals[7] || 0,
      };
    }

    const nodes: Record<string, NodeResult> = {};
    for (let n = 0; n < nNodes; n++) {
      const vals: number[] = [];
      for (let v = 0; v < nNodeVars; v++) vals.push(readFloat32());
      nodes[nodeNames[n]] = {
        depth: vals[0] || 0,
        head: vals[1] || 0,
        volume: vals[2] || 0,
        lateralInflow: vals[3] || 0,
        totalInflow: vals[4] || 0,
        flooding: vals[5] || 0,
      };
    }

    const links: Record<string, LinkResult> = {};
    for (let l = 0; l < nLinks; l++) {
      const vals: number[] = [];
      for (let v = 0; v < nLinkVars; v++) vals.push(readFloat32());
      links[linkNames[l]] = {
        flow: vals[0] || 0,
        depth: vals[1] || 0,
        velocity: vals[2] || 0,
        volume: vals[3] || 0,
        capacity: vals[4] || 0,
      };
    }

    timeSteps.push({
      time: timeSec,
      dateTime: formatSimDateTime(simStartMs, timeSec),
      nodes,
      links,
      subcatchments,
    });
  }

  const runoffCE = 0;
  const flowCE = 0;

  return {
    timeSteps,
    summary: {
      totalDuration: maxPeriods * reportStep,
      reportingSteps: maxPeriods,
      routingModel: project.options['FLOW_ROUTING'] || 'DYNWAVE',
      continuityErrors: {
        runoff: runoffCE,
        flow: flowCE,
        quality: 0,
      },
    },
  };
}
