import { useState, useMemo, useCallback, useEffect } from 'react';
import type { SwmmProject, SelectedObject } from '@/lib/swmm-types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronDown, ChevronRight, X, MapPin } from 'lucide-react';
import { CrossSectionSvg } from './Panels';
import { unitLabel, isSIProject } from '@/lib/units';
import ProvenanceBadge from './ProvenanceBadge';
import type { XSection } from '@/lib/swmm-types';

type FieldDef = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'boolean' | 'readonly' | 'subdialog';
  unit?: string;
  options?: string[];
  section: string;
  precision?: number;
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
  visibleWhen?: { field: string; values: string[] };
  subdialogType?: string;
  helpText?: string;
};

function getJunctionFields(): FieldDef[] {
  return [
    { key: 'id', label: 'Name', type: 'readonly', section: 'General' },
    { key: '_x', label: 'X-Coordinate', type: 'number', section: 'General', precision: 2 },
    { key: '_y', label: 'Y-Coordinate', type: 'number', section: 'General', precision: 2 },
    { key: 'elevation', label: 'Invert Elevation', type: 'number', unit: 'ft', section: 'Hydraulic', precision: 2, required: true, helpText: 'Invert elevation of the junction' },
    { key: 'maxDepth', label: 'Max Depth', type: 'number', unit: 'ft', section: 'Hydraulic', precision: 2, min: 0, helpText: '0 = uses distance to ground' },
    { key: 'initDepth', label: 'Initial Depth', type: 'number', unit: 'ft', section: 'Hydraulic', precision: 2, min: 0 },
    { key: 'surDepth', label: 'Surcharge Depth', type: 'number', unit: 'ft', section: 'Hydraulic', precision: 2, min: 0 },
    { key: 'aponded', label: 'Ponded Area', type: 'number', unit: 'ft²', section: 'Hydraulic', precision: 0, min: 0 },
    { key: '_directInflows', label: 'Direct Inflows', type: 'subdialog', section: 'Inflows', subdialogType: 'directInflow' },
    { key: '_dwfInflows', label: 'Dry Weather', type: 'subdialog', section: 'Inflows', subdialogType: 'dwfInflow' },
    { key: '_rdiiInflows', label: 'RDII', type: 'subdialog', section: 'Inflows', subdialogType: 'rdiiInflow' },
    { key: '_treatment', label: 'Treatment', type: 'subdialog', section: 'Treatment', subdialogType: 'treatment' },
  ];
}

function getOutfallFields(): FieldDef[] {
  return [
    { key: 'id', label: 'Name', type: 'readonly', section: 'General' },
    { key: '_x', label: 'X-Coordinate', type: 'number', section: 'General', precision: 2 },
    { key: '_y', label: 'Y-Coordinate', type: 'number', section: 'General', precision: 2 },
    { key: 'elevation', label: 'Invert Elevation', type: 'number', unit: 'ft', section: 'Hydraulic', precision: 2, required: true },
    { key: 'type', label: 'Type', type: 'select', section: 'Hydraulic', options: ['FREE', 'NORMAL', 'FIXED', 'TIDAL', 'TIMESERIES'] },
    { key: 'stageData', label: 'Fixed Stage', type: 'number', unit: 'ft', section: 'Hydraulic', precision: 2, visibleWhen: { field: 'type', values: ['FIXED'] } },
    { key: 'stageData', label: 'Tidal Curve', type: 'subdialog', section: 'Hydraulic', subdialogType: 'curve', visibleWhen: { field: 'type', values: ['TIDAL'] } },
    { key: 'stageData', label: 'Time Series', type: 'subdialog', section: 'Hydraulic', subdialogType: 'timeSeries', visibleWhen: { field: 'type', values: ['TIMESERIES'] } },
    { key: 'gated', label: 'Tide Gate', type: 'select', section: 'Hydraulic', options: ['YES', 'NO'] },
    { key: 'routeTo', label: 'Route To', type: 'text', section: 'Hydraulic' },
  ];
}

function getStorageFields(): FieldDef[] {
  return [
    { key: 'id', label: 'Name', type: 'readonly', section: 'General' },
    { key: '_x', label: 'X-Coordinate', type: 'number', section: 'General', precision: 2 },
    { key: '_y', label: 'Y-Coordinate', type: 'number', section: 'General', precision: 2 },
    { key: 'elevation', label: 'Invert Elevation', type: 'number', unit: 'ft', section: 'Hydraulic', precision: 2 },
    { key: 'maxDepth', label: 'Max Depth', type: 'number', unit: 'ft', section: 'Hydraulic', precision: 2, min: 0 },
    { key: 'initDepth', label: 'Initial Depth', type: 'number', unit: 'ft', section: 'Hydraulic', precision: 2, min: 0 },
    { key: 'shape', label: 'Storage Curve', type: 'select', section: 'Storage', options: ['FUNCTIONAL', 'TABULAR'] },
    { key: 'surDepth', label: 'Surcharge Depth', type: 'number', unit: 'ft', section: 'Hydraulic', precision: 2, min: 0 },
    { key: 'fevap', label: 'Evap Factor', type: 'number', section: 'Seepage', precision: 3, min: 0 },
  ];
}

