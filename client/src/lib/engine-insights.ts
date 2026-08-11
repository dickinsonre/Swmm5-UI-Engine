// Engine insights: parse .rpt diagnostics + compute result-based health metrics.
// Powers the Engine Health dashboard, Timestep Explorer, Assumptions drawer,
// and the Engine Inspector (calculation microscope).

import type { SwmmProject, SimulationResults, XSection } from './swmm-types';

// ---------------- .rpt parsing ----------------

export interface ContinuityBlock {
  key: 'runoff' | 'groundwater' | 'routing' | 'quality';
  title: string;
  errorPct: number | null;
  rows: { label: string; v1: string; v2: string }[];
}

export interface TimeStepMetrics {
  requestedSec: number | null;
  variableStep: boolean | null;
  minSec: number | null;
  avgSec: number | null;
  maxSec: number | null;
  pctSteady: number | null;
  avgIterations: number | null;
  pctNotConverging: number | null;
  frequencies: { range: string; pct: number }[];
}

export interface RptEngineMetrics {
  continuity: ContinuityBlock[];
  highestContinuityNodes: { id: string; pct: number }[];
  timeStepCriticalElements: { id: string; pct: number; kind: 'node' | 'link' }[];
  instabilityLinks: { id: string; index: number }[];
  nonconvergingNodes: { id: string; pct: number }[];
  timeStep: TimeStepMetrics;
  analysisOptions: { label: string; value: string }[];
}

const CONTINUITY_TITLES: [ContinuityBlock['key'], string][] = [
  ['runoff', 'Runoff Quantity Continuity'],
  ['groundwater', 'Groundwater Continuity'],
  ['routing', 'Flow Routing Continuity'],
  ['quality', 'Quality Routing Continuity'],
];

function parseContinuityBlock(lines: string[], startIdx: number): { errorPct: number | null; rows: ContinuityBlock['rows'] } {
  const rows: ContinuityBlock['rows'] = [];
  let errorPct: number | null = null;
  for (let i = startIdx; i < Math.min(lines.length, startIdx + 40); i++) {
    const line = lines[i];
    const m = line.match(/^\s{2,}(.+?)\s\.{2,}\s+([-\d.]+)(?:\s+([-\d.]+))?\s*$/);
    if (m) {
      if (/Continuity Error/i.test(m[1])) {
        errorPct = parseFloat(m[2]);
        break;
      }
      rows.push({ label: m[1].trim(), v1: m[2], v2: m[3] ?? '' });
    } else if (/^\s*\*{4,}/.test(line) && rows.length > 0) {
      break;
    }
  }
  return { errorPct, rows };
}

function parseIdPctList(lines: string[], startIdx: number, kind: 'Node' | 'Link'): { id: string; pct: number }[] {
  const out: { id: string; pct: number }[] = [];
  for (let i = startIdx; i < Math.min(lines.length, startIdx + 20); i++) {
    const m = lines[i].match(new RegExp(`^\\s+${kind}\\s+(\\S+)\\s+\\(([-\\d.]+)%?\\)`));
    if (m) out.push({ id: m[1], pct: parseFloat(m[2]) });
    else if (out.length > 0) break;
  }
  return out;
}

// "Time-Step Critical Elements" mixes Node and Link rows — keep both, with type.
function parseCriticalElements(lines: string[], startIdx: number): { id: string; pct: number; kind: 'node' | 'link' }[] {
  const out: { id: string; pct: number; kind: 'node' | 'link' }[] = [];
  for (let i = startIdx; i < Math.min(lines.length, startIdx + 20); i++) {
    const m = lines[i].match(/^\s+(Node|Link)\s+(\S+)\s+\(([-\d.]+)%?\)/);
    if (m) out.push({ id: m[2], pct: parseFloat(m[3]), kind: m[1].toLowerCase() as 'node' | 'link' });
    else if (out.length > 0) break;
  }
  return out;
}

