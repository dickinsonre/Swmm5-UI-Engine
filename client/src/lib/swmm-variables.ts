export type VarCategory =
  | 'NODE_STD' | 'NODE_SOLVER' | 'NODE_RDII'
  | 'LINK_STD' | 'LINK_MOMENTUM' | 'LINK_GEOMETRY' | 'LINK_ENERGY' | 'LINK_COMPAT' | 'LINK_PROPS'
  | 'SUB_STD' | 'SUB_RUNOFF' | 'SUB_LID' | 'SUB_GW' | 'SUB_SNOW' | 'SUB_INFIL' | 'SUB_POLLUT'
  | 'SYS' | 'SYS_QA' | 'FLOW_CLASS';

export type VarScope = 'node' | 'link' | 'subcatch' | 'system';

export interface SwmmVariable {
  key: string;
  name: string;
  units: string;
  cat: VarCategory;
  scope: VarScope;
  maxVal: number;
  isInput?: boolean;
  labels?: string[];
  desc?: string;
}

export interface VarCategoryInfo {
  id: VarCategory;
  label: string;
  scope: VarScope;
  icon: string;
  color: string;
}

export const CATEGORY_INFO: VarCategoryInfo[] = [
  { id: 'NODE_STD', label: 'Standard (EPA)', scope: 'node', icon: '\u25CF', color: '#58a6ff' },
  { id: 'NODE_SOLVER', label: 'Solver Internals', scope: 'node', icon: '\u26A1', color: '#f0883e' },
  { id: 'NODE_RDII', label: 'RDII / DWF', scope: 'node', icon: '\uD83D\uDCA7', color: '#39d3d8' },
  { id: 'LINK_STD', label: 'Standard (EPA)', scope: 'link', icon: '\u2501', color: '#3fb950' },
  { id: 'LINK_MOMENTUM', label: 'Momentum Eq Terms', scope: 'link', icon: '\u2202Q', color: '#f85149' },
  { id: 'LINK_GEOMETRY', label: 'Geometry (US/DS)', scope: 'link', icon: '\u2B21', color: '#d29922' },
  { id: 'LINK_ENERGY', label: 'Energy / Bernoulli', scope: 'link', icon: '\u2696', color: '#bc8cff' },
  { id: 'LINK_COMPAT', label: 'SWMM 3/4/5 Compat', scope: 'link', icon: '\uD83D\uDD04', color: '#8b949e' },
  { id: 'LINK_PROPS', label: 'Properties / RTC', scope: 'link', icon: '\u2699', color: '#6e7681' },
  { id: 'SUB_STD', label: 'Standard (EPA)', scope: 'subcatch', icon: '\uD83C\uDF27', color: '#58a6ff' },
  { id: 'SUB_RUNOFF', label: 'Runoff Detail', scope: 'subcatch', icon: '\uD83C\uDFD8', color: '#3fb950' },
  { id: 'SUB_LID', label: 'LID Internals', scope: 'subcatch', icon: '\uD83C\uDF3F', color: '#39d3d8' },
  { id: 'SUB_GW', label: 'Groundwater', scope: 'subcatch', icon: '\uD83C\uDF0A', color: '#d29922' },
  { id: 'SUB_SNOW', label: 'Snow Internals', scope: 'subcatch', icon: '\u2744', color: '#f0883e' },
  { id: 'SUB_INFIL', label: 'Infiltration', scope: 'subcatch', icon: '\u2B07', color: '#bc8cff' },
  { id: 'SUB_POLLUT', label: 'Pollutant WQ', scope: 'subcatch', icon: '\u2623', color: '#f85149' },
  { id: 'SYS', label: 'System Flow', scope: 'system', icon: '\uD83D\uDD04', color: '#58a6ff' },
  { id: 'SYS_QA', label: 'QA Diagnostics', scope: 'system', icon: '\uD83D\uDD0D', color: '#f85149' },
  { id: 'FLOW_CLASS', label: 'Flow Classification', scope: 'link', icon: '\uD83C\uDFF7', color: '#d29922' },
];

export const NODE_INPUT_VARS: SwmmVariable[] = [
  { key: 'none', name: 'None', units: '', cat: 'NODE_STD', scope: 'node', maxVal: 0, isInput: true },
  { key: 'elevation', name: 'Invert El.', units: 'ft/m', cat: 'NODE_STD', scope: 'node', maxVal: 0, isInput: true, labels: ['Low', '', '', '', 'High'] },
  { key: 'maxDepth', name: 'Max Depth', units: 'ft', cat: 'NODE_STD', scope: 'node', maxVal: 20, isInput: true, labels: ['< 2', '2-5', '5-10', '10-15', '> 15'] },
];

export const LINK_INPUT_VARS: SwmmVariable[] = [
  { key: 'none', name: 'None', units: '', cat: 'LINK_STD', scope: 'link', maxVal: 0, isInput: true },
  { key: 'maxDepth', name: 'Max Depth', units: 'ft', cat: 'LINK_STD', scope: 'link', maxVal: 10, isInput: true, labels: ['< 1', '1-2.5', '2.5-5', '5-7.5', '> 7.5'] },
  { key: 'roughness', name: "Manning's N", units: '', cat: 'LINK_STD', scope: 'link', maxVal: 0.05, isInput: true, labels: ['< 0.010', '0.010-0.015', '0.015-0.025', '0.025-0.035', '> 0.035'] },
  { key: 'length', name: 'Length', units: 'ft', cat: 'LINK_STD', scope: 'link', maxVal: 0, isInput: true, labels: ['Short', '', '', '', 'Long'] },
  { key: 'slope', name: 'Slope', units: 'ft/ft', cat: 'LINK_STD', scope: 'link', maxVal: 0.05, isInput: true, labels: ['< 0.005', '0.005-0.01', '0.01-0.02', '0.02-0.04', '> 0.04'] },
];

export const SUB_INPUT_VARS: SwmmVariable[] = [
  { key: 'none', name: 'None', units: '', cat: 'SUB_STD', scope: 'subcatch', maxVal: 0, isInput: true },
  { key: 'imperv', name: '% Imperv', units: '%', cat: 'SUB_STD', scope: 'subcatch', maxVal: 100, isInput: true, labels: ['< 20%', '20-40%', '40-60%', '60-80%', '> 80%'] },
  { key: 'area', name: 'Area', units: 'ac/ha', cat: 'SUB_STD', scope: 'subcatch', maxVal: 0, isInput: true, labels: ['Small', '', '', '', 'Large'] },
  { key: 'width', name: 'Width', units: 'ft', cat: 'SUB_STD', scope: 'subcatch', maxVal: 0, isInput: true, labels: ['Narrow', '', '', '', 'Wide'] },
  { key: 'slope', name: 'Slope', units: '%', cat: 'SUB_STD', scope: 'subcatch', maxVal: 0, isInput: true, labels: ['Flat', '', '', '', 'Steep'] },
];