function getDividerFields(): FieldDef[] {
  return [
    { key: 'id', label: 'Name', type: 'readonly', section: 'General' },
    { key: '_x', label: 'X-Coordinate', type: 'number', section: 'General', precision: 2 },
    { key: '_y', label: 'Y-Coordinate', type: 'number', section: 'General', precision: 2 },
    { key: 'elevation', label: 'Invert Elevation', type: 'number', unit: 'ft', section: 'Hydraulic', precision: 2 },
    { key: 'divertedLink', label: 'Diverted Link', type: 'text', section: 'Hydraulic' },
    { key: 'type', label: 'Type', type: 'select', section: 'Diversion', options: ['CUTOFF', 'TABULAR', 'WEIR', 'OVERFLOW'] },
    { key: 'cutoffFlow', label: 'Cutoff Flow', type: 'number', section: 'Diversion', precision: 2 },
    { key: 'maxDepth', label: 'Max Depth', type: 'number', unit: 'ft', section: 'Hydraulic', precision: 2, min: 0 },
    { key: 'initDepth', label: 'Initial Depth', type: 'number', unit: 'ft', section: 'Hydraulic', precision: 2, min: 0 },
    { key: 'surDepth', label: 'Surcharge Depth', type: 'number', unit: 'ft', section: 'Hydraulic', precision: 2, min: 0 },
    { key: 'aponded', label: 'Ponded Area', type: 'number', unit: 'ft²', section: 'Hydraulic', precision: 0, min: 0 },
  ];
}

function getConduitFields(): FieldDef[] {
  return [
    { key: 'id', label: 'Name', type: 'readonly', section: 'General' },
    { key: 'fromNode', label: 'From Node', type: 'text', section: 'General', required: true },
    { key: 'toNode', label: 'To Node', type: 'text', section: 'General', required: true },
    { key: 'length', label: 'Length', type: 'number', unit: 'ft', section: 'Geometry', precision: 2, min: 0.01, required: true },
    { key: 'roughness', label: "Manning's N", type: 'number', section: 'Geometry', precision: 4, step: 0.001, min: 0.001, max: 1, required: true },
    { key: 'inOffset', label: 'Inlet Offset', type: 'number', unit: 'ft', section: 'Geometry', precision: 2, min: 0 },
    { key: 'outOffset', label: 'Outlet Offset', type: 'number', unit: 'ft', section: 'Geometry', precision: 2, min: 0 },
    { key: '_xsShape', label: 'Shape', type: 'select', section: 'Cross-Section', options: ['CIRCULAR', 'FORCE_MAIN', 'FILLED_CIRCULAR', 'RECT_CLOSED', 'RECT_OPEN', 'TRAPEZOIDAL', 'TRIANGULAR', 'HORIZ_ELLIPSE', 'VERT_ELLIPSE', 'ARCH', 'PARABOLIC', 'POWER', 'RECT_TRIANGULAR', 'RECT_ROUND', 'MOD_BASKETHANDLE', 'EGG', 'HORSESHOE', 'GOTHIC', 'CATENARY', 'SEMI_ELLIPTICAL', 'BASKETHANDLE', 'SEMI_CIRCULAR', 'IRREGULAR', 'CUSTOM', 'STREET'], required: true },
    { key: '_xsGeom1', label: 'Max Depth (Geom1)', type: 'number', unit: 'ft', section: 'Cross-Section', precision: 2, min: 0, required: true },
    { key: '_xsGeom2', label: 'Geom2', type: 'number', section: 'Cross-Section', precision: 2 },
    { key: '_xsGeom3', label: 'Geom3', type: 'number', section: 'Cross-Section', precision: 2 },
    { key: '_xsGeom4', label: 'Geom4', type: 'number', section: 'Cross-Section', precision: 2 },
    { key: '_xsBarrels', label: 'Barrels', type: 'number', section: 'Cross-Section', precision: 0, min: 1 },
    { key: '_xsTransect', label: 'Transect', type: 'text', section: 'Cross-Section', visibleWhen: { field: '_xsShape', values: ['IRREGULAR'] } },
    { key: 'initFlow', label: 'Initial Flow', type: 'number', unit: 'CFS', section: 'Flow', precision: 2, min: 0 },
    { key: 'maxFlow', label: 'Max Flow', type: 'number', unit: 'CFS', section: 'Flow', precision: 2, min: 0 },
    { key: '_lossEntry', label: 'Entry Loss Coeff', type: 'number', section: 'Losses', precision: 3, min: 0 },
    { key: '_lossExit', label: 'Exit Loss Coeff', type: 'number', section: 'Losses', precision: 3, min: 0 },
    { key: '_lossAvg', label: 'Avg Loss Coeff', type: 'number', section: 'Losses', precision: 3, min: 0 },
    { key: '_lossFlapGate', label: 'Flap Gate', type: 'select', section: 'Losses', options: ['YES', 'NO'] },
    { key: '_lossSeepage', label: 'Seepage Rate', type: 'number', unit: 'in/hr', section: 'Losses', precision: 3, min: 0 },
  ];
}

function getPumpFields(): FieldDef[] {
  return [
    { key: 'id', label: 'Name', type: 'readonly', section: 'General' },
    { key: 'fromNode', label: 'From Node', type: 'text', section: 'General' },
    { key: 'toNode', label: 'To Node', type: 'text', section: 'General' },
    { key: 'pumpCurve', label: 'Pump Curve', type: 'subdialog', section: 'Pump', subdialogType: 'curve' },
    { key: 'status', label: 'Initial Status', type: 'select', section: 'Pump', options: ['ON', 'OFF'] },
    { key: 'startupDepth', label: 'Startup Depth', type: 'number', unit: 'ft', section: 'Pump', precision: 2, min: 0 },
    { key: 'shutoffDepth', label: 'Shutoff Depth', type: 'number', unit: 'ft', section: 'Pump', precision: 2, min: 0 },
  ];
}

