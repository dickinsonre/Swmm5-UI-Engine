import type { SwmmProject, SimulationResults, Conduit } from './swmm-types';

export type HealthSeverity = 'error' | 'warning' | 'info';

export interface HealthFinding {
  id: string;
  severity: HealthSeverity;
  message: string;
  objectId?: string;
  objectType?: string;
  value?: string;
}

export interface HealthSection {
  key: 'input' | 'hydraulic' | 'numerical' | 'consequences';
  title: string;
  findings: HealthFinding[];
  requiresResults: boolean;
}

export interface ModelHealthReport {
  sections: HealthSection[];
  hasResults: boolean;
  errorCount: number;
  warningCount: number;
}

interface NodeInfo {
  id: string;
  type: string;
  invert: number;
  maxDepth: number;
}

function collectNodes(project: SwmmProject): Map<string, NodeInfo> {
  const m = new Map<string, NodeInfo>();
  for (const j of project.junctions) m.set(j.id, { id: j.id, type: 'junction', invert: j.elevation, maxDepth: j.maxDepth });
  for (const o of project.outfalls) m.set(o.id, { id: o.id, type: 'outfall', invert: o.elevation, maxDepth: 0 });
  for (const s of project.storageUnits) m.set(s.id, { id: s.id, type: 'storage', invert: s.elevation, maxDepth: s.maxDepth });
  for (const d of project.dividers) m.set(d.id, { id: d.id, type: 'divider', invert: d.elevation, maxDepth: d.maxDepth });
  return m;
}

function allLinks(project: SwmmProject) {
  return [
    ...project.conduits.map(c => ({ id: c.id, from: c.fromNode, to: c.toNode, type: 'conduit' })),
    ...project.pumps.map(p => ({ id: p.id, from: p.fromNode, to: p.toNode, type: 'pump' })),
    ...project.orifices.map(o => ({ id: o.id, from: o.fromNode, to: o.toNode, type: 'orifice' })),
    ...project.weirs.map(w => ({ id: w.id, from: w.fromNode, to: w.toNode, type: 'weir' })),
    ...project.outlets.map(o => ({ id: o.id, from: o.fromNode, to: o.toNode, type: 'outlet' })),
  ];
}

function getXs(project: SwmmProject, linkId: string) {
  const xs: any = project.xsections;
  if (Array.isArray(xs)) return xs.find((x: any) => x.linkId === linkId);
  return xs[linkId];
}

function findDuplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const v of ids) { if (seen.has(v)) dups.add(v); seen.add(v); }
  return Array.from(dups);
}

function isMetric(project: SwmmProject): boolean {
  const fu = (project.options['FLOW_UNITS'] || 'CFS').toUpperCase();
  return ['CMS', 'LPS', 'MLD'].includes(fu);
}

// ---------------- Section 1: Input integrity ----------------