export const NODE_VARS: SwmmVariable[] = [
  { key: 'depth', name: 'Depth', units: 'ft/m', cat: 'NODE_STD', scope: 'node', maxVal: 8, labels: ['< 1.5', '1.5-3.0', '3.0-4.0', '4.0-5.0', '> 5.0'] },
  { key: 'head', name: 'Head (HGL)', units: 'ft/m', cat: 'NODE_STD', scope: 'node', maxVal: 110, labels: ['< 92', '92-95', '95-97', '97-100', '> 100'] },
  { key: 'volume', name: 'Volume', units: 'ft\u00B3/m\u00B3', cat: 'NODE_STD', scope: 'node', maxVal: 1000, labels: ['< 100', '100-300', '300-500', '500-800', '> 800'] },
  { key: 'lateralInflow', name: 'Lateral Inflow', units: 'CFS/CMS', cat: 'NODE_STD', scope: 'node', maxVal: 10, labels: ['< 1', '1-3', '3-5', '5-8', '> 8'] },
  { key: 'totalInflow', name: 'Total Inflow', units: 'CFS/CMS', cat: 'NODE_STD', scope: 'node', maxVal: 15, labels: ['< 1', '1-4', '4-8', '8-12', '> 12'] },
  { key: 'flooding', name: 'Overflow / Flooding', units: 'CFS/CMS', cat: 'NODE_STD', scope: 'node', maxVal: 5, labels: ['0', '< 1', '1-2', '2-4', '> 4'] },

  { key: 'surfaceArea', name: 'Surface Area', units: 'ft\u00B2/m\u00B2', cat: 'NODE_SOLVER', scope: 'node', maxVal: 100, labels: ['< 10', '10-25', '25-50', '50-75', '> 75'] },
  { key: 'nodeTimestep', name: 'Timestep', units: 'sec', cat: 'NODE_SOLVER', scope: 'node', maxVal: 60, labels: ['< 5', '5-15', '15-30', '30-45', '> 45'] },
  { key: 'nodeCE', name: 'Continuity Error', units: '\u2014', cat: 'NODE_SOLVER', scope: 'node', maxVal: 0.05, labels: ['< 0.01', '0.01-0.02', '0.02-0.03', '0.03-0.04', '> 0.04'] },
  { key: 'dqdh', name: 'dQ/dH (Jacobian)', units: 'CFS\u00B7ft\u207B\u00B9', cat: 'NODE_SOLVER', scope: 'node', maxVal: 50, labels: ['< 5', '5-15', '15-25', '25-40', '> 40'] },
  { key: 'nrDenom', name: 'NR Denominator', units: '\u2014', cat: 'NODE_SOLVER', scope: 'node', maxVal: 100, labels: ['< 10', '10-30', '30-50', '50-80', '> 80'] },
  { key: 'fResidual', name: 'F(H) Residual', units: 'CFS/CMS', cat: 'NODE_SOLVER', scope: 'node', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'crownElev', name: 'Crown Elevation', units: 'ft/m', cat: 'NODE_SOLVER', scope: 'node', maxVal: 120, labels: ['Low', '', '', '', 'High'] },
  { key: 'prevArea', name: 'Previous Area', units: 'ft\u00B2/m\u00B2', cat: 'NODE_SOLVER', scope: 'node', maxVal: 100, labels: ['< 10', '10-25', '25-50', '50-75', '> 75'] },
  { key: 'headCorrection', name: 'Head Correction', units: 'ft/m', cat: 'NODE_SOLVER', scope: 'node', maxVal: 1, labels: ['< 0.1', '0.1-0.3', '0.3-0.5', '0.5-0.8', '> 0.8'] },
  { key: 'nodeIterations', name: 'Iteration Count', units: 'count', cat: 'NODE_SOLVER', scope: 'node', maxVal: 10, labels: ['1-2', '3-4', '5-6', '7-8', '> 8'] },
  { key: 'nodeConvergence', name: 'Convergence Flag', units: '0/1', cat: 'NODE_SOLVER', scope: 'node', maxVal: 1, labels: ['Failed', '', '', '', 'OK'] },
  { key: 'nodeInfil', name: 'Node Infiltration', units: 'CFS/CMS', cat: 'NODE_SOLVER', scope: 'node', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'nodeEvap', name: 'Node Evaporation', units: 'CFS/CMS', cat: 'NODE_SOLVER', scope: 'node', maxVal: 1, labels: ['< 0.1', '0.1-0.3', '0.3-0.5', '0.5-0.8', '> 0.8'] },
  { key: 'nodeDegree', name: 'Node Degree', units: 'count', cat: 'NODE_SOLVER', scope: 'node', maxVal: 8, labels: ['1', '2', '3', '4-5', '> 5'] },
  { key: 'oldAreaByDt', name: 'OldArea / dt', units: 'ft\u00B2/s', cat: 'NODE_SOLVER', scope: 'node', maxVal: 10, labels: ['< 1', '1-3', '3-5', '5-8', '> 8'] },

  { key: 'rdiiTotal', name: 'RDII Total Flow', units: 'CFS/CMS', cat: 'NODE_RDII', scope: 'node', maxVal: 10, labels: ['< 1', '1-3', '3-5', '5-8', '> 8'] },
  { key: 'rdiiUH1', name: 'RDII from UH1', units: 'CFS/CMS', cat: 'NODE_RDII', scope: 'node', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'rdiiUH2', name: 'RDII from UH2', units: 'CFS/CMS', cat: 'NODE_RDII', scope: 'node', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'rdiiUH3', name: 'RDII from UH3', units: 'CFS/CMS', cat: 'NODE_RDII', scope: 'node', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'dwfInflow', name: 'DWF Inflow', units: 'CFS/CMS', cat: 'NODE_RDII', scope: 'node', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'totalOutflow', name: 'Total Outflow', units: 'CFS/CMS', cat: 'NODE_RDII', scope: 'node', maxVal: 15, labels: ['< 1', '1-4', '4-8', '8-12', '> 12'] },
];

