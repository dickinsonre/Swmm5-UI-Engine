import type { SwmmProject, Junction, Conduit, XSection, LossData } from './swmm-types';

export interface CflConduitResult {
  conduitId: string;
  length: number;
  diameter: number;
  shape: string;
  celerity: number;
  stableDt: number;
  conservativeDt: number;
  routingStep: number;
  courantNumber: number;
  violatesCfl: boolean;
  segmentsNeeded: number;
}

export interface CflAnalysisResult {
  conduits: CflConduitResult[];
  flaggedCount: number;
  totalCount: number;
  routingStep: number;
  gravity: number;
  units: string;
  worstCourant: number;
  worstConduitId: string;
}

export interface DiscretizationSettings {
  method: 'fixed_interval' | 'dx_d_ratio';
  fixedMinLength: number;
  fixedMaxLength: number;
  dxDRatio: number;
  lengtheningEnabled: boolean;
  lengtheningStep: number;
  mnsa: number;
}

export interface DiscretizationResult {
  project: SwmmProject;
  stats: {
    originalConduitCount: number;
    newConduitCount: number;
    splitCount: number;
    newJunctionCount: number;
    lengtheningCount: number;
    lengtheningTotalAdded: number;
    method: string;
  };
  newJunctionIds: Set<string>;
  splitConduitIds: Set<string>;
}

const DEFAULT_SETTINGS: DiscretizationSettings = {
  method: 'fixed_interval',
  fixedMinLength: 50,
  fixedMaxLength: 500,
  dxDRatio: 25,
  lengtheningEnabled: true,
  lengtheningStep: 1,
  mnsa: 6,
};

function getGravity(flowUnits: string): number {
  const usUnits = ['CFS', 'GPM', 'MGD'];
  return usUnits.includes(flowUnits.toUpperCase()) ? 32.174 : 9.81;
}

function parseRoutingStep(options: Record<string, string>): number {
  const val = options['ROUTING_STEP'] || options['WET_STEP'] || '30';
  const parts = val.split(':');
  if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
  }
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(val) || 30;
}

export function computeCflAnalysis(project: SwmmProject): CflAnalysisResult {
  const flowUnits = (project.options['FLOW_UNITS'] || 'CFS').toUpperCase();
  const g = getGravity(flowUnits);
  const routingStep = parseRoutingStep(project.options);

  const results: CflConduitResult[] = [];
  let worstCourant = 0;
  let worstConduitId = '';

  for (const conduit of project.conduits) {
    const xs = project.xsections[conduit.id];
    const diameter = xs ? (typeof xs.geom1 === 'number' ? xs.geom1 : 1) : 1;
    const shape = xs ? xs.shape : 'CIRCULAR';

    if (shape.toUpperCase() === 'DUMMY' || shape.toUpperCase() === 'IRREGULAR') {
      results.push({
        conduitId: conduit.id,
        length: conduit.length,
        diameter,
        shape,
        celerity: 0,
        stableDt: Infinity,
        conservativeDt: Infinity,
        routingStep,
        courantNumber: 0,
        violatesCfl: false,
        segmentsNeeded: 1,
      });
      continue;
    }

    const celerity = Math.sqrt(g * diameter);
    const stableDt = conduit.length / celerity;
    const conservativeDt = stableDt * 0.10;
    const courantNumber = (celerity * routingStep) / conduit.length;
    const violatesCfl = courantNumber > 1.0;
    const segmentsNeeded = violatesCfl ? Math.ceil(courantNumber) : 1;

    if (courantNumber > worstCourant) {
      worstCourant = courantNumber;
      worstConduitId = conduit.id;
    }

    results.push({
      conduitId: conduit.id,
      length: conduit.length,
      diameter,
      shape,
      celerity,
      stableDt,
      conservativeDt,
      routingStep,
      courantNumber,
      violatesCfl,
      segmentsNeeded,
    });
  }

  return {
    conduits: results,
    flaggedCount: results.filter(r => r.violatesCfl).length,
    totalCount: results.length,
    routingStep,
    gravity: g,
    units: flowUnits,
    worstCourant,
    worstConduitId,
  };
}