function getOrificeFields(): FieldDef[] {
  return [
    { key: 'id', label: 'Name', type: 'readonly', section: 'General' },
    { key: 'fromNode', label: 'From Node', type: 'text', section: 'General' },
    { key: 'toNode', label: 'To Node', type: 'text', section: 'General' },
    { key: 'type', label: 'Type', type: 'select', section: 'Orifice', options: ['SIDE', 'BOTTOM'] },
    { key: 'offset', label: 'Inlet Offset', type: 'number', unit: 'ft', section: 'Orifice', precision: 2, min: 0 },
    { key: 'cd', label: 'Discharge Coeff', type: 'number', section: 'Orifice', precision: 3 },
    { key: 'gated', label: 'Flap Gate', type: 'select', section: 'Orifice', options: ['YES', 'NO'] },
    { key: 'closeTime', label: 'Close Time', type: 'number', unit: 'sec', section: 'Orifice', precision: 1, min: 0 },
  ];
}

function getWeirFields(): FieldDef[] {
  return [
    { key: 'id', label: 'Name', type: 'readonly', section: 'General' },
    { key: 'fromNode', label: 'From Node', type: 'text', section: 'General' },
    { key: 'toNode', label: 'To Node', type: 'text', section: 'General' },
    { key: 'type', label: 'Type', type: 'select', section: 'Weir', options: ['TRANSVERSE', 'SIDEFLOW', 'V-NOTCH', 'TRAPEZOIDAL', 'ROADWAY'] },
    { key: 'crestHeight', label: 'Crest Height', type: 'number', unit: 'ft', section: 'Weir', precision: 2 },
    { key: 'cd', label: 'Discharge Coeff', type: 'number', section: 'Weir', precision: 3 },
    { key: 'gated', label: 'Flap Gate', type: 'select', section: 'Weir', options: ['YES', 'NO'] },
    { key: 'ec', label: 'End Contractions', type: 'number', section: 'Weir', precision: 0, min: 0 },
    { key: 'cd2', label: 'End Coeff', type: 'number', section: 'Weir', precision: 3 },
    { key: 'surcharge', label: 'Can Surcharge', type: 'select', section: 'Weir', options: ['YES', 'NO'] },
    { key: 'width', label: 'Width', type: 'number', unit: 'ft', section: 'Weir', precision: 2 },
  ];
}

function getOutletFields(): FieldDef[] {
  return [
    { key: 'id', label: 'Name', type: 'readonly', section: 'General' },
    { key: 'fromNode', label: 'From Node', type: 'text', section: 'General' },
    { key: 'toNode', label: 'To Node', type: 'text', section: 'General' },
    { key: 'offset', label: 'Inlet Offset', type: 'number', unit: 'ft', section: 'Outlet', precision: 2, min: 0 },
    { key: 'type', label: 'Type', type: 'select', section: 'Outlet', options: ['FUNCTIONAL/DEPTH', 'FUNCTIONAL/HEAD', 'TABULAR/DEPTH', 'TABULAR/HEAD'] },
    { key: 'curveOrTable', label: 'Curve/Table', type: 'subdialog', section: 'Outlet', subdialogType: 'curve' },
  ];
}

function getInfiltrationFields(method: string): FieldDef[] {
  const m = (method || '').toUpperCase();
  if (m === 'HORTON' || m === 'MODIFIED_HORTON') {
    return [
      { key: '_infiltVal0', label: 'Max Infil Rate', type: 'number', unit: 'in/hr', section: 'Infiltration', precision: 4, min: 0, helpText: 'Horton max infiltration rate' },
      { key: '_infiltVal1', label: 'Min Infil Rate', type: 'number', unit: 'in/hr', section: 'Infiltration', precision: 4, min: 0, helpText: 'Horton min infiltration rate' },
      { key: '_infiltVal2', label: 'Decay Constant', type: 'number', unit: '1/hr', section: 'Infiltration', precision: 4, min: 0, helpText: 'Horton decay constant' },
    ];
  }
  if (m === 'CURVE_NUMBER') {
    return [
      { key: '_infiltVal0', label: 'Curve Number', type: 'number', section: 'Infiltration', precision: 1, min: 0, max: 100, helpText: 'SCS curve number' },
      { key: '_infiltVal1', label: 'Conductivity', type: 'number', unit: 'in/hr', section: 'Infiltration', precision: 4, min: 0, helpText: 'Hydraulic conductivity (optional)' },
      { key: '_infiltVal2', label: 'Drying Time', type: 'number', unit: 'days', section: 'Infiltration', precision: 1, min: 0, helpText: 'Time for fully saturated soil to dry' },
    ];
  }
  return [
    { key: '_infiltVal0', label: 'Suction Head', type: 'number', unit: 'in', section: 'Infiltration', precision: 2, min: 0, helpText: 'Green-Ampt suction head' },
    { key: '_infiltVal1', label: 'Conductivity', type: 'number', unit: 'in/hr', section: 'Infiltration', precision: 4, min: 0, helpText: 'Green-Ampt hydraulic conductivity' },
    { key: '_infiltVal2', label: 'Initial Deficit', type: 'number', section: 'Infiltration', precision: 3, min: 0, max: 1, helpText: 'Green-Ampt initial moisture deficit' },
  ];
}