export const LINK_VARS: SwmmVariable[] = [
  { key: 'flow', name: 'Flow (Q)', units: 'CFS/CMS', cat: 'LINK_STD', scope: 'link', maxVal: 15, labels: ['< 1.0', '1.0-2.5', '2.5-4.0', '4.0-6.0', '> 6.0'] },
  { key: 'depth', name: 'Depth (midpoint)', units: 'ft/m', cat: 'LINK_STD', scope: 'link', maxVal: 3, labels: ['< 0.5', '0.5-1.0', '1.0-1.5', '1.5-2.0', '> 2.0'] },
  { key: 'velocity', name: 'Velocity', units: 'ft/s', cat: 'LINK_STD', scope: 'link', maxVal: 8, labels: ['< 1.0', '1.0-2.0', '2.0-3.0', '3.0-5.0', '> 5.0'] },
  { key: 'volume', name: 'Volume', units: 'ft\u00B3/m\u00B3', cat: 'LINK_STD', scope: 'link', maxVal: 500, labels: ['< 50', '50-150', '150-300', '300-400', '> 400'] },
  { key: 'capacity', name: 'Capacity (d/D)', units: 'ratio', cat: 'LINK_STD', scope: 'link', maxVal: 1, labels: ['< 0.2', '0.2-0.4', '0.4-0.6', '0.6-0.8', '> 0.8'] },

  { key: 'froude', name: 'Froude Number', units: '\u2014', cat: 'LINK_MOMENTUM', scope: 'link', maxVal: 2, labels: ['< 0.3', '0.3-0.6', '0.6-1.0', '1.0-1.5', '> 1.5'] },
  { key: 'f1Area', name: 'F1 (US Area)', units: 'ft\u00B2/m\u00B2', cat: 'LINK_MOMENTUM', scope: 'link', maxVal: 20, labels: ['< 2', '2-5', '5-10', '10-15', '> 15'] },
  { key: 'f2Area', name: 'F2 (DS Area)', units: 'ft\u00B2/m\u00B2', cat: 'LINK_MOMENTUM', scope: 'link', maxVal: 20, labels: ['< 2', '2-5', '5-10', '10-15', '> 15'] },
  { key: 'v1', name: 'V1 (US Velocity)', units: 'ft/s', cat: 'LINK_MOMENTUM', scope: 'link', maxVal: 8, labels: ['< 1', '1-2', '2-4', '4-6', '> 6'] },
  { key: 'v2', name: 'V2 (DS Velocity)', units: 'ft/s', cat: 'LINK_MOMENTUM', scope: 'link', maxVal: 8, labels: ['< 1', '1-2', '2-4', '4-6', '> 6'] },
  { key: 'dq1Inertia', name: 'DQ1: Inertia', units: 'CFS/CMS', cat: 'LINK_MOMENTUM', scope: 'link', maxVal: 10, labels: ['< 1', '1-3', '3-5', '5-8', '> 8'] },
  { key: 'dq2Pressure', name: 'DQ2: Gravity/Pressure', units: 'CFS/CMS', cat: 'LINK_MOMENTUM', scope: 'link', maxVal: 10, labels: ['< 1', '1-3', '3-5', '5-8', '> 8'] },
  { key: 'dq3Friction', name: 'DQ3: Friction', units: 'CFS/CMS', cat: 'LINK_MOMENTUM', scope: 'link', maxVal: 10, labels: ['< 1', '1-3', '3-5', '5-8', '> 8'] },
  { key: 'dq4Losses', name: 'DQ4: Entry/Exit Loss', units: 'CFS/CMS', cat: 'LINK_MOMENTUM', scope: 'link', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'dq5Lateral', name: 'DQ5: Lateral Inflow', units: 'CFS/CMS', cat: 'LINK_MOMENTUM', scope: 'link', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'dq6Convect', name: 'DQ6: Convective Accel', units: 'CFS/CMS', cat: 'LINK_MOMENTUM', scope: 'link', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'upHLoss', name: 'US Head Loss', units: 'ft/m', cat: 'LINK_MOMENTUM', scope: 'link', maxVal: 2, labels: ['< 0.2', '0.2-0.5', '0.5-1.0', '1.0-1.5', '> 1.5'] },
  { key: 'dnHLoss', name: 'DS Head Loss', units: 'ft/m', cat: 'LINK_MOMENTUM', scope: 'link', maxVal: 2, labels: ['< 0.2', '0.2-0.5', '0.5-1.0', '1.0-1.5', '> 1.5'] },
  { key: 'frictionHLoss', name: 'Friction Head Loss', units: 'ft/m', cat: 'LINK_MOMENTUM', scope: 'link', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'hwFrictionSlope', name: 'H-W Friction Slope', units: 'ft/ft', cat: 'LINK_MOMENTUM', scope: 'link', maxVal: 0.05, labels: ['< 0.005', '0.005-0.01', '0.01-0.02', '0.02-0.04', '> 0.04'] },
  { key: 'qNormal', name: 'Q_normal', units: 'CFS/CMS', cat: 'LINK_MOMENTUM', scope: 'link', maxVal: 20, labels: ['< 2', '2-5', '5-10', '10-15', '> 15'] },
  { key: 'stVenantBalance', name: 'St. Venant Balance', units: '\u2014', cat: 'LINK_MOMENTUM', scope: 'link', maxVal: 1, labels: ['< 0.1', '0.1-0.3', '0.3-0.5', '0.5-0.8', '> 0.8'] },
  { key: 'linkDqdh', name: 'Link dQ/dH', units: 'CFS/ft', cat: 'LINK_MOMENTUM', scope: 'link', maxVal: 50, labels: ['< 5', '5-15', '15-25', '25-40', '> 40'] },

  { key: 'aMid', name: 'A_mid (Midpoint Area)', units: 'ft\u00B2/m\u00B2', cat: 'LINK_GEOMETRY', scope: 'link', maxVal: 20, labels: ['< 2', '2-5', '5-10', '10-15', '> 15'] },
  { key: 'aWeighted', name: 'A_weighted', units: 'ft\u00B2/m\u00B2', cat: 'LINK_GEOMETRY', scope: 'link', maxVal: 20, labels: ['< 2', '2-5', '5-10', '10-15', '> 15'] },
  { key: 'a1', name: 'A1 (US Area)', units: 'ft\u00B2/m\u00B2', cat: 'LINK_GEOMETRY', scope: 'link', maxVal: 20, labels: ['< 2', '2-5', '5-10', '10-15', '> 15'] },
  { key: 'a2', name: 'A2 (DS Area)', units: 'ft\u00B2/m\u00B2', cat: 'LINK_GEOMETRY', scope: 'link', maxVal: 20, labels: ['< 2', '2-5', '5-10', '10-15', '> 15'] },
  { key: 'rMid', name: 'R_mid (Hyd Radius)', units: 'ft/m', cat: 'LINK_GEOMETRY', scope: 'link', maxVal: 3, labels: ['< 0.3', '0.3-0.8', '0.8-1.5', '1.5-2.5', '> 2.5'] },
  { key: 'rWeighted', name: 'R_weighted', units: 'ft/m', cat: 'LINK_GEOMETRY', scope: 'link', maxVal: 3, labels: ['< 0.3', '0.3-0.8', '0.8-1.5', '1.5-2.5', '> 2.5'] },
  { key: 'r1', name: 'R1 (US Hyd Radius)', units: 'ft/m', cat: 'LINK_GEOMETRY', scope: 'link', maxVal: 3, labels: ['< 0.3', '0.3-0.8', '0.8-1.5', '1.5-2.5', '> 2.5'] },
  { key: 'r2', name: 'R2 (DS Hyd Radius)', units: 'ft/m', cat: 'LINK_GEOMETRY', scope: 'link', maxVal: 3, labels: ['< 0.3', '0.3-0.8', '0.8-1.5', '1.5-2.5', '> 2.5'] },
  { key: 'w1', name: 'W1 (US Top Width)', units: 'ft/m', cat: 'LINK_GEOMETRY', scope: 'link', maxVal: 10, labels: ['< 1', '1-3', '3-5', '5-8', '> 8'] },
  { key: 'w2', name: 'W2 (DS Top Width)', units: 'ft/m', cat: 'LINK_GEOMETRY', scope: 'link', maxVal: 10, labels: ['< 1', '1-3', '3-5', '5-8', '> 8'] },
  { key: 'y1', name: 'Y1 (US Depth)', units: 'ft/m', cat: 'LINK_GEOMETRY', scope: 'link', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'y2', name: 'Y2 (DS Depth)', units: 'ft/m', cat: 'LINK_GEOMETRY', scope: 'link', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },

  { key: 'hgl', name: 'HGL (midpoint)', units: 'ft/m', cat: 'LINK_ENERGY', scope: 'link', maxVal: 110, labels: ['Low', '', '', '', 'High'] },
  { key: 'h1Head', name: 'H1 (US Head)', units: 'ft/m', cat: 'LINK_ENERGY', scope: 'link', maxVal: 110, labels: ['Low', '', '', '', 'High'] },
  { key: 'h2Head', name: 'H2 (DS Head)', units: 'ft/m', cat: 'LINK_ENERGY', scope: 'link', maxVal: 110, labels: ['Low', '', '', '', 'High'] },
  { key: 'vhUp', name: 'VH_up (US Vel Head)', units: 'ft/m', cat: 'LINK_ENERGY', scope: 'link', maxVal: 2, labels: ['< 0.2', '0.2-0.5', '0.5-1.0', '1.0-1.5', '> 1.5'] },
  { key: 'vhMid', name: 'VH_mid (Vel Head)', units: 'ft/m', cat: 'LINK_ENERGY', scope: 'link', maxVal: 2, labels: ['< 0.2', '0.2-0.5', '0.5-1.0', '1.0-1.5', '> 1.5'] },
  { key: 'vhDn', name: 'VH_dn (DS Vel Head)', units: 'ft/m', cat: 'LINK_ENERGY', scope: 'link', maxVal: 2, labels: ['< 0.2', '0.2-0.5', '0.5-1.0', '1.0-1.5', '> 1.5'] },
  { key: 'frictionLossHf', name: 'Friction Loss (hf)', units: 'ft/m', cat: 'LINK_ENERGY', scope: 'link', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'bernoulliLHS', name: 'Bernoulli LHS', units: 'ft/m', cat: 'LINK_ENERGY', scope: 'link', maxVal: 120, labels: ['Low', '', '', '', 'High'] },
  { key: 'bernoulliRHS', name: 'Bernoulli RHS', units: 'ft/m', cat: 'LINK_ENERGY', scope: 'link', maxVal: 120, labels: ['Low', '', '', '', 'High'] },
  { key: 'rho', name: '\u03C1 (Density Factor)', units: '\u2014', cat: 'LINK_ENERGY', scope: 'link', maxVal: 2, labels: ['< 0.5', '0.5-0.8', '0.8-1.0', '1.0-1.5', '> 1.5'] },
  { key: 'sigma', name: '\u03C3 (Inertial Damping)', units: '0\u20131', cat: 'LINK_ENERGY', scope: 'link', maxVal: 1, labels: ['< 0.2', '0.2-0.4', '0.4-0.6', '0.6-0.8', '> 0.8'] },

  { key: 'areaSWMM3', name: 'Area (SWMM3 weight)', units: 'ft\u00B2/m\u00B2', cat: 'LINK_COMPAT', scope: 'link', maxVal: 20, labels: ['< 2', '2-5', '5-10', '10-15', '> 15'] },
  { key: 'areaSWMM4', name: 'Area (SWMM4 weight)', units: 'ft\u00B2/m\u00B2', cat: 'LINK_COMPAT', scope: 'link', maxVal: 20, labels: ['< 2', '2-5', '5-10', '10-15', '> 15'] },
  { key: 'areaSWMM5', name: 'Area (SWMM5 weight)', units: 'ft\u00B2/m\u00B2', cat: 'LINK_COMPAT', scope: 'link', maxVal: 20, labels: ['< 2', '2-5', '5-10', '10-15', '> 15'] },

  { key: 'usNormalArea', name: 'US Normal Area', units: 'ft\u00B2/m\u00B2', cat: 'LINK_PROPS', scope: 'link', maxVal: 20, labels: ['< 2', '2-5', '5-10', '10-15', '> 15'] },
  { key: 'dsNormalArea', name: 'DS Normal Area', units: 'ft\u00B2/m\u00B2', cat: 'LINK_PROPS', scope: 'link', maxVal: 20, labels: ['< 2', '2-5', '5-10', '10-15', '> 15'] },
  { key: 'linkTimestep', name: 'Timestep', units: 'sec', cat: 'LINK_PROPS', scope: 'link', maxVal: 60, labels: ['< 5', '5-15', '15-30', '30-45', '> 45'] },
  { key: 'linkIterations', name: 'Iterations', units: 'count', cat: 'LINK_PROPS', scope: 'link', maxVal: 10, labels: ['1-2', '3-4', '5-6', '7-8', '> 8'] },
  { key: 'akon', name: 'AKON Factor', units: '\u2014', cat: 'LINK_PROPS', scope: 'link', maxVal: 100, labels: ['< 10', '10-30', '30-50', '50-80', '> 80'] },
  { key: 'fasnh', name: 'FASNH Factor', units: '\u2014', cat: 'LINK_PROPS', scope: 'link', maxVal: 100, labels: ['< 10', '10-30', '30-50', '50-80', '> 80'] },
  { key: 'actualLength', name: 'Length (actual)', units: 'ft/m', cat: 'LINK_PROPS', scope: 'link', maxVal: 0, labels: ['Short', '', '', '', 'Long'] },
  { key: 'modLength', name: 'Modified Length', units: 'ft/m', cat: 'LINK_PROPS', scope: 'link', maxVal: 0, labels: ['Short', '', '', '', 'Long'] },
  { key: 'actualRoughness', name: 'Roughness (n)', units: '\u2014', cat: 'LINK_PROPS', scope: 'link', maxVal: 0.05, labels: ['< 0.010', '0.010-0.015', '0.015-0.025', '0.025-0.035', '> 0.035'] },
  { key: 'roughFactor', name: 'Roughness Factor', units: '\u2014', cat: 'LINK_PROPS', scope: 'link', maxVal: 2, labels: ['< 0.5', '0.5-0.8', '0.8-1.0', '1.0-1.5', '> 1.5'] },
  { key: 'bedSlope', name: 'Bed Slope', units: 'ft/ft', cat: 'LINK_PROPS', scope: 'link', maxVal: 0.05, labels: ['< 0.005', '0.005-0.01', '0.01-0.02', '0.02-0.04', '> 0.04'] },
  { key: 'qMax', name: 'Q_max (Full Cap)', units: 'CFS/CMS', cat: 'LINK_PROPS', scope: 'link', maxVal: 50, labels: ['< 5', '5-15', '15-25', '25-40', '> 40'] },
  { key: 'beta', name: '\u03B2 (Momentum Coeff)', units: '\u2014', cat: 'LINK_PROPS', scope: 'link', maxVal: 1.5, labels: ['< 0.8', '0.8-0.9', '0.9-1.0', '1.0-1.1', '> 1.1'] },
  { key: 'setting', name: 'Setting', units: '0\u20131', cat: 'LINK_PROPS', scope: 'link', maxVal: 1, labels: ['Off', '', '', '', 'Full'] },
  { key: 'targetSetting', name: 'Target Setting', units: '0\u20131', cat: 'LINK_PROPS', scope: 'link', maxVal: 1, labels: ['Off', '', '', '', 'Full'] },
  { key: 'timeOpen', name: 'Time Open', units: 'sec', cat: 'LINK_PROPS', scope: 'link', maxVal: 3600, labels: ['< 300', '300-900', '900-1800', '1800-3000', '> 3000'] },

  { key: 'flowClass', name: 'Flow Classification', units: 'flag', cat: 'FLOW_CLASS', scope: 'link', maxVal: 10, labels: ['Dry', 'SubCrit', 'SupCrit', 'Critical', 'Full'] },
];