export function discretizeProject(
  project: SwmmProject,
  settings: DiscretizationSettings = DEFAULT_SETTINGS,
  flaggedIds?: Set<string>
): DiscretizationResult {
  const flowUnits = (project.options['FLOW_UNITS'] || 'CFS').toUpperCase();
  const g = getGravity(flowUnits);

  const nodeElevations = new Map<string, { elevation: number; maxDepth: number }>();
  for (const j of project.junctions) {
    nodeElevations.set(j.id, { elevation: j.elevation, maxDepth: j.maxDepth });
  }
  for (const o of project.outfalls) {
    nodeElevations.set(o.id, { elevation: o.elevation, maxDepth: 0 });
  }
  for (const s of project.storageUnits) {
    nodeElevations.set(s.id, { elevation: s.elevation, maxDepth: s.maxDepth });
  }
  for (const d of project.dividers) {
    nodeElevations.set(d.id, { elevation: d.elevation, maxDepth: d.maxDepth });
  }

  let lengtheningCount = 0;
  let lengtheningTotalAdded = 0;

  const workingConduits = project.conduits.map(c => ({ ...c }));

  if (settings.lengtheningEnabled && settings.lengtheningStep > 0) {
    for (const c of workingConduits) {
      const xs = project.xsections[c.id];
      const diameter = xs ? (typeof xs.geom1 === 'number' ? xs.geom1 : 1) : 1;
      const celerity = Math.sqrt(g * diameter);
      const minLength = +(celerity * settings.lengtheningStep).toFixed(2);
      if (c.length < minLength) {
        const added = minLength - c.length;
        lengtheningTotalAdded += added;
        c.length = minLength;
        lengtheningCount++;
      }
    }
  }

  const newConduits: Conduit[] = [];
  const newJunctions: Junction[] = [];
  const newXsections: Record<string, XSection> = {};
  const newCoordinates: Record<string, [number, number]> = { ...project.coordinates };
  const newLosses: Record<string, LossData> = {};
  const newVertices: Record<string, [number, number][]> = { ...project.vertices };

  const newJunctionIds = new Set<string>();
  const splitConduitOriginalIds = new Set<string>();

  let splitCount = 0;
  let newJunctionCount = 0;

  const skipShapes = new Set(['DUMMY', 'IRREGULAR']);

  for (const conduit of workingConduits) {
    const xs = project.xsections[conduit.id];
    const diameter = xs ? (typeof xs.geom1 === 'number' ? xs.geom1 : 1) : 1;
    const shape = xs ? xs.shape.toUpperCase() : 'CIRCULAR';

    const shouldSplit = !flaggedIds || flaggedIds.has(conduit.id);

    let targetLength: number;
    if (settings.method === 'fixed_interval') {
      targetLength = Math.min(settings.fixedMaxLength, Math.max(settings.fixedMinLength, conduit.length));
    } else {
      targetLength = Math.max(1, diameter * settings.dxDRatio);
    }

    const nSegments = shouldSplit ? Math.max(1, Math.ceil(conduit.length / targetLength)) : 1;

    if (nSegments <= 1 || (xs && skipShapes.has(shape))) {
      newConduits.push(conduit);
      if (xs) {
        newXsections[conduit.id] = { ...xs };
      }
      const loss = project.losses[conduit.id];
      if (loss) {
        newLosses[conduit.id] = { ...loss };
      }
      continue;
    }

    const segLength = +(conduit.length / nSegments).toFixed(2);
    const fromElev = nodeElevations.get(conduit.fromNode);
    const toElev = nodeElevations.get(conduit.toNode);
    const fromCoord = project.coordinates[conduit.fromNode];
    const toCoord = project.coordinates[conduit.toNode];
    const loss = project.losses[conduit.id];

    if (!fromElev || !toElev) {
      newConduits.push(conduit);
      if (xs) newXsections[conduit.id] = { ...xs };
      if (loss) newLosses[conduit.id] = { ...loss };
      continue;
    }

    splitCount++;
    splitConduitOriginalIds.add(conduit.id);

    const startElev = fromElev.elevation;
    const endElev = toElev.elevation;

    let prevNodeId = conduit.fromNode;

    delete newVertices[conduit.id];

    for (let seg = 0; seg < nSegments; seg++) {
      const isLast = seg === nSegments - 1;
      let toNodeId: string;

      if (isLast) {
        toNodeId = conduit.toNode;
      } else {
        const frac = (seg + 1) / nSegments;
        toNodeId = `${conduit.id}_N${seg + 1}`;

        const interpElev = +(startElev + (endElev - startElev) * frac).toFixed(3);
        const interpMaxDepth = +(fromElev.maxDepth || settings.mnsa).toFixed(2);

        const newJunction: Junction = {
          id: toNodeId,
          elevation: interpElev,
          maxDepth: interpMaxDepth,
          initDepth: 0,
          surDepth: 0,
          aponded: Math.round(settings.mnsa),
        };
        newJunctions.push(newJunction);
        newJunctionIds.add(toNodeId);
        nodeElevations.set(toNodeId, { elevation: interpElev, maxDepth: interpMaxDepth });

        if (fromCoord && toCoord) {
          const ix = +(fromCoord[0] + (toCoord[0] - fromCoord[0]) * frac).toFixed(2);
          const iy = +(fromCoord[1] + (toCoord[1] - fromCoord[1]) * frac).toFixed(2);
          newCoordinates[toNodeId] = [ix, iy];
        }

        newJunctionCount++;
      }

      const segId = `${conduit.id}_${seg + 1}`;
      newConduits.push({
        id: segId,
        fromNode: prevNodeId,
        toNode: toNodeId,
        length: segLength,
        roughness: conduit.roughness,
        inOffset: seg === 0 ? conduit.inOffset : 0,
        outOffset: isLast ? conduit.outOffset : 0,
        initFlow: conduit.initFlow,
        maxFlow: conduit.maxFlow,
      });

      if (xs) {
        newXsections[segId] = {
          linkId: segId,
          shape: xs.shape,
          geom1: xs.geom1,
          geom2: xs.geom2,
          geom3: xs.geom3,
          geom4: xs.geom4,
          barrels: xs.barrels,
        };
      }

      if (loss) {
        newLosses[segId] = {
          linkId: segId,
          entryLoss: seg === 0 ? loss.entryLoss : 0,
          exitLoss: isLast ? loss.exitLoss : 0,
          avgLoss: +(loss.avgLoss / nSegments).toFixed(4),
          flapGate: loss.flapGate,
          seepageRate: loss.seepageRate,
        };
      }

      prevNodeId = toNodeId;
    }
  }

  const discretizedProject: SwmmProject = {
    ...project,
    junctions: [...project.junctions, ...newJunctions],
    conduits: newConduits,
    xsections: newXsections,
    losses: newLosses,
    coordinates: newCoordinates,
    vertices: newVertices,
  };

  return {
    project: discretizedProject,
    stats: {
      originalConduitCount: project.conduits.length,
      newConduitCount: newConduits.length,
      splitCount,
      newJunctionCount,
      lengtheningCount,
      lengtheningTotalAdded: +lengtheningTotalAdded.toFixed(2),
      method: settings.method,
    },
    newJunctionIds,
    splitConduitIds: splitConduitOriginalIds,
  };
}

export function getDefaultSettings(): DiscretizationSettings {
  return { ...DEFAULT_SETTINGS };
}