function getSubcatchmentFields(infiltMethod?: string): FieldDef[] {
  return [
    { key: 'id', label: 'Name', type: 'readonly', section: 'General' },
    { key: 'rainGage', label: 'Rain Gage', type: 'text', section: 'General', required: true },
    { key: 'outlet', label: 'Outlet', type: 'text', section: 'General', required: true },
    { key: 'area', label: 'Area', type: 'number', unit: 'ac', section: 'Area/Geometry', precision: 2, min: 0, required: true },
    { key: 'width', label: 'Width', type: 'number', unit: 'ft', section: 'Area/Geometry', precision: 2, min: 0, required: true },
    { key: 'slope', label: '% Slope', type: 'number', unit: '%', section: 'Area/Geometry', precision: 2, min: 0, required: true },
    { key: 'curbLen', label: 'Curb Length', type: 'number', unit: 'ft', section: 'Area/Geometry', precision: 0, min: 0 },
    { key: 'pctImperv', label: '% Impervious', type: 'number', unit: '%', section: 'Imperviousness', precision: 1, min: 0, max: 100, required: true },
    { key: '_nImperv', label: 'N-Imperv (Manning)', type: 'number', section: 'Imperviousness', precision: 4, min: 0, step: 0.001 },
    { key: '_nPerv', label: 'N-Perv (Manning)', type: 'number', section: 'Imperviousness', precision: 4, min: 0, step: 0.001 },
    { key: '_sImperv', label: 'Dstore-Imperv', type: 'number', unit: 'in', section: 'Imperviousness', precision: 3, min: 0 },
    { key: '_sPerv', label: 'Dstore-Perv', type: 'number', unit: 'in', section: 'Imperviousness', precision: 3, min: 0 },
    { key: '_pctZero', label: '%Zero-Imperv', type: 'number', unit: '%', section: 'Imperviousness', precision: 1, min: 0, max: 100 },
    { key: '_routeTo', label: 'Subarea Routing', type: 'select', section: 'Subarea Routing', options: ['OUTLET', 'IMPERV', 'PERV'] },
    { key: '_pctRouted', label: '% Routed', type: 'number', unit: '%', section: 'Subarea Routing', precision: 1, min: 0, max: 100 },
    ...getInfiltrationFields(infiltMethod || 'GREEN_AMPT'),
    { key: 'snowPack', label: 'Snow Pack', type: 'text', section: 'Snow' },
    { key: '_groundwater', label: 'Groundwater', type: 'subdialog', section: 'Groundwater', subdialogType: 'groundwater' },
    { key: '_lidControls', label: 'LID Controls', type: 'subdialog', section: 'LID Controls', subdialogType: 'lidUsage' },
    { key: '_landUses', label: 'Land Uses', type: 'readonly', section: 'Land Uses' },
  ];
}

function getRaingageFields(): FieldDef[] {
  return [
    { key: 'id', label: 'Name', type: 'readonly', section: 'General' },
    { key: '_x', label: 'X-Coordinate', type: 'number', section: 'General', precision: 2 },
    { key: '_y', label: 'Y-Coordinate', type: 'number', section: 'General', precision: 2 },
    { key: 'format', label: 'Format', type: 'select', section: 'Rainfall', options: ['INTENSITY', 'VOLUME', 'CUMULATIVE'] },
    { key: 'interval', label: 'Interval', type: 'text', section: 'Rainfall' },
    { key: 'scf', label: 'Snow Catch Factor', type: 'number', section: 'Rainfall', precision: 3 },
    { key: 'sourceType', label: 'Data Source', type: 'select', section: 'Data Source', options: ['TIMESERIES', 'FILE'] },
    { key: 'sourceName', label: 'Series/File Name', type: 'subdialog', section: 'Data Source', subdialogType: 'timeSeries', visibleWhen: { field: 'sourceType', values: ['TIMESERIES'] } },
    { key: 'sourceName', label: 'File Name', type: 'text', section: 'Data Source', visibleWhen: { field: 'sourceType', values: ['FILE'] } },
    { key: 'stationId', label: 'Station ID', type: 'text', section: 'Data Source' },
    { key: 'units', label: 'Rain Units', type: 'text', section: 'Data Source' },
  ];
}

function getLabelFields(): FieldDef[] {
  return [
    { key: 'text', label: 'Text', type: 'text', section: 'General' },
    { key: 'x', label: 'X-Coordinate', type: 'number', section: 'General', precision: 2 },
    { key: 'y', label: 'Y-Coordinate', type: 'number', section: 'General', precision: 2 },
    { key: 'anchorNode', label: 'Anchor Node', type: 'text', section: 'General' },
    { key: 'size', label: 'Font Size', type: 'number', section: 'Appearance', precision: 0, min: 6 },
    { key: 'bold', label: 'Bold', type: 'boolean', section: 'Appearance' },
    { key: 'italic', label: 'Italic', type: 'boolean', section: 'Appearance' },
  ];
}

function getFieldsForType(objType: string, opts?: Record<string, string>): FieldDef[] {
  switch (objType) {
    case 'junction': return getJunctionFields();
    case 'outfall': return getOutfallFields();
    case 'storage': return getStorageFields();
    case 'divider': return getDividerFields();
    case 'conduit': return getConduitFields();
    case 'pump': return getPumpFields();
    case 'orifice': return getOrificeFields();
    case 'weir': return getWeirFields();
    case 'outlet': return getOutletFields();
    case 'subcatchment': return getSubcatchmentFields(opts?.['INFILTRATION'] || opts?.infiltration);
    case 'raingage': return getRaingageFields();
    case 'label': return getLabelFields();
    default: return [];
  }
}

