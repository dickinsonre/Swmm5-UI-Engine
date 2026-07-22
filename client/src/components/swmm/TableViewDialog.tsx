import { useState, useMemo, useCallback, useRef } from 'react';
import type { SwmmProject, SimulationResults } from '@/lib/swmm-types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table2, ArrowUpAZ, ArrowDownAZ, Copy, Columns3, AlignJustify, FileText, Filter, Printer, LineChart, BarChart3, ScatterChart, Activity, RefreshCw, X } from 'lucide-react';
import { LineChart as RLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ScatterChart as RScatterChart, Scatter } from 'recharts';
import ProvenanceBadge from './ProvenanceBadge';
import { SyntheticResultsLabel, SYNTHETIC_TEXT_HEADER } from './SyntheticWarning';
import type { VarScope } from '@/lib/swmm-variables';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: SwmmProject;
  results: SimulationResults | null;
  mode: 'byObject' | 'byVariable';
  onModeChange: (m: 'byObject' | 'byVariable') => void;
  timeStep: number;
}

type ObjCategory = 'node' | 'link' | 'subcatchment' | 'system';

const NODE_VARS = ['depth', 'head', 'volume', 'lateralInflow', 'totalInflow', 'flooding'] as const;
const NODE_VAR_LABELS: Record<string, string> = { depth: 'Depth', head: 'Head', volume: 'Volume', lateralInflow: 'Lat. Inflow', totalInflow: 'Tot. Inflow', flooding: 'Flooding' };
const LINK_VARS = ['flow', 'depth', 'velocity', 'volume', 'capacity'] as const;
const LINK_VAR_LABELS: Record<string, string> = { flow: 'Flow', depth: 'Depth', velocity: 'Velocity', volume: 'Volume', capacity: 'Capacity' };
const SUBCATCH_VARS = ['rainfall', 'snowDepth', 'evapLoss', 'infilLoss', 'runoff', 'gwOutflow', 'gwElev', 'soilMoisture'] as const;
const SUBCATCH_VAR_LABELS: Record<string, string> = { rainfall: 'Rainfall', snowDepth: 'Snow Depth', evapLoss: 'Evaporation', infilLoss: 'Infiltration', runoff: 'Runoff', gwOutflow: 'GW Flow', gwElev: 'GW Elev', soilMoisture: 'Soil Moisture' };
const SYSTEM_VARS = [
  'sysTemperature', 'sysRainfall', 'sysSnowDepth', 'sysInfil', 'sysRunoff', 'sysDWF', 'sysGWFlow',
  'sysRDII', 'sysExtFlow', 'sysTotalInflow', 'sysFlooding', 'sysOutflow', 'sysStorage', 'sysEvap',
  'sysPET', 'sysWindSpeed', 'sysSnowfall', 'sysSnowArea', 'sysFreeWater', 'sysColdContent',
  'sysSnowmelt', 'sysImelt', 'sysRainMelt', 'stepFlowError', 'sysCE', 'sysIterations', 'sysTimestep',
] as const;
const SYSTEM_VAR_LABELS: Record<string, string> = {
  sysTemperature: 'Temperature', sysRainfall: 'Rainfall', sysSnowDepth: 'Snow Depth',
  sysInfil: 'Infiltration', sysRunoff: 'Runoff', sysDWF: 'DWF', sysGWFlow: 'GW Flow',
  sysRDII: 'RDII', sysExtFlow: 'External Flow', sysTotalInflow: 'Total Inflow',
  sysFlooding: 'Flooding', sysOutflow: 'Outflow', sysStorage: 'Storage', sysEvap: 'Evaporation',
  sysPET: 'PET', sysWindSpeed: 'Wind Speed', sysSnowfall: 'Snowfall', sysSnowArea: 'Snow Area',
  sysFreeWater: 'Free Water', sysColdContent: 'Cold Content', sysSnowmelt: 'Snowmelt',
  sysImelt: 'Immed. Melt', sysRainMelt: 'Rain Melt', stepFlowError: 'Step Error',
  sysCE: 'Cont. Error', sysIterations: 'Iterations', sysTimestep: 'Timestep',
};