export function analyzeInputIntegrity(project: SwmmProject): HealthFinding[] {
  const out: HealthFinding[] = [];
  let n = 0;
  const add = (severity: HealthSeverity, message: string, objectId?: string, objectType?: string, value?: string) =>
    out.push({ id: `in${n++}`, severity, message, objectId, objectType, value });

  const nodes = collectNodes(project);
  const links = allLinks(project);

  if (nodes.size === 0) add('error', 'No nodes defined in the model');
  if (project.outfalls.length === 0) add('error', 'No outfall nodes — the model needs at least one outfall');

  // Invalid node references + self-loops
  for (const l of links) {
    if (!nodes.has(l.from)) add('error', `${l.type} "${l.id}" references unknown upstream node "${l.from}"`, l.id, l.type);
    if (!nodes.has(l.to)) add('error', `${l.type} "${l.id}" references unknown downstream node "${l.to}"`, l.id, l.type);
    if (l.from === l.to) add('error', `${l.type} "${l.id}" connects a node to itself`, l.id, l.type);
  }

  // Orphaned nodes
  const connected = new Set<string>();
  for (const l of links) { connected.add(l.from); connected.add(l.to); }
  const subOutlets = new Set(project.subcatchments.map(s => s.outlet));
  for (const [nid, info] of Array.from(nodes.entries())) {
    if (!connected.has(nid) && !subOutlets.has(nid)) {
      add('warning', `Node "${nid}" is not connected to any link or subcatchment`, nid, info.type);
    }
  }

  // Zero-length links
  for (const c of project.conduits) {
    if (c.length <= 0) add('error', `Conduit "${c.id}" has zero or negative length`, c.id, 'conduit', `${c.length}`);
  }

  // Duplicate IDs (across all node types, and across all link types)
  const nodeIds = [
    ...project.junctions.map(j => j.id), ...project.outfalls.map(o => o.id),
    ...project.storageUnits.map(s => s.id), ...project.dividers.map(d => d.id),
  ];
  for (const d of findDuplicates(nodeIds)) add('error', `Duplicate node ID "${d}" used by more than one node`, d, nodes.get(d)?.type);
  const linkIds = links.map(l => l.id);
  for (const d of findDuplicates(linkIds)) add('error', `Duplicate link ID "${d}" used by more than one link`, d, links.find(l => l.id === d)?.type);
  for (const d of findDuplicates(project.subcatchments.map(s => s.id))) add('error', `Duplicate subcatchment ID "${d}"`, d, 'subcatchment');

  // Missing curve references
  const curveNames = new Set(Object.keys(project.curves || {}));
  for (const p of project.pumps) {
    const pc = (p.pumpCurve || '').trim();
    if (pc && pc !== '*' && !curveNames.has(pc)) {
      add('error', `Pump "${p.id}" references missing curve "${pc}"`, p.id, 'pump');
    }
  }
  for (const s of project.storageUnits) {
    if ((s.shape || '').toUpperCase() === 'TABULAR') {
      const cn = (s.curveParams?.[0] || '').trim();
      if (cn && !curveNames.has(cn)) add('error', `Storage "${s.id}" references missing storage curve "${cn}"`, s.id, 'storage');
    }
  }
  for (const o of project.outlets) {
    const t = (o.type || '').toUpperCase();
    if (t.includes('TABULAR')) {
      const cn = (o.curveOrTable || '').trim();
      if (cn && !curveNames.has(cn)) add('error', `Outlet "${o.id}" references missing rating curve "${cn}"`, o.id, 'outlet');
    }
  }
  for (const d of project.dividers) {
    if ((d.type || '').toUpperCase() === 'TABULAR') {
      const cn = (d.curve || '').trim();
      if (cn && !curveNames.has(cn)) add('error', `Divider "${d.id}" references missing diversion curve "${cn}"`, d.id, 'divider');
    }
  }

  // Missing time series references
  const tsNames = new Set(Object.keys(project.timeseries || {}));
  for (const rg of project.raingages) {
    if ((rg.sourceType || '').toUpperCase() === 'TIMESERIES') {
      const tn = (rg.sourceName || '').trim();
      if (tn && !tsNames.has(tn)) add('error', `Rain gage "${rg.id}" references missing time series "${tn}"`, rg.id, 'raingage');
    }
  }
  for (const o of project.outfalls) {
    const t = (o.type || '').toUpperCase();
    if (t === 'TIMESERIES') {
      const tn = (o.stageData || '').trim();
      if (tn && !tsNames.has(tn)) add('error', `Outfall "${o.id}" references missing stage time series "${tn}"`, o.id, 'outfall');
    }
    if (t === 'TIDAL') {
      const cn = (o.stageData || '').trim();
      if (cn && !curveNames.has(cn)) add('error', `Outfall "${o.id}" references missing tidal curve "${cn}"`, o.id, 'outfall');
    }
  }

  // Subcatchment references
  const nodeSet = new Set(nodes.keys());
  const subIds = new Set(project.subcatchments.map(s => s.id));
  const rgIds = new Set(project.raingages.map(r => r.id));
  for (const s of project.subcatchments) {
    if (!s.outlet) add('error', `Subcatchment "${s.id}" has no outlet defined`, s.id, 'subcatchment');
    else if (!nodeSet.has(s.outlet) && !subIds.has(s.outlet)) add('error', `Subcatchment "${s.id}" outlet "${s.outlet}" not found`, s.id, 'subcatchment');
    if (!s.rainGage) add('error', `Subcatchment "${s.id}" has no rain gage assigned`, s.id, 'subcatchment');
    else if (!rgIds.has(s.rainGage)) add('error', `Subcatchment "${s.id}" references unknown rain gage "${s.rainGage}"`, s.id, 'subcatchment');
  }

  // Missing cross-sections
  for (const c of project.conduits) {
    if (!getXs(project, c.id)) add('error', `Conduit "${c.id}" has no cross-section defined`, c.id, 'conduit');
  }

  if (out.length === 0) add('info', 'All input integrity checks passed');
  return out;
}