export const SUB_VARS: SwmmVariable[] = [
  { key: 'rainfall', name: 'Rainfall', units: 'in/hr', cat: 'SUB_STD', scope: 'subcatch', maxVal: 5, labels: ['< 0.5', '0.5-1.0', '1.0-2.0', '2.0-3.0', '> 3.0'] },
  { key: 'snowDepth', name: 'Snow Depth', units: 'in/mm', cat: 'SUB_STD', scope: 'subcatch', maxVal: 5, labels: ['< 0.5', '0.5-1.0', '1.0-2.0', '2.0-4.0', '> 4.0'] },
  { key: 'evap', name: 'Evaporation', units: 'in/hr', cat: 'SUB_STD', scope: 'subcatch', maxVal: 0.5, labels: ['< 0.05', '0.05-0.1', '0.1-0.2', '0.2-0.4', '> 0.4'] },
  { key: 'infiltration', name: 'Infiltration', units: 'in/hr', cat: 'SUB_STD', scope: 'subcatch', maxVal: 3, labels: ['< 0.2', '0.2-0.5', '0.5-1.0', '1.0-2.0', '> 2.0'] },
  { key: 'runoff', name: 'Total Runoff', units: 'CFS/CMS', cat: 'SUB_STD', scope: 'subcatch', maxVal: 20, labels: ['< 2', '2-5', '5-10', '10-15', '> 15'] },
  { key: 'gwOutflow', name: 'GW Flow to Node', units: 'CFS/CMS', cat: 'SUB_STD', scope: 'subcatch', maxVal: 5, labels: ['< 0.5', '0.5-1.0', '1.0-2.0', '2.0-4.0', '> 4.0'] },
  { key: 'gwElev', name: 'GW Table Elev', units: 'ft/m', cat: 'SUB_STD', scope: 'subcatch', maxVal: 50, labels: ['Low', '', '', '', 'High'] },
  { key: 'moisture', name: 'Soil Moisture', units: 'fraction', cat: 'SUB_STD', scope: 'subcatch', maxVal: 0.5, labels: ['< 0.1', '0.1-0.2', '0.2-0.3', '0.3-0.4', '> 0.4'] },

  { key: 'runoffImperv0', name: 'Runoff: Imperv (no DS)', units: 'CFS/CMS', cat: 'SUB_RUNOFF', scope: 'subcatch', maxVal: 10, labels: ['< 1', '1-3', '3-5', '5-8', '> 8'] },
  { key: 'runoffImperv1', name: 'Runoff: Imperv (DS)', units: 'CFS/CMS', cat: 'SUB_RUNOFF', scope: 'subcatch', maxVal: 10, labels: ['< 1', '1-3', '3-5', '5-8', '> 8'] },
  { key: 'runoffPerv', name: 'Runoff: Pervious', units: 'CFS/CMS', cat: 'SUB_RUNOFF', scope: 'subcatch', maxVal: 10, labels: ['< 1', '1-3', '3-5', '5-8', '> 8'] },
  { key: 'depthImperv0', name: 'Depth: Imperv (no DS)', units: 'ft/m', cat: 'SUB_RUNOFF', scope: 'subcatch', maxVal: 0.5, labels: ['< 0.05', '0.05-0.1', '0.1-0.2', '0.2-0.3', '> 0.3'] },
  { key: 'depthImperv1', name: 'Depth: Imperv (DS)', units: 'ft/m', cat: 'SUB_RUNOFF', scope: 'subcatch', maxVal: 0.5, labels: ['< 0.05', '0.05-0.1', '0.1-0.2', '0.2-0.3', '> 0.3'] },
  { key: 'depthPerv', name: 'Depth: Pervious', units: 'ft/m', cat: 'SUB_RUNOFF', scope: 'subcatch', maxVal: 0.5, labels: ['< 0.05', '0.05-0.1', '0.1-0.2', '0.2-0.3', '> 0.3'] },
  { key: 'avgSurfDepth', name: 'Avg Surface Depth', units: 'ft/m', cat: 'SUB_RUNOFF', scope: 'subcatch', maxVal: 0.5, labels: ['< 0.05', '0.05-0.1', '0.1-0.2', '0.2-0.3', '> 0.3'] },
  { key: 'runon', name: 'Runon (from outfall)', units: 'CFS/CMS', cat: 'SUB_RUNOFF', scope: 'subcatch', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'subArea', name: 'Total Area', units: 'ac/ha', cat: 'SUB_RUNOFF', scope: 'subcatch', maxVal: 0, labels: ['Small', '', '', '', 'Large'] },
  { key: 'impAreaDS', name: 'Imperv Area (DS)', units: 'ac/ha', cat: 'SUB_RUNOFF', scope: 'subcatch', maxVal: 0, labels: ['Small', '', '', '', 'Large'] },
  { key: 'impAreaNoDS', name: 'Imperv Area (no DS)', units: 'ac/ha', cat: 'SUB_RUNOFF', scope: 'subcatch', maxVal: 0, labels: ['Small', '', '', '', 'Large'] },
  { key: 'pervArea', name: 'Pervious Area', units: 'ac/ha', cat: 'SUB_RUNOFF', scope: 'subcatch', maxVal: 0, labels: ['Small', '', '', '', 'Large'] },
  { key: 'nonLidArea', name: 'Non-LID Area', units: 'ac/ha', cat: 'SUB_RUNOFF', scope: 'subcatch', maxVal: 0, labels: ['Small', '', '', '', 'Large'] },

  { key: 'lidArea', name: 'LID Total Area', units: 'ft\u00B2/m\u00B2', cat: 'SUB_LID', scope: 'subcatch', maxVal: 5000, labels: ['< 500', '500-1500', '1500-3000', '3000-4500', '> 4500'] },
  { key: 'lidCaptureArea', name: 'LID Capture Area', units: 'ft\u00B2/m\u00B2', cat: 'SUB_LID', scope: 'subcatch', maxVal: 5000, labels: ['< 500', '500-1500', '1500-3000', '3000-4500', '> 4500'] },
  { key: 'impToLidFlow', name: 'Imp to LID Flow', units: 'CFS/CMS', cat: 'SUB_LID', scope: 'subcatch', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'lidCount', name: 'LID Unit Count', units: 'count', cat: 'SUB_LID', scope: 'subcatch', maxVal: 10, labels: ['0', '1-2', '3-4', '5-7', '> 7'] },
  { key: 'lidSurfInflow', name: 'LID: Surface Inflow', units: 'in/hr', cat: 'SUB_LID', scope: 'subcatch', maxVal: 3, labels: ['< 0.3', '0.3-0.8', '0.8-1.5', '1.5-2.5', '> 2.5'] },
  { key: 'lidEvap', name: 'LID: Evaporation', units: 'in/hr', cat: 'SUB_LID', scope: 'subcatch', maxVal: 0.5, labels: ['< 0.05', '0.05-0.1', '0.1-0.2', '0.2-0.4', '> 0.4'] },
  { key: 'lidSurfInfil', name: 'LID: Surface Infil', units: 'in/hr', cat: 'SUB_LID', scope: 'subcatch', maxVal: 3, labels: ['< 0.3', '0.3-0.8', '0.8-1.5', '1.5-2.5', '> 2.5'] },
  { key: 'lidPavePerc', name: 'LID: Pavement Perc', units: 'in/hr', cat: 'SUB_LID', scope: 'subcatch', maxVal: 3, labels: ['< 0.3', '0.3-0.8', '0.8-1.5', '1.5-2.5', '> 2.5'] },
  { key: 'lidSoilPerc', name: 'LID: Soil Perc', units: 'in/hr', cat: 'SUB_LID', scope: 'subcatch', maxVal: 3, labels: ['< 0.3', '0.3-0.8', '0.8-1.5', '1.5-2.5', '> 2.5'] },
  { key: 'lidStorExfil', name: 'LID: Storage Exfil', units: 'in/hr', cat: 'SUB_LID', scope: 'subcatch', maxVal: 3, labels: ['< 0.3', '0.3-0.8', '0.8-1.5', '1.5-2.5', '> 2.5'] },
  { key: 'lidSurfOverflow', name: 'LID: Surface Overflow', units: 'in/hr', cat: 'SUB_LID', scope: 'subcatch', maxVal: 3, labels: ['< 0.3', '0.3-0.8', '0.8-1.5', '1.5-2.5', '> 2.5'] },
  { key: 'lidStorDrain', name: 'LID: Underdrain Flow', units: 'in/hr', cat: 'SUB_LID', scope: 'subcatch', maxVal: 3, labels: ['< 0.3', '0.3-0.8', '0.8-1.5', '1.5-2.5', '> 2.5'] },
  { key: 'lidSurfDepth', name: 'LID: Surface Depth', units: 'in/mm', cat: 'SUB_LID', scope: 'subcatch', maxVal: 3, labels: ['< 0.3', '0.3-0.8', '0.8-1.5', '1.5-2.5', '> 2.5'] },
  { key: 'lidPaveDepth', name: 'LID: Pavement Depth', units: 'in/mm', cat: 'SUB_LID', scope: 'subcatch', maxVal: 3, labels: ['< 0.3', '0.3-0.8', '0.8-1.5', '1.5-2.5', '> 2.5'] },
  { key: 'lidSoilMoist', name: 'LID: Soil Moisture', units: 'fraction', cat: 'SUB_LID', scope: 'subcatch', maxVal: 1, labels: ['< 0.2', '0.2-0.4', '0.4-0.6', '0.6-0.8', '> 0.8'] },
  { key: 'lidStorDepth', name: 'LID: Storage Depth', units: 'in/mm', cat: 'SUB_LID', scope: 'subcatch', maxVal: 10, labels: ['< 1', '1-3', '3-5', '5-8', '> 8'] },
  { key: 'lidTotalInflow', name: 'LID: Total Inflow', units: 'CFS/CMS', cat: 'SUB_LID', scope: 'subcatch', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },

  { key: 'gwFlowA1', name: 'GW: A1 Term (lateral)', units: 'CFS/CMS', cat: 'SUB_GW', scope: 'subcatch', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'gwFlowA2', name: 'GW: A2 Term (deep)', units: 'CFS/CMS', cat: 'SUB_GW', scope: 'subcatch', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'gwFlowA3', name: 'GW: A3 Term (interact)', units: 'CFS/CMS', cat: 'SUB_GW', scope: 'subcatch', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'gwPercolation', name: 'GW: Percolation', units: 'in/hr', cat: 'SUB_GW', scope: 'subcatch', maxVal: 1, labels: ['< 0.1', '0.1-0.3', '0.3-0.5', '0.5-0.8', '> 0.8'] },
  { key: 'gwEvapLoss', name: 'GW: ET Loss', units: 'in/hr', cat: 'SUB_GW', scope: 'subcatch', maxVal: 0.5, labels: ['< 0.05', '0.05-0.1', '0.1-0.2', '0.2-0.4', '> 0.4'] },
  { key: 'gwHstar', name: 'GW: H* (threshold)', units: 'ft/m', cat: 'SUB_GW', scope: 'subcatch', maxVal: 50, labels: ['Low', '', '', '', 'High'] },
  { key: 'gwHsw', name: 'GW: H_sw (surface)', units: 'ft/m', cat: 'SUB_GW', scope: 'subcatch', maxVal: 50, labels: ['Low', '', '', '', 'High'] },
  { key: 'gwLowerDepth', name: 'GW: Lower Zone Depth', units: 'ft/m', cat: 'SUB_GW', scope: 'subcatch', maxVal: 10, labels: ['< 1', '1-3', '3-5', '5-8', '> 8'] },
  { key: 'gwTotalDepth', name: 'GW: Total GW Depth', units: 'ft/m', cat: 'SUB_GW', scope: 'subcatch', maxVal: 20, labels: ['< 2', '2-5', '5-10', '10-15', '> 15'] },
  { key: 'aqBottomElev', name: 'Aquifer Bottom Elev', units: 'ft/m', cat: 'SUB_GW', scope: 'subcatch', maxVal: 0, labels: ['Low', '', '', '', 'High'] },
  { key: 'aqPorosity', name: 'Aquifer Porosity', units: 'fraction', cat: 'SUB_GW', scope: 'subcatch', maxVal: 0.5, labels: ['< 0.1', '0.1-0.2', '0.2-0.3', '0.3-0.4', '> 0.4'] },
  { key: 'gwMaxFlow', name: 'GW: Max Lateral Flow', units: 'CFS/CMS', cat: 'SUB_GW', scope: 'subcatch', maxVal: 10, labels: ['< 1', '1-3', '3-5', '5-8', '> 8'] },
  { key: 'gwMaxNegFlow', name: 'GW: Max Neg Flow', units: 'CFS/CMS', cat: 'SUB_GW', scope: 'subcatch', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'waterTableLevel', name: 'Water Table Level', units: 'ft/m', cat: 'SUB_GW', scope: 'subcatch', maxVal: 0, labels: ['Low', '', '', '', 'High'] },
  { key: 'gwNodeFlow', name: 'GW: Flow at Node', units: 'CFS/CMS', cat: 'SUB_GW', scope: 'subcatch', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'gwOldFlow', name: 'GW: Previous Flow', units: 'CFS/CMS', cat: 'SUB_GW', scope: 'subcatch', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },

  { key: 'snowmelt', name: 'Snowmelt Rate', units: 'in/hr', cat: 'SUB_SNOW', scope: 'subcatch', maxVal: 1, labels: ['< 0.1', '0.1-0.3', '0.3-0.5', '0.5-0.8', '> 0.8'] },
  { key: 'immediateMelt', name: 'Immediate Melt', units: 'in/hr', cat: 'SUB_SNOW', scope: 'subcatch', maxVal: 1, labels: ['< 0.1', '0.1-0.3', '0.3-0.5', '0.5-0.8', '> 0.8'] },
  { key: 'rainOnSnowMelt', name: 'Rain-on-Snow Melt', units: 'in/hr', cat: 'SUB_SNOW', scope: 'subcatch', maxVal: 1, labels: ['< 0.1', '0.1-0.3', '0.3-0.5', '0.5-0.8', '> 0.8'] },
  { key: 'snowFreeWater', name: 'Snow: Free Water', units: 'in/mm', cat: 'SUB_SNOW', scope: 'subcatch', maxVal: 2, labels: ['< 0.2', '0.2-0.5', '0.5-1.0', '1.0-1.5', '> 1.5'] },
  { key: 'snowColdContent', name: 'Snow: Cold Content', units: 'in/mm', cat: 'SUB_SNOW', scope: 'subcatch', maxVal: 2, labels: ['< 0.2', '0.2-0.5', '0.5-1.0', '1.0-1.5', '> 1.5'] },
  { key: 'snowCoverage', name: 'Snow: Coverage', units: 'fraction', cat: 'SUB_SNOW', scope: 'subcatch', maxVal: 1, labels: ['< 0.2', '0.2-0.4', '0.4-0.6', '0.6-0.8', '> 0.8'] },

  { key: 'ulThickness', name: 'Upper Zone Thickness', units: 'ft/m', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'fTotal', name: 'F_total (cum infil)', units: 'in/mm', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'fUpper', name: 'F_upper', units: 'in/mm', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 3, labels: ['< 0.3', '0.3-0.8', '0.8-1.5', '1.5-2.5', '> 2.5'] },
  { key: 'fUpperMax', name: 'F_upper_max', units: 'in/mm', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'currentMoisture', name: 'Current Moisture', units: 'fraction', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 0.5, labels: ['< 0.1', '0.1-0.2', '0.2-0.3', '0.3-0.4', '> 0.4'] },
  { key: 'imd', name: 'IMD (Moisture Deficit)', units: 'fraction', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 0.5, labels: ['< 0.1', '0.1-0.2', '0.2-0.3', '0.3-0.4', '> 0.4'] },
  { key: 'imdByEvent', name: 'IMD at Event Start', units: 'fraction', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 0.5, labels: ['< 0.1', '0.1-0.2', '0.2-0.3', '0.3-0.4', '> 0.4'] },
  { key: 'satFlag', name: 'Saturation Flag', units: '0/1', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 1, labels: ['Unsat', '', '', '', 'Sat'] },
  { key: 'infilTime', name: 'GA: Infil Time', units: 'hours', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 24, labels: ['< 2', '2-6', '6-12', '12-18', '> 18'] },
  { key: 'currentInfilRate', name: 'Current Infil Rate', units: 'in/hr', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 3, labels: ['< 0.3', '0.3-0.8', '0.8-1.5', '1.5-2.5', '> 2.5'] },
  { key: 'hortonTp', name: 'Horton: Tp', units: 'hours', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 10, labels: ['< 1', '1-3', '3-5', '5-8', '> 8'] },
  { key: 'hortonFe', name: 'Horton: Fe (cum F)', units: 'in/mm', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'gaIMD', name: 'GA: IMD', units: 'fraction', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 0.5, labels: ['< 0.1', '0.1-0.2', '0.2-0.3', '0.3-0.4', '> 0.4'] },
  { key: 'gaF', name: 'GA: F (cum infil)', units: 'in/mm', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'gaFu', name: 'GA: F_upper', units: 'in/mm', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 3, labels: ['< 0.3', '0.3-0.8', '0.8-1.5', '1.5-2.5', '> 2.5'] },
  { key: 'gaLu', name: 'GA: Lu (depth)', units: 'in/mm', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 10, labels: ['< 1', '1-3', '3-5', '5-8', '> 8'] },
  { key: 'gaT', name: 'GA: Time', units: 'hours', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 24, labels: ['< 2', '2-6', '6-12', '12-18', '> 18'] },
  { key: 'gaSat', name: 'GA: Saturation', units: '0/1', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 1, labels: ['Unsat', '', '', '', 'Sat'] },
  { key: 'cnS', name: 'CN: S (retention)', units: 'in/mm', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 10, labels: ['< 1', '1-3', '3-5', '5-8', '> 8'] },
  { key: 'cnF', name: 'CN: F (cum infil)', units: 'in/mm', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'cnP', name: 'CN: P (cum precip)', units: 'in/mm', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'cnT', name: 'CN: Time', units: 'hours', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 24, labels: ['< 2', '2-6', '6-12', '12-18', '> 18'] },
  { key: 'cnSe', name: 'CN: Se (effective S)', units: 'in/mm', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 10, labels: ['< 1', '1-3', '3-5', '5-8', '> 8'] },
  { key: 'cnRate', name: 'CN: f (current rate)', units: 'in/hr', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 3, labels: ['< 0.3', '0.3-0.8', '0.8-1.5', '1.5-2.5', '> 2.5'] },
  { key: 'cnSmax', name: 'CN: S_max', units: 'in/mm', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 15, labels: ['< 2', '2-5', '5-8', '8-12', '> 12'] },
  { key: 'cnF1', name: 'CN: F1 (prev F)', units: 'in/mm', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'cnRegen', name: 'CN: Regeneration', units: 'in/mm', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'cnCN', name: 'CN: Current CN', units: '\u2014', cat: 'SUB_INFIL', scope: 'subcatch', maxVal: 100, labels: ['< 40', '40-60', '60-75', '75-90', '> 90'] },

  { key: 'pollutWashoff', name: 'Pollutant: Washoff', units: 'mg/L', cat: 'SUB_POLLUT', scope: 'subcatch', maxVal: 100, labels: ['< 10', '10-30', '30-50', '50-80', '> 80'] },
  { key: 'pollutBuildup', name: 'Pollutant: Buildup', units: 'lbs/kg', cat: 'SUB_POLLUT', scope: 'subcatch', maxVal: 50, labels: ['< 5', '5-15', '15-25', '25-40', '> 40'] },
  { key: 'pollutConcRunoff', name: 'Pollutant: Conc in Runoff', units: 'mg/L', cat: 'SUB_POLLUT', scope: 'subcatch', maxVal: 200, labels: ['< 20', '20-50', '50-100', '100-150', '> 150'] },
  { key: 'pollutConcGW', name: 'Pollutant: Conc in GW', units: 'mg/L', cat: 'SUB_POLLUT', scope: 'subcatch', maxVal: 100, labels: ['< 10', '10-30', '30-50', '50-80', '> 80'] },
  { key: 'pollutLoad', name: 'Pollutant: Total Load', units: 'lbs/kg', cat: 'SUB_POLLUT', scope: 'subcatch', maxVal: 100, labels: ['< 10', '10-30', '30-50', '50-80', '> 80'] },

  { key: 'snowATI', name: 'Snow: ATI (temp index)', units: '\u00B0F', cat: 'SUB_SNOW', scope: 'subcatch', maxVal: 50, labels: ['< 10', '10-20', '20-30', '30-40', '> 40'] },
  { key: 'snowWATI', name: 'Snow: WATI (wind ATI)', units: '\u00B0F', cat: 'SUB_SNOW', scope: 'subcatch', maxVal: 50, labels: ['< 10', '10-20', '20-30', '30-40', '> 40'] },
  { key: 'snowPackSWE', name: 'Snow: Pack SWE', units: 'in/mm', cat: 'SUB_SNOW', scope: 'subcatch', maxVal: 10, labels: ['< 1', '1-3', '3-5', '5-8', '> 8'] },
  { key: 'snowPackDepth', name: 'Snow: Pack Depth', units: 'in/mm', cat: 'SUB_SNOW', scope: 'subcatch', maxVal: 20, labels: ['< 2', '2-6', '6-10', '10-15', '> 15'] },

  { key: 'lidSoilEvap', name: 'LID: Soil Evap', units: 'in/hr', cat: 'SUB_LID', scope: 'subcatch', maxVal: 0.2, labels: ['< 0.02', '0.02-0.05', '0.05-0.1', '0.1-0.15', '> 0.15'] },
  { key: 'lidDrainCoeff', name: 'LID: Drain Coeff', units: 'in/hr', cat: 'SUB_LID', scope: 'subcatch', maxVal: 2, labels: ['< 0.2', '0.2-0.5', '0.5-1.0', '1.0-1.5', '> 1.5'] },
  { key: 'lidRetention', name: 'LID: Water Retention', units: 'in/mm', cat: 'SUB_LID', scope: 'subcatch', maxVal: 3, labels: ['< 0.3', '0.3-0.8', '0.8-1.5', '1.5-2.5', '> 2.5'] },
];

