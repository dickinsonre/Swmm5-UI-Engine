import type { SwmmProject, SimulationResults } from '@/lib/swmm-types';

export interface PhasePoint {
  t: number;
  dateTime: string;
  depth: number;
  flow: number;
  rising: boolean;
}

export interface DerivativePoint {
  t: number;
  dateTime: string;
  dQdt: number;
  dhdt: number;
}

export interface PhaseMetrics {
  id: string;
  elementType: 'link' | 'node';
  objType: string;
  depthReversalPct: number;
  oscillationIndex: number;
  chatterCount: number;
  signReversals: number;
  maxDepth: number;
  maxAbsFlow: number;
  score: number;
}

export interface ManningCurvePoint {
  depth: number;
  qNormal: number;
}

function isSiProject(project: SwmmProject): boolean {
  // SWMM5's metric FLOW_UNITS are CMS, LPS, MLD (US: CFS, GPM, MGD).
  // Matches the unit-system detection used in swmm-engine.ts.
  const fu = (project.options?.['FLOW_UNITS'] || project.options?.['flow_units'] || 'CFS').toString().toUpperCase();
  return fu === 'CMS' || fu === 'LPS' || fu === 'MLD';
}

function linkObjType(project: SwmmProject, id: string): string {
  if (project.conduits.some(c => c.id === id)) return 'conduit';
  if (project.pumps.some(p => p.id === id)) return 'pump';
  if (project.orifices.some(o => o.id === id)) return 'orifice';
  if (project.weirs.some(w => w.id === id)) return 'weir';
  return 'outlet';
}

function nodeObjType(project: SwmmProject, id: string): string {
  if (project.outfalls.some(o => o.id === id)) return 'outfall';
  if (project.storageUnits.some(s => s.id === id)) return 'storage';
  if (project.dividers.some(d => d.id === id)) return 'divider';
  return 'junction';
}

export function isLinkObjType(objType: string): boolean {
  return ['conduit', 'pump', 'orifice', 'weir', 'outlet'].includes(objType);
}

export function isNodeObjType(objType: string): boolean {
  return ['junction', 'outfall', 'divider', 'storage'].includes(objType);
}

// ---------------- Trajectory extraction ----------------

export function extractTrajectory(
  results: SimulationResults,
  id: string,
  elementType: 'link' | 'node',
): PhasePoint[] {
  const pts: PhasePoint[] = [];
  for (const ts of results.timeSteps) {
    if (elementType === 'link') {
      const lr = ts.links?.[id];
      if (!lr) continue;
      pts.push({ t: ts.time, dateTime: ts.dateTime, depth: lr.depth, flow: lr.flow, rising: true });
    } else {
      const nr = ts.nodes?.[id];
      if (!nr) continue;
      pts.push({ t: ts.time, dateTime: ts.dateTime, depth: nr.depth, flow: nr.totalInflow, rising: true });
    }
  }
  // Mark rising vs falling branches based on depth direction
  let lastDir = true;
  for (let i = 1; i < pts.length; i++) {
    const dd = pts[i].depth - pts[i - 1].depth;
    if (dd > 1e-9) lastDir = true;
    else if (dd < -1e-9) lastDir = false;
    pts[i].rising = lastDir;
  }
  if (pts.length > 1) pts[0].rising = pts[1].rising;
  return pts;
}

export function computeDerivatives(traj: PhasePoint[]): DerivativePoint[] {
  const out: DerivativePoint[] = [];
  for (let i = 1; i < traj.length; i++) {
    const dt = traj[i].t - traj[i - 1].t;
    if (dt <= 0) continue;
    out.push({
      t: traj[i].t,
      dateTime: traj[i].dateTime,
      dQdt: (traj[i].flow - traj[i - 1].flow) / dt,
      dhdt: (traj[i].depth - traj[i - 1].depth) / dt,
    });
  }
  return out;
}

// ---------------- Metrics ----------------

