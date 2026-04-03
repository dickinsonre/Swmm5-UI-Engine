import { useState, useMemo, useCallback, useEffect } from 'react';
import type { SwmmProject, SelectedObject } from '@/lib/swmm-types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronDown, ChevronRight, X, MapPin } from 'lucide-react';
import { CrossSectionSvg } from './Panels';
import type { XSection } from '@/lib/swmm-types';

type FieldDef = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'boolean' | 'readonly';
  unit?: string;
  options?: string[];
  section: string;
  precision?: number;
  min?: number;
  step?: number;
};

function getJunctionFields(): FieldDef[] {
  return [
    { key: 'id', label: 'Name', type: 'readonly', section: 'General' },
    { key: '_x', label: 'X-Coordinate', type: 'number', section: 'General', precision: 2 },
    { key: '_y', label: 'Y-Coordinate', type: 'number', section: 'General', precision: 2 },
    { key: 'elevation', label: 'Invert Elevation', type: 'number', unit: 'ft', section: 'Hydraulic', precision: 2 },
    { key: 'maxDepth', label: 'Max Depth', type: 'number', unit: 'ft', section: 'Hydraulic', precision: 2, min: 0 },
    { key: 'initDepth', label: 'Initial Depth', type: 'number', unit: 'ft', section: 'Hydraulic', precision: 2, min: 0 },
    { key: 'surDepth', label: 'Surcharge Depth', type: 'number', unit: 'ft', section: 'Hydraulic', precision: 2, min: 0 },
    { key: 'aponded', label: 'Ponded Area', type: 'number', unit: 'ft²', section: 'Hydraulic', precision: 0, min: 0 },
  ];
}

function getOutfallFields(): FieldDef[] {
  return [
    { key: 'id', label: 'Name', type: 'readonly', section: 'General' },
    { key: '_x', label: 'X-Coordinate', type: 'number', section: 'General', precision: 2 },
    { key: '_y', label: 'Y-Coordinate', type: 'number', section: 'General', precision: 2 },
    { key: 'elevation', label: 'Invert Elevation', type: 'number', unit: 'ft', section: 'Hydraulic', precision: 2 },
    { key: 'type', label: 'Type', type: 'select', section: 'Hydraulic', options: ['FREE', 'NORMAL', 'FIXED', 'TIDAL', 'TIMESERIES'] },
    { key: 'stageData', label: 'Stage Data', type: 'text', section: 'Hydraulic' },
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
    { key: 'fromNode', label: 'From Node', type: 'text', section: 'General' },
    { key: 'toNode', label: 'To Node', type: 'text', section: 'General' },
    { key: 'length', label: 'Length', type: 'number', unit: 'ft', section: 'Geometry', precision: 2, min: 0 },
    { key: 'roughness', label: "Manning's N", type: 'number', section: 'Geometry', precision: 4, step: 0.001 },
    { key: 'inOffset', label: 'Inlet Offset', type: 'number', unit: 'ft', section: 'Geometry', precision: 2, min: 0 },
    { key: 'outOffset', label: 'Outlet Offset', type: 'number', unit: 'ft', section: 'Geometry', precision: 2, min: 0 },
    { key: '_xsShape', label: 'Shape', type: 'select', section: 'Cross-Section', options: ['CIRCULAR', 'RECT_OPEN', 'RECT_CLOSED', 'TRAPEZOIDAL', 'TRIANGULAR', 'HORIZ_ELLIPSE', 'VERT_ELLIPSE', 'ARCH', 'PARABOLIC', 'POWER', 'RECT_TRIANGULAR', 'RECT_ROUND', 'MOD_BASKETHANDLE', 'EGG', 'HORSESHOE', 'GOTHIC', 'CATENARY', 'SEMI_ELLIPTICAL', 'BASKETHANDLE', 'SEMI_CIRCULAR', 'IRREGULAR', 'CUSTOM', 'FORCE_MAIN'] },
    { key: '_xsGeom1', label: 'Max Depth', type: 'number', unit: 'ft', section: 'Cross-Section', precision: 2 },
    { key: '_xsGeom2', label: 'Geom2', type: 'number', section: 'Cross-Section', precision: 2 },
    { key: '_xsGeom3', label: 'Geom3', type: 'number', section: 'Cross-Section', precision: 2 },
    { key: '_xsGeom4', label: 'Geom4', type: 'number', section: 'Cross-Section', precision: 2 },
    { key: '_xsBarrels', label: 'Barrels', type: 'number', section: 'Cross-Section', precision: 0, min: 1 },
    { key: 'initFlow', label: 'Initial Flow', type: 'number', unit: 'CFS', section: 'Flow', precision: 2, min: 0 },
    { key: 'maxFlow', label: 'Max Flow', type: 'number', unit: 'CFS', section: 'Flow', precision: 2, min: 0 },
  ];
}

