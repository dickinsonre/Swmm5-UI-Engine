import { useState, useCallback, useMemo, useRef } from 'react';
import type { SwmmProject, CurvePoint, TimeSeriesPoint, PatternData, Pollutant, LandUse, LidControl } from '@/lib/swmm-types';
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

const TABS = ['Time Series', 'Curves', 'Patterns', 'Controls', 'Pollutants', 'Land Uses', 'LID Controls', 'Evaporation', 'Aquifers'] as const;
type Tab = typeof TABS[number];

export default function DataEditorDialog({ open, onOpenChange, project, onUpdateProject, initialSection, initialItem }: DataEditorProps) {
  const tabFromSection = initialSection === 'TIMESERIES' ? 'Time Series' :
    initialSection === 'CURVES' ? 'Curves' :
    initialSection === 'PATTERNS' ? 'Patterns' :
    initialSection === 'CONTROLS' ? 'Controls' :
    initialSection === 'POLLUTANTS' ? 'Pollutants' :
    initialSection === 'LANDUSES' ? 'Land Uses' :
    initialSection === 'LID_CONTROLS' ? 'LID Controls' :
    initialSection === 'EVAPORATION' ? 'Evaporation' :
    initialSection === 'AQUIFERS' ? 'Aquifers' : 'Time Series';
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
      patterns: { ...prev.patterns, [name]: { type: newType, factors: Array(len).fill(1.0) } }
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
      const factors = [...p.factors];
      factors[idx] = parseFloat(val) || 0;
      return { ...prev, patterns: { ...prev.patterns, [selected]: { ...p, factors } } };
    });
  }, [selected, onUpdateProject]);

  const labels = pattern ? PERIOD_LABELS[pattern.type] || [] : [];
  const chartData = pattern ? pattern.factors.map((f, i) => ({ name: labels[i] || `${i}`, factor: f })) : [];

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
                  {pattern.factors.map((f, i) => (
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

  const highlighted = useMemo(() => {
    return text.split('\n').map((line, i) => {
      let html = line;
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
      landuses: [...prev.landuses, { id, sweepInterval: 0, sweepFraction: 0, lastSweep: 0 } as LandUse]
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
  const [selected, setSelected] = useState(project.lidControls[0]?.name || '');
  const lid = project.lidControls.find(l => l.name === selected);
  const LID_TYPES = ['BC', 'RG', 'GR', 'IT', 'PP', 'RB', 'RD', 'VS'];
  const LID_TYPE_NAMES: Record<string, string> = { BC: 'Bio-Retention', RG: 'Rain Garden', GR: 'Green Roof', IT: 'Inf. Trench', PP: 'Perm. Pavement', RB: 'Rain Barrel', RD: 'Rooftop Disconnect', VS: 'Veg. Swale' };

  const addLid = useCallback(() => {
    const name = `LID${project.lidControls.length + 1}`;
    onUpdateProject(prev => ({
      ...prev,
      lidControls: [...prev.lidControls, { name, type: 'BC', layers: [] }]
    }));
    setSelected(name);
  }, [project.lidControls.length, onUpdateProject]);

  const deleteLid = useCallback(() => {
    if (!selected) return;
    onUpdateProject(prev => ({ ...prev, lidControls: prev.lidControls.filter(l => l.name !== selected) }));
    setSelected('');
  }, [selected, onUpdateProject]);

  const updateType = useCallback((type: string) => {
    onUpdateProject(prev => ({
      ...prev,
      lidControls: prev.lidControls.map(l => l.name === selected ? { ...l, type } : l)
    }));
  }, [selected, onUpdateProject]);

  return (
    <div className="flex gap-3 h-[400px]" data-testid="lid-editor">
      <div className="w-[140px] shrink-0 border-r border-[#d0d0d8] pr-2">
        <Button size="sm" onClick={addLid} className="h-6 w-full text-[10px] bg-[#2c6eb5] text-white mb-2"><Plus className="w-3 h-3 mr-1" />Add LID</Button>
        <ScrollArea className="h-[360px]">
          {project.lidControls.map(l => (
            <button key={l.name} onClick={() => setSelected(l.name)}
              className={`w-full text-left px-2 py-1 text-[11px] rounded transition-colors ${selected === l.name ? 'bg-[#2c6eb5] text-white' : 'hover:bg-[#f0f0f4] text-[#2a2a3e]'}`}
            >
              <div>{l.name}</div>
              <div className={`text-[9px] ${selected === l.name ? 'text-blue-200' : 'text-[#9090a0]'}`}>{LID_TYPE_NAMES[l.type] || l.type}</div>
            </button>
          ))}
        </ScrollArea>
      </div>
      <div className="flex-1">
        {lid ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-[#3a5070]">{lid.name}</span>
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
                      <td className="px-2 py-0.5 border-b border-[#f0f0f4] font-medium">{layer.split(/\s+/)[0]}</td>
                      <td className="px-2 py-0.5 border-b border-[#f0f0f4]">
                        <Input className="h-5 text-[10px] font-mono border-0 bg-transparent p-0" value={layer.split(/\s+/).slice(1).join(' ')} onChange={e => {
                          const layerName = layer.split(/\s+/)[0];
                          const newLayer = `${layerName} ${e.target.value}`;
                          onUpdateProject(prev => ({ ...prev, lidControls: prev.lidControls.map(l => l.name === selected ? { ...l, layers: l.layers.map((ll, li) => li === i ? newLayer : ll) } : l) }));
                        }} data-testid={`lid-layer-${i}`} />
                      </td>
                      <td className="px-1 py-0.5 border-b border-[#f0f0f4]">
                        <button className="text-red-400 hover:text-red-600" onClick={() => onUpdateProject(prev => ({ ...prev, lidControls: prev.lidControls.map(l => l.name === selected ? { ...l, layers: l.layers.filter((_, li) => li !== i) } : l) }))} data-testid={`lid-layer-del-${i}`}><Trash2 className="w-3 h-3" /></button>
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
                  onUpdateProject(prev => ({ ...prev, lidControls: prev.lidControls.map(l => l.name === selected ? { ...l, layers: [...l.layers, defaults[layerType] || `${layerType} 0`] } : l) }));
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