function computeMetricsFromSeries(
  depths: number[],
  flows: number[],
  surchargeThreshold: number | null,
  surchargeSeries: number[] | null,
): Omit<PhaseMetrics, 'id' | 'elementType' | 'objType'> {
  const n = depths.length;
  const maxDepth = n ? Math.max(...depths) : 0;
  const maxAbsFlow = n ? Math.max(...flows.map(Math.abs)) : 0;

  // Depth reversal percentage: interior points where depth direction reverses meaningfully
  let depthTurns = 0;
  const depthNoise = Math.max(maxDepth * 0.01, 1e-6);
  for (let i = 1; i < n - 1; i++) {
    const d1 = depths[i] - depths[i - 1];
    const d2 = depths[i + 1] - depths[i];
    if (d1 * d2 < 0 && Math.abs(d1) > depthNoise && Math.abs(d2) > depthNoise) depthTurns++;
  }
  const depthReversalPct = n > 2 ? (depthTurns / (n - 2)) * 100 : 0;

  // Oscillation/noise index on flow (SWMM-style flow instability index)
  let flowTurns = 0;
  for (let i = 1; i < n - 1; i++) {
    const d1 = flows[i] - flows[i - 1];
    const d2 = flows[i + 1] - flows[i];
    if (d1 * d2 < 0 && Math.abs(d1) > 0.05 * maxAbsFlow && Math.abs(d2) > 0.05 * maxAbsFlow) flowTurns++;
  }
  const oscillationIndex = n > 2 && maxAbsFlow > 1e-6 ? flowTurns / (n - 2) : 0;

  // Surcharge chatter: crossings of the surcharge threshold
  let chatterCount = 0;
  const series = surchargeSeries ?? depths;
  if (surchargeThreshold != null && surchargeThreshold > 0) {
    let above = series[0] >= surchargeThreshold;
    for (let i = 1; i < n; i++) {
      const nowAbove = series[i] >= surchargeThreshold;
      if (nowAbove !== above) chatterCount++;
      above = nowAbove;
    }
    // Only count as "chatter" if it bounces (more than one crossing)
    if (chatterCount <= 1) chatterCount = 0;
  }

  // Flow sign reversals (with magnitude threshold to skip near-zero noise)
  let signReversals = 0;
  const signThresh = 0.01 * maxAbsFlow;
  let lastSign = 0;
  for (let i = 0; i < n; i++) {
    if (Math.abs(flows[i]) <= signThresh) continue;
    const s = flows[i] > 0 ? 1 : -1;
    if (lastSign !== 0 && s !== lastSign) signReversals++;
    lastSign = s;
  }

  const score =
    Math.min(1, depthReversalPct / 50) * 30 +
    Math.min(1, oscillationIndex / 0.5) * 35 +
    Math.min(1, chatterCount / 10) * 20 +
    Math.min(1, signReversals / 6) * 15;

  return { depthReversalPct, oscillationIndex, chatterCount, signReversals, maxDepth, maxAbsFlow, score };
}

export function computePhaseMetrics(
  project: SwmmProject,
  results: SimulationResults,
  id: string,
  elementType: 'link' | 'node',
): PhaseMetrics | null {
  const traj = extractTrajectory(results, id, elementType);
  if (traj.length < 4) return null;
  const depths = traj.map(p => p.depth);
  const flows = traj.map(p => p.flow);

  let surchargeThreshold: number | null = null;
  let surchargeSeries: number[] | null = null;
  if (elementType === 'link') {
    // Use capacity (d/D) series with 0.95 threshold when available
    const caps: number[] = [];
    for (const ts of results.timeSteps) {
      const lr = ts.links?.[id];
      if (lr) caps.push(lr.capacity);
    }
    if (caps.length === depths.length && caps.some(c => c > 0)) {
      surchargeSeries = caps;
      surchargeThreshold = 0.95;
    }
  } else {
    const j = project.junctions.find(x => x.id === id)
      || project.storageUnits.find(x => x.id === id)
      || project.dividers.find(x => x.id === id);
    if (j && j.maxDepth > 0) surchargeThreshold = j.maxDepth * 0.99;
  }

  const m = computeMetricsFromSeries(depths, flows, surchargeThreshold, surchargeSeries);
  const objType = elementType === 'link' ? linkObjType(project, id) : nodeObjType(project, id);
  return { id, elementType, objType, ...m };
}

// ---------------- Attention sweep ----------------