export const SYS_VARS: SwmmVariable[] = [
  { key: 'sysTemperature', name: 'Air Temperature', units: '\u00B0F/\u00B0C', cat: 'SYS', scope: 'system', maxVal: 100, labels: ['Cold', '', '', '', 'Hot'] },
  { key: 'sysRainfall', name: 'System Rainfall', units: 'in/hr', cat: 'SYS', scope: 'system', maxVal: 5, labels: ['< 0.5', '0.5-1.0', '1.0-2.0', '2.0-3.0', '> 3.0'] },
  { key: 'sysSnowDepth', name: 'System Snow Depth', units: 'in/mm', cat: 'SYS', scope: 'system', maxVal: 5, labels: ['< 0.5', '0.5-1.0', '1.0-2.0', '2.0-4.0', '> 4.0'] },
  { key: 'sysInfil', name: 'System Infiltration', units: 'CFS/CMS', cat: 'SYS', scope: 'system', maxVal: 50, labels: ['< 5', '5-15', '15-25', '25-40', '> 40'] },
  { key: 'sysRunoff', name: 'System Runoff', units: 'CFS/CMS', cat: 'SYS', scope: 'system', maxVal: 100, labels: ['< 10', '10-30', '30-50', '50-80', '> 80'] },
  { key: 'sysDWF', name: 'System DWF', units: 'CFS/CMS', cat: 'SYS', scope: 'system', maxVal: 20, labels: ['< 2', '2-5', '5-10', '10-15', '> 15'] },
  { key: 'sysGWFlow', name: 'System GW Flow', units: 'CFS/CMS', cat: 'SYS', scope: 'system', maxVal: 20, labels: ['< 2', '2-5', '5-10', '10-15', '> 15'] },
  { key: 'sysRDII', name: 'System RDII', units: 'CFS/CMS', cat: 'SYS', scope: 'system', maxVal: 20, labels: ['< 2', '2-5', '5-10', '10-15', '> 15'] },
  { key: 'sysExtFlow', name: 'System External Flow', units: 'CFS/CMS', cat: 'SYS', scope: 'system', maxVal: 20, labels: ['< 2', '2-5', '5-10', '10-15', '> 15'] },
  { key: 'sysTotalInflow', name: 'Total Lateral Inflow', units: 'CFS/CMS', cat: 'SYS', scope: 'system', maxVal: 100, labels: ['< 10', '10-30', '30-50', '50-80', '> 80'] },
  { key: 'sysFlooding', name: 'System Flooding', units: 'CFS/CMS', cat: 'SYS', scope: 'system', maxVal: 20, labels: ['< 2', '2-5', '5-10', '10-15', '> 15'] },
  { key: 'sysOutflow', name: 'System Outflow', units: 'CFS/CMS', cat: 'SYS', scope: 'system', maxVal: 100, labels: ['< 10', '10-30', '30-50', '50-80', '> 80'] },
  { key: 'sysStorage', name: 'System Storage', units: 'ft\u00B3/m\u00B3', cat: 'SYS', scope: 'system', maxVal: 10000, labels: ['< 1000', '1k-3k', '3k-5k', '5k-8k', '> 8k'] },
  { key: 'sysEvap', name: 'System Evaporation', units: 'CFS/CMS', cat: 'SYS', scope: 'system', maxVal: 5, labels: ['< 0.5', '0.5-1.5', '1.5-2.5', '2.5-4', '> 4'] },
  { key: 'sysPET', name: 'Potential ET', units: 'in/day', cat: 'SYS', scope: 'system', maxVal: 0.3, labels: ['< 0.05', '0.05-0.1', '0.1-0.15', '0.15-0.25', '> 0.25'] },
  { key: 'sysWindSpeed', name: 'Wind Speed', units: 'mph', cat: 'SYS', scope: 'system', maxVal: 30, labels: ['< 5', '5-10', '10-15', '15-25', '> 25'] },
  { key: 'sysSnowfall', name: 'System Snowfall', units: 'in/hr', cat: 'SYS', scope: 'system', maxVal: 2, labels: ['< 0.2', '0.2-0.5', '0.5-1.0', '1.0-1.5', '> 1.5'] },
  { key: 'sysSnowArea', name: 'Snow Coverage', units: 'fraction', cat: 'SYS', scope: 'system', maxVal: 1, labels: ['< 0.2', '0.2-0.4', '0.4-0.6', '0.6-0.8', '> 0.8'] },
  { key: 'sysFreeWater', name: 'Snow Free Water', units: 'in/mm', cat: 'SYS', scope: 'system', maxVal: 2, labels: ['< 0.2', '0.2-0.5', '0.5-1.0', '1.0-1.5', '> 1.5'] },
  { key: 'sysColdContent', name: 'Snow Cold Content', units: 'in/mm', cat: 'SYS', scope: 'system', maxVal: 2, labels: ['< 0.2', '0.2-0.5', '0.5-1.0', '1.0-1.5', '> 1.5'] },
  { key: 'sysSnowmelt', name: 'System Snowmelt', units: 'in/hr', cat: 'SYS', scope: 'system', maxVal: 1, labels: ['< 0.1', '0.1-0.3', '0.3-0.5', '0.5-0.8', '> 0.8'] },
  { key: 'sysImelt', name: 'Immediate Melt', units: 'in/hr', cat: 'SYS', scope: 'system', maxVal: 1, labels: ['< 0.1', '0.1-0.3', '0.3-0.5', '0.5-0.8', '> 0.8'] },
  { key: 'sysRainMelt', name: 'Rain-on-Snow Melt', units: 'in/hr', cat: 'SYS', scope: 'system', maxVal: 1, labels: ['< 0.1', '0.1-0.3', '0.3-0.5', '0.5-0.8', '> 0.8'] },

  { key: 'stepFlowError', name: 'Step Flow Error', units: '%', cat: 'SYS_QA', scope: 'system', maxVal: 10, labels: ['< 1', '1-3', '3-5', '5-8', '> 8'] },
  { key: 'sysCE', name: 'Continuity Error', units: '%', cat: 'SYS_QA', scope: 'system', maxVal: 10, labels: ['< 1', '1-3', '3-5', '5-8', '> 8'] },
  { key: 'sysIterations', name: 'Avg Iterations', units: 'count', cat: 'SYS_QA', scope: 'system', maxVal: 10, labels: ['1-2', '3-4', '5-6', '7-8', '> 8'] },
  { key: 'sysTimestep', name: 'Timestep Used', units: 'sec', cat: 'SYS_QA', scope: 'system', maxVal: 60, labels: ['< 5', '5-15', '15-30', '30-45', '> 45'] },
];

