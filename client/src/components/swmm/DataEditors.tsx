import { useState, useCallback, useMemo, useRef } from 'react';
import type { SwmmProject, CurvePoint, TimeSeriesPoint, PatternData, Pollutant, LandUse, LidControl, Transect, SnowPack, DWFEntry, Groundwater, Street, Inlet } from '@/lib/swmm-types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Trash2, Download, Upload } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

interface DataEditorProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: SwmmProject;
  onUpdateProject: (updater: (prev: SwmmProject) => SwmmProject) => void;
  initialSection?: string;
  initialItem?: string;
}

const TABS = ['Time Series', 'Curves', 'Patterns', 'Controls', 'Pollutants', 'Land Uses', 'LID Controls', 'Evaporation', 'Aquifers', 'Transects', 'Snow Packs', 'Groundwater', 'DWF/Inflows', 'Treatment', 'Adjustments', 'Streets', 'Inlets'] as const;
type Tab = typeof TABS[number];

const SECTION_TAB_MAP: Record<string, Tab> = {
  TIMESERIES: 'Time Series', CURVES: 'Curves', PATTERNS: 'Patterns', CONTROLS: 'Controls',
  POLLUTANTS: 'Pollutants', LANDUSES: 'Land Uses', LID_CONTROLS: 'LID Controls',
  EVAPORATION: 'Evaporation', AQUIFERS: 'Aquifers', TRANSECTS: 'Transects',
  SNOWPACKS: 'Snow Packs', GROUNDWATER: 'Groundwater', DWF: 'DWF/Inflows',
  TREATMENT: 'Treatment', ADJUSTMENTS: 'Adjustments', STREETS: 'Streets', INLETS: 'Inlets',
};