function getNodeIds(p: SwmmProject): string[] {
  return [
    ...p.junctions.map(j => j.id),
    ...p.outfalls.map(o => o.id),
    ...(p.dividers || []).map(d => d.id),
    ...p.storageUnits.map(s => s.id),
  ];
}
function getLinkIds(p: SwmmProject): string[] {
  return [
    ...p.conduits.map(c => c.id),
    ...p.pumps.map(pp => pp.id),
    ...p.orifices.map(o => o.id),
    ...p.weirs.map(w => w.id),
    ...p.outlets.map(o => o.id),
  ];
}
function getSubcatchIds(p: SwmmProject): string[] {
  return p.subcatchments.map(s => s.id);
}

function getResultValue(results: SimulationResults, category: ObjCategory, id: string, variable: string, step: number): string {
  if (!results.timeSteps || step >= results.timeSteps.length) return '\u2014';
  const ts = results.timeSteps[step];
  if (!ts) return '\u2014';
  if (category === 'system') {
    const sysVal = ts.system?.extended?.[variable];
    if (sysVal === undefined || sysVal === null) return '\u2014';
    return Number(sysVal).toFixed(3);
  }
  let obj: Record<string, number> | undefined;
  if (category === 'node') {
    obj = ts.nodes?.[id];
  } else if (category === 'link') {
    obj = ts.links?.[id];
  } else {
    obj = ts.subcatchments?.[id];
  }
  if (!obj) return '\u2014';
  const val = (obj as any)[variable];
  if (val === undefined || val === null) return '\u2014';
  return Number(val).toFixed(3);
}