export function getSystemVarByKey(key: string): SwmmVariable | undefined {
  return SYS_VARS.find(v => v.key === key);
}

export function getSystemCategories(): { label: string; vars: SwmmVariable[] }[] {
  const cats = CATEGORY_INFO.filter(c => c.scope === 'system');
  const groups: { label: string; vars: SwmmVariable[] }[] = [];
  for (const cat of cats) {
    const vars = SYS_VARS.filter(v => v.cat === cat.id);
    if (vars.length > 0) groups.push({ label: cat.label, vars });
  }
  return groups;
}

export function getNodeVarByKey(key: string): SwmmVariable | undefined {
  return NODE_VARS.find(v => v.key === key) || NODE_INPUT_VARS.find(v => v.key === key);
}

export function getLinkVarByKey(key: string): SwmmVariable | undefined {
  return LINK_VARS.find(v => v.key === key) || LINK_INPUT_VARS.find(v => v.key === key);
}

export function getSubVarByKey(key: string): SwmmVariable | undefined {
  return SUB_VARS.find(v => v.key === key) || SUB_INPUT_VARS.find(v => v.key === key);
}

export function getNodeCategories(): { label: string; vars: SwmmVariable[] }[] {
  const cats = CATEGORY_INFO.filter(c => c.scope === 'node');
  const groups: { label: string; vars: SwmmVariable[] }[] = [];
  for (const cat of cats) {
    const vars = NODE_VARS.filter(v => v.cat === cat.id);
    if (vars.length > 0) groups.push({ label: cat.label, vars });
  }
  return groups;
}