function getObjectData(project: SwmmProject, objType: string, id: string): Record<string, any> | null {
  const coord = project.coordinates[id];
  const symbol = project.symbols[id];
  const pos = coord || symbol;

  switch (objType) {
    case 'junction': {
      const obj = project.junctions.find(j => j.id === id);
      return obj ? { ...obj, _x: pos?.[0] ?? 0, _y: pos?.[1] ?? 0 } : null;
    }
    case 'outfall': {
      const obj = project.outfalls.find(o => o.id === id);
      return obj ? { ...obj, _x: pos?.[0] ?? 0, _y: pos?.[1] ?? 0 } : null;
    }
    case 'storage': {
      const obj = project.storageUnits.find(s => s.id === id);
      return obj ? { ...obj, _x: pos?.[0] ?? 0, _y: pos?.[1] ?? 0 } : null;
    }
    case 'divider': {
      const obj = project.dividers.find(d => d.id === id);
      return obj ? { ...obj, _x: pos?.[0] ?? 0, _y: pos?.[1] ?? 0 } : null;
    }
    case 'conduit': {
      const obj = project.conduits.find(c => c.id === id);
      const xs = Array.isArray(project.xsections)
        ? project.xsections.find((x: any) => x.linkId === id)
        : project.xsections[id];
      const loss = project.losses[id];
      return obj ? {
        ...obj,
        _xsShape: xs?.shape || 'CIRCULAR',
        _xsGeom1: xs?.geom1 || 0,
        _xsGeom2: xs?.geom2 || 0,
        _xsGeom3: xs?.geom3 || 0,
        _xsGeom4: xs?.geom4 || 0,
        _xsBarrels: xs?.barrels || 1,
        _xsTransect: (xs as any)?.transect || '',
        _lossEntry: loss?.entryLoss ?? 0,
        _lossExit: loss?.exitLoss ?? 0,
        _lossAvg: loss?.avgLoss ?? 0,
        _lossFlapGate: loss?.flapGate ?? 'NO',
        _lossSeepage: loss?.seepageRate ?? 0,
      } : null;
    }
    case 'pump': {
      const obj = project.pumps.find(p => p.id === id);
      return obj || null;
    }
    case 'orifice': {
      const obj = project.orifices.find(o => o.id === id);
      return obj || null;
    }
    case 'weir': {
      const obj = project.weirs.find(w => w.id === id);
      return obj || null;
    }
    case 'outlet': {
      const obj = project.outlets.find(o => o.id === id);
      return obj || null;
    }
    case 'subcatchment': {
      const obj = project.subcatchments.find(s => s.id === id);
      const sa = project.subareas[id];
      const inf = project.infiltration[id];
      return obj ? {
        ...obj,
        _nImperv: sa?.nImperv ?? 0.01,
        _nPerv: sa?.nPerv ?? 0.1,
        _sImperv: sa?.sImperv ?? 0.05,
        _sPerv: sa?.sPerv ?? 0.05,
        _pctZero: sa?.pctZero ?? 25,
        _routeTo: sa?.routeTo ?? 'OUTLET',
        _pctRouted: sa?.pctRouted ?? 100,
        _infiltVal0: inf?.values?.[0] ?? 0,
        _infiltVal1: inf?.values?.[1] ?? 0,
        _infiltVal2: inf?.values?.[2] ?? 0,
      } : null;
    }
    case 'raingage': {
      const obj = project.raingages.find(r => r.id === id);
      return obj ? { ...obj, _x: pos?.[0] ?? 0, _y: pos?.[1] ?? 0 } : null;
    }
    case 'label': {
      const obj = project.labels.find(l => l.text === id || `${l.x},${l.y}` === id);
      return obj || null;
    }
    default: return null;
  }
}

const TYPE_LABELS: Record<string, string> = {
  junction: 'Junction',
  outfall: 'Outfall',
  storage: 'Storage Unit',
  divider: 'Divider',
  conduit: 'Conduit',
  pump: 'Pump',
  orifice: 'Orifice',
  weir: 'Weir',
  outlet: 'Outlet',
  subcatchment: 'Subcatchment',
  raingage: 'Rain Gage',
  label: 'Label',
};

const TYPE_COLORS: Record<string, string> = {
  junction: '#4a90c2',
  outfall: '#c05050',
  storage: '#3a8a3a',
  divider: '#9060c0',
  conduit: '#2c6eb5',
  pump: '#e88a1a',
  orifice: '#60a5fa',
  weir: '#d06040',
  outlet: '#8b5cf6',
  subcatchment: '#7092BE',
  raingage: '#06b6d4',
  label: '#6b6b7b',
};

interface PropertyEditorProps {
  project: SwmmProject;
  selectedObj: SelectedObject;
  onUpdateProject: (updater: (prev: SwmmProject) => SwmmProject) => void;
  onClose: () => void;
  onSubdialog?: (type: string, objId: string) => void;
  results?: any;
  timeStep?: number;
}