function getPumpFields(): FieldDef[] {
  return [
    { key: 'id', label: 'Name', type: 'readonly', section: 'General' },
    { key: 'fromNode', label: 'From Node', type: 'text', section: 'General' },
    { key: 'toNode', label: 'To Node', type: 'text', section: 'General' },
    { key: 'pumpCurve', label: 'Pump Curve', type: 'text', section: 'Pump' },
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
    { key: 'curveOrTable', label: 'Curve/Table', type: 'text', section: 'Outlet' },
  ];
}

function getSubcatchmentFields(): FieldDef[] {
  return [
    { key: 'id', label: 'Name', type: 'readonly', section: 'General' },
    { key: 'rainGage', label: 'Rain Gage', type: 'text', section: 'General' },
    { key: 'outlet', label: 'Outlet', type: 'text', section: 'General' },
    { key: 'area', label: 'Area', type: 'number', unit: 'ac', section: 'Area', precision: 2, min: 0 },
    { key: 'width', label: 'Width', type: 'number', unit: 'ft', section: 'Area', precision: 2, min: 0 },
    { key: 'slope', label: '% Slope', type: 'number', unit: '%', section: 'Area', precision: 2, min: 0 },
    { key: 'curbLen', label: 'Curb Length', type: 'number', unit: 'ft', section: 'Area', precision: 0, min: 0 },
    { key: 'pctImperv', label: '% Impervious', type: 'number', unit: '%', section: 'Imperviousness', precision: 1, min: 0 },
    { key: '_nImperv', label: 'N-Imperv', type: 'number', section: 'Imperviousness', precision: 4 },
    { key: '_nPerv', label: 'N-Perv', type: 'number', section: 'Imperviousness', precision: 4 },
    { key: '_sImperv', label: 'Dstore-Imperv', type: 'number', unit: 'in', section: 'Imperviousness', precision: 3 },
    { key: '_sPerv', label: 'Dstore-Perv', type: 'number', unit: 'in', section: 'Imperviousness', precision: 3 },
    { key: '_pctZero', label: '%Zero-Imperv', type: 'number', unit: '%', section: 'Imperviousness', precision: 1, min: 0 },
    { key: '_routeTo', label: 'Subarea Routing', type: 'select', section: 'Imperviousness', options: ['OUTLET', 'IMPERV', 'PERV'] },
    { key: 'snowPack', label: 'Snow Pack', type: 'text', section: 'Snow' },
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
    { key: 'sourceName', label: 'Series/File Name', type: 'text', section: 'Data Source' },
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

function getFieldsForType(objType: string): FieldDef[] {
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
    case 'subcatchment': return getSubcatchmentFields();
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
      const xs = project.xsections.find(x => x.linkId === id);
      return obj ? {
        ...obj,
        _xsShape: xs?.shape || 'CIRCULAR',
        _xsGeom1: xs?.geom1 || 0,
        _xsGeom2: xs?.geom2 || 0,
        _xsGeom3: xs?.geom3 || 0,
        _xsGeom4: xs?.geom4 || 0,
        _xsBarrels: xs?.barrels || 1,
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
      return obj ? {
        ...obj,
        _nImperv: sa?.nImperv ?? 0.01,
        _nPerv: sa?.nPerv ?? 0.1,
        _sImperv: sa?.sImperv ?? 0.05,
        _sPerv: sa?.sPerv ?? 0.05,
        _pctZero: sa?.pctZero ?? 25,
        _routeTo: sa?.routeTo ?? 'OUTLET',
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
  results?: any;
  timeStep?: number;
}

export default function PropertyEditor({ project, selectedObj, onUpdateProject, onClose, results, timeStep }: PropertyEditorProps) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const objType = selectedObj?.objType || '';
  const objId = selectedObj?.id || '';

  const fields = useMemo(() => getFieldsForType(objType), [objType]);
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
        next.xsections = next.xsections.map(xs =>
          xs.linkId === objId ? { ...xs, [realKey]: value } : xs
        );
        return next;
      }

      if (key.startsWith('_') && objType === 'subcatchment') {
        const saKey = key.slice(1);
        const sa = next.subareas[objId] || { nImperv: 0.01, nPerv: 0.1, sImperv: 0.05, sPerv: 0.05, pctZero: 25, routeTo: 'OUTLET' };
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
      return project.xsections.find(x => x.linkId === objId) || null;
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
        { label: 'Depth', value: nr.depth.toFixed(3), unit: 'ft' },
        { label: 'Head', value: nr.head.toFixed(3), unit: 'ft' },
        { label: 'Volume', value: nr.volume.toFixed(3), unit: 'ft³' },
        { label: 'Lateral Inflow', value: nr.lateralInflow.toFixed(3), unit: 'CFS' },
        { label: 'Total Inflow', value: nr.totalInflow.toFixed(3), unit: 'CFS' },
        { label: 'Flooding', value: nr.flooding.toFixed(3), unit: 'CFS' },
      ];
    }
    if (objType === 'conduit' || objType === 'pump' || objType === 'orifice' || objType === 'weir' || objType === 'outlet') {
      const lr = ts.links[objId];
      if (!lr) return null;
      return [
        { label: 'Flow', value: lr.flow.toFixed(3), unit: 'CFS' },
        { label: 'Velocity', value: lr.velocity.toFixed(3), unit: 'ft/s' },
        { label: 'Depth', value: lr.depth.toFixed(3), unit: 'ft' },
        { label: 'Volume', value: lr.volume.toFixed(3), unit: 'ft³' },
        { label: 'Capacity', value: lr.capacity.toFixed(3), unit: '' },
      ];
    }
    if (objType === 'subcatchment') {
      const sr = ts.subcatchments[objId];
      if (!sr) return null;
      return [
        { label: 'Rainfall', value: sr.rainfall.toFixed(3), unit: 'in/hr' },
        { label: 'Evaporation', value: sr.evap.toFixed(3), unit: 'in/hr' },
        { label: 'Infiltration', value: sr.infiltration.toFixed(3), unit: 'in/hr' },
        { label: 'Runoff', value: sr.runoff.toFixed(3), unit: 'CFS' },
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
        <button onClick={onClose} className="p-0.5 rounded hover:bg-white/20 transition-colors" data-testid="btn-close-property-editor">
          <X className="w-3.5 h-3.5 text-white/80" />
        </button>
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
                  {r.unit && <span className="text-[8px] text-[#9090a0] ml-1">{r.unit}</span>}
                </div>
              ))}
            </div>
          )}

          {sections.map(sec => {
            const sFields = fields.filter(f => f.section === sec);
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
                {!isCollapsed && sFields.map(field => (
                  <PropertyRow
                    key={field.key}
                    field={field}
                    value={data[field.key]}
                    onChange={(val) => handleFieldChange(field.key, val)}
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

function PropertyRow({ field, value, onChange }: { field: FieldDef; value: any; onChange: (val: any) => void }) {
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

  const handleStartEdit = () => {
    if (field.type === 'readonly') return;
    setEditVal(displayVal);
    setEditing(true);
  };

  const handleCommit = () => {
    setEditing(false);
    if (field.type === 'number') {
      const num = parseFloat(editVal);
      if (!isNaN(num)) onChange(num);
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

  if (field.type === 'select') {
    return (
      <div className="flex items-center px-2.5 py-[3px] hover:bg-[#f0f4ff] transition-colors group" data-testid={`prop-${field.key}`}>
        <span className="text-[9px] text-[#6b6b7b] w-[100px] truncate" title={field.label}>{field.label}</span>
        <select
          className="flex-1 text-[9px] bg-transparent border-0 outline-none text-[#2a2a3e] cursor-pointer p-0 h-[18px] group-hover:bg-white/60 rounded px-0.5"
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          data-testid={`prop-select-${field.key}`}
        >
          {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        {field.unit && <span className="text-[8px] text-[#9090a0] ml-1 shrink-0">{field.unit}</span>}
      </div>
    );
  }

  if (field.type === 'boolean') {
    return (
      <div className="flex items-center px-2.5 py-[3px] hover:bg-[#f0f4ff] transition-colors" data-testid={`prop-${field.key}`}>
        <span className="text-[9px] text-[#6b6b7b] w-[100px] truncate" title={field.label}>{field.label}</span>
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
      className={`flex items-center px-2.5 py-[3px] transition-colors ${field.type === 'readonly' ? 'bg-[#fafafa]' : 'hover:bg-[#f0f4ff] cursor-text'}`}
      onClick={handleStartEdit}
      data-testid={`prop-${field.key}`}
    >
      <span className="text-[9px] text-[#6b6b7b] w-[100px] truncate" title={field.label}>{field.label}</span>
      {editing ? (
        <input
          autoFocus
          className="flex-1 text-[9px] font-mono bg-white border border-[#2c6eb5] rounded px-1 py-0 outline-none text-[#2a2a3e] h-[18px]"
          value={editVal}
          onChange={e => setEditVal(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={handleKeyDown}
          type={field.type === 'number' ? 'text' : 'text'}
          data-testid={`prop-input-${field.key}`}
        />
      ) : (
        <span className={`flex-1 text-[9px] font-mono truncate ${field.type === 'readonly' ? 'text-[#6b6b7b]' : 'text-[#2a2a3e]'}`}>
          {displayVal || '\u00A0'}
        </span>
      )}
      {field.unit && !editing && <span className="text-[8px] text-[#9090a0] ml-1 shrink-0">{field.unit}</span>}
    </div>
  );
}