export function parseRptEngineMetrics(rpt: string): RptEngineMetrics {
  const lines = rpt.split(/\r?\n/);
  const metrics: RptEngineMetrics = {
    continuity: [],
    highestContinuityNodes: [],
    timeStepCriticalElements: [],
    instabilityLinks: [],
    nonconvergingNodes: [],
    timeStep: {
      requestedSec: null, variableStep: null, minSec: null, avgSec: null, maxSec: null,
      pctSteady: null, avgIterations: null, pctNotConverging: null, frequencies: [],
    },
    analysisOptions: [],
  };

  // Headings may carry trailing column labels (e.g. "Runoff Quantity Continuity     acre-feet        inches"),
  // so match on the start of the trimmed line rather than exact equality.
  const findHeading = (title: string): number => {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith(title)) return i;
    }
    return -1;
  };

  // Continuity blocks
  for (const [key, title] of CONTINUITY_TITLES) {
    const idx = findHeading(title);
    if (idx >= 0) {
      const { errorPct, rows } = parseContinuityBlock(lines, idx + 1);
      metrics.continuity.push({ key, title, errorPct, rows });
    }
  }

  // Diagnostic element lists
  let idx = findHeading('Highest Continuity Errors');
  if (idx >= 0) metrics.highestContinuityNodes = parseIdPctList(lines, idx + 1, 'Node');
  idx = findHeading('Time-Step Critical Elements');
  if (idx >= 0) metrics.timeStepCriticalElements = parseCriticalElements(lines, idx + 1);
  idx = findHeading('Most Frequent Nonconverging Nodes');
  if (idx >= 0) metrics.nonconvergingNodes = parseIdPctList(lines, idx + 1, 'Node');
  idx = findHeading('Highest Flow Instability Indexes');
  if (idx >= 0) {
    for (let i = idx + 1; i < Math.min(lines.length, idx + 20); i++) {
      const m = lines[i].match(/^\s+Link\s+(\S+)\s+\((\d+)\)/);
      if (m) metrics.instabilityLinks.push({ id: m[1], index: parseInt(m[2], 10) });
      else if (metrics.instabilityLinks.length > 0) break;
    }
  }

  // Routing Time Step Summary
  idx = findHeading('Routing Time Step Summary');
  if (idx >= 0) {
    let found = false;
    for (let i = idx + 1; i < Math.min(lines.length, idx + 25); i++) {
      const line = lines[i];
      let m;
      if ((m = line.match(/Minimum Time Step\s*:\s*([\d.]+)/))) { metrics.timeStep.minSec = parseFloat(m[1]); found = true; }
      else if ((m = line.match(/Average Time Step\s*:\s*([\d.]+)/))) { metrics.timeStep.avgSec = parseFloat(m[1]); found = true; }
      else if ((m = line.match(/Maximum Time Step\s*:\s*([\d.]+)/))) { metrics.timeStep.maxSec = parseFloat(m[1]); found = true; }
      else if ((m = line.match(/% of Time in Steady State\s*:\s*([\d.]+)/))) { metrics.timeStep.pctSteady = parseFloat(m[1]); found = true; }
      else if ((m = line.match(/Average Iterations per Step\s*:\s*([\d.]+)/))) { metrics.timeStep.avgIterations = parseFloat(m[1]); found = true; }
      else if ((m = line.match(/% of Steps Not Converging\s*:\s*([\d.]+)/))) { metrics.timeStep.pctNotConverging = parseFloat(m[1]); found = true; }
      else if ((m = line.match(/^\s+([\d.]+\s*-\s*[\d.]+ sec)\s*:\s*([\d.]+)\s*%/))) {
        metrics.timeStep.frequencies.push({ range: m[1].replace(/\s+/g, ' '), pct: parseFloat(m[2]) });
        found = true;
      } else if (/^\s*\*{4,}/.test(line) && found) break;
    }
  }

  // Analysis Options block
  idx = findHeading('Analysis Options');
  if (idx >= 0) {
    for (let i = idx + 2; i < Math.min(lines.length, idx + 45); i++) {
      const line = lines[i];
      if (/^\s*\*{4,}/.test(line)) break;
      const m = line.match(/^(\s+)(.+?)\s\.{2,}\s+(.+?)\s*$/);
      if (m) {
        const indent = m[1].length > 3 ? '\u2003' : '';
        metrics.analysisOptions.push({ label: indent + m[2].trim(), value: m[3].trim() });
      } else {
        const hm = line.match(/^\s+([A-Za-z /]+):\s*$/);
        if (hm) metrics.analysisOptions.push({ label: hm[1].trim() + ':', value: '' });
      }
      if (metrics.analysisOptions.length > 0 && line.trim() === '' && lines[i + 1]?.trim() === '') break;
    }
    if ((metrics.timeStep.requestedSec == null)) {
      const rs = metrics.analysisOptions.find(o => /Routing Time Step/i.test(o.label));
      if (rs) {
        const m = rs.value.match(/([\d.]+)\s*sec/);
        if (m) metrics.timeStep.requestedSec = parseFloat(m[1]);
      }
      const vt = metrics.analysisOptions.find(o => /Variable Time Step/i.test(o.label));
      if (vt) metrics.timeStep.variableStep = /YES/i.test(vt.value);
    }
  }

  return metrics;
}

