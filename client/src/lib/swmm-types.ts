export interface RainGage {
  id: string;
  format: string;
  interval: string;
  scf: number;
  sourceType: string;
  sourceName: string;
  stationId?: string;
  units?: string;
}

export interface Subcatchment {
  id: string;
  rainGage: string;
  outlet: string;
  area: number;
  pctImperv: number;
  width: number;
  slope: number;
  curbLen: number;
  snowPack?: string;
}

export interface SubareaData {
  nImperv: number;
  nPerv: number;
  sImperv: number;
  sPerv: number;
  pctZero: number;
  routeTo: string;
  pctRouted?: number;
}

export interface InfiltrationData {
  method?: string;
  values: number[];
}

export interface Junction {
  id: string;
  elevation: number;
  maxDepth: number;
  initDepth: number;
  surDepth: number;
  aponded: number;
}

export interface Outfall {
  id: string;
  elevation: number;
  type: string;
  stageData?: string;
  gated: string;
  routeTo?: string;
}

export interface Divider {
  id: string;
  elevation: number;
  divertedLink: string;
  type: string;
  cutoffFlow?: number;
  curve?: string;
  maxDepth: number;
  initDepth: number;
  surDepth: number;
  aponded: number;
}

export interface StorageUnit {
  id: string;
  elevation: number;
  maxDepth: number;
  initDepth: number;
  shape: string;
  curveParams: string[];
  surDepth: number;
  fevap: number;
  psi?: number;
  ksat?: number;
  imd?: number;
}

export interface Conduit {
  id: string;
  fromNode: string;
  toNode: string;
  length: number;
  roughness: number;
  inOffset: number;
  outOffset: number;
  initFlow: number;
  maxFlow: number;
}

export interface Pump {
  id: string;
  fromNode: string;
  toNode: string;
  pumpCurve: string;
  status: string;
  startupDepth?: number;
  shutoffDepth?: number;
}

export interface Orifice {
  id: string;
  fromNode: string;
  toNode: string;
  type: string;
  offset: number;
  cd: number;
  gated: string;
  closeTime: number;
}

export interface Weir {
  id: string;
  fromNode: string;
  toNode: string;
  type: string;
  crestHeight: number;
  cd: number;
  gated: string;
  ec: number;
  cd2: number;
  surcharge: string;
  width?: number;
}

export interface Outlet {
  id: string;
  fromNode: string;
  toNode: string;
  offset: number;
  type: string;
  curveOrTable: string;
}

export interface XSection {
  linkId: string;
  shape: string;
  geom1: number;
  geom2: number;
  geom3: number;
  geom4: number;
  barrels: number;
  culvert?: string;
}

export interface CurvePoint {
  type?: string;
  x: number;
  y: number;
}

export interface TimeSeriesPoint {
  dateTime: string;
  value: number;
}

export interface PatternData {
  type: string;
  multipliers: number[];
}

export interface MapLabel {
  x: number;
  y: number;
  text: string;
  anchorNode?: string;
  font?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
}