export default function DataEditorDialog({ open, onOpenChange, project, onUpdateProject, initialSection, initialItem }: DataEditorProps) {
  const tabFromSection = (initialSection && SECTION_TAB_MAP[initialSection]) || 'Time Series';
  const [tab, setTab] = useState<Tab>(tabFromSection as Tab);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white border-[#d0d0d8] text-[#2a2a3e] max-w-3xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col" data-testid="data-editor-dialog">
        <DialogHeader>
          <DialogTitle className="text-[#2a2a3e]">Data Object Editor</DialogTitle>
          <DialogDescription className="text-[#6b6b7b]">Edit time series, curves, patterns, and other data objects</DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b border-[#d0d0d8] mb-2 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors border-b-2 whitespace-nowrap ${tab === t ? 'border-[#2c6eb5] text-[#2c6eb5]' : 'border-transparent text-[#6b6b7b] hover:text-[#2a2a3e]'}`}
              data-testid={`data-tab-${t.replace(/ /g, '-').toLowerCase()}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {tab === 'Time Series' && <TimeSeriesEditor project={project} onUpdateProject={onUpdateProject} initialItem={initialItem} />}
          {tab === 'Curves' && <CurvesEditor project={project} onUpdateProject={onUpdateProject} initialItem={initialItem} />}
          {tab === 'Patterns' && <PatternsEditor project={project} onUpdateProject={onUpdateProject} initialItem={initialItem} />}
          {tab === 'Controls' && <ControlsEditor project={project} onUpdateProject={onUpdateProject} />}
          {tab === 'Pollutants' && <PollutantsEditor project={project} onUpdateProject={onUpdateProject} />}
          {tab === 'Land Uses' && <LandUsesEditor project={project} onUpdateProject={onUpdateProject} />}
          {tab === 'LID Controls' && <LidControlsEditor project={project} onUpdateProject={onUpdateProject} />}
          {tab === 'Evaporation' && <EvaporationEditor project={project} onUpdateProject={onUpdateProject} />}
          {tab === 'Aquifers' && <AquifersEditor project={project} onUpdateProject={onUpdateProject} />}
          {tab === 'Transects' && <TransectsEditor project={project} onUpdateProject={onUpdateProject} />}
          {tab === 'Snow Packs' && <SnowPacksEditor project={project} onUpdateProject={onUpdateProject} />}
          {tab === 'Groundwater' && <GroundwaterEditor project={project} onUpdateProject={onUpdateProject} />}
          {tab === 'DWF/Inflows' && <DWFEditor project={project} onUpdateProject={onUpdateProject} />}
          {tab === 'Treatment' && <TreatmentEditor project={project} onUpdateProject={onUpdateProject} />}
          {tab === 'Adjustments' && <AdjustmentsEditor project={project} onUpdateProject={onUpdateProject} />}
          {tab === 'Streets' && <StreetsEditor project={project} onUpdateProject={onUpdateProject} />}
          {tab === 'Inlets' && <InletsEditor project={project} onUpdateProject={onUpdateProject} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TimeSeriesEditor({ project, onUpdateProject, initialItem }: { project: SwmmProject; onUpdateProject: (u: (p: SwmmProject) => SwmmProject) => void; initialItem?: string }) {
  const names = Object.keys(project.timeseries);
  const [selected, setSelected] = useState(initialItem && names.includes(initialItem) ? initialItem : names[0] || '');
  const [newName, setNewName] = useState('');
  const points = selected ? project.timeseries[selected] || [] : [];

  const addSeries = useCallback(() => {
    const name = newName.trim();
    if (!name || project.timeseries[name]) return;
    onUpdateProject(prev => ({ ...prev, timeseries: { ...prev.timeseries, [name]: [] } }));
    setSelected(name);
    setNewName('');
  }, [newName, project.timeseries, onUpdateProject]);

  const deleteSeries = useCallback(() => {
    if (!selected) return;
    onUpdateProject(prev => {
      const ts = { ...prev.timeseries };
      delete ts[selected];
      return { ...prev, timeseries: ts };
    });
    setSelected('');
  }, [selected, onUpdateProject]);

  const updatePoint = useCallback((idx: number, field: 'dateTime' | 'value', val: string) => {
    onUpdateProject(prev => {
      const pts = [...(prev.timeseries[selected] || [])];
      pts[idx] = { ...pts[idx], [field]: field === 'value' ? parseFloat(val) || 0 : val };
      return { ...prev, timeseries: { ...prev.timeseries, [selected]: pts } };
    });
  }, [selected, onUpdateProject]);

  const addPoint = useCallback(() => {
    onUpdateProject(prev => {
      const pts = [...(prev.timeseries[selected] || []), { dateTime: '0', value: 0 }];
      return { ...prev, timeseries: { ...prev.timeseries, [selected]: pts } };
    });
  }, [selected, onUpdateProject]);

  const removePoint = useCallback((idx: number) => {
    onUpdateProject(prev => {
      const pts = (prev.timeseries[selected] || []).filter((_, i) => i !== idx);
      return { ...prev, timeseries: { ...prev.timeseries, [selected]: pts } };
    });
  }, [selected, onUpdateProject]);

  const chartData = useMemo(() => points.map((p, i) => ({ x: i, label: p.dateTime, value: p.value })), [points]);

  return (
    <div className="flex gap-3 h-[420px]" data-testid="ts-editor">
      <div className="w-[140px] shrink-0 border-r border-[#d0d0d8] pr-2">
        <div className="flex gap-1 mb-2">
          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New..." className="h-6 text-[10px] bg-white border-[#d0d0d8]" data-testid="ts-new-name" />
          <Button size="sm" onClick={addSeries} className="h-6 w-6 p-0 bg-[#2c6eb5] text-white" data-testid="ts-add"><Plus className="w-3 h-3" /></Button>
        </div>
        <ScrollArea className="h-[380px]">
          {names.map(n => (
            <button key={n} onClick={() => setSelected(n)}
              className={`w-full text-left px-2 py-1 text-[11px] rounded transition-colors ${selected === n ? 'bg-[#2c6eb5] text-white' : 'hover:bg-[#f0f0f4] text-[#2a2a3e]'}`}
              data-testid={`ts-item-${n}`}
            >{n}</button>
          ))}
        </ScrollArea>
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        {selected ? (
          <>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-[#3a5070]">{selected}</span>
              <span className="text-[10px] text-[#9090a0]">({points.length} points)</span>
              <Button size="sm" variant="ghost" onClick={deleteSeries} className="ml-auto h-6 text-[10px] text-red-500" data-testid="ts-delete"><Trash2 className="w-3 h-3 mr-1" />Delete</Button>
            </div>
            <div className="h-[140px] mb-2">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="value" stroke="#2c6eb5" dot={{ r: 2 }} strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <div className="flex items-center justify-center h-full text-xs text-[#9090a0]">No data points</div>}
            </div>
            <div className="flex-1 overflow-y-auto border border-[#d0d0d8] rounded">
              <table className="w-full text-[11px] border-collapse">
                <thead className="sticky top-0 bg-[#f0f0f4]">
                  <tr>
                    <th className="px-2 py-1 text-left text-[#6b6b7b] font-medium border-b border-[#d0d0d8] w-8">#</th>
                    <th className="px-2 py-1 text-left text-[#6b6b7b] font-medium border-b border-[#d0d0d8]">Date/Time</th>
                    <th className="px-2 py-1 text-left text-[#6b6b7b] font-medium border-b border-[#d0d0d8]">Value</th>
                    <th className="px-2 py-1 border-b border-[#d0d0d8] w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p, i) => (
                    <tr key={i} className={i % 2 === 0 ? '' : 'bg-[#fafafa]'}>
                      <td className="px-2 py-0.5 text-[#9090a0] border-b border-[#f0f0f4]">{i + 1}</td>
                      <td className="px-1 py-0.5 border-b border-[#f0f0f4]">
                        <Input value={p.dateTime} onChange={e => updatePoint(i, 'dateTime', e.target.value)} className="h-5 text-[10px] bg-white border-[#d0d0d8] px-1" data-testid={`ts-dt-${i}`} />
                      </td>
                      <td className="px-1 py-0.5 border-b border-[#f0f0f4]">
                        <Input type="number" value={p.value} onChange={e => updatePoint(i, 'value', e.target.value)} className="h-5 text-[10px] bg-white border-[#d0d0d8] px-1 font-mono" data-testid={`ts-val-${i}`} />
                      </td>
                      <td className="px-1 py-0.5 border-b border-[#f0f0f4]">
                        <button onClick={() => removePoint(i)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button size="sm" onClick={addPoint} className="mt-1 h-6 text-[10px] bg-[#2c6eb5] text-white self-start" data-testid="ts-add-point"><Plus className="w-3 h-3 mr-1" />Add Point</Button>
          </>
        ) : <div className="flex items-center justify-center h-full text-xs text-[#9090a0]">Select or create a time series</div>}
      </div>
    </div>
  );
}

function CurvesEditor({ project, onUpdateProject, initialItem }: { project: SwmmProject; onUpdateProject: (u: (p: SwmmProject) => SwmmProject) => void; initialItem?: string }) {
  const names = Object.keys(project.curves);
  const [selected, setSelected] = useState(initialItem && names.includes(initialItem) ? initialItem : names[0] || '');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('STORAGE');
  const points = selected ? project.curves[selected] || [] : [];
  const curveType = points[0]?.type || '';

  const addCurve = useCallback(() => {
    const name = newName.trim();
    if (!name || project.curves[name]) return;
    onUpdateProject(prev => ({ ...prev, curves: { ...prev.curves, [name]: [{ x: 0, y: 0, type: newType }] } }));
    setSelected(name);
    setNewName('');
  }, [newName, newType, project.curves, onUpdateProject]);

  const deleteCurve = useCallback(() => {
    if (!selected) return;
    onUpdateProject(prev => {
      const c = { ...prev.curves };
      delete c[selected];
      return { ...prev, curves: c };
    });
    setSelected('');
  }, [selected, onUpdateProject]);

  const updatePoint = useCallback((idx: number, field: 'x' | 'y', val: string) => {
    onUpdateProject(prev => {
      const pts = [...(prev.curves[selected] || [])];
      pts[idx] = { ...pts[idx], [field]: parseFloat(val) || 0 };
      return { ...prev, curves: { ...prev.curves, [selected]: pts } };
    });
  }, [selected, onUpdateProject]);

  const addPoint = useCallback(() => {
    onUpdateProject(prev => {
      const pts = [...(prev.curves[selected] || []), { x: 0, y: 0, type: curveType }];
      return { ...prev, curves: { ...prev.curves, [selected]: pts } };
    });
  }, [selected, curveType, onUpdateProject]);

  const removePoint = useCallback((idx: number) => {
    onUpdateProject(prev => {
      const pts = (prev.curves[selected] || []).filter((_, i) => i !== idx);
      return { ...prev, curves: { ...prev.curves, [selected]: pts } };
    });
  }, [selected, onUpdateProject]);

  const chartData = useMemo(() => points.map(p => ({ x: p.x, y: p.y })), [points]);

  return (
    <div className="flex gap-3 h-[420px]" data-testid="curves-editor">
      <div className="w-[140px] shrink-0 border-r border-[#d0d0d8] pr-2">
        <div className="space-y-1 mb-2">
          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name..." className="h-6 text-[10px] bg-white border-[#d0d0d8]" data-testid="curve-new-name" />
          <Select value={newType} onValueChange={setNewType}>
            <SelectTrigger className="h-6 text-[10px] bg-white border-[#d0d0d8]"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-white border-[#d0d0d8]">
              {['STORAGE', 'PUMP1', 'PUMP2', 'PUMP3', 'PUMP4', 'RATING', 'SHAPE', 'TIDAL', 'DIVERSION', 'CONTROL'].map(t =>
                <SelectItem key={t} value={t} className="text-[10px]">{t}</SelectItem>
              )}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={addCurve} className="h-6 w-full text-[10px] bg-[#2c6eb5] text-white" data-testid="curve-add"><Plus className="w-3 h-3 mr-1" />Add</Button>
        </div>
        <ScrollArea className="h-[340px]">
          {names.map(n => {
            const tp = project.curves[n]?.[0]?.type || '';
            return (
              <button key={n} onClick={() => setSelected(n)}
                className={`w-full text-left px-2 py-1 text-[11px] rounded transition-colors ${selected === n ? 'bg-[#2c6eb5] text-white' : 'hover:bg-[#f0f0f4] text-[#2a2a3e]'}`}
                data-testid={`curve-item-${n}`}
              >
                <div>{n}</div>
                {tp && <div className={`text-[9px] ${selected === n ? 'text-blue-200' : 'text-[#9090a0]'}`}>{tp}</div>}
              </button>
            );
          })}
        </ScrollArea>
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        {selected ? (
          <>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-[#3a5070]">{selected}</span>
              <span className="text-[10px] text-[#9090a0]">({curveType}, {points.length} pts)</span>
              <Button size="sm" variant="ghost" onClick={deleteCurve} className="ml-auto h-6 text-[10px] text-red-500" data-testid="curve-delete"><Trash2 className="w-3 h-3 mr-1" />Delete</Button>
            </div>
            <div className="h-[140px] mb-2">
              {chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
                    <XAxis dataKey="x" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="y" stroke="#2c6eb5" dot={{ r: 2 }} strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <div className="flex items-center justify-center h-full text-xs text-[#9090a0]">Add at least 2 points to see chart</div>}
            </div>
            <div className="flex-1 overflow-y-auto border border-[#d0d0d8] rounded">
              <table className="w-full text-[11px] border-collapse">
                <thead className="sticky top-0 bg-[#f0f0f4]">
                  <tr>
                    <th className="px-2 py-1 text-left text-[#6b6b7b] font-medium border-b border-[#d0d0d8] w-8">#</th>
                    <th className="px-2 py-1 text-left text-[#6b6b7b] font-medium border-b border-[#d0d0d8]">X</th>
                    <th className="px-2 py-1 text-left text-[#6b6b7b] font-medium border-b border-[#d0d0d8]">Y</th>
                    <th className="px-2 py-1 border-b border-[#d0d0d8] w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p, i) => (
                    <tr key={i} className={i % 2 === 0 ? '' : 'bg-[#fafafa]'}>
                      <td className="px-2 py-0.5 text-[#9090a0] border-b border-[#f0f0f4]">{i + 1}</td>
                      <td className="px-1 py-0.5 border-b border-[#f0f0f4]">
                        <Input type="number" value={p.x} onChange={e => updatePoint(i, 'x', e.target.value)} className="h-5 text-[10px] bg-white border-[#d0d0d8] px-1 font-mono" data-testid={`curve-x-${i}`} />
                      </td>
                      <td className="px-1 py-0.5 border-b border-[#f0f0f4]">
                        <Input type="number" value={p.y} onChange={e => updatePoint(i, 'y', e.target.value)} className="h-5 text-[10px] bg-white border-[#d0d0d8] px-1 font-mono" data-testid={`curve-y-${i}`} />
                      </td>
                      <td className="px-1 py-0.5 border-b border-[#f0f0f4]">
                        <button onClick={() => removePoint(i)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button size="sm" onClick={addPoint} className="mt-1 h-6 text-[10px] bg-[#2c6eb5] text-white self-start" data-testid="curve-add-point"><Plus className="w-3 h-3 mr-1" />Add Point</Button>
          </>
        ) : <div className="flex items-center justify-center h-full text-xs text-[#9090a0]">Select or create a curve</div>}
      </div>
    </div>
  );
}

function PatternsEditor({ project, onUpdateProject, initialItem }: { project: SwmmProject; onUpdateProject: (u: (p: SwmmProject) => SwmmProject) => void; initialItem?: string }) {
  const names = Object.keys(project.patterns);
  const [selected, setSelected] = useState(initialItem && names.includes(initialItem) ? initialItem : names[0] || '');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('MONTHLY');
  const pattern = selected ? project.patterns[selected] : null;

  const PERIOD_LABELS: Record<string, string[]> = {
    MONTHLY: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    DAILY: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    HOURLY: Array.from({ length: 24 }, (_, i) => `${i}:00`),
    WEEKEND: Array.from({ length: 24 }, (_, i) => `${i}:00`),
  };

  const addPattern = useCallback(() => {
    const name = newName.trim();
    if (!name || project.patterns[name]) return;
    const len = newType === 'MONTHLY' ? 12 : newType === 'DAILY' ? 7 : 24;
    onUpdateProject(prev => ({
      ...prev,
      patterns: { ...prev.patterns, [name]: { type: newType, multipliers: Array(len).fill(1.0) } }
    }));
    setSelected(name);
    setNewName('');
  }, [newName, newType, project.patterns, onUpdateProject]);

  const deletePattern = useCallback(() => {
    if (!selected) return;
    onUpdateProject(prev => {
      const p = { ...prev.patterns };
      delete p[selected];
      return { ...prev, patterns: p };
    });
    setSelected('');
  }, [selected, onUpdateProject]);

  const updateFactor = useCallback((idx: number, val: string) => {
    onUpdateProject(prev => {
      const p = prev.patterns[selected];
      if (!p) return prev;
      const multipliers = [...p.multipliers];
      multipliers[idx] = parseFloat(val) || 0;
      return { ...prev, patterns: { ...prev.patterns, [selected]: { ...p, multipliers } } };
    });
  }, [selected, onUpdateProject]);

  const labels = pattern ? PERIOD_LABELS[pattern.type] || [] : [];
  const chartData = pattern ? pattern.multipliers.map((f, i) => ({ name: labels[i] || `${i}`, factor: f })) : [];

  return (
    <div className="flex gap-3 h-[420px]" data-testid="patterns-editor">
      <div className="w-[140px] shrink-0 border-r border-[#d0d0d8] pr-2">
        <div className="space-y-1 mb-2">
          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name..." className="h-6 text-[10px] bg-white border-[#d0d0d8]" data-testid="pat-new-name" />
          <Select value={newType} onValueChange={setNewType}>
            <SelectTrigger className="h-6 text-[10px] bg-white border-[#d0d0d8]"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-white border-[#d0d0d8]">
              {['MONTHLY', 'DAILY', 'HOURLY', 'WEEKEND'].map(t => <SelectItem key={t} value={t} className="text-[10px]">{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={addPattern} className="h-6 w-full text-[10px] bg-[#2c6eb5] text-white" data-testid="pat-add"><Plus className="w-3 h-3 mr-1" />Add</Button>
        </div>
        <ScrollArea className="h-[340px]">
          {names.map(n => {
            const tp = project.patterns[n]?.type || '';
            return (
              <button key={n} onClick={() => setSelected(n)}
                className={`w-full text-left px-2 py-1 text-[11px] rounded transition-colors ${selected === n ? 'bg-[#2c6eb5] text-white' : 'hover:bg-[#f0f0f4] text-[#2a2a3e]'}`}
                data-testid={`pat-item-${n}`}
              >
                <div>{n}</div>
                {tp && <div className={`text-[9px] ${selected === n ? 'text-blue-200' : 'text-[#9090a0]'}`}>{tp}</div>}
              </button>
            );
          })}
        </ScrollArea>
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        {pattern ? (
          <>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-[#3a5070]">{selected}</span>
              <span className="text-[10px] text-[#9090a0]">({pattern.type})</span>
              <Button size="sm" variant="ghost" onClick={deletePattern} className="ml-auto h-6 text-[10px] text-red-500" data-testid="pat-delete"><Trash2 className="w-3 h-3 mr-1" />Delete</Button>
            </div>
            <div className="h-[160px] mb-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
                  <XAxis dataKey="name" tick={{ fontSize: 8 }} interval={0} angle={pattern.type === 'HOURLY' || pattern.type === 'WEEKEND' ? -45 : 0} />
                  <YAxis tick={{ fontSize: 9 }} />
                  <Tooltip contentStyle={{ fontSize: 10 }} />
                  <Bar dataKey="factor" fill="#2c6eb5" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 overflow-y-auto border border-[#d0d0d8] rounded">
              <table className="w-full text-[11px] border-collapse">
                <thead className="sticky top-0 bg-[#f0f0f4]">
                  <tr>
                    <th className="px-2 py-1 text-left text-[#6b6b7b] font-medium border-b border-[#d0d0d8]">Period</th>
                    <th className="px-2 py-1 text-left text-[#6b6b7b] font-medium border-b border-[#d0d0d8]">Multiplier</th>
                  </tr>
                </thead>
                <tbody>
                  {pattern.multipliers.map((f, i) => (
                    <tr key={i} className={i % 2 === 0 ? '' : 'bg-[#fafafa]'}>
                      <td className="px-2 py-0.5 border-b border-[#f0f0f4] text-[#3a5070] font-medium">{labels[i] || i}</td>
                      <td className="px-1 py-0.5 border-b border-[#f0f0f4]">
                        <Input type="number" step="0.01" value={f} onChange={e => updateFactor(i, e.target.value)} className="h-5 text-[10px] bg-white border-[#d0d0d8] px-1 font-mono w-24" data-testid={`pat-factor-${i}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : <div className="flex items-center justify-center h-full text-xs text-[#9090a0]">Select or create a pattern</div>}
      </div>
    </div>
  );
}

function ControlsEditor({ project, onUpdateProject }: { project: SwmmProject; onUpdateProject: (u: (p: SwmmProject) => SwmmProject) => void }) {
  const [text, setText] = useState(project.controls.join('\n'));

  const handleSave = useCallback(() => {
    onUpdateProject(prev => ({
      ...prev,
      controls: text.split('\n').filter(l => l.trim())
    }));
  }, [text, onUpdateProject]);

  const keywords = ['RULE', 'IF', 'THEN', 'ELSE', 'AND', 'OR', 'PRIORITY', 'END'];

  const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const highlighted = useMemo(() => {
    return text.split('\n').map((line, i) => {
      let html = escapeHtml(line);
      for (const kw of keywords) {
        const re = new RegExp(`\\b(${kw})\\b`, 'gi');
        html = html.replace(re, `<span style="color:#2c6eb5;font-weight:600">$1</span>`);
      }
      return html;
    });
  }, [text]);

  return (
    <div className="h-[420px] flex flex-col" data-testid="controls-editor">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold text-[#3a5070]">Control Rules</span>
        <span className="text-[10px] text-[#9090a0]">({project.controls.length} lines)</span>
        <Button size="sm" onClick={handleSave} className="ml-auto h-6 text-[10px] bg-[#2c6eb5] text-white" data-testid="controls-save">Apply Changes</Button>
      </div>
      <div className="flex-1 relative border border-[#d0d0d8] rounded overflow-hidden">
        <div className="absolute inset-0 p-2 pointer-events-none overflow-auto font-mono text-[11px] leading-5 whitespace-pre-wrap" aria-hidden="true">
          {highlighted.map((h, i) => <div key={i} dangerouslySetInnerHTML={{ __html: h || '&nbsp;' }} />)}
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          className="absolute inset-0 w-full h-full p-2 font-mono text-[11px] leading-5 bg-transparent text-transparent caret-[#2a2a3e] resize-none outline-none"
          spellCheck={false}
          data-testid="controls-textarea"
        />
      </div>
    </div>
  );
}

function PollutantsEditor({ project, onUpdateProject }: { project: SwmmProject; onUpdateProject: (u: (p: SwmmProject) => SwmmProject) => void }) {
  const [selected, setSelected] = useState(project.pollutants[0]?.id || '');
  const pollutant = project.pollutants.find(p => p.id === selected);

  const updateField = useCallback((field: string, value: string | number) => {
    onUpdateProject(prev => ({
      ...prev,
      pollutants: prev.pollutants.map(p => p.id === selected ? { ...p, [field]: value } : p)
    }));
  }, [selected, onUpdateProject]);

  const addPollutant = useCallback(() => {
    const id = `Pollut${project.pollutants.length + 1}`;
    onUpdateProject(prev => ({
      ...prev,
      pollutants: [...prev.pollutants, { id, units: 'MG/L', cRain: 0, cGW: 0, cRDII: 0, kDecay: 0, snowOnly: 'NO', coPollutant: '*', coFraction: 0, cDWF: 0, cInit: 0 } as Pollutant]
    }));
    setSelected(id);
  }, [project.pollutants.length, onUpdateProject]);

  const deletePollutant = useCallback(() => {
    if (!selected) return;
    onUpdateProject(prev => ({ ...prev, pollutants: prev.pollutants.filter(p => p.id !== selected) }));
    setSelected('');
  }, [selected, onUpdateProject]);

  return (
    <div className="flex gap-3 h-[400px]" data-testid="pollutants-editor">
      <div className="w-[140px] shrink-0 border-r border-[#d0d0d8] pr-2">
        <Button size="sm" onClick={addPollutant} className="h-6 w-full text-[10px] bg-[#2c6eb5] text-white mb-2" data-testid="poll-add"><Plus className="w-3 h-3 mr-1" />Add</Button>
        <ScrollArea className="h-[360px]">
          {project.pollutants.map(p => (
            <button key={p.id} onClick={() => setSelected(p.id)}
              className={`w-full text-left px-2 py-1 text-[11px] rounded transition-colors ${selected === p.id ? 'bg-[#2c6eb5] text-white' : 'hover:bg-[#f0f0f4] text-[#2a2a3e]'}`}
            >{p.id}</button>
          ))}
        </ScrollArea>
      </div>
      <div className="flex-1">
        {pollutant ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-[#3a5070]">{pollutant.id}</span>
              <Button size="sm" variant="ghost" onClick={deletePollutant} className="ml-auto h-6 text-[10px] text-red-500"><Trash2 className="w-3 h-3 mr-1" />Delete</Button>
            </div>
            {[
              { label: 'Units', field: 'units', type: 'select' as const, options: ['MG/L', 'UG/L', '#/L'] },
              { label: 'Rain Concentration', field: 'cRain', type: 'number' as const },
              { label: 'GW Concentration', field: 'cGW', type: 'number' as const },
              { label: 'I&I Concentration', field: 'cRDII', type: 'number' as const },
              { label: 'Decay Coefficient', field: 'kDecay', type: 'number' as const },
              { label: 'Snow Only', field: 'snowOnly', type: 'select' as const, options: ['YES', 'NO'] },
              { label: 'Co-Pollutant', field: 'coPollutant', type: 'text' as const },
              { label: 'Co-Fraction', field: 'coFraction', type: 'number' as const },
              { label: 'DWF Concentration', field: 'cDWF', type: 'number' as const },
              { label: 'Init. Concentration', field: 'cInit', type: 'number' as const },
            ].map(({ label, field, type, options }) => (
              <div key={field} className="flex items-center justify-between gap-2">
                <Label className="text-xs text-[#2a2a3e] w-[160px]">{label}</Label>
                {type === 'select' ? (
                  <Select value={(pollutant as any)[field]} onValueChange={v => updateField(field, v)}>
                    <SelectTrigger className="h-7 text-xs bg-white border-[#d0d0d8] w-[160px]"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-white border-[#d0d0d8]">
                      {options!.map(o => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={type}
                    value={(pollutant as any)[field]}
                    onChange={e => updateField(field, type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
                    className="h-7 text-xs bg-white border-[#d0d0d8] w-[160px]"
                  />
                )}
              </div>
            ))}
          </div>
        ) : <div className="flex items-center justify-center h-full text-xs text-[#9090a0]">Select or create a pollutant</div>}
      </div>
    </div>
  );
}

function LandUsesEditor({ project, onUpdateProject }: { project: SwmmProject; onUpdateProject: (u: (p: SwmmProject) => SwmmProject) => void }) {
  const [selected, setSelected] = useState(project.landuses[0]?.id || '');
  const landuse = project.landuses.find(l => l.id === selected);

  const addLandUse = useCallback(() => {
    const id = `LandUse${project.landuses.length + 1}`;
    onUpdateProject(prev => ({
      ...prev,
      landuses: [...prev.landuses, { id, sweepInterval: 0, sweepAvail: 0, sweepLast: 0 }]
    }));
    setSelected(id);
  }, [project.landuses.length, onUpdateProject]);

  const deleteLandUse = useCallback(() => {
    if (!selected) return;
    onUpdateProject(prev => ({ ...prev, landuses: prev.landuses.filter(l => l.id !== selected) }));
    setSelected('');
  }, [selected, onUpdateProject]);

  const updateField = useCallback((field: string, value: number) => {
    onUpdateProject(prev => ({
      ...prev,
      landuses: prev.landuses.map(l => l.id === selected ? { ...l, [field]: value } : l)
    }));
  }, [selected, onUpdateProject]);

  return (
    <div className="flex gap-3 h-[400px]" data-testid="landuses-editor">
      <div className="w-[140px] shrink-0 border-r border-[#d0d0d8] pr-2">
        <Button size="sm" onClick={addLandUse} className="h-6 w-full text-[10px] bg-[#2c6eb5] text-white mb-2"><Plus className="w-3 h-3 mr-1" />Add</Button>
        <ScrollArea className="h-[360px]">
          {project.landuses.map(l => (
            <button key={l.id} onClick={() => setSelected(l.id)}
              className={`w-full text-left px-2 py-1 text-[11px] rounded transition-colors ${selected === l.id ? 'bg-[#2c6eb5] text-white' : 'hover:bg-[#f0f0f4] text-[#2a2a3e]'}`}
            >{l.id}</button>
          ))}
        </ScrollArea>
      </div>
      <div className="flex-1">
        {landuse ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-[#3a5070]">{landuse.id}</span>
              <Button size="sm" variant="ghost" onClick={deleteLandUse} className="ml-auto h-6 text-[10px] text-red-500"><Trash2 className="w-3 h-3 mr-1" />Delete</Button>
            </div>
            {[
              { label: 'Sweep Interval (days)', field: 'sweepInterval' },
              { label: 'Sweep Fraction Available', field: 'sweepFraction' },
              { label: 'Last Swept (days)', field: 'lastSweep' },
            ].map(({ label, field }) => (
              <div key={field} className="flex items-center justify-between gap-2">
                <Label className="text-xs text-[#2a2a3e] w-[180px]">{label}</Label>
                <Input type="number" value={(landuse as any)[field]} onChange={e => updateField(field, parseFloat(e.target.value) || 0)} className="h-7 text-xs bg-white border-[#d0d0d8] w-[140px]" />
              </div>
            ))}
          </div>
        ) : <div className="flex items-center justify-center h-full text-xs text-[#9090a0]">Select or create a land use</div>}
      </div>
    </div>
  );
}

function LidControlsEditor({ project, onUpdateProject }: { project: SwmmProject; onUpdateProject: (u: (p: SwmmProject) => SwmmProject) => void }) {
  const [selected, setSelected] = useState(project.lidControls[0]?.id || '');
  const lid = project.lidControls.find(l => l.id === selected);
  const LID_TYPES = ['BC', 'RG', 'GR', 'IT', 'PP', 'RB', 'RD', 'VS'];
  const LID_TYPE_NAMES: Record<string, string> = { BC: 'Bio-Retention', RG: 'Rain Garden', GR: 'Green Roof', IT: 'Inf. Trench', PP: 'Perm. Pavement', RB: 'Rain Barrel', RD: 'Rooftop Disconnect', VS: 'Veg. Swale' };

  const addLid = useCallback(() => {
    const id = `LID${project.lidControls.length + 1}`;
    onUpdateProject(prev => ({
      ...prev,
      lidControls: [...prev.lidControls, { id, type: 'BC', layers: [] }]
    }));
    setSelected(id);
  }, [project.lidControls.length, onUpdateProject]);

  const deleteLid = useCallback(() => {
    if (!selected) return;
    onUpdateProject(prev => ({ ...prev, lidControls: prev.lidControls.filter(l => l.id !== selected) }));
    setSelected('');
  }, [selected, onUpdateProject]);

  const updateType = useCallback((type: string) => {
    onUpdateProject(prev => ({
      ...prev,
      lidControls: prev.lidControls.map(l => l.id === selected ? { ...l, type } : l)
    }));
  }, [selected, onUpdateProject]);

  return (
    <div className="flex gap-3 h-[400px]" data-testid="lid-editor">
      <div className="w-[140px] shrink-0 border-r border-[#d0d0d8] pr-2">
        <Button size="sm" onClick={addLid} className="h-6 w-full text-[10px] bg-[#2c6eb5] text-white mb-2"><Plus className="w-3 h-3 mr-1" />Add LID</Button>
        <ScrollArea className="h-[360px]">
          {project.lidControls.map(l => (
            <button key={l.id} onClick={() => setSelected(l.id)}
              className={`w-full text-left px-2 py-1 text-[11px] rounded transition-colors ${selected === l.id ? 'bg-[#2c6eb5] text-white' : 'hover:bg-[#f0f0f4] text-[#2a2a3e]'}`}
            >
              <div>{l.id}</div>
              <div className={`text-[9px] ${selected === l.id ? 'text-blue-200' : 'text-[#9090a0]'}`}>{LID_TYPE_NAMES[l.type] || l.type}</div>
            </button>
          ))}
        </ScrollArea>
      </div>
      <div className="flex-1">
        {lid ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-[#3a5070]">{lid.id}</span>
              <Button size="sm" variant="ghost" onClick={deleteLid} className="ml-auto h-6 text-[10px] text-red-500"><Trash2 className="w-3 h-3 mr-1" />Delete</Button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-[#2a2a3e] w-[120px]">LID Type</Label>
              <Select value={lid.type} onValueChange={updateType}>
                <SelectTrigger className="h-7 text-xs bg-white border-[#d0d0d8] w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-white border-[#d0d0d8]">
                  {LID_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{LID_TYPE_NAMES[t] || t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="border border-[#d0d0d8] rounded overflow-auto max-h-[280px]">
              <table className="w-full text-[11px] border-collapse">
                <thead className="sticky top-0 bg-[#f0f0f4]">
                  <tr>
                    <th className="px-2 py-1 text-left text-[#6b6b7b] font-medium border-b border-[#d0d0d8]">Layer</th>
                    <th className="px-2 py-1 text-left text-[#6b6b7b] font-medium border-b border-[#d0d0d8]">Parameters</th>
                    <th className="px-2 py-1 w-8 border-b border-[#d0d0d8]"></th>
                  </tr>
                </thead>
                <tbody>
                  {lid.layers.map((layer, i) => (
                    <tr key={i} className={i % 2 === 0 ? '' : 'bg-[#fafafa]'}>
                      <td className="px-2 py-0.5 border-b border-[#f0f0f4] font-medium">{layer[0] || ''}</td>
                      <td className="px-2 py-0.5 border-b border-[#f0f0f4]">
                        <Input className="h-5 text-[10px] font-mono border-0 bg-transparent p-0" value={layer.slice(1).join(' ')} onChange={e => {
                          const newLayer = [layer[0] || '', ...e.target.value.split(/\s+/).filter(Boolean)];
                          onUpdateProject(prev => ({ ...prev, lidControls: prev.lidControls.map(l => l.id === selected ? { ...l, layers: l.layers.map((ll, li) => li === i ? newLayer : ll) } : l) }));
                        }} data-testid={`lid-layer-${i}`} />
                      </td>
                      <td className="px-1 py-0.5 border-b border-[#f0f0f4]">
                        <button className="text-red-400 hover:text-red-600" onClick={() => onUpdateProject(prev => ({ ...prev, lidControls: prev.lidControls.map(l => l.id === selected ? { ...l, layers: l.layers.filter((_, li) => li !== i) } : l) }))} data-testid={`lid-layer-del-${i}`}><Trash2 className="w-3 h-3" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-1 mt-1">
              {['SURFACE', 'SOIL', 'PAVEMENT', 'STORAGE', 'DRAIN', 'DRAINMAT'].map(layerType => (
                <Button key={layerType} size="sm" variant="outline" className="h-5 text-[9px] px-1.5" onClick={() => {
                  const defaults: Record<string, string> = { SURFACE: 'SURFACE 0 0.0 0.1 1 5', SOIL: 'SOIL 6 0.5 0.2 0.1 10 3.5 2', PAVEMENT: 'PAVEMENT 6 0.15 0 100 0 0', STORAGE: 'STORAGE 12 0.75 0.5 0', DRAIN: 'DRAIN 0 0.5 6 6', DRAINMAT: 'DRAINMAT 3 0.4 0.1' };
                  const newLayer = (defaults[layerType] || `${layerType} 0`).split(/\s+/);
                  onUpdateProject(prev => ({ ...prev, lidControls: prev.lidControls.map(l => l.id === selected ? { ...l, layers: [...l.layers, newLayer] } : l) }));
                }} data-testid={`lid-add-${layerType.toLowerCase()}`}>{layerType}</Button>
              ))}
            </div>
          </div>
        ) : <div className="flex items-center justify-center h-full text-xs text-[#9090a0]">Select or create a LID control</div>}
      </div>
    </div>
  );
}

function EvaporationEditor({ project, onUpdateProject }: { project: SwmmProject; onUpdateProject: (u: (p: SwmmProject) => SwmmProject) => void }) {
  const evap = (project as any).evaporation || {};
  const [evapType, setEvapType] = useState(evap.type || 'CONSTANT');
  const [constRate, setConstRate] = useState(String(evap.rate ?? '0'));
  const [monthlyVals, setMonthlyVals] = useState<string[]>(
    evap.monthly || ['0','0','0','0','0','0','0','0','0','0','0','0']
  );
  const [dryOnly, setDryOnly] = useState(evap.dryOnly || 'NO');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const handleApply = useCallback(() => {
    onUpdateProject(prev => ({
      ...prev,
      evaporation: { type: evapType, rate: parseFloat(constRate) || 0, monthly: monthlyVals, dryOnly } as any,
      options: { ...prev.options, EVAPORATION: evapType === 'CONSTANT' ? constRate : evapType },
    }));
  }, [evapType, constRate, monthlyVals, dryOnly, onUpdateProject]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Label className="text-xs text-[#2a2a3e] w-24">Type</Label>
        <Select value={evapType} onValueChange={setEvapType}>
          <SelectTrigger className="h-7 text-xs flex-1" data-testid="evap-type"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="CONSTANT">Constant</SelectItem>
            <SelectItem value="MONTHLY">Monthly Averages</SelectItem>
            <SelectItem value="TIMESERIES">Time Series</SelectItem>
            <SelectItem value="TEMPERATURE">Temperature</SelectItem>
            <SelectItem value="FILE">Climate File</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {evapType === 'CONSTANT' && (
        <div className="flex items-center gap-2">
          <Label className="text-xs text-[#2a2a3e] w-24">Rate (in/day)</Label>
          <Input className="h-7 text-xs flex-1" type="number" value={constRate} onChange={e => setConstRate(e.target.value)} data-testid="evap-const-rate" />
        </div>
      )}
      {evapType === 'MONTHLY' && (
        <div className="grid grid-cols-4 gap-2">
          {months.map((m, i) => (
            <div key={m} className="flex items-center gap-1">
              <Label className="text-[10px] text-[#6b6b7b] w-8">{m}</Label>
              <Input className="h-6 text-[10px]" type="number" value={monthlyVals[i]} onChange={e => { const v = [...monthlyVals]; v[i] = e.target.value; setMonthlyVals(v); }} data-testid={`evap-month-${i}`} />
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-[#2a2a3e] w-24">Dry-Only</Label>
        <Select value={dryOnly} onValueChange={setDryOnly}>
          <SelectTrigger className="h-7 text-xs w-24" data-testid="evap-dry-only"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="NO">No</SelectItem>
            <SelectItem value="YES">Yes</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button size="sm" onClick={handleApply} className="bg-[#2c6eb5] text-white" data-testid="btn-evap-apply">Apply</Button>
    </div>
  );
}

function AquifersEditor({ project, onUpdateProject }: { project: SwmmProject; onUpdateProject: (u: (p: SwmmProject) => SwmmProject) => void }) {
  const aquifers = (project as any).aquifers || [];
  const [selected, setSelected] = useState('');
  const sel = aquifers.find((a: any) => a.name === selected);

  const addAquifer = useCallback(() => {
    const name = `Aq${aquifers.length + 1}`;
    onUpdateProject(prev => ({
      ...prev,
      aquifers: [...(prev as any).aquifers || [], { name, porosity: 0.5, wp: 0.15, fc: 0.3, ksat: 5, kslope: 10, tslope: 15, etu: 0.35, elu: 14, egw: 3.5, umc: 0.3, bottomEl: 0, waterTableEl: 10, unsatZoneMoisture: 0.3, pattern: '' }] as any,
    }));
    setSelected(name);
  }, [aquifers, onUpdateProject]);

  const updateField = useCallback((field: string, value: string) => {
    onUpdateProject(prev => ({
      ...prev,
      aquifers: ((prev as any).aquifers || []).map((a: any) => a.name === selected ? { ...a, [field]: isNaN(Number(value)) ? value : Number(value) } : a) as any,
    }));
  }, [selected, onUpdateProject]);

  const fields: [string, string][] = [
    ['porosity', 'Porosity'], ['wp', 'Wilting Point'], ['fc', 'Field Capacity'],
    ['ksat', 'Conductivity'], ['kslope', 'Conductivity Slope'], ['tslope', 'Tension Slope'],
    ['etu', 'Upper Evap Fraction'], ['elu', 'Lower Evap Depth'],
    ['egw', 'Lower GW Loss Rate'], ['bottomEl', 'Bottom Elev.'],
    ['waterTableEl', 'Water Table Elev.'], ['unsatZoneMoisture', 'Unsat. Zone Moisture'],
  ];

  return (
    <div className="flex gap-3 min-h-[350px]">
      <div className="w-36 border-r border-[#e0e0e8] pr-2">
        <Button size="sm" onClick={addAquifer} className="h-6 w-full text-[10px] bg-[#2c6eb5] text-white mb-2" data-testid="btn-add-aquifer"><Plus className="w-3 h-3 mr-1" />Add Aquifer</Button>
        <ScrollArea className="h-[300px]">
          {aquifers.map((a: any) => (
            <button key={a.name} onClick={() => setSelected(a.name)} className="block w-full text-left text-[11px] px-2 py-1 rounded transition-colors" style={{ backgroundColor: selected === a.name ? '#2c6eb5' : 'transparent', color: selected === a.name ? '#fff' : '#3a3a4a' }} data-testid={`aquifer-${a.name}`}>{a.name}</button>
          ))}
        </ScrollArea>
      </div>
      <div className="flex-1">
        {sel ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-[#2a2a3e] w-[140px]">Name</Label>
              <Input className="h-7 text-xs flex-1" value={sel.name} onChange={e => updateField('name', e.target.value)} data-testid="aquifer-name" />
            </div>
            {fields.map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <Label className="text-xs text-[#2a2a3e] w-[140px]">{label}</Label>
                <Input className="h-7 text-xs flex-1" type="number" value={sel[key] ?? ''} onChange={e => updateField(key, e.target.value)} data-testid={`aquifer-${key}`} />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Label className="text-xs text-[#2a2a3e] w-[140px]">Pattern</Label>
              <Input className="h-7 text-xs flex-1" value={sel.pattern || ''} onChange={e => updateField('pattern', e.target.value)} data-testid="aquifer-pattern" />
            </div>
          </div>
        ) : <div className="flex items-center justify-center h-full text-xs text-[#9090a0]">Select or create an aquifer</div>}
      </div>
    </div>
  );
}

type EditorProps = { project: SwmmProject; onUpdateProject: (u: (p: SwmmProject) => SwmmProject) => void };

function TransectsEditor({ project, onUpdateProject }: EditorProps) {
  const items = project.transects || [];
  const [selected, setSelected] = useState('');
  const sel = items.find(t => t.id === selected);

  const addItem = useCallback(() => {
    const id = `Transect${items.length + 1}`;
    onUpdateProject(prev => ({
      ...prev,
      transects: [...prev.transects, { id, stations: [{ x: 0, y: 10 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 15, y: 10 }], roughness: { left: 0.04, right: 0.04, channel: 0.025 }, bankStations: { left: 5, right: 10 }, modifiers: [] }],
    }));
    setSelected(id);
  }, [items, onUpdateProject]);

  const updateRoughness = useCallback((field: string, value: string) => {
    onUpdateProject(prev => ({
      ...prev,
      transects: prev.transects.map(t => t.id === selected ? { ...t, roughness: { ...t.roughness, [field]: Number(value) || 0 } } : t),
    }));
  }, [selected, onUpdateProject]);

  const updateBank = useCallback((field: string, value: string) => {
    onUpdateProject(prev => ({
      ...prev,
      transects: prev.transects.map(t => t.id === selected ? { ...t, bankStations: { ...t.bankStations, [field]: Number(value) || 0 } } : t),
    }));
  }, [selected, onUpdateProject]);

  const updateStation = useCallback((idx: number, field: 'x' | 'y', value: string) => {
    onUpdateProject(prev => ({
      ...prev,
      transects: prev.transects.map(t => {
        if (t.id !== selected) return t;
        const stations = [...t.stations];
        stations[idx] = { ...stations[idx], [field]: Number(value) || 0 };
        return { ...t, stations };
      }),
    }));
  }, [selected, onUpdateProject]);

  const addStation = useCallback(() => {
    if (!sel) return;
    const lastX = sel.stations.length > 0 ? sel.stations[sel.stations.length - 1].x + 5 : 0;
    onUpdateProject(prev => ({
      ...prev,
      transects: prev.transects.map(t => t.id === selected ? { ...t, stations: [...t.stations, { x: lastX, y: 0 }] } : t),
    }));
  }, [sel, selected, onUpdateProject]);

  const chartData = sel ? sel.stations.map(s => ({ x: s.x, y: s.y })) : [];

  return (
    <div className="flex gap-3 min-h-[350px]">
      <div className="w-36 border-r border-[#e0e0e8] pr-2">
        <Button size="sm" onClick={addItem} className="h-6 w-full text-[10px] bg-[#2c6eb5] text-white mb-2" data-testid="btn-add-transect"><Plus className="w-3 h-3 mr-1" />Add Transect</Button>
        <ScrollArea className="h-[300px]">
          {items.map(t => (
            <button key={t.id} onClick={() => setSelected(t.id)} className="block w-full text-left text-[11px] px-2 py-1 rounded transition-colors" style={{ backgroundColor: selected === t.id ? '#2c6eb5' : 'transparent', color: selected === t.id ? '#fff' : '#3a3a4a' }} data-testid={`transect-${t.id}`}>{t.id}</button>
          ))}
        </ScrollArea>
      </div>
      <div className="flex-1">
        {sel ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-[10px]">Left n</Label><Input className="h-7 text-xs" type="number" step={0.001} value={sel.roughness.left} onChange={e => updateRoughness('left', e.target.value)} data-testid="transect-n-left" /></div>
              <div><Label className="text-[10px]">Channel n</Label><Input className="h-7 text-xs" type="number" step={0.001} value={sel.roughness.channel} onChange={e => updateRoughness('channel', e.target.value)} data-testid="transect-n-channel" /></div>
              <div><Label className="text-[10px]">Right n</Label><Input className="h-7 text-xs" type="number" step={0.001} value={sel.roughness.right} onChange={e => updateRoughness('right', e.target.value)} data-testid="transect-n-right" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-[10px]">Left Bank Sta.</Label><Input className="h-7 text-xs" type="number" value={sel.bankStations.left} onChange={e => updateBank('left', e.target.value)} data-testid="transect-bank-left" /></div>
              <div><Label className="text-[10px]">Right Bank Sta.</Label><Input className="h-7 text-xs" type="number" value={sel.bankStations.right} onChange={e => updateBank('right', e.target.value)} data-testid="transect-bank-right" /></div>
            </div>
            <div className="h-[120px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
                  <XAxis dataKey="x" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} reversed />
                  <Tooltip contentStyle={{ fontSize: 10 }} />
                  <Line type="linear" dataKey="y" stroke="#2c6eb5" strokeWidth={2} dot={{ r: 3, fill: '#2c6eb5' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold text-[#2c3e6b]">Stations</span>
              <Button size="sm" variant="outline" className="h-5 text-[9px]" onClick={addStation} data-testid="btn-add-station"><Plus className="w-2.5 h-2.5 mr-0.5" />Add</Button>
            </div>
            <ScrollArea className="h-[100px]">
              <table className="w-full text-[10px]">
                <thead><tr><th className="text-left px-1">Station</th><th className="text-left px-1">Elevation</th></tr></thead>
                <tbody>
                  {sel.stations.map((s, i) => (
                    <tr key={i}><td className="px-1"><Input className="h-6 text-[10px]" type="number" value={s.x} onChange={e => updateStation(i, 'x', e.target.value)} /></td>
                    <td className="px-1"><Input className="h-6 text-[10px]" type="number" value={s.y} onChange={e => updateStation(i, 'y', e.target.value)} /></td></tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </div>
        ) : <div className="flex items-center justify-center h-full text-xs text-[#9090a0]">Select or create a transect</div>}
      </div>
    </div>
  );
}

function SnowPacksEditor({ project, onUpdateProject }: EditorProps) {
  const items = project.snowpacks || [];
  const [selected, setSelected] = useState('');
  const sel = items.find(s => s.id === selected);

  const addItem = useCallback(() => {
    const id = `SnowPack${items.length + 1}`;
    onUpdateProject(prev => ({
      ...prev,
      snowpacks: [...prev.snowpacks, { id, parameters: { PLOWABLE: [0.001, 0.001, 32, 0.1, 0, 0, 0], IMPERVIOUS: [0.001, 0.001, 32, 0.1, 0, 0, 0], PERVIOUS: [0.001, 0.001, 32, 0.1, 0, 0, 0], REMOVAL: [1, 0, 0, 0, 0, 0] } }],
    }));
    setSelected(id);
  }, [items, onUpdateProject]);

  const updateParam = useCallback((surface: string, idx: number, value: string) => {
    onUpdateProject(prev => ({
      ...prev,
      snowpacks: prev.snowpacks.map(s => {
        if (s.id !== selected) return s;
        const params = { ...s.parameters };
        const arr = [...(params[surface] || [])];
        arr[idx] = isNaN(Number(value)) ? value as any : Number(value);
        params[surface] = arr;
        return { ...s, parameters: params };
      }),
    }));
  }, [selected, onUpdateProject]);

  const surfaces = ['PLOWABLE', 'IMPERVIOUS', 'PERVIOUS'];
  const paramLabels = ['Min Melt Coeff', 'Max Melt Coeff', 'Base Temp', 'Fraction FWF', 'SD100', 'Init Depth', 'Init FWF'];

  return (
    <div className="flex gap-3 min-h-[350px]">
      <div className="w-36 border-r border-[#e0e0e8] pr-2">
        <Button size="sm" onClick={addItem} className="h-6 w-full text-[10px] bg-[#2c6eb5] text-white mb-2" data-testid="btn-add-snowpack"><Plus className="w-3 h-3 mr-1" />Add Snow Pack</Button>
        <ScrollArea className="h-[300px]">
          {items.map(s => (
            <button key={s.id} onClick={() => setSelected(s.id)} className="block w-full text-left text-[11px] px-2 py-1 rounded transition-colors" style={{ backgroundColor: selected === s.id ? '#2c6eb5' : 'transparent', color: selected === s.id ? '#fff' : '#3a3a4a' }} data-testid={`snowpack-${s.id}`}>{s.id}</button>
          ))}
        </ScrollArea>
      </div>
      <div className="flex-1">
        {sel ? (
          <ScrollArea className="h-[350px]">
            {surfaces.map(surface => (
              <div key={surface} className="mb-3">
                <h4 className="text-[10px] font-semibold text-[#2c3e6b] mb-1 uppercase">{surface}</h4>
                <div className="space-y-1">
                  {paramLabels.map((label, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Label className="text-[10px] w-[120px]">{label}</Label>
                      <Input className="h-6 text-[10px] flex-1" type="number" step={0.001} value={(sel.parameters[surface] || [])[i] ?? 0} onChange={e => updateParam(surface, i, e.target.value)} data-testid={`snow-${surface}-${i}`} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="mb-3">
              <h4 className="text-[10px] font-semibold text-[#2c3e6b] mb-1">REMOVAL</h4>
              {['Depth at which removal starts', 'Fraction transferred out', 'Fraction transferred to imperv', 'Fraction transferred to perv', 'Subcatchment for transfer', 'Fraction converted to immed. melt'].map((label, i) => (
                <div key={i} className="flex items-center gap-2 mb-1">
                  <Label className="text-[10px] w-[180px]">{label}</Label>
                  <Input className="h-6 text-[10px] flex-1" value={(sel.parameters.REMOVAL || [])[i] ?? ''} onChange={e => updateParam('REMOVAL', i, e.target.value)} data-testid={`snow-removal-${i}`} />
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : <div className="flex items-center justify-center h-full text-xs text-[#9090a0]">Select or create a snow pack</div>}
      </div>
    </div>
  );
}

function GroundwaterEditor({ project, onUpdateProject }: EditorProps) {
  const items = project.groundwater || [];
  const [selected, setSelected] = useState(0);
  const sel = items[selected];
  const subcatchIds = project.subcatchments.map(s => s.id);
  const aquiferIds = (project.aquifers || []).map((a: any) => a.id || a.name);
  const nodeIds = [...project.junctions.map(j => j.id), ...project.outfalls.map(o => o.id), ...project.storageUnits.map(s => s.id)];

  const addItem = useCallback(() => {
    const scId = subcatchIds.find(id => !items.some(g => g.subcatchId === id)) || subcatchIds[0] || 'S1';
    onUpdateProject(prev => ({
      ...prev,
      groundwater: [...prev.groundwater, { subcatchId: scId, aquiferId: aquiferIds[0] || '', nodeId: nodeIds[0] || '', surfElev: 0, a1: 0.001, b1: 1, a2: 0, b2: 1, a3: 0, fixedDepth: 0, threshold: 0, params: [] }],
    }));
    setSelected(items.length);
  }, [items, subcatchIds, aquiferIds, nodeIds, onUpdateProject]);

  const updateField = useCallback((field: string, value: string) => {
    onUpdateProject(prev => ({
      ...prev,
      groundwater: prev.groundwater.map((g, i) => i === selected ? { ...g, [field]: isNaN(Number(value)) ? value : Number(value) } : g),
    }));
  }, [selected, onUpdateProject]);

  const fields: [string, string][] = [
    ['subcatchId', 'Subcatchment'], ['aquiferId', 'Aquifer'], ['nodeId', 'Receiving Node'],
    ['surfElev', 'Surface Elev.'], ['a1', 'GW Flow Coeff (A1)'], ['b1', 'GW Flow Exponent (B1)'],
    ['a2', 'SW Flow Coeff (A2)'], ['b2', 'SW Flow Exponent (B2)'], ['a3', 'GW-SW Interaction (A3)'],
    ['fixedDepth', 'Fixed Surface Water Depth'], ['threshold', 'Threshold GW Elev.'],
  ];

  return (
    <div className="flex gap-3 min-h-[350px]">
      <div className="w-44 border-r border-[#e0e0e8] pr-2">
        <Button size="sm" onClick={addItem} className="h-6 w-full text-[10px] bg-[#2c6eb5] text-white mb-2" data-testid="btn-add-gw"><Plus className="w-3 h-3 mr-1" />Add GW Link</Button>
        <ScrollArea className="h-[300px]">
          {items.map((g, i) => (
            <button key={i} onClick={() => setSelected(i)} className="block w-full text-left text-[11px] px-2 py-1 rounded transition-colors" style={{ backgroundColor: selected === i ? '#2c6eb5' : 'transparent', color: selected === i ? '#fff' : '#3a3a4a' }} data-testid={`gw-${i}`}>{g.subcatchId} → {g.nodeId}</button>
          ))}
        </ScrollArea>
      </div>
      <div className="flex-1">
        {sel ? (
          <div className="space-y-2">
            {fields.map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <Label className="text-[10px] w-[160px]">{label}</Label>
                {key === 'subcatchId' ? (
                  <Select value={sel.subcatchId} onValueChange={v => updateField('subcatchId', v)}>
                    <SelectTrigger className="h-7 text-xs flex-1" data-testid="gw-subcatch"><SelectValue /></SelectTrigger>
                    <SelectContent>{subcatchIds.map(id => <SelectItem key={id} value={id}>{id}</SelectItem>)}</SelectContent>
                  </Select>
                ) : key === 'aquiferId' ? (
                  <Select value={sel.aquiferId} onValueChange={v => updateField('aquiferId', v)}>
                    <SelectTrigger className="h-7 text-xs flex-1" data-testid="gw-aquifer"><SelectValue /></SelectTrigger>
                    <SelectContent>{aquiferIds.map(id => <SelectItem key={id} value={id}>{id}</SelectItem>)}</SelectContent>
                  </Select>
                ) : key === 'nodeId' ? (
                  <Select value={sel.nodeId} onValueChange={v => updateField('nodeId', v)}>
                    <SelectTrigger className="h-7 text-xs flex-1" data-testid="gw-node"><SelectValue /></SelectTrigger>
                    <SelectContent>{nodeIds.map(id => <SelectItem key={id} value={id}>{id}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <Input className="h-7 text-xs flex-1" type="number" value={(sel as any)[key] ?? ''} onChange={e => updateField(key, e.target.value)} data-testid={`gw-${key}`} />
                )}
              </div>
            ))}
          </div>
        ) : <div className="flex items-center justify-center h-full text-xs text-[#9090a0]">Select or create a groundwater link</div>}
      </div>
    </div>
  );
}

function DWFEditor({ project, onUpdateProject }: EditorProps) {
  const items = project.dwf || [];
  const [selected, setSelected] = useState(0);
  const sel = items[selected];
  const nodeIds = [...project.junctions.map(j => j.id), ...project.outfalls.map(o => o.id), ...project.storageUnits.map(s => s.id)];
  const patternNames = Object.keys(project.patterns || {});

  const addItem = useCallback(() => {
    onUpdateProject(prev => ({
      ...prev,
      dwf: [...prev.dwf, { nodeId: nodeIds[0] || 'J1', constituent: 'FLOW', baseline: 0, patterns: ['', '', '', ''] }],
    }));
    setSelected(items.length);
  }, [items, nodeIds, onUpdateProject]);

  const updateField = useCallback((field: string, value: string) => {
    onUpdateProject(prev => ({
      ...prev,
      dwf: prev.dwf.map((d, i) => i === selected ? { ...d, [field]: field === 'baseline' ? Number(value) || 0 : value } : d),
    }));
  }, [selected, onUpdateProject]);

  const updatePattern = useCallback((idx: number, value: string) => {
    onUpdateProject(prev => ({
      ...prev,
      dwf: prev.dwf.map((d, i) => {
        if (i !== selected) return d;
        const patterns = [...d.patterns];
        while (patterns.length <= idx) patterns.push('');
        patterns[idx] = value;
        return { ...d, patterns };
      }),
    }));
  }, [selected, onUpdateProject]);

  const deleteItem = useCallback(() => {
    onUpdateProject(prev => ({ ...prev, dwf: prev.dwf.filter((_, i) => i !== selected) }));
    setSelected(Math.max(0, selected - 1));
  }, [selected, onUpdateProject]);

  const patternTypes = ['Monthly', 'Daily', 'Hourly', 'Weekend'];

  return (
    <div className="flex gap-3 min-h-[350px]">
      <div className="w-44 border-r border-[#e0e0e8] pr-2">
        <div className="flex gap-1 mb-2">
          <Button size="sm" onClick={addItem} className="h-6 flex-1 text-[10px] bg-[#2c6eb5] text-white" data-testid="btn-add-dwf"><Plus className="w-3 h-3 mr-0.5" />Add</Button>
          {items.length > 0 && <Button size="sm" variant="outline" onClick={deleteItem} className="h-6 text-[10px] border-[#d0d0d8]" data-testid="btn-del-dwf"><Trash2 className="w-3 h-3" /></Button>}
        </div>
        <ScrollArea className="h-[300px]">
          {items.map((d, i) => (
            <button key={i} onClick={() => setSelected(i)} className="block w-full text-left text-[11px] px-2 py-1 rounded transition-colors" style={{ backgroundColor: selected === i ? '#2c6eb5' : 'transparent', color: selected === i ? '#fff' : '#3a3a4a' }} data-testid={`dwf-${i}`}>{d.nodeId} — {d.constituent}</button>
          ))}
        </ScrollArea>
      </div>
      <div className="flex-1">
        {sel ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-[10px] w-[100px]">Node</Label>
              <Select value={sel.nodeId} onValueChange={v => updateField('nodeId', v)}>
                <SelectTrigger className="h-7 text-xs flex-1" data-testid="dwf-node"><SelectValue /></SelectTrigger>
                <SelectContent>{nodeIds.map(id => <SelectItem key={id} value={id}>{id}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-[10px] w-[100px]">Constituent</Label>
              <Select value={sel.constituent} onValueChange={v => updateField('constituent', v)}>
                <SelectTrigger className="h-7 text-xs flex-1" data-testid="dwf-constituent"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FLOW">FLOW</SelectItem>
                  {project.pollutants.map(p => <SelectItem key={p.id} value={p.id}>{p.id}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-[10px] w-[100px]">Baseline</Label>
              <Input className="h-7 text-xs flex-1" type="number" value={sel.baseline} onChange={e => updateField('baseline', e.target.value)} data-testid="dwf-baseline" />
            </div>
            <h4 className="text-[10px] font-semibold text-[#2c3e6b] mt-3">Time Patterns</h4>
            {patternTypes.map((pt, idx) => (
              <div key={pt} className="flex items-center gap-2">
                <Label className="text-[10px] w-[100px]">{pt}</Label>
                <Select value={(sel.patterns || [])[idx] || ''} onValueChange={v => updatePattern(idx, v)}>
                  <SelectTrigger className="h-7 text-xs flex-1" data-testid={`dwf-pattern-${idx}`}><SelectValue placeholder="(none)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value=" ">(none)</SelectItem>
                    {patternNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        ) : <div className="flex items-center justify-center h-full text-xs text-[#9090a0]">Select or create a dry weather flow entry</div>}
      </div>
    </div>
  );
}

function TreatmentEditor({ project, onUpdateProject }: EditorProps) {
  const raw = (project.rawSections?.TREATMENT || []) as string[];
  const [text, setText] = useState(raw.join('\n'));
  const nodeIds = [...project.junctions.map(j => j.id), ...project.outfalls.map(o => o.id), ...project.storageUnits.map(s => s.id)];
  const pollutantIds = project.pollutants.map(p => p.id);

  const save = useCallback(() => {
    const lines = text.split('\n').filter(l => l.trim());
    onUpdateProject(prev => ({
      ...prev,
      rawSections: { ...prev.rawSections, TREATMENT: lines },
    }));
  }, [text, onUpdateProject]);

  return (
    <div className="min-h-[350px] space-y-3">
      <div className="text-[10px] text-[#6b6b7b]">
        Format: <code className="bg-[#f0f0f4] px-1 rounded">NodeID PollutantID Result = Expression</code><br />
        Available functions: R (removal fraction), C (concentration), C0 (influent conc)
      </div>
      <div className="flex gap-2 text-[10px] text-[#6b6b7b]">
        <span>Nodes: {nodeIds.slice(0, 5).join(', ')}{nodeIds.length > 5 ? '...' : ''}</span>
        <span>Pollutants: {pollutantIds.join(', ') || '(none)'}</span>
      </div>
      <textarea
        className="w-full h-[250px] text-[11px] font-mono p-2 border border-[#d0d0d8] rounded resize-none"
        style={{ backgroundColor: '#fafafe' }}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="J1  TSS  R = 0.5 * (1 - EXP(-5*HRT))"
        spellCheck={false}
        data-testid="treatment-text"
      />
      <Button size="sm" onClick={save} className="bg-[#2c6eb5] text-white text-[10px] h-7" data-testid="btn-save-treatment">Apply Changes</Button>
    </div>
  );
}

function AdjustmentsEditor({ project, onUpdateProject }: EditorProps) {
  const raw = project.rawSections?.ADJUSTMENTS || [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const adjustTypes = ['TEMPERATURE', 'EVAPORATION', 'RAINFALL', 'CONDUCTIVITY'];

  const parseRow = (type: string): number[] => {
    const line = raw.find(l => l.trim().toUpperCase().startsWith(type));
    if (!line) return Array(12).fill(0);
    const parts = line.trim().split(/\s+/).slice(1);
    return Array.from({ length: 12 }, (_, i) => Number(parts[i]) || 0);
  };

  const [values, setValues] = useState<Record<string, number[]>>(() => {
    const result: Record<string, number[]> = {};
    for (const t of adjustTypes) result[t] = parseRow(t);
    return result;
  });

  const updateValue = useCallback((type: string, month: number, value: string) => {
    setValues(prev => {
      const arr = [...prev[type]];
      arr[month] = Number(value) || 0;
      return { ...prev, [type]: arr };
    });
  }, []);

  const save = useCallback(() => {
    const lines = adjustTypes.map(type => `${type}  ${values[type].join('  ')}`);
    onUpdateProject(prev => ({
      ...prev,
      rawSections: { ...prev.rawSections, ADJUSTMENTS: lines },
    }));
  }, [values, onUpdateProject]);

  return (
    <div className="min-h-[350px] space-y-3">
      <div className="text-[10px] text-[#6b6b7b]">Monthly adjustment factors for climatology parameters.</div>
      <ScrollArea className="h-[300px]">
        {adjustTypes.map(type => (
          <div key={type} className="mb-4">
            <h4 className="text-[10px] font-semibold text-[#2c3e6b] mb-1">{type}</h4>
            <div className="grid grid-cols-6 gap-1">
              {monthNames.map((m, i) => (
                <div key={m}>
                  <Label className="text-[9px] text-[#6b6b7b]">{m}</Label>
                  <Input className="h-6 text-[10px]" type="number" step={0.1} value={values[type][i]} onChange={e => updateValue(type, i, e.target.value)} data-testid={`adj-${type}-${i}`} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </ScrollArea>
      <Button size="sm" onClick={save} className="bg-[#2c6eb5] text-white text-[10px] h-7" data-testid="btn-save-adjustments">Apply Changes</Button>
    </div>
  );
}

function StreetsEditor({ project, onUpdateProject }: EditorProps) {
  const items = project.streets || [];
  const [selected, setSelected] = useState('');
  const sel = items.find(s => s.id === selected);
  const paramLabels = ['Tcrown (ft)', 'Hcurb (ft)', 'Sx', 'nRoad', 'a', 'W', 'Sides', 'Tback (ft)', 'Sback', 'nBack'];

  const addItem = useCallback(() => {
    const id = `Street${items.length + 1}`;
    onUpdateProject(prev => ({
      ...prev,
      streets: [...prev.streets, { id, params: ['40', '0.5', '0.04', '0.016', '0', '0', '2', '20', '0.02', '0.016'] }],
    }));
    setSelected(id);
  }, [items, onUpdateProject]);

  const updateParam = useCallback((idx: number, value: string) => {
    onUpdateProject(prev => ({
      ...prev,
      streets: prev.streets.map(s => {
        if (s.id !== selected) return s;
        const params = [...s.params];
        params[idx] = value;
        return { ...s, params };
      }),
    }));
  }, [selected, onUpdateProject]);

  return (
    <div className="flex gap-3 min-h-[350px]">
      <div className="w-36 border-r border-[#e0e0e8] pr-2">
        <Button size="sm" onClick={addItem} className="h-6 w-full text-[10px] bg-[#2c6eb5] text-white mb-2" data-testid="btn-add-street"><Plus className="w-3 h-3 mr-1" />Add Street</Button>
        <ScrollArea className="h-[300px]">
          {items.map(s => (
            <button key={s.id} onClick={() => setSelected(s.id)} className="block w-full text-left text-[11px] px-2 py-1 rounded transition-colors" style={{ backgroundColor: selected === s.id ? '#2c6eb5' : 'transparent', color: selected === s.id ? '#fff' : '#3a3a4a' }} data-testid={`street-${s.id}`}>{s.id}</button>
          ))}
        </ScrollArea>
      </div>
      <div className="flex-1">
        {sel ? (
          <div className="space-y-2">
            {paramLabels.map((label, i) => (
              <div key={i} className="flex items-center gap-2">
                <Label className="text-[10px] w-[120px]">{label}</Label>
                <Input className="h-7 text-xs flex-1" value={(sel.params || [])[i] ?? ''} onChange={e => updateParam(i, e.target.value)} data-testid={`street-param-${i}`} />
              </div>
            ))}
          </div>
        ) : <div className="flex items-center justify-center h-full text-xs text-[#9090a0]">Select or create a street cross-section</div>}
      </div>
    </div>
  );
}

function InletsEditor({ project, onUpdateProject }: EditorProps) {
  const items = project.inlets || [];
  const [selected, setSelected] = useState('');
  const sel = items.find(s => s.id === selected);
  const inletTypes = ['GRATE', 'CURB', 'SLOTTED', 'CUSTOM'];

  const addItem = useCallback(() => {
    const id = `Inlet${items.length + 1}`;
    onUpdateProject(prev => ({
      ...prev,
      inlets: [...prev.inlets, { id, type: 'GRATE', params: ['2', '2', 'P_BAR-50', ''] }],
    }));
    setSelected(id);
  }, [items, onUpdateProject]);

  const updateType = useCallback((value: string) => {
    onUpdateProject(prev => ({
      ...prev,
      inlets: prev.inlets.map(s => s.id === selected ? { ...s, type: value } : s),
    }));
  }, [selected, onUpdateProject]);

  const updateParam = useCallback((idx: number, value: string) => {
    onUpdateProject(prev => ({
      ...prev,
      inlets: prev.inlets.map(s => {
        if (s.id !== selected) return s;
        const params = [...s.params];
        params[idx] = value;
        return { ...s, params };
      }),
    }));
  }, [selected, onUpdateProject]);

  const getParamLabels = (type: string): string[] => {
    if (type === 'GRATE') return ['Length (ft)', 'Width (ft)', 'Grate Type', 'A-Open Frac'];
    if (type === 'CURB') return ['Length (ft)', 'Height (ft)', 'Throat Type'];
    if (type === 'SLOTTED') return ['Length (ft)', 'Width (ft)'];
    return ['Curve Name'];
  };

  return (
    <div className="flex gap-3 min-h-[350px]">
      <div className="w-36 border-r border-[#e0e0e8] pr-2">
        <Button size="sm" onClick={addItem} className="h-6 w-full text-[10px] bg-[#2c6eb5] text-white mb-2" data-testid="btn-add-inlet"><Plus className="w-3 h-3 mr-1" />Add Inlet</Button>
        <ScrollArea className="h-[300px]">
          {items.map(s => (
            <button key={s.id} onClick={() => setSelected(s.id)} className="block w-full text-left text-[11px] px-2 py-1 rounded transition-colors" style={{ backgroundColor: selected === s.id ? '#2c6eb5' : 'transparent', color: selected === s.id ? '#fff' : '#3a3a4a' }} data-testid={`inlet-${s.id}`}>{s.id} ({s.type})</button>
          ))}
        </ScrollArea>
      </div>
      <div className="flex-1">
        {sel ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-[10px] w-[100px]">Type</Label>
              <Select value={sel.type} onValueChange={updateType}>
                <SelectTrigger className="h-7 text-xs flex-1" data-testid="inlet-type"><SelectValue /></SelectTrigger>
                <SelectContent>{inletTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {getParamLabels(sel.type).map((label, i) => (
              <div key={i} className="flex items-center gap-2">
                <Label className="text-[10px] w-[100px]">{label}</Label>
                <Input className="h-7 text-xs flex-1" value={(sel.params || [])[i] ?? ''} onChange={e => updateParam(i, e.target.value)} data-testid={`inlet-param-${i}`} />
              </div>
            ))}
          </div>
        ) : <div className="flex items-center justify-center h-full text-xs text-[#9090a0]">Select or create an inlet</div>}
      </div>
    </div>
  );
}