// ---------------- Continuity classification ----------------

export interface ContinuityClass {
  label: 'Excellent' | 'Good' | 'Investigate' | 'Warning';
  color: string;
  bg: string;
}

export function classifyContinuity(pct: number | null): ContinuityClass {
  const a = Math.abs(pct ?? 0);
  if (pct == null || a < 1) return { label: 'Excellent', color: '#1a7f37', bg: '#e6f4ea' };
  if (a < 2) return { label: 'Good', color: '#4d8a1a', bg: '#eef7e6' };
  if (a < 5) return { label: 'Investigate', color: '#b0730a', bg: '#fdf3df' };
  return { label: 'Warning', color: '#c62828', bg: '#fdeaea' };
}

// ---------------- Result-derived health ----------------

export interface ComputedHealth {
  surchargedNodeIds: string[];
  floodedNodeIds: string[];
  reversalLinkIds: string[];
  maxFroude: { value: number; linkId: string | null };
  hasFroude: boolean;
}

export function computeResultHealth(project: SwmmProject, results: SimulationResults | null): ComputedHealth {
  const out: ComputedHealth = {
    surchargedNodeIds: [], floodedNodeIds: [], reversalLinkIds: [],
    maxFroude: { value: 0, linkId: null }, hasFroude: false,
  };
  if (!results || results.timeSteps.length === 0) return out;

  const nodeMaxD = new Map<string, number>();
  for (const j of project.junctions) nodeMaxD.set(j.id, j.maxDepth);
  for (const s of project.storageUnits) nodeMaxD.set(s.id, s.maxDepth);

  const surcharged = new Set<string>();
  const flooded = new Set<string>();
  const posFlow = new Set<string>();
  const negFlow = new Set<string>();
  const FLOW_EPS = 0.001;

  for (const ts of results.timeSteps) {
    for (const [nid, nr] of Object.entries(ts.nodes || {})) {
      const maxD = nodeMaxD.get(nid);
      if (maxD != null && maxD > 0 && nr.depth >= maxD * 0.999) surcharged.add(nid);
      if ((nr.flooding ?? 0) > FLOW_EPS) flooded.add(nid);
    }
    for (const [lid, lr] of Object.entries(ts.links || {})) {
      if (lr.flow > FLOW_EPS) posFlow.add(lid);
      else if (lr.flow < -FLOW_EPS) negFlow.add(lid);
      const fr = lr.extended?.froude;
      if (fr != null) {
        out.hasFroude = true;
        if (fr > out.maxFroude.value && lr.depth > 0.01) {
          out.maxFroude = { value: fr, linkId: lid };
        }
      }
    }
  }

  const conduitIds = new Set(project.conduits.map(c => c.id));
  out.surchargedNodeIds = Array.from(surcharged);
  out.floodedNodeIds = Array.from(flooded);
  out.reversalLinkIds = Array.from(posFlow).filter(id => negFlow.has(id) && conduitIds.has(id));
  return out;
}