// ---------------- Section 2: Hydraulic configuration ----------------

export function analyzeHydraulicConfig(project: SwmmProject): HealthFinding[] {
  const out: HealthFinding[] = [];
  let n = 0;
  const add = (severity: HealthSeverity, message: string, objectId?: string, objectType?: string, value?: string) =>
    out.push({ id: `hc${n++}`, severity, message, objectId, objectType, value });

  const metric = isMetric(project);
  const lu = metric ? 'm' : 'ft';
  const shortLen = metric ? 3 : 10;
  const longLen = metric ? 600 : 2000;
  const nodes = collectNodes(project);

  // Routing timestep (seconds) from [OPTIONS] — accepts "10", "10.0", or "H:MM:SS"
  const parseRoutingStep = (): number | null => {
    const raw = (project.options['ROUTING_STEP'] || '').trim();
    if (!raw) return null;
    if (raw.includes(':')) {
      const parts = raw.split(':').map(Number);
      if (parts.some(isNaN)) return null;
      while (parts.length < 3) parts.unshift(0);
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    const v = parseFloat(raw);
    return isFinite(v) && v > 0 ? v : null;
  };
  const routingStep = parseRoutingStep();
  const isDynwave = (project.options['FLOW_ROUTING'] || project.options['ROUTING'] || '').toUpperCase().includes('DYN');
  const refVel = metric ? 3 : 10; // typical wave speed used for the travel-time screen

  // Per-conduit checks
  const inflowsByNode = new Map<string, Conduit[]>();
  const outflowsByNode = new Map<string, Conduit[]>();
  for (const c of project.conduits) {
    if (!outflowsByNode.has(c.fromNode)) outflowsByNode.set(c.fromNode, []);
    outflowsByNode.get(c.fromNode)!.push(c);
    if (!inflowsByNode.has(c.toNode)) inflowsByNode.set(c.toNode, []);
    inflowsByNode.get(c.toNode)!.push(c);
  }

  const conduitDepth = (c: Conduit): number | null => {
    const xs = getXs(project, c.id);
    if (!xs) return null;
    const g1 = typeof xs.geom1 === 'number' ? xs.geom1 : parseFloat(xs.geom1);
    return isFinite(g1) && g1 > 0 ? g1 : null;
  };

  for (const c of project.conduits) {
    const fromN = nodes.get(c.fromNode);
    const toN = nodes.get(c.toNode);

    // Adverse (negative) slope
    if (fromN && toN && c.length > 0) {
      const usInvert = fromN.invert + (c.inOffset || 0);
      const dsInvert = toN.invert + (c.outOffset || 0);
      const slope = (usInvert - dsInvert) / c.length;
      if (slope < -1e-6) {
        add('warning', `Conduit "${c.id}" has an adverse (negative) slope of ${(slope * 100).toFixed(3)}%`, c.id, 'conduit', `${(slope * 100).toFixed(3)}%`);
      } else if (slope >= 0 && slope < 0.0005 && slope > -1e-6) {
        add('info', `Conduit "${c.id}" is nearly flat (slope ${(slope * 100).toFixed(4)}%)`, c.id, 'conduit');
      }
    }

    // Very short / very long links
    if (c.length > 0 && c.length < shortLen) {
      add('warning', `Conduit "${c.id}" is very short (${c.length.toFixed(1)} ${lu}) — may force a small routing time step`, c.id, 'conduit', `${c.length.toFixed(1)} ${lu}`);
    }
    if (c.length > longLen) {
      add('info', `Conduit "${c.id}" is very long (${c.length.toFixed(0)} ${lu}) — consider subdividing for accuracy`, c.id, 'conduit', `${c.length.toFixed(0)} ${lu}`);
    }

    // Possible hydraulic instability: routing step longer than the conduit travel time
    if (isDynwave && routingStep != null && c.length > 0) {
      const travelTime = c.length / refVel;
      if (routingStep > travelTime * 1.5 && c.length < (metric ? 60 : 200)) {
        add('warning',
          `Possible hydraulic instability: conduit "${c.id}" is ${c.length.toFixed(1)} ${lu} long (travel time ≈ ${travelTime.toFixed(1)} s at ${refVel} ${lu}/s) but the routing timestep is ${routingStep.toFixed(1)} s — the Courant condition will force sub-stepping or oscillation`,
          c.id, 'conduit', `Δt ${routingStep.toFixed(1)} s vs ~${travelTime.toFixed(1)} s`);
      }
    }
  }

  // Abrupt diameter changes + crown discontinuities at each node
  for (const [nid, ups] of Array.from(inflowsByNode.entries())) {
    const downs = outflowsByNode.get(nid);
    if (!downs || downs.length === 0) continue;
    const node = nodes.get(nid);
    for (const up of ups) {
      const dUp = conduitDepth(up);
      if (dUp == null) continue;
      for (const dn of downs) {
        const dDn = conduitDepth(dn);
        if (dDn == null) continue;
        // Abrupt reduction going downstream
        if (dDn < dUp * 0.7) {
          add('warning', `Pipe size drops sharply at node "${nid}": "${up.id}" (${dUp.toFixed(2)} ${lu}) into "${dn.id}" (${dDn.toFixed(2)} ${lu})`, dn.id, 'conduit');
        }
        // Crown discontinuity: downstream crown above upstream crown
        if (node) {
          const upCrown = node.invert + (up.outOffset || 0) + dUp;
          const dnCrown = node.invert + (dn.inOffset || 0) + dDn;
          if (dnCrown > upCrown + 0.01) {
            add('warning', `Crown discontinuity at node "${nid}": outgoing conduit "${dn.id}" crown is ${(dnCrown - upCrown).toFixed(2)} ${lu} above incoming "${up.id}"`, dn.id, 'conduit');
          }
        }
      }
    }
  }

  // Drop/rise between conduit invert and node invert (offset sanity)
  for (const c of project.conduits) {
    const fromN = nodes.get(c.fromNode);
    const toN = nodes.get(c.toNode);
    if (fromN && (c.inOffset || 0) < 0) add('warning', `Conduit "${c.id}" has a negative inlet offset`, c.id, 'conduit');
    if (toN && (c.outOffset || 0) < 0) add('warning', `Conduit "${c.id}" has a negative outlet offset`, c.id, 'conduit');
  }

  // Small node areas: MINSURFAREA option and small storage areas
  const minSurf = parseFloat(project.options['MIN_SURFAREA'] || project.options['MINSURFAREA'] || '');
  if (!isFinite(minSurf) || minSurf <= 0) {
    add('info', 'MIN_SURFAREA is not set — SWMM will use its default minimum node surface area, which can cause depth spikes at small nodes');
  }
  for (const s of project.storageUnits) {
    if ((s.shape || '').toUpperCase() === 'FUNCTIONAL') {
      const cCoef = parseFloat(s.curveParams?.[2] ?? s.curveParams?.[0] ?? '');
      const constArea = parseFloat(s.curveParams?.[2] ?? '');
      const area = isFinite(constArea) ? constArea : cCoef;
      if (isFinite(area) && area > 0 && area < (metric ? 1 : 10)) {
        add('warning', `Storage "${s.id}" has a very small base surface area (${area}) — prone to instability`, s.id, 'storage');
      }
    }
  }

  // Roughness sanity
  for (const c of project.conduits) {
    if (c.roughness > 0 && (c.roughness < 0.008 || c.roughness > 0.1)) {
      add('warning', `Conduit "${c.id}" has unusual Manning's n = ${c.roughness}`, c.id, 'conduit', `${c.roughness}`);
    }
  }

  if (out.length === 0) add('info', 'All hydraulic configuration checks passed');
  return out;
}

// ---------------- Section 3: Numerical performance (post-run) ----------------

export function analyzeNumericalPerformance(project: SwmmProject, results: SimulationResults | null): HealthFinding[] {
  const out: HealthFinding[] = [];
  let n = 0;
  const add = (severity: HealthSeverity, message: string, objectId?: string, objectType?: string, value?: string) =>
    out.push({ id: `np${n++}`, severity, message, objectId, objectType, value });

  if (!results || results.timeSteps.length === 0) return out;

  const steps = results.timeSteps;

  // Continuity errors
  const ce = results.summary?.continuityErrors;
  if (ce) {
    const checkCE = (label: string, v: number) => {
      const av = Math.abs(v);
      if (av > 10) add('error', `${label} continuity error is ${v.toFixed(2)}% — results are unreliable`, undefined, undefined, `${v.toFixed(2)}%`);
      else if (av > 2) add('warning', `${label} continuity error is ${v.toFixed(2)}% (above the 2% guideline)`, undefined, undefined, `${v.toFixed(2)}%`);
      else add('info', `${label} continuity error is ${v.toFixed(2)}% — acceptable`, undefined, undefined, `${v.toFixed(2)}%`);
    };
    checkCE('Flow routing', ce.flow ?? 0);
    checkCE('Runoff', ce.runoff ?? 0);
  }

  // Per-node stats from extended vars
  const nodeTypeOf = (id: string): string => {
    if (project.junctions.some(j => j.id === id)) return 'junction';
    if (project.outfalls.some(o => o.id === id)) return 'outfall';
    if (project.storageUnits.some(s => s.id === id)) return 'storage';
    return 'divider';
  };

  const nonConverged = new Map<string, number>();
  const maxIter = new Map<string, number>();
  const minTs = new Map<string, number>();
  let anyExtended = false;

  for (const ts of steps) {
    for (const [nid, nr] of Object.entries(ts.nodes || {})) {
      const ext = nr.extended;
      if (!ext) continue;
      anyExtended = true;
      if (ext.nodeConvergence !== undefined && ext.nodeConvergence < 0.5) {
        nonConverged.set(nid, (nonConverged.get(nid) || 0) + 1);
      }
      if (ext.nodeIterations !== undefined) {
        maxIter.set(nid, Math.max(maxIter.get(nid) || 0, ext.nodeIterations));
      }
      if (ext.nodeTimestep !== undefined && ext.nodeTimestep > 0) {
        minTs.set(nid, Math.min(minTs.get(nid) ?? Infinity, ext.nodeTimestep));
      }
    }
  }

  // Non-converging nodes
  const ncSorted = Array.from(nonConverged.entries()).sort((a, b) => b[1] - a[1]);
  for (const [nid, cnt] of ncSorted.slice(0, 10)) {
    const pct = (cnt / steps.length) * 100;
    add(pct > 10 ? 'error' : 'warning', `Node "${nid}" failed to converge in ${cnt} of ${steps.length} reporting steps (${pct.toFixed(1)}%)`, nid, nodeTypeOf(nid), `${cnt}`);
  }
  if (anyExtended && nonConverged.size === 0) add('info', 'All nodes converged at every reporting step');

  // Maximum trials / iterations
  const hiIter = Array.from(maxIter.entries()).filter(([, v]) => v >= 6).sort((a, b) => b[1] - a[1]);
  for (const [nid, v] of hiIter.slice(0, 10)) {
    add(v >= 8 ? 'warning' : 'info', `Node "${nid}" needed up to ${v.toFixed(0)} solver iterations — near the trial limit`, nid, nodeTypeOf(nid), `${v.toFixed(0)}`);
  }

  // Critical (smallest) timestep elements
  const tsSorted = Array.from(minTs.entries()).filter(([, v]) => isFinite(v)).sort((a, b) => a[1] - b[1]);
  if (tsSorted.length > 0) {
    const globalMin = tsSorted[0][1];
    add(globalMin < 1 ? 'warning' : 'info', `Smallest node time step was ${globalMin.toFixed(2)} s at node "${tsSorted[0][0]}"`, tsSorted[0][0], nodeTypeOf(tsSorted[0][0]), `${globalMin.toFixed(2)} s`);
    for (const [nid, v] of tsSorted.slice(1, 5)) {
      if (v <= globalMin * 2) {
        add('info', `Node "${nid}" also controls the time step (min ${v.toFixed(2)} s)`, nid, nodeTypeOf(nid), `${v.toFixed(2)} s`);
      }
    }
  }

  // Flow instability index per link (SWMM-style: flow turns relative to steps)
  const linkFlows = new Map<string, number[]>();
  for (const ts of steps) {
    for (const [lid, lr] of Object.entries(ts.links || {})) {
      if (!linkFlows.has(lid)) linkFlows.set(lid, []);
      linkFlows.get(lid)!.push(lr.flow);
    }
  }
  const linkTypeOf = (id: string): string => {
    if (project.conduits.some(c => c.id === id)) return 'conduit';
    if (project.pumps.some(p => p.id === id)) return 'pump';
    if (project.orifices.some(o => o.id === id)) return 'orifice';
    if (project.weirs.some(w => w.id === id)) return 'weir';
    return 'outlet';
  };
  const instability: { id: string; fii: number }[] = [];
  for (const [lid, flows] of Array.from(linkFlows.entries())) {
    if (flows.length < 4) continue;
    const maxAbs = Math.max(...flows.map(Math.abs));
    if (maxAbs < 1e-6) continue;
    let turns = 0;
    for (let i = 1; i < flows.length - 1; i++) {
      const d1 = flows[i] - flows[i - 1];
      const d2 = flows[i + 1] - flows[i];
      if (d1 * d2 < 0 && Math.abs(d1) > 0.05 * maxAbs && Math.abs(d2) > 0.05 * maxAbs) turns++;
    }
    const fii = turns / (flows.length - 2);
    if (fii > 0.3) instability.push({ id: lid, fii });
  }
  instability.sort((a, b) => b.fii - a.fii);
  for (const { id, fii } of instability.slice(0, 10)) {
    add(fii > 0.5 ? 'warning' : 'info', `Link "${id}" shows an oscillating flow pattern (instability index ${(fii * 100).toFixed(0)}%)`, id, linkTypeOf(id), `${(fii * 100).toFixed(0)}%`);
  }
  if (instability.length === 0 && linkFlows.size > 0) add('info', 'No significant flow oscillation detected in any link');

  if (!anyExtended) add('info', 'Extended solver diagnostics not available for this run — showing flow-based checks only');

  if (out.length === 0) add('info', 'All numerical performance checks passed');
  return out;
}

// ---------------- Section 4: Result consequences (post-run) ----------------

export function analyzeResultConsequences(project: SwmmProject, results: SimulationResults | null): HealthFinding[] {
  const out: HealthFinding[] = [];
  let n = 0;
  const add = (severity: HealthSeverity, message: string, objectId?: string, objectType?: string, value?: string) =>
    out.push({ id: `rc${n++}`, severity, message, objectId, objectType, value });

  if (!results || results.timeSteps.length === 0) return out;

  const steps = results.timeSteps;
  const metric = isMetric(project);
  const vu = metric ? 'm/s' : 'ft/s';
  const fu = (project.options['FLOW_UNITS'] || 'CFS').toUpperCase();
  const vHigh = metric ? 3.0 : 10;
  const vSevere = metric ? 4.5 : 15;
  const stepHours = steps.length > 1 ? Math.max((steps[1].time - steps[0].time), 0) / 3600 : 0;

  const nodes = collectNodes(project);

  // Flooding
  const floodMax = new Map<string, number>();
  const floodSteps = new Map<string, number>();
  const surchargeSteps = new Map<string, number>();
  const maxDepthByNode = new Map<string, number>();

  for (const ts of steps) {
    for (const [nid, nr] of Object.entries(ts.nodes || {})) {
      if (nr.flooding > 0) {
        floodMax.set(nid, Math.max(floodMax.get(nid) || 0, nr.flooding));
        floodSteps.set(nid, (floodSteps.get(nid) || 0) + 1);
      }
      maxDepthByNode.set(nid, Math.max(maxDepthByNode.get(nid) || 0, nr.depth));
      const info = nodes.get(nid);
      if (info && info.type === 'junction' && info.maxDepth > 0 && nr.depth >= info.maxDepth * 0.999) {
        surchargeSteps.set(nid, (surchargeSteps.get(nid) || 0) + 1);
      }
    }
  }

  const floodSorted = Array.from(floodMax.entries()).sort((a, b) => b[1] - a[1]);
  if (floodSorted.length > 0) {
    add('error', `${floodSorted.length} node(s) flooded during the simulation`, undefined, undefined, `${floodSorted.length}`);
    for (const [nid, peak] of floodSorted.slice(0, 10)) {
      const hrs = (floodSteps.get(nid) || 0) * stepHours;
      add('error', `Node "${nid}" floods at up to ${peak.toFixed(2)} ${fu}${hrs > 0 ? ` for ~${hrs.toFixed(1)} h` : ''}`, nid, nodes.get(nid)?.type || 'junction', `${peak.toFixed(2)} ${fu}`);
    }
  } else {
    add('info', 'No node flooding detected');
  }

  // Surcharged nodes (full depth, not necessarily flooding)
  const surchargeOnly = Array.from(surchargeSteps.entries()).filter(([nid]) => !floodMax.has(nid)).sort((a, b) => b[1] - a[1]);
  for (const [nid, cnt] of surchargeOnly.slice(0, 10)) {
    add('warning', `Node "${nid}" is surcharged (at full depth) for ${(cnt * stepHours).toFixed(1)} h`, nid, nodes.get(nid)?.type || 'junction');
  }

  // Link stats: d/D, velocity, reverse flow, capacity exceedance
  const linkStats = new Map<string, { maxCap: number; maxVel: number; minFlow: number; maxFlow: number; revSteps: number; total: number }>();
  for (const ts of steps) {
    for (const [lid, lr] of Object.entries(ts.links || {})) {
      let s = linkStats.get(lid);
      if (!s) { s = { maxCap: 0, maxVel: 0, minFlow: Infinity, maxFlow: -Infinity, revSteps: 0, total: 0 }; linkStats.set(lid, s); }
      s.maxCap = Math.max(s.maxCap, lr.capacity ?? 0);
      s.maxVel = Math.max(s.maxVel, Math.abs(lr.velocity ?? 0));
      s.minFlow = Math.min(s.minFlow, lr.flow);
      s.maxFlow = Math.max(s.maxFlow, lr.flow);
      if (lr.flow < -1e-6) s.revSteps++;
      s.total++;
    }
  }

  const conduitIds = new Set(project.conduits.map(c => c.id));
  const fullLinks = Array.from(linkStats.entries()).filter(([lid, s]) => conduitIds.has(lid) && s.maxCap >= 0.999).sort((a, b) => b[1].maxCap - a[1].maxCap);
  if (fullLinks.length > 0) {
    add('warning', `${fullLinks.length} conduit(s) reached full capacity (d/D = 1.0)`, undefined, undefined, `${fullLinks.length}`);
    for (const [lid] of fullLinks.slice(0, 10)) {
      add('warning', `Conduit "${lid}" flows full — capacity exceeded`, lid, 'conduit', 'd/D = 1.00');
    }
  }
  const nearFull = Array.from(linkStats.entries()).filter(([lid, s]) => conduitIds.has(lid) && s.maxCap >= 0.85 && s.maxCap < 0.999).sort((a, b) => b[1].maxCap - a[1].maxCap);
  for (const [lid, s] of nearFull.slice(0, 5)) {
    add('info', `Conduit "${lid}" reaches d/D = ${s.maxCap.toFixed(2)} — limited remaining capacity`, lid, 'conduit', `d/D = ${s.maxCap.toFixed(2)}`);
  }

  // Max velocity
  const fastLinks = Array.from(linkStats.entries()).filter(([lid, s]) => conduitIds.has(lid) && s.maxVel > vHigh).sort((a, b) => b[1].maxVel - a[1].maxVel);
  for (const [lid, s] of fastLinks.slice(0, 10)) {
    add(s.maxVel > vSevere ? 'error' : 'warning', `Conduit "${lid}" peaks at ${s.maxVel.toFixed(1)} ${vu} — erosion/scour risk`, lid, 'conduit', `${s.maxVel.toFixed(1)} ${vu}`);
  }
  if (fastLinks.length === 0) add('info', `No conduit exceeds ${vHigh} ${vu} peak velocity`);

  // Reverse flow
  const revLinks = Array.from(linkStats.entries()).filter(([lid, s]) => conduitIds.has(lid) && s.revSteps > 0).sort((a, b) => b[1].revSteps - a[1].revSteps);
  for (const [lid, s] of revLinks.slice(0, 10)) {
    const pct = (s.revSteps / s.total) * 100;
    add(pct > 25 ? 'warning' : 'info', `Conduit "${lid}" flows in reverse for ${pct.toFixed(0)}% of the simulation`, lid, 'conduit', `${pct.toFixed(0)}%`);
  }

  // Outfall loading
  const outfallPeaks: { id: string; peak: number; volume: number }[] = [];
  for (const o of project.outfalls) {
    let peak = 0;
    let vol = 0;
    for (const ts of steps) {
      const nr = ts.nodes?.[o.id];
      if (nr) {
        peak = Math.max(peak, nr.totalInflow ?? 0);
        vol += (nr.totalInflow ?? 0) * stepHours * 3600;
      }
    }
    if (peak > 0) outfallPeaks.push({ id: o.id, peak, volume: vol });
  }
  outfallPeaks.sort((a, b) => b.peak - a.peak);
  for (const { id, peak } of outfallPeaks.slice(0, 5)) {
    add('info', `Outfall "${id}" peak discharge: ${peak.toFixed(2)} ${fu}`, id, 'outfall', `${peak.toFixed(2)} ${fu}`);
  }
  if (outfallPeaks.length === 0 && project.outfalls.length > 0) {
    add('warning', 'No flow reached any outfall — check connectivity and inflows');
  }

  if (out.length === 0) add('info', 'All result consequence checks passed');
  return out;
}

// ---------------- Report assembly ----------------

export function buildModelHealthReport(project: SwmmProject, results: SimulationResults | null): ModelHealthReport {
  const hasResults = !!(results && results.timeSteps.length > 0);
  const sections: HealthSection[] = [
    { key: 'input', title: 'Input Integrity', findings: analyzeInputIntegrity(project), requiresResults: false },
    { key: 'hydraulic', title: 'Hydraulic Configuration', findings: analyzeHydraulicConfig(project), requiresResults: false },
    { key: 'numerical', title: 'Numerical Performance', findings: analyzeNumericalPerformance(project, results), requiresResults: true },
    { key: 'consequences', title: 'Result Consequences', findings: analyzeResultConsequences(project, results), requiresResults: true },
  ];
  let errorCount = 0;
  let warningCount = 0;
  for (const s of sections) {
    for (const f of s.findings) {
      if (f.severity === 'error') errorCount++;
      else if (f.severity === 'warning') warningCount++;
    }
  }
  return { sections, hasResults, errorCount, warningCount };
}