function getNumericValue(results: SimulationResults, category: ObjCategory, id: string, variable: string, step: number): number {
  const s = getResultValue(results, category, id, variable, step);
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

type OverlayView = null | 'dataPlot' | 'frequencyPlot' | 'histogramPlot' | 'scatterPlot' | 'statistics' | 'filter';

function categoryToScope(cat: ObjCategory): VarScope {
  return cat === 'subcatchment' ? 'subcatch' : cat;
}

export default function TableViewDialog({ open, onOpenChange, project, results, mode, onModeChange, timeStep }: Props) {
  const [category, setCategory] = useState<ObjCategory>('node');
  const [selectedObj, setSelectedObj] = useState('');
  const [selectedVar, setSelectedVar] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [overlayView, setOverlayView] = useState<OverlayView>(null);
  const [filterText, setFilterText] = useState('');
  const [filterActive, setFilterActive] = useState(false);
  const [contextColKey, setContextColKey] = useState('');
  const tableRef = useRef<HTMLTableElement>(null);

  const ids = useMemo(() => {
    if (category === 'node') return getNodeIds(project);
    if (category === 'link') return getLinkIds(project);
    if (category === 'system') return ['System'];
    return getSubcatchIds(project);
  }, [project, category]);

  const vars = category === 'node' ? NODE_VARS : category === 'link' ? LINK_VARS : category === 'system' ? SYSTEM_VARS : SUBCATCH_VARS;
  const varLabels = category === 'node' ? NODE_VAR_LABELS : category === 'link' ? LINK_VAR_LABELS : category === 'system' ? SYSTEM_VAR_LABELS : SUBCATCH_VAR_LABELS;
  const timestamps = useMemo(() => {
    if (!results?.timeSteps) return [];
    return results.timeSteps.map(ts => ts.dateTime || `t=${ts.time}`);
  }, [results]);

  const handleContextMenu = useCallback((e: React.MouseEvent, colKey?: string) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).closest('.scroll-area-container')?.getBoundingClientRect() || { left: 0, top: 0 };
    setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (colKey) setContextColKey(colKey);
  }, []);

  const closeCtx = useCallback(() => setContextMenu(null), []);

  const handleSort = useCallback((dir: 'asc' | 'desc') => {
    setSortDir(dir);
    setSortCol(contextColKey || null);
    closeCtx();
  }, [contextColKey, closeCtx]);

  const handleCopy = useCallback(() => {
    closeCtx();
    if (!tableRef.current || !results) return;
    const rows: string[][] = [];
    const headerRow = tableRef.current.querySelectorAll('thead th');
    if (headerRow.length > 0) rows.push(Array.from(headerRow).map(th => th.textContent || ''));
    tableRef.current.querySelectorAll('tbody tr').forEach(tr => {
      rows.push(Array.from(tr.querySelectorAll('td')).map(td => td.textContent || ''));
    });
    const body = rows.map(r => r.join('\t')).join('\n');
    const text = results.engineUsed === 'mock' ? SYNTHETIC_TEXT_HEADER + body : body;
    navigator.clipboard.writeText(text).catch(() => {});
  }, [results, closeCtx]);

  const handleFitColumns = useCallback(() => {
    closeCtx();
    setColWidths({});
  }, [closeCtx]);

  const handlePrint = useCallback(() => {
    closeCtx();
    window.print();
  }, [closeCtx]);

  const byObjectSorted = useMemo(() => {
    if (mode !== 'byObject' || !results || !selectedObj) return null;
    let indices = timestamps.map((_, i) => i);
    if (sortCol && vars.includes(sortCol as any)) {
      indices.sort((a, b) => {
        const va = getNumericValue(results, category, selectedObj, sortCol, a);
        const vb = getNumericValue(results, category, selectedObj, sortCol, b);
        return sortDir === 'asc' ? va - vb : vb - va;
      });
    }
    if (filterActive && filterText) {
      const lower = filterText.toLowerCase();
      indices = indices.filter(i => {
        const ts = timestamps[i]?.toLowerCase() || '';
        if (ts.includes(lower)) return true;
        return vars.some(v => getResultValue(results, category, selectedObj, v, i).toLowerCase().includes(lower));
      });
    }
    return indices;
  }, [mode, results, selectedObj, timestamps, sortCol, sortDir, vars, category, filterActive, filterText]);

  const byVarSorted = useMemo(() => {
    if (mode !== 'byVariable' || !results || !selectedVar) return null;
    let sortedIds = [...ids];
    if (sortCol === selectedVar) {
      sortedIds.sort((a, b) => {
        const va = getNumericValue(results, category, a, selectedVar, timeStep);
        const vb = getNumericValue(results, category, b, selectedVar, timeStep);
        return sortDir === 'asc' ? va - vb : vb - va;
      });
    }
    if (filterActive && filterText) {
      const lower = filterText.toLowerCase();
      sortedIds = sortedIds.filter(id => id.toLowerCase().includes(lower) || getResultValue(results, category, id, selectedVar, timeStep).toLowerCase().includes(lower));
    }
    return sortedIds;
  }, [mode, results, selectedVar, ids, sortCol, sortDir, category, timeStep, filterActive, filterText]);

  const plotData = useMemo(() => {
    if (!results || mode !== 'byObject' || !selectedObj) return [];
    const varKey = contextColKey && vars.includes(contextColKey as any) ? contextColKey : vars[0];
    return timestamps.map((ts, i) => ({
      time: ts.replace(/^Day \d+,?\s*/, ''),
      idx: i,
      value: getNumericValue(results, category, selectedObj, varKey, i),
    }));
  }, [results, mode, selectedObj, contextColKey, vars, timestamps, category]);

  const statsData = useMemo(() => {
    if (!results || !selectedObj || mode !== 'byObject') return null;
    const varKey = contextColKey && vars.includes(contextColKey as any) ? contextColKey : vars[0];
    const values = timestamps.map((_, i) => getNumericValue(results, category, selectedObj, varKey, i));
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;
    const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
    const stddev = Math.sqrt(variance);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const median = sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 : sorted[Math.floor(sorted.length / 2)];
    const p10 = sorted[Math.floor(sorted.length * 0.1)];
    const p25 = sorted[Math.floor(sorted.length * 0.25)];
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    const skewness = values.reduce((a, v) => a + ((v - mean) / stddev) ** 3, 0) / values.length;
    return { variable: varLabels[varKey] || varKey, count: values.length, mean, stddev, min, max, median, p10, p25, p75, p90, skewness: isFinite(skewness) ? skewness : 0, sum };
  }, [results, selectedObj, mode, contextColKey, vars, timestamps, category, varLabels]);

  const freqData = useMemo(() => {
    if (!results || !selectedObj || mode !== 'byObject') return [];
    const varKey = contextColKey && vars.includes(contextColKey as any) ? contextColKey : vars[0];
    const values = timestamps.map((_, i) => getNumericValue(results, category, selectedObj, varKey, i));
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.map((v, i) => ({ value: v, exceedance: ((sorted.length - i) / sorted.length) * 100 }));
  }, [results, selectedObj, mode, contextColKey, vars, timestamps, category]);

  const histData = useMemo(() => {
    if (!results || !selectedObj || mode !== 'byObject') return [];
    const varKey = contextColKey && vars.includes(contextColKey as any) ? contextColKey : vars[0];
    const values = timestamps.map((_, i) => getNumericValue(results, category, selectedObj, varKey, i));
    if (values.length === 0) return [];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binCount = Math.min(20, Math.max(5, Math.ceil(Math.sqrt(values.length))));
    const binWidth = (max - min) / binCount || 1;
    const bins: { range: string; count: number }[] = [];
    for (let i = 0; i < binCount; i++) {
      const lo = min + i * binWidth;
      const hi = lo + binWidth;
      bins.push({ range: `${lo.toFixed(2)}`, count: values.filter(v => v >= lo && (i === binCount - 1 ? v <= hi : v < hi)).length });
    }
    return bins;
  }, [results, selectedObj, mode, contextColKey, vars, timestamps, category]);

  const scatterData = useMemo(() => {
    if (!results || !selectedObj || mode !== 'byObject' || vars.length < 2) return [];
    const xVar = vars[0];
    const yVar = contextColKey && vars.includes(contextColKey as any) && contextColKey !== vars[0] ? contextColKey : vars[1] || vars[0];
    return timestamps.map((_, i) => ({
      x: getNumericValue(results, category, selectedObj, xVar, i),
      y: getNumericValue(results, category, selectedObj, yVar, i),
    }));
  }, [results, selectedObj, mode, vars, contextColKey, timestamps, category]);

  if (!results) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md bg-white border-[#d0d0d8]" data-testid="table-view-dialog">
          <DialogHeader>
            <DialogTitle className="text-[#2c3e6b] flex items-center gap-2"><Table2 className="w-4 h-4" /> Table View</DialogTitle>
            <DialogDescription>Run a simulation first to view tabular results.</DialogDescription>
          </DialogHeader>
          <div className="py-8 text-center text-sm text-[#6b6b7b]">No simulation results available. Run a simulation first.</div>
        </DialogContent>
      </Dialog>
    );
  }

  const menuItems: { label: string; icon: any; action: () => void; separator?: boolean }[] = [
    { label: 'Sort Ascending', icon: ArrowUpAZ, action: () => handleSort('asc') },
    { label: 'Sort Descending', icon: ArrowDownAZ, action: () => handleSort('desc') },
    { label: 'Copy', icon: Copy, action: handleCopy, separator: true },
    { label: 'Format Column...', icon: Columns3, action: () => { closeCtx(); } },
    { label: 'Fit Column Width', icon: AlignJustify, action: handleFitColumns },
    { label: 'Format Report...', icon: FileText, action: () => { closeCtx(); } },
    { label: 'Filtering...', icon: Filter, action: () => { setOverlayView('filter'); closeCtx(); } },
    { label: 'Print...', icon: Printer, action: handlePrint, separator: true },
    { label: 'Data Plot...', icon: LineChart, action: () => { setOverlayView('dataPlot'); closeCtx(); } },
    { label: 'Data Frequency Plot...', icon: Activity, action: () => { setOverlayView('frequencyPlot'); closeCtx(); } },
    { label: 'Data Histogram Plot...', icon: BarChart3, action: () => { setOverlayView('histogramPlot'); closeCtx(); } },
    { label: 'Data Scatter Plot...', icon: ScatterChart, action: () => { setOverlayView('scatterPlot'); closeCtx(); } },
    { label: 'Data Statistics...', icon: Table2, action: () => { setOverlayView('statistics'); closeCtx(); }, separator: true },
    { label: 'Refresh', icon: RefreshCw, action: () => { closeCtx(); setSortCol(null); setFilterActive(false); setFilterText(''); } },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] bg-white border-[#d0d0d8] max-h-[90vh] overflow-hidden flex flex-col" data-testid="table-view-dialog">
        <DialogHeader>
          <DialogTitle className="text-[#2c3e6b] flex items-center gap-2">
            <Table2 className="w-4 h-4" /> Table — {mode === 'byObject' ? 'By Object' : 'By Variable'}
            {results.engineUsed === 'mock' && <SyntheticResultsLabel />}
          </DialogTitle>
          <DialogDescription>
            {mode === 'byObject' ? 'View all timesteps for a single object.' : 'View all objects for a single variable at the current timestep.'}
            {' '}Right-click table for more options.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            <Button variant={mode === 'byObject' ? 'default' : 'outline'} size="sm" className="text-[11px] h-7" onClick={() => onModeChange('byObject')} style={mode === 'byObject' ? { backgroundColor: '#2c6eb5' } : {}} data-testid="btn-table-by-object">By Object</Button>
            <Button variant={mode === 'byVariable' ? 'default' : 'outline'} size="sm" className="text-[11px] h-7" onClick={() => onModeChange('byVariable')} style={mode === 'byVariable' ? { backgroundColor: '#2c6eb5' } : {}} data-testid="btn-table-by-variable">By Variable</Button>
          </div>
          <Select value={category} onValueChange={v => { setCategory(v as ObjCategory); setSelectedObj(v === 'system' ? 'System' : ''); setSelectedVar(''); }}>
            <SelectTrigger className="h-7 text-[11px] w-32" data-testid="select-table-category"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="node">Nodes</SelectItem>
              <SelectItem value="link">Links</SelectItem>
              <SelectItem value="subcatchment">Subcatchments</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
          {mode === 'byObject' && category !== 'system' && (
            <Select value={selectedObj} onValueChange={setSelectedObj}>
              <SelectTrigger className="h-7 text-[11px] w-36" data-testid="select-table-object"><SelectValue placeholder="Select object..." /></SelectTrigger>
              <SelectContent>
                {ids.map(id => <SelectItem key={id} value={id}>{id}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {mode === 'byVariable' && (
            <Select value={selectedVar} onValueChange={setSelectedVar}>
              <SelectTrigger className="h-7 text-[11px] w-36" data-testid="select-table-variable"><SelectValue placeholder="Select variable..." /></SelectTrigger>
              <SelectContent>
                {vars.map(v => <SelectItem key={v} value={v}>{varLabels[v] || v}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {filterActive && (
            <div className="flex items-center gap-1 ml-auto">
              <Filter className="w-3 h-3 text-[#2c6eb5]" />
              <Input className="h-7 text-[11px] w-28" placeholder="Filter..." value={filterText} onChange={e => setFilterText(e.target.value)} data-testid="input-table-filter" />
              <button onClick={() => { setFilterActive(false); setFilterText(''); }} className="text-[#9090a0] hover:text-[#d04040]" data-testid="btn-clear-filter"><X className="w-3 h-3" /></button>
            </div>
          )}
        </div>

        <div className="relative flex-1 min-h-0 scroll-area-container">
          <ScrollArea className="h-full border border-[#e0e0e8] rounded">
            {mode === 'byObject' && selectedObj && byObjectSorted ? (
              <table ref={tableRef} className="w-full text-[11px]" onContextMenu={e => handleContextMenu(e)}>
                <thead className="sticky top-0 bg-[#f0f0f4] z-10">
                  <tr>
                    <th className="text-left px-2 py-1.5 border-b border-[#d0d0d8] font-semibold text-[#2c3e6b] cursor-pointer select-none"
                      style={colWidths['time'] ? { width: colWidths['time'] } : {}}
                      onClick={() => { setSortCol(null); }}
                      onContextMenu={e => handleContextMenu(e, 'time')}
                      data-testid="th-time">
                      Days-Hour {sortCol === null && ''}
                    </th>
                    {vars.map(v => (
                      <th key={v} className="text-right px-2 py-1.5 border-b border-[#d0d0d8] font-semibold text-[#2c3e6b] cursor-pointer select-none hover:bg-[#e0e8f0]"
                        style={colWidths[v] ? { width: colWidths[v] } : {}}
                        onClick={() => { setSortCol(v); setSortDir(prev => sortCol === v ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'); }}
                        onContextMenu={e => handleContextMenu(e, v)}
                        data-testid={`th-${v}`}>
                        <span className="inline-flex items-center gap-1">
                          {varLabels[v] || v}
                          <ProvenanceBadge varKey={v} scope={categoryToScope(category)} />
                        </span>
                        {sortCol === v && <span className="ml-1 text-[9px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byObjectSorted.map((idx, row) => (
                    <tr key={idx} className={row % 2 === 0 ? 'bg-white' : 'bg-[#fafafe]'} style={idx === timeStep ? { backgroundColor: '#e8f0ff' } : {}}
                      onContextMenu={e => handleContextMenu(e)}>
                      <td className="px-2 py-1 border-b border-[#f0f0f4] font-mono">{timestamps[idx]}</td>
                      {vars.map(v => <td key={v} className="text-right px-2 py-1 border-b border-[#f0f0f4] font-mono">{getResultValue(results, category, selectedObj, v, idx)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : mode === 'byVariable' && selectedVar && byVarSorted ? (
              <table ref={tableRef} className="w-full text-[11px]" onContextMenu={e => handleContextMenu(e)}>
                <thead className="sticky top-0 bg-[#f0f0f4] z-10">
                  <tr>
                    <th className="text-left px-2 py-1.5 border-b border-[#d0d0d8] font-semibold text-[#2c3e6b]"
                      onContextMenu={e => handleContextMenu(e, 'id')}
                      data-testid="th-id">ID</th>
                    <th className="text-right px-2 py-1.5 border-b border-[#d0d0d8] font-semibold text-[#2c3e6b] cursor-pointer hover:bg-[#e0e8f0]"
                      onClick={() => { setSortCol(selectedVar); setSortDir(prev => sortCol === selectedVar ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'); }}
                      onContextMenu={e => handleContextMenu(e, selectedVar)}
                      data-testid={`th-${selectedVar}`}>
                      <span className="inline-flex items-center gap-1">
                        {varLabels[selectedVar] || selectedVar}
                        <ProvenanceBadge varKey={selectedVar} scope={categoryToScope(category)} />
                      </span>
                      {sortCol === selectedVar && <span className="ml-1 text-[9px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {byVarSorted.map((id, i) => (
                    <tr key={id} className={i % 2 === 0 ? 'bg-white' : 'bg-[#fafafe]'}
                      onContextMenu={e => handleContextMenu(e)}>
                      <td className="px-2 py-1 border-b border-[#f0f0f4] font-mono">{id}</td>
                      <td className="text-right px-2 py-1 border-b border-[#f0f0f4] font-mono">{getResultValue(results, category, id, selectedVar, timeStep)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-8 text-center text-sm text-[#6b6b7b]">
                {mode === 'byObject' ? 'Select an object to view its time series data.' : 'Select a variable to view across all objects.'}
              </div>
            )}
          </ScrollArea>

          {contextMenu && (
            <>
              <div className="fixed inset-0 z-[60]" onClick={closeCtx} onContextMenu={e => { e.preventDefault(); closeCtx(); }} />
              <div className="absolute z-[70] bg-white border border-[#c0c0cc] rounded-lg shadow-xl py-1 min-w-[200px]"
                style={{ left: Math.min(contextMenu.x, 300), top: Math.min(contextMenu.y, 200) }}
                data-testid="table-context-menu">
                {menuItems.map((item, i) => (
                  <div key={i}>
                    {item.separator && i > 0 && <div className="h-px bg-[#e0e0e8] my-1" />}
                    <button
                      className="w-full text-left px-3 py-1.5 text-[11px] text-[#2a2a3e] hover:bg-[#e8f0ff] flex items-center gap-2 transition-colors"
                      onClick={item.action}
                      data-testid={`ctx-${item.label.toLowerCase().replace(/[^a-z]/g, '-')}`}
                    >
                      <item.icon className="w-3.5 h-3.5 text-[#6b6b7b]" />
                      {item.label}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {overlayView && (
          <div className="border-t border-[#d0d0d8] pt-2 mt-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-[#2c3e6b]">
                {overlayView === 'dataPlot' && 'Data Plot'}
                {overlayView === 'frequencyPlot' && 'Data Frequency Plot'}
                {overlayView === 'histogramPlot' && 'Data Histogram Plot'}
                {overlayView === 'scatterPlot' && 'Data Scatter Plot'}
                {overlayView === 'statistics' && 'Data Statistics'}
                {overlayView === 'filter' && 'Filter Data'}
              </span>
              <button onClick={() => setOverlayView(null)} className="text-[#6b6b7b] hover:text-[#d04040]" data-testid="btn-close-overlay"><X className="w-4 h-4" /></button>
            </div>

            {overlayView === 'dataPlot' && (
              <div className="h-[200px]" data-testid="overlay-data-plot">
                <ResponsiveContainer width="100%" height="100%">
                  <RLineChart data={plotData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
                    <XAxis dataKey="idx" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="value" stroke="#2c6eb5" strokeWidth={1.5} dot={false} />
                  </RLineChart>
                </ResponsiveContainer>
              </div>
            )}

            {overlayView === 'frequencyPlot' && (
              <div className="h-[200px]" data-testid="overlay-freq-plot">
                <ResponsiveContainer width="100%" height="100%">
                  <RLineChart data={freqData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
                    <XAxis dataKey="value" tick={{ fontSize: 9 }} label={{ value: 'Value', fontSize: 9, position: 'insideBottom', offset: -3 }} />
                    <YAxis tick={{ fontSize: 9 }} label={{ value: '% Exceedance', fontSize: 9, angle: -90, position: 'insideLeft' }} />
                    <Tooltip contentStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="exceedance" stroke="#e88a1a" strokeWidth={1.5} dot={false} />
                  </RLineChart>
                </ResponsiveContainer>
              </div>
            )}

            {overlayView === 'histogramPlot' && (
              <div className="h-[200px]" data-testid="overlay-hist-plot">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={histData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
                    <XAxis dataKey="range" tick={{ fontSize: 8 }} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ fontSize: 10 }} />
                    <Bar dataKey="count" fill="#2c6eb5" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {overlayView === 'scatterPlot' && (
              <div className="h-[200px]" data-testid="overlay-scatter-plot">
                <ResponsiveContainer width="100%" height="100%">
                  <RScatterChart margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
                    <XAxis dataKey="x" type="number" tick={{ fontSize: 9 }} name={varLabels[vars[0]] || vars[0]} />
                    <YAxis dataKey="y" type="number" tick={{ fontSize: 9 }} name={varLabels[contextColKey] || contextColKey || (vars[1] || vars[0])} />
                    <Tooltip contentStyle={{ fontSize: 10 }} />
                    <Scatter data={scatterData} fill="#2c6eb5" />
                  </RScatterChart>
                </ResponsiveContainer>
              </div>
            )}

            {overlayView === 'statistics' && statsData && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-[11px]" data-testid="overlay-stats">
                {[
                  ['Variable', statsData.variable],
                  ['Count', String(statsData.count)],
                  ['Mean', statsData.mean.toFixed(4)],
                  ['Std Dev', statsData.stddev.toFixed(4)],
                  ['Min', statsData.min.toFixed(4)],
                  ['10th %ile', statsData.p10.toFixed(4)],
                  ['25th %ile', statsData.p25.toFixed(4)],
                  ['Median', statsData.median.toFixed(4)],
                  ['75th %ile', statsData.p75.toFixed(4)],
                  ['90th %ile', statsData.p90.toFixed(4)],
                  ['Max', statsData.max.toFixed(4)],
                  ['Skewness', statsData.skewness.toFixed(4)],
                  ['Sum', statsData.sum.toFixed(4)],
                ].map(([label, value]) => (
                  <div key={label} className="bg-[#f8f8fa] border border-[#e0e0e8] rounded px-2 py-1.5 text-center">
                    <div className="text-[9px] text-[#6b6b7b]">{label}</div>
                    <div className="font-mono font-semibold text-[#2a2a3e]">{value}</div>
                  </div>
                ))}
              </div>
            )}

            {overlayView === 'filter' && (
              <div className="flex items-center gap-2" data-testid="overlay-filter">
                <Input className="h-7 text-[11px] flex-1" placeholder="Type to filter rows..." value={filterText} onChange={e => setFilterText(e.target.value)} autoFocus data-testid="input-overlay-filter" />
                <Button size="sm" className="h-7 text-[10px] bg-[#2c6eb5] text-white" onClick={() => { setFilterActive(true); setOverlayView(null); }} data-testid="btn-apply-filter">Apply</Button>
                <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => { setFilterActive(false); setFilterText(''); setOverlayView(null); }} data-testid="btn-clear-filter-overlay">Clear</Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