export function getLinkCategories(): { label: string; vars: SwmmVariable[] }[] {
  const cats = CATEGORY_INFO.filter(c => c.scope === 'link');
  const groups: { label: string; vars: SwmmVariable[] }[] = [];
  for (const cat of cats) {
    const vars = LINK_VARS.filter(v => v.cat === cat.id);
    if (vars.length > 0) groups.push({ label: cat.label, vars });
  }
  return groups;
}

export function getSubCategories(): { label: string; vars: SwmmVariable[] }[] {
  const cats = CATEGORY_INFO.filter(c => c.scope === 'subcatch');
  const groups: { label: string; vars: SwmmVariable[] }[] = [];
  for (const cat of cats) {
    const vars = SUB_VARS.filter(v => v.cat === cat.id);
    if (vars.length > 0) groups.push({ label: cat.label, vars });
  }
  return groups;
}

const stdNodeKeys = new Set(['depth', 'head', 'volume', 'lateralInflow', 'totalInflow', 'flooding']);
const stdLinkKeys = new Set(['flow', 'depth', 'velocity', 'volume', 'capacity']);
const stdSubKeys = new Set(['rainfall', 'snowDepth', 'evap', 'infiltration', 'runoff', 'gwOutflow', 'gwElev', 'moisture']);

export function isStdNodeVar(key: string): boolean { return stdNodeKeys.has(key); }
export function isStdLinkVar(key: string): boolean { return stdLinkKeys.has(key); }
export function isStdSubVar(key: string): boolean { return stdSubKeys.has(key); }

export function isExtendedNodeVar(key: string): boolean {
  return NODE_VARS.some(v => v.key === key) && !stdNodeKeys.has(key);
}
export function isExtendedLinkVar(key: string): boolean {
  return LINK_VARS.some(v => v.key === key) && !stdLinkKeys.has(key);
}
export function isExtendedSubVar(key: string): boolean {
  return SUB_VARS.some(v => v.key === key) && !stdSubKeys.has(key);
}