export function computeAttentionSweep(project: SwmmProject, results: SimulationResults): PhaseMetrics[] {
  const out: PhaseMetrics[] = [];
  const first = results.timeSteps[0];
  if (!first) return out;
  for (const lid of Object.keys(first.links || {})) {
    const m = computePhaseMetrics(project, results, lid, 'link');
    if (m) out.push(m);
  }
  for (const nid of Object.keys(first.nodes || {})) {
    const m = computePhaseMetrics(project, results, nid, 'node');
    if (m) out.push(m);
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

// ---------------- Manning normal-flow reference curve ----------------

interface SectionGeom {
  area: number;
  hydRadius: number;
}

function sectionGeometry(shape: string, y: number, g1: number, g2: number, g3: number, g4: number): SectionGeom | null {
  const s = shape.toUpperCase();
  if (y <= 0) return { area: 0, hydRadius: 0 };
  if (s === 'CIRCULAR' || s === 'FORCE_MAIN') {
    const D = g1;
    if (D <= 0) return null;
    const yy = Math.min(y, D);
    const theta = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - (2 * yy) / D)));
    const area = (D * D / 8) * (theta - Math.sin(theta));
    const perim = (D / 2) * theta;
    return { area, hydRadius: perim > 0 ? area / perim : 0 };
  }
  if (s === 'RECT_CLOSED' || s === 'RECT_OPEN') {
    const H = g1, W = g2;
    if (H <= 0 || W <= 0) return null;
    const yy = Math.min(y, H);
    const area = W * yy;
    const perim = s === 'RECT_CLOSED' && yy >= H ? 2 * W + 2 * H : W + 2 * yy;
    return { area, hydRadius: perim > 0 ? area / perim : 0 };
  }
  if (s === 'TRAPEZOIDAL') {
    const H = g1, B = g2, zL = g3, zR = g4;
    if (H <= 0) return null;
    const yy = Math.min(y, H);
    const area = yy * (B + 0.5 * (zL + zR) * yy);
    const perim = B + yy * (Math.sqrt(1 + zL * zL) + Math.sqrt(1 + zR * zR));
    return { area, hydRadius: perim > 0 ? area / perim : 0 };
  }
  if (s === 'TRIANGULAR') {
    const H = g1, TW = g2;
    if (H <= 0 || TW <= 0) return null;
    const yy = Math.min(y, H);
    const z = TW / (2 * H);
    const area = z * yy * yy;
    const perim = 2 * yy * Math.sqrt(1 + z * z);
    return { area, hydRadius: perim > 0 ? area / perim : 0 };
  }
  if (s === 'PARABOLIC') {
    const H = g1, TW = g2;
    if (H <= 0 || TW <= 0) return null;
    const yy = Math.min(y, H);
    const tw = TW * Math.sqrt(yy / H);
    const area = (2 / 3) * tw * yy;
    const perim = tw + (8 / 3) * (yy * yy / Math.max(tw, 1e-9));
    return { area, hydRadius: perim > 0 ? area / perim : 0 };
  }
  return null;
}

export function computeManningCurve(project: SwmmProject, linkId: string): ManningCurvePoint[] | null {
  const c = project.conduits.find(x => x.id === linkId);
  if (!c) return null;
  const xs = project.xsections[linkId];
  if (!xs || typeof xs.geom1 !== 'number') return null;

  const allNodes = [...project.junctions, ...project.storageUnits, ...project.outfalls, ...project.dividers];
  const fn = allNodes.find(n => n.id === c.fromNode);
  const tn = allNodes.find(n => n.id === c.toNode);
  if (!fn || !tn || c.length <= 0 || c.roughness <= 0) return null;

  const upInvert = fn.elevation + (c.inOffset || 0);
  const dnInvert = tn.elevation + (c.outOffset || 0);
  let slope = (upInvert - dnInvert) / c.length;
  slope = Math.max(Math.abs(slope), 0.0001);

  const k = isSiProject(project) ? 1.0 : 1.486;
  const maxY = xs.geom1;
  if (maxY <= 0) return null;

  const barrels = Math.max(1, xs.barrels || 1);
  const pts: ManningCurvePoint[] = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const y = (maxY * i) / N;
    const g = sectionGeometry(xs.shape, y, xs.geom1, xs.geom2, xs.geom3, xs.geom4);
    if (!g) return null;
    const q = g.area > 0 ? (k / c.roughness) * g.area * Math.pow(g.hydRadius, 2 / 3) * Math.sqrt(slope) * barrels : 0;
    pts.push({ depth: y, qNormal: q });
  }
  return pts;
}