// ---------------- Flow regime ----------------

export const FLOW_REGIMES = [
  { code: 0, label: 'DRY', color: '#9aa0a6' },
  { code: 1, label: 'SUBCRITICAL', color: '#2c6eb5' },
  { code: 2, label: 'SUPERCRITICAL', color: '#e2574c' },
  { code: 3, label: 'CRITICAL', color: '#b0730a' },
  { code: 4, label: 'FULL / SURCHARGED', color: '#7b3fa0' },
] as const;

export function regimeForLink(
  flowClass: number | undefined,
  flow: number,
): { label: string; color: string } {
  const base = FLOW_REGIMES.find(r => r.code === (flowClass ?? -1));
  if (!base) return { label: 'N/A', color: '#9aa0a6' };
  if (flow < -0.001 && base.code !== 0) return { label: base.label + ' \u00b7 REVERSED', color: base.color };
  return { label: base.label, color: base.color };
}

// ---------------- Cross-section geometry (for the Engine Inspector) ----------------

// Shapes whose A/P/T reconstruction below is exact. Everything else (arch, elliptical,
// irregular/transect, custom, filled circular, ...) is gated off in the Inspector rather
// than silently approximated as circular.
export const SUPPORTED_XS_SHAPES = new Set(['CIRCULAR', 'FORCE_MAIN', 'RECT_CLOSED', 'RECT_OPEN', 'TRAPEZOIDAL', 'TRIANGULAR']);

export interface XsGeom { shape: string; geom1: number; geom2: number; geom3: number; geom4: number }

export function xsFromProject(project: SwmmProject, linkId: string): XsGeom | null {
  const xsAll: any = project.xsections;
  const xs: XSection | undefined = Array.isArray(xsAll) ? xsAll.find((x: any) => x.linkId === linkId) : xsAll[linkId];
  if (!xs) return null;
  const num = (v: number | string | undefined) => (typeof v === 'number' ? v : parseFloat(String(v ?? 0)) || 0);
  return { shape: (xs.shape || 'CIRCULAR').toUpperCase(), geom1: num(xs.geom1), geom2: num(xs.geom2), geom3: num(xs.geom3), geom4: num(xs.geom4) };
}

export function xsArea(xs: XsGeom, depth: number): number {
  const D = xs.geom1 || 1;
  const d = Math.max(0, Math.min(depth, D));
  if (d <= 0) return 0;
  switch (xs.shape) {
    case 'CIRCULAR':
    case 'FORCE_MAIN':
    case 'FILLED_CIRCULAR': {
      if (d >= D) return Math.PI * D * D / 4;
      const r = D / 2;
      const th = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - d / r)));
      return r * r / 2 * (th - Math.sin(th));
    }
    case 'RECT_CLOSED': case 'RECT_OPEN': return d * (xs.geom2 || D);
    case 'TRAPEZOIDAL': {
      const sL = xs.geom3 || 0, sR = xs.geom4 || sL;
      return d * ((xs.geom2 || D) + 0.5 * (sL + sR) * d);
    }
    case 'TRIANGULAR': return (xs.geom2 || 1) * d * d;
    default: {
      if (d >= D) return Math.PI * D * D / 4;
      const r = D / 2;
      const th = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - d / r)));
      return r * r / 2 * (th - Math.sin(th));
    }
  }
}