export interface MapExtent {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Pollutant {
  id: string;
  units: string;
  cRain: number;
  cGW: number;
  cRDII: number;
  kDecay: number;
  snowOnly: string;
  coPollutant: string;
  coFraction: number;
  cDWF: number;
  cInit: number;
}

export interface LandUse {
  id: string;
  sweepInterval: number;
  sweepAvail: number;
  sweepLast: number;
}

export interface DWFEntry {
  nodeId: string;
  constituent: string;
  baseline: number;
  patterns: string[];
}

export interface LossData {
  linkId: string;
  entryLoss: number;
  exitLoss: number;
  avgLoss: number;
  flapGate: string;
  seepageRate: number;
}

export interface LidControl {
  id: string;
  type: string;
  layers: string[][];
}

export interface LidUsage {
  subcatchId: string;
  lidId: string;
  number: number;
  area: number;
  width: number;
  initSat: number;
  fromImperv: number;
  toPerv: number;
  rptFile: string;
  drainTo: string;
  fromPerv: number;
}

export interface Groundwater {
  subcatchId: string;
  aquiferId: string;
  nodeId: string;
  surfElev: number;
  a1: number;
  b1: number;
  a2: number;
  b2: number;
  a3: number;
  fixedDepth: number;
  threshold: number;
  params: number[];
}

export interface Aquifer {
  id: string;
  porosity: number;
  wiltPoint: number;
  fieldCap: number;
  conductivity: number;
  conductSlope: number;
  tensionSlope: number;
  upperEvap: number;
  lowerEvap: number;
  lowerGWLoss: number;
  bottomElev: number;
  waterTableElev: number;
  unsatMoisture: number;
  params: number[];
}

export interface Transect {
  id: string;
  stations: { x: number; y: number }[];
  roughness: { left: number; right: number; channel: number };
  bankStations: { left: number; right: number };
  modifiers: number[];
}

export interface SnowPack {
  id: string;
  parameters: Record<string, number[]>;
}

export interface Street {
  id: string;
  params: string[];
}

export interface Inlet {
  id: string;
  type: string;
  params: string[];
}

export interface InletUsage {
  linkId: string;
  inletId: string;
  nodeId: string;
  number: number;
  pctClogged: number;
  maxFlow: number;
  params: string[];
}

export interface SwmmProject {
  title: string[];
  options: Record<string, string>;
  reportOptions: Record<string, string>;
  raingages: RainGage[];
  subcatchments: Subcatchment[];
  subareas: Record<string, SubareaData>;
  infiltration: Record<string, InfiltrationData>;
  junctions: Junction[];
  outfalls: Outfall[];
  dividers: Divider[];
  storageUnits: StorageUnit[];
  conduits: Conduit[];
  pumps: Pump[];
  orifices: Orifice[];
  weirs: Weir[];
  outlets: Outlet[];
  xsections: Record<string, XSection>;
  losses: Record<string, LossData>;
  curves: Record<string, CurvePoint[]>;
  timeseries: Record<string, TimeSeriesPoint[]>;
  patterns: Record<string, PatternData>;
  controls: string[];
  dwf: DWFEntry[];
  pollutants: Pollutant[];
  landuses: LandUse[];
  lidControls: LidControl[];
  lidUsage: LidUsage[];
  groundwater: Groundwater[];
  aquifers: Aquifer[];
  transects: Transect[];
  snowpacks: SnowPack[];
  streets: Street[];
  inlets: Inlet[];
  inletUsage: InletUsage[];
  coordinates: Record<string, [number, number]>;
  vertices: Record<string, [number, number][]>;
  polygons: Record<string, [number, number][]>;
  symbols: Record<string, [number, number]>;
  labels: MapLabel[];
  mapExtent: MapExtent | null;
  rawSections: Record<string, string[]>;
  results: SimulationResults | null;
}

export interface NodeResult {
  depth: number;
  head: number;
  volume: number;
  lateralInflow: number;
  totalInflow: number;
  flooding: number;
}

export interface LinkResult {
  flow: number;
  depth: number;
  velocity: number;
  volume: number;
  capacity: number;
}

export interface SubcatchResult {
  rainfall: number;
  snowDepth: number;
  evap: number;
  infiltration: number;
  runoff: number;
  gwOutflow: number;
  gwElev: number;
  moisture: number;
}

export interface TimeStepResults {
  time: number;
  dateTime: string;
  nodes: Record<string, NodeResult>;
  links: Record<string, LinkResult>;
  subcatchments: Record<string, SubcatchResult>;
}

export interface SimulationResults {
  timeSteps: TimeStepResults[];
  summary: {
    totalDuration: number;
    reportingSteps: number;
    routingModel: string;
    continuityErrors: {
      runoff: number;
      flow: number;
      quality: number;
    };
  };
  reportContent?: string;
}

export type SelectedObject = {
  id: string;
  objType: 'junction' | 'outfall' | 'divider' | 'storage' | 'conduit' | 'pump' | 'orifice' | 'weir' | 'outlet' | 'subcatchment' | 'raingage' | 'label';
} | null;

export function createEmptyProject(): SwmmProject {
  return {
    title: [],
    options: {},
    reportOptions: {},
    raingages: [],
    subcatchments: [],
    subareas: {},
    infiltration: {},
    junctions: [],
    outfalls: [],
    dividers: [],
    storageUnits: [],
    conduits: [],
    pumps: [],
    orifices: [],
    weirs: [],
    outlets: [],
    xsections: {},
    losses: {},
    curves: {},
    timeseries: {},
    patterns: {},
    controls: [],
    dwf: [],
    pollutants: [],
    landuses: [],
    lidControls: [],
    lidUsage: [],
    groundwater: [],
    aquifers: [],
    transects: [],
    snowpacks: [],
    streets: [],
    inlets: [],
    inletUsage: [],
    coordinates: {},
    vertices: {},
    polygons: {},
    symbols: {},
    labels: [],
    mapExtent: null,
    rawSections: {},
    results: null,
  };
}