export default function PropertyEditor({ project, selectedObj, onUpdateProject, onClose, onSubdialog, results, timeStep }: PropertyEditorProps) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const objType = selectedObj?.objType || '';
  const objId = selectedObj?.id || '';

  const fields = useMemo(() => getFieldsForType(objType, project.options), [objType, project.options]);
  const data = useMemo(() => getObjectData(project, objType, objId), [project, objType, objId]);

  const sections = useMemo(() => {
    const secs: string[] = [];
    for (const f of fields) {
      if (!secs.includes(f.section)) secs.push(f.section);
    }
    return secs;
  }, [fields]);

  const toggleSection = useCallback((sec: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sec)) next.delete(sec); else next.add(sec);
      return next;
    });
  }, []);

  const handleFieldChange = useCallback((key: string, value: any) => {
    if (!selectedObj) return;

    onUpdateProject(prev => {
      const next = { ...prev };

      if (key === '_x' || key === '_y') {
        const coordKey = objType === 'raingage' ? 'symbols' : 'coordinates';
        const oldPos = (next as any)[coordKey][objId] || [0, 0];
        (next as any)[coordKey] = { ...(next as any)[coordKey], [objId]: key === '_x' ? [value, oldPos[1]] : [oldPos[0], value] };
        return next;
      }

      if (key.startsWith('_xs')) {
        const xsKey = key.replace('_xs', '').replace(/^(.)/, (_, c) => c.toLowerCase()) as string;
        const realKey = xsKey === 'shape' ? 'shape' : xsKey;
        if (Array.isArray(next.xsections)) {
          next.xsections = (next.xsections as any).map((xs: any) =>
            xs.linkId === objId ? { ...xs, [realKey]: value } : xs
          );
        } else {
          const existing = next.xsections[objId] || { linkId: objId, shape: 'CIRCULAR', geom1: 0, geom2: 0, geom3: 0, geom4: 0, barrels: 1 };
          next.xsections = { ...next.xsections, [objId]: { ...existing, [realKey]: value } };
        }
        return next;
      }

      if (key.startsWith('_loss') && (objType === 'conduit' || objType === 'pump' || objType === 'orifice' || objType === 'weir')) {
        const lossMap: Record<string, string> = {
          _lossEntry: 'entryLoss', _lossExit: 'exitLoss', _lossAvg: 'avgLoss',
          _lossFlapGate: 'flapGate', _lossSeepage: 'seepageRate',
        };
        const lossField = lossMap[key];
        if (lossField) {
          const existing = next.losses[objId] || { linkId: objId, entryLoss: 0, exitLoss: 0, avgLoss: 0, flapGate: 'NO', seepageRate: 0 };
          next.losses = { ...next.losses, [objId]: { ...existing, [lossField]: value } };
        }
        return next;
      }

      if (key.startsWith('_infil') && objType === 'subcatchment') {
        const idx = parseInt(key.replace('_infiltVal', ''));
        const existing = next.infiltration[objId] || { values: [0, 0, 0] };
        const vals = [...(existing.values || [0, 0, 0])];
        vals[idx] = value;
        next.infiltration = { ...next.infiltration, [objId]: { ...existing, values: vals } };
        return next;
      }

      if (key.startsWith('_') && objType === 'subcatchment') {
        const saKey = key.slice(1);
        const sa = next.subareas[objId] || { nImperv: 0.01, nPerv: 0.1, sImperv: 0.05, sPerv: 0.05, pctZero: 25, routeTo: 'OUTLET', pctRouted: 100 };
        next.subareas = { ...next.subareas, [objId]: { ...sa, [saKey]: value } };
        return next;
      }

      const arrays: Record<string, string> = {
        junction: 'junctions', outfall: 'outfalls', storage: 'storageUnits',
        divider: 'dividers', conduit: 'conduits', pump: 'pumps',
        orifice: 'orifices', weir: 'weirs', outlet: 'outlets',
        subcatchment: 'subcatchments', raingage: 'raingages',
      };
      const arrKey = arrays[objType];
      if (arrKey) {
        (next as any)[arrKey] = (next as any)[arrKey].map((item: any) =>
          item.id === objId ? { ...item, [key]: value } : item
        );
      }

      if (objType === 'label') {
        next.labels = next.labels.map(l =>
          (l.text === objId || `${l.x},${l.y}` === objId) ? { ...l, [key]: value } : l
        );
      }

      return next;
    });
  }, [selectedObj, objType, objId, onUpdateProject]);

  const xsData = useMemo((): XSection | null => {
    if (objType === 'conduit') {
      if (Array.isArray(project.xsections)) {
        return (project.xsections as any).find((x: any) => x.linkId === objId) || null;
      }
      return project.xsections[objId] || null;
    }
    return null;
  }, [project, objType, objId]);

  const resultInfo = useMemo(() => {
    if (!results || !results.timeSteps || !results.timeSteps[timeStep ?? 0]) return null;
    const ts = results.timeSteps[timeStep ?? 0];
    if (objType === 'junction' || objType === 'outfall' || objType === 'storage' || objType === 'divider') {
      const nr = ts.nodes[objId];
      if (!nr) return null;
      return [
        { label: 'Depth', value: nr.depth.toFixed(3), unit: 'ft', varKey: 'depth', scope: 'node' as const },
        { label: 'Head', value: nr.head.toFixed(3), unit: 'ft', varKey: 'head', scope: 'node' as const },
        { label: 'Volume', value: nr.volume.toFixed(3), unit: 'ft³', varKey: 'volume', scope: 'node' as const },
        { label: 'Lateral Inflow', value: nr.lateralInflow.toFixed(3), unit: 'CFS', varKey: 'lateralInflow', scope: 'node' as const },
        { label: 'Total Inflow', value: nr.totalInflow.toFixed(3), unit: 'CFS', varKey: 'totalInflow', scope: 'node' as const },
        { label: 'Flooding', value: nr.flooding.toFixed(3), unit: 'CFS', varKey: 'flooding', scope: 'node' as const },
      ];
    }
    if (objType === 'conduit' || objType === 'pump' || objType === 'orifice' || objType === 'weir' || objType === 'outlet') {
      const lr = ts.links[objId];
      if (!lr) return null;
      return [
        { label: 'Flow', value: lr.flow.toFixed(3), unit: 'CFS', varKey: 'flow', scope: 'link' as const },
        { label: 'Velocity', value: lr.velocity.toFixed(3), unit: 'ft/s', varKey: 'velocity', scope: 'link' as const },
        { label: 'Depth', value: lr.depth.toFixed(3), unit: 'ft', varKey: 'depth', scope: 'link' as const },
        { label: 'Volume', value: lr.volume.toFixed(3), unit: 'ft³', varKey: 'volume', scope: 'link' as const },
        { label: 'Capacity', value: lr.capacity.toFixed(3), unit: '', varKey: 'capacity', scope: 'link' as const },
      ];
    }
    if (objType === 'subcatchment') {
      const sr = ts.subcatchments[objId];
      if (!sr) return null;
      return [
        { label: 'Rainfall', value: sr.rainfall.toFixed(3), unit: 'in/hr', varKey: 'rainfall', scope: 'subcatch' as const },
        { label: 'Evaporation', value: sr.evap.toFixed(3), unit: 'in/hr', varKey: 'evap', scope: 'subcatch' as const },
        { label: 'Infiltration', value: sr.infiltration.toFixed(3), unit: 'in/hr', varKey: 'infiltration', scope: 'subcatch' as const },
        { label: 'Runoff', value: sr.runoff.toFixed(3), unit: 'CFS', varKey: 'runoff', scope: 'subcatch' as const },
      ];
    }
    return null;
  }, [results, timeStep, objType, objId]);

  if (!selectedObj || !data) {
    return (
      <div className="h-full flex items-center justify-center p-4" data-testid="property-editor-empty">
        <div className="text-center text-[#8a8a9a]">
          <MapPin className="w-6 h-6 mx-auto mb-2 opacity-40" />
          <p className="text-[10px]">Select an object on the map or Project Explorer to view properties</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" data-testid="property-editor">
      <div
        className="shrink-0 flex items-center justify-between px-2.5 py-1.5"
        style={{ backgroundColor: TYPE_COLORS[objType] || '#4a90c2', borderBottom: '1px solid rgba(0,0,0,0.15)' }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider">{TYPE_LABELS[objType] || objType}</span>
          <span className="text-[11px] font-bold text-white truncate">{objId}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="text-[8px] font-bold px-1.5 py-[1px] rounded bg-white/25 text-white tracking-wide"
            title={`Units: ${isSIProject(project) ? 'SI (Metric)' : 'US Customary'} — FLOW_UNITS = ${(project.options?.['FLOW_UNITS'] || 'CFS').toUpperCase()}`}
            data-testid="chip-units"
          >
            {isSIProject(project) ? 'SI' : 'US'} · {(project.options?.['FLOW_UNITS'] || 'CFS').toUpperCase()}
          </span>
          <button onClick={onClose} className="p-0.5 rounded hover:bg-white/20 transition-colors" data-testid="btn-close-property-editor">
            <X className="w-3.5 h-3.5 text-white/80" />
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="pb-2">
          {resultInfo && (
            <div className="border-b border-[#d0d0d8]">
              <div
                className="flex items-center gap-1 px-2.5 py-1.5 cursor-pointer bg-[#f0f4ff] hover:bg-[#e8eeff] transition-colors"
                onClick={() => toggleSection('__results')}
              >
                {collapsedSections.has('__results')
                  ? <ChevronRight className="w-3 h-3 text-[#2c6eb5]" />
                  : <ChevronDown className="w-3 h-3 text-[#2c6eb5]" />}
                <span className="text-[10px] font-bold text-[#2c6eb5]">Results @ Step {(timeStep ?? 0) + 1}</span>
              </div>
              {!collapsedSections.has('__results') && resultInfo.map(r => (
                <div key={r.label} className="flex items-center px-2.5 py-[3px] bg-[#f8f9ff]">
                  <span className="text-[9px] text-[#6b6b7b] w-[100px] truncate">{r.label}</span>
                  <span className="text-[9px] font-mono text-[#2a2a3e] flex-1">{r.value}</span>
                  {r.unit && <span className="text-[8px] text-[#9090a0] ml-1">{unitLabel(r.unit, project)}</span>}
                  <span className="ml-1"><ProvenanceBadge varKey={r.varKey} scope={r.scope} /></span>
                </div>
              ))}
            </div>
          )}

          {sections.map(sec => {
            const sFields = fields.filter(f => f.section === sec);
            const visibleFields = sFields.filter(f => {
              if (!f.visibleWhen) return true;
              const depVal = data[f.visibleWhen.field];
              return f.visibleWhen.values.includes(String(depVal ?? ''));
            });
            if (visibleFields.length === 0) return null;
            const isCollapsed = collapsedSections.has(sec);
            return (
              <div key={sec} className="border-b border-[#e8e8f0]">
                <div
                  className="flex items-center gap-1 px-2.5 py-1.5 cursor-pointer bg-[#f0f0f4] hover:bg-[#e8e8f0] transition-colors"
                  onClick={() => toggleSection(sec)}
                  data-testid={`section-${sec.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                >
                  {isCollapsed
                    ? <ChevronRight className="w-3 h-3 text-[#6b6b7b]" />
                    : <ChevronDown className="w-3 h-3 text-[#6b6b7b]" />}
                  <span className="text-[10px] font-semibold text-[#4a4a5a]">{sec}</span>
                </div>
                {!isCollapsed && visibleFields.map(field => (
                  <PropertyRow
                    key={`${field.key}-${field.label}`}
                    field={field.unit ? { ...field, unit: unitLabel(field.unit, project) } : field}
                    value={data[field.key]}
                    onChange={(val) => handleFieldChange(field.key, val)}
                    onSubdialogClick={field.type === 'subdialog' && field.subdialogType && onSubdialog ? () => {
                      const sdType = field.subdialogType!;
                      const refTypes = ['curve', 'timeSeries', 'pattern'];
                      const sdObjId = refTypes.includes(sdType) && data[field.key] ? String(data[field.key]) : objId;
                      onSubdialog(sdType, sdObjId);
                    } : undefined}
                  />
                ))}
              </div>
            );
          })}

          {xsData && (
            <div className="border-b border-[#e8e8f0]">
              <div className="px-2.5 py-2 bg-[#f8f8fa] flex justify-center">
                <CrossSectionSvg xs={xsData} size={120} />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function PropertyRow({ field, value, onChange, onSubdialogClick }: { field: FieldDef; value: any; onChange: (val: any) => void; onSubdialogClick?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState('');

  const displayVal = useMemo(() => {
    if (value === undefined || value === null) return '';
    if (field.type === 'boolean') return value ? 'YES' : 'NO';
    if (field.type === 'number' && typeof value === 'number' && field.precision !== undefined) {
      return value.toFixed(field.precision);
    }
    return String(value);
  }, [value, field]);

  const validationError = useMemo(() => {
    if (field.required && (value === undefined || value === null || value === '')) return 'Required';
    if (field.type === 'number' && value !== undefined && value !== null && value !== '') {
      const n = typeof value === 'number' ? value : parseFloat(String(value));
      if (isNaN(n)) return 'Must be a number';
      if (field.min !== undefined && n < field.min) return `Min: ${field.min}`;
      if (field.max !== undefined && n > field.max) return `Max: ${field.max}`;
    }
    return null;
  }, [value, field]);

  const handleStartEdit = () => {
    if (field.type === 'readonly' || field.type === 'subdialog') return;
    setEditVal(displayVal);
    setEditing(true);
  };

  const handleCommit = () => {
    setEditing(false);
    if (field.type === 'number') {
      const num = parseFloat(editVal);
      if (!isNaN(num)) {
        const clamped = field.min !== undefined && num < field.min ? field.min
          : field.max !== undefined && num > field.max ? field.max : num;
        onChange(clamped);
      }
    } else if (field.type === 'boolean') {
      onChange(editVal.toUpperCase() === 'YES' || editVal === 'true');
    } else {
      onChange(editVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCommit();
    if (e.key === 'Escape') setEditing(false);
  };

  const labelEl = (
    <span className="text-[9px] text-[#6b6b7b] w-[100px] truncate flex items-center gap-0.5" title={field.helpText || field.label}>
      {field.label}
      {field.required && <span className="text-red-500 text-[8px]">*</span>}
    </span>
  );

  const errorIndicator = validationError ? (
    <span className="text-[7px] text-red-500 ml-1 shrink-0" title={validationError}>!</span>
  ) : null;

  if (field.type === 'subdialog') {
    const sdDisplay = value && typeof value === 'string' && value !== 'NO' && value !== 'NONE' ? value : '[...]';
    return (
      <div className="flex items-center px-2.5 py-[3px] hover:bg-[#f0f4ff] transition-colors group" data-testid={`prop-${field.key}`}>
        {labelEl}
        <button
          className="flex-1 text-[9px] text-left font-mono text-[#2c6eb5] bg-[#f0f4ff] hover:bg-[#e0ecff] border border-[#d0d8e8] rounded px-1.5 py-0 h-[18px] cursor-pointer transition-colors"
          data-testid={`prop-subdialog-${field.key}`}
          onClick={() => onSubdialogClick?.()}
        >
          {sdDisplay}
        </button>
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <div className={`flex items-center px-2.5 py-[3px] hover:bg-[#f0f4ff] transition-colors group ${validationError ? 'bg-red-50/50' : ''}`} data-testid={`prop-${field.key}`}>
        {labelEl}
        <select
          className="flex-1 text-[9px] bg-transparent border-0 outline-none text-[#2a2a3e] cursor-pointer p-0 h-[18px] group-hover:bg-white/60 rounded px-0.5"
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          data-testid={`prop-select-${field.key}`}
        >
          {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        {field.unit && <span className="text-[8px] text-[#9090a0] ml-1 shrink-0">{field.unit}</span>}
        {errorIndicator}
      </div>
    );
  }

  if (field.type === 'boolean') {
    return (
      <div className="flex items-center px-2.5 py-[3px] hover:bg-[#f0f4ff] transition-colors" data-testid={`prop-${field.key}`}>
        {labelEl}
        <select
          className="flex-1 text-[9px] bg-transparent border-0 outline-none text-[#2a2a3e] cursor-pointer p-0 h-[18px]"
          value={value ? 'YES' : 'NO'}
          onChange={e => onChange(e.target.value === 'YES')}
          data-testid={`prop-bool-${field.key}`}
        >
          <option value="YES">YES</option>
          <option value="NO">NO</option>
        </select>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center px-2.5 py-[3px] transition-colors ${field.type === 'readonly' ? 'bg-[#fafafa]' : 'hover:bg-[#f0f4ff] cursor-text'} ${validationError ? 'bg-red-50/50' : ''}`}
      onClick={handleStartEdit}
      data-testid={`prop-${field.key}`}
    >
      {labelEl}
      {editing ? (
        <input
          autoFocus
          className={`flex-1 text-[9px] font-mono bg-white border rounded px-1 py-0 outline-none text-[#2a2a3e] h-[18px] ${validationError ? 'border-red-400' : 'border-[#2c6eb5]'}`}
          value={editVal}
          onChange={e => setEditVal(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={handleKeyDown}
          type="text"
          data-testid={`prop-input-${field.key}`}
        />
      ) : (
        <span className={`flex-1 text-[9px] font-mono truncate ${field.type === 'readonly' ? 'text-[#6b6b7b]' : 'text-[#2a2a3e]'}`}>
          {displayVal || '\u00A0'}
        </span>
      )}
      {field.unit && !editing && <span className="text-[8px] text-[#9090a0] ml-1 shrink-0">{field.unit}</span>}
      {errorIndicator}
    </div>
  );
}