export function xsWettedPerimeter(xs: XsGeom, depth: number): number {
  const D = xs.geom1 || 1;
  const d = Math.max(0, Math.min(depth, D));
  if (d <= 0) return 0;
  switch (xs.shape) {
    case 'CIRCULAR': case 'FORCE_MAIN': case 'FILLED_CIRCULAR': {
      if (d >= D) return Math.PI * D;
      const r = D / 2;
      return r * 2 * Math.acos(Math.max(-1, Math.min(1, 1 - d / r)));
    }
    case 'RECT_CLOSED': case 'RECT_OPEN': return (xs.geom2 || D) + 2 * d + (d >= D && xs.shape === 'RECT_CLOSED' ? (xs.geom2 || D) : 0);
    case 'TRAPEZOIDAL': {
      const sL = xs.geom3 || 0, sR = xs.geom4 || sL;
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

export function xsTopWidth(xs: XsGeom, depth: number): number {
  const D = xs.geom1 || 1;
  const d = Math.max(0.0001, Math.min(depth, D - 0.0001));
  switch (xs.shape) {
    case 'CIRCULAR': case 'FORCE_MAIN': case 'FILLED_CIRCULAR': {
      const r = D / 2;
      return 2 * Math.sqrt(Math.max(0, r * r - (r - d) * (r - d)));
    }
    case 'RECT_CLOSED': case 'RECT_OPEN': return xs.geom2 || D;
    case 'TRAPEZOIDAL': {
      const sL = xs.geom3 || 0, sR = xs.geom4 || sL;
      return (xs.geom2 || D) + (sL + sR) * d;
    }
    case 'TRIANGULAR': return 2 * (xs.geom2 || 1) * d;
    default: {
      const r = D / 2;
      return 2 * Math.sqrt(Math.max(0, r * r - (r - d) * (r - d)));
    }
  }
}

// ---------------- Engine Inspector calculation trace ----------------

export interface InspectorTrace {
  linkId: string;
  units: { flow: string; len: string; vel: string };
  isSI: boolean;
  g: number;
  phi: number; // Manning conversion constant
  // inputs
  length: number;
  roughness: number;
  slope: number; // computed from inverts + offsets
  upNode: string;
  dnNode: string;
  upInvert: number | null;
  dnInvert: number | null;
  shape: string;
  geom1: number;
  // state at timestep
  upHead: number | null;
  dnHead: number | null;
  upDepthNode: number | null;
  dnDepthNode: number | null;
  headGradient: number | null; // (H1 - H2)/L
  depth: number;
  area: number;
  wettedP: number;
  hydRadius: number;
  topWidth: number;
  hydDepth: number;
  velocity: number;
  flow: number;
  froude: number;
  normalFlow: number | null;  // Manning at current depth
  fullFlow: number | null;    // Manning at full depth
  capacity: number;           // d/D from results if present
  regime: { label: string; color: string };
  surcharged: boolean;
  // False when the cross-section shape is not in SUPPORTED_XS_SHAPES; geometry-derived
  // fields (area, R, T, D, normal/full flow, Froude fallback) are then unavailable.
  geometrySupported: boolean;
}

export function buildInspectorTrace(
  project: SwmmProject,
  results: SimulationResults,
  linkId: string,
  timeStep: number,
): InspectorTrace | null {
  const c = project.conduits.find(k => k.id === linkId);
  if (!c) return null;
  const ts = results.timeSteps[Math.max(0, Math.min(timeStep, results.timeSteps.length - 1))];
  if (!ts) return null;
  const lr = ts.links?.[linkId];
  if (!lr) return null;

  const fu = (project.options?.FLOW_UNITS || 'CFS').toUpperCase();
  const isSI = ['CMS', 'LPS', 'MLD'].includes(fu);
  const g = isSI ? 9.81 : 32.174;
  const phi = isSI ? 1.0 : 1.4859;

  const nodeElev = new Map<string, number>();
  for (const j of project.junctions) nodeElev.set(j.id, j.elevation);
  for (const o of project.outfalls) nodeElev.set(o.id, o.elevation);
  for (const s of project.storageUnits) nodeElev.set(s.id, s.elevation);
  for (const d of project.dividers) nodeElev.set(d.id, d.elevation);

  const upInvertNode = nodeElev.get(c.fromNode) ?? null;
  const dnInvertNode = nodeElev.get(c.toNode) ?? null;
  const upInvert = upInvertNode != null ? upInvertNode + (c.inOffset || 0) : null;
  const dnInvert = dnInvertNode != null ? dnInvertNode + (c.outOffset || 0) : null;
  const slope = upInvert != null && dnInvert != null && c.length > 0 ? (upInvert - dnInvert) / c.length : 0;

  const xs = xsFromProject(project, linkId) || { shape: 'CIRCULAR', geom1: 1, geom2: 0, geom3: 0, geom4: 0 };
  const geometrySupported = SUPPORTED_XS_SHAPES.has(xs.shape) && xs.geom1 > 0;
  const depth = lr.depth ?? 0;
  const area = geometrySupported ? xsArea(xs, depth) : NaN;
  const wettedP = geometrySupported ? xsWettedPerimeter(xs, depth) : NaN;
  const hydRadius = geometrySupported && wettedP > 0 ? area / wettedP : geometrySupported ? 0 : NaN;
  const topWidth = geometrySupported ? xsTopWidth(xs, depth) : NaN;
  const hydDepth = geometrySupported ? (topWidth > 0 ? area / topWidth : 0) : NaN;
  const velocity = lr.velocity ?? (geometrySupported && area > 0 ? lr.flow / area : 0);
  const froude = lr.extended?.froude ?? (geometrySupported && hydDepth > 0 ? Math.abs(velocity) / Math.sqrt(g * hydDepth) : NaN);

  const n = c.roughness || 0.013;
  const sAbs = Math.max(slope, 0);
  const normalFlow = geometrySupported && area > 0 && sAbs > 0 ? (phi / n) * area * Math.pow(hydRadius, 2 / 3) * Math.sqrt(sAbs) : null;
  const aFull = geometrySupported ? xsArea(xs, xs.geom1) : NaN;
  const pFull = geometrySupported ? xsWettedPerimeter(xs, xs.geom1) : NaN;
  const rFull = pFull > 0 ? aFull / pFull : 0;
  const fullFlow = geometrySupported && sAbs > 0 ? (phi / n) * aFull * Math.pow(rFull, 2 / 3) * Math.sqrt(sAbs) : null;

  const upNR = ts.nodes?.[c.fromNode];
  const dnNR = ts.nodes?.[c.toNode];
  const upHead = upNR?.head ?? null;
  const dnHead = dnNR?.head ?? null;
  const headGradient = upHead != null && dnHead != null && c.length > 0 ? (upHead - dnHead) / c.length : null;

  const capacity = lr.capacity ?? (xs.geom1 > 0 ? depth / xs.geom1 : 0);
  const surcharged = capacity >= 0.97;

  return {
    linkId,
    units: {
      flow: fu,
      len: isSI ? 'm' : 'ft',
      vel: isSI ? 'm/s' : 'ft/s',
    },
    isSI, g, phi,
    length: c.length, roughness: n, slope,
    upNode: c.fromNode, dnNode: c.toNode, upInvert, dnInvert,
    shape: xs.shape, geom1: xs.geom1,
    upHead, dnHead,
    upDepthNode: upNR?.depth ?? null, dnDepthNode: dnNR?.depth ?? null,
    headGradient,
    depth, area, wettedP, hydRadius, topWidth, hydDepth,
    velocity, flow: lr.flow ?? 0, froude,
    normalFlow, fullFlow, capacity,
    regime: regimeForLink(lr.extended?.flowClass, lr.flow ?? 0),
    surcharged,
    geometrySupported,
  };
}

// ---------------- Assumptions drawer ----------------

const ASSUMPTION_KEYS: [string, string][] = [
  ['FLOW_UNITS', 'Flow units'],
  ['ROUTING', 'Routing model'],
  ['FLOW_ROUTING', 'Routing model'],
  ['INFILTRATION', 'Infiltration method'],
  ['SURCHARGE_METHOD', 'Surcharge method'],
  ['INERTIAL_DAMPING', 'Inertial terms'],
  ['NORMAL_FLOW_LIMITED', 'Normal flow limitation'],
  ['FORCE_MAIN_EQUATION', 'Force mains'],
  ['ROUTING_STEP', 'Routing time step'],
  ['VARIABLE_STEP', 'Variable timestep factor'],
  ['MINIMUM_STEP', 'Minimum timestep'],
  ['LENGTHENING_STEP', 'Conduit lengthening step'],
  ['MAX_TRIALS', 'Max trials per step'],
  ['HEAD_TOLERANCE', 'Head tolerance'],
  ['SYS_FLOW_TOL', 'System flow tolerance'],
  ['LAT_FLOW_TOL', 'Lateral flow tolerance'],
  ['MIN_SURFAREA', 'Minimum nodal surface area'],
  ['MIN_SLOPE', 'Minimum conduit slope'],
  ['ALLOW_PONDING', 'Ponding allowed'],
  ['SKIP_STEADY_STATE', 'Skip steady-state periods'],
  ['IGNORE_RAINFALL', 'Ignore rainfall'],
  ['IGNORE_GROUNDWATER', 'Ignore groundwater'],
  ['IGNORE_SNOWMELT', 'Ignore snowmelt'],
  ['IGNORE_QUALITY', 'Ignore water quality'],
  ['THREADS', 'Threads'],
];

// Prefer the exact [OPTIONS] lines from the .inp the engine actually ran (results.inpUsed)
// over the current editable project, which may have been modified since the run.
export function buildAssumptions(options: Record<string, string>): { label: string; value: string; key: string }[] {
  const out: { label: string; value: string; key: string }[] = [];
  const seen = new Set<string>();
  for (const [key, label] of ASSUMPTION_KEYS) {
    const v = options?.[key];
    if (v != null && v !== '' && !seen.has(label)) {
      out.push({ label, value: v, key });
      seen.add(label);
    }
  }
  return out;
}

export function optionsFromInpText(inpText: string): Record<string, string> | null {
  const m = inpText.match(/^\s*\[OPTIONS\]\s*$([\s\S]*?)(?=^\s*\[|\s*$(?![\s\S]))/im);
  if (!m) return null;
  const opts: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith(';')) continue;
    const mm = t.match(/^(\S+)\s+(.+)$/);
    if (mm) opts[mm[1].toUpperCase()] = mm[2].trim();
  }
  return Object.keys(opts).length > 0 ? opts : null;
}

// ---------------- Timestep drop explanations ----------------

export function explainTimestepDrop(rpt: RptEngineMetrics): string[] {
  const reasons: string[] = [];
  const t = rpt.timeStep;
  if (t.requestedSec != null && t.minSec != null && t.minSec < t.requestedSec * 0.9) {
    if (rpt.timeStepCriticalElements.length > 0) {
      reasons.push(
        'Courant (CFL) constraint: ' +
        rpt.timeStepCriticalElements.map(l => `${l.kind} ${l.id} (controls ${l.pct.toFixed(1)}% of steps)`).join(', ') +
        ' forced the variable timestep below the requested value — wave celerity there exceeds length/\u0394t.'
      );
    } else {
      reasons.push('The variable timestep dropped below the requested routing step (Courant constraint or rapid node depth change).');
    }
  }
  if ((t.pctNotConverging ?? 0) > 5) {
    reasons.push(
      `Iteration convergence: ${t.pctNotConverging!.toFixed(1)}% of steps hit the trial limit without converging` +
      (rpt.nonconvergingNodes.length > 0
        ? ` — worst nodes: ${rpt.nonconvergingNodes.slice(0, 5).map(n => n.id).join(', ')}.`
        : '.') +
      ' Consider more trials, a looser head tolerance, or reviewing those nodes.'
    );
  }
  if (rpt.instabilityLinks.length > 0) {
    reasons.push(
      `Flow instability: link${rpt.instabilityLinks.length > 1 ? 's' : ''} ` +
      rpt.instabilityLinks.slice(0, 5).map(l => `${l.id} (index ${l.index})`).join(', ') +
      ' show oscillating flows, which shrink the stable timestep.'
    );
  }
  if (reasons.length === 0) {
    reasons.push('The routing timestep stayed near the requested value — no significant Courant, convergence, or instability pressure detected.');
  }
  return reasons;
}
