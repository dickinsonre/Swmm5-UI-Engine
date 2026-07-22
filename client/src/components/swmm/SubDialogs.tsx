import { useState, useEffect, useRef, useCallback } from 'react';
import type { SwmmProject, DWFEntry, LidUsage, Groundwater, TimeSeriesPoint, CurvePoint, PatternData } from '@/lib/swmm-types';
import { X, Plus, Trash2, Upload, ClipboardPaste } from 'lucide-react';

type SubDialogProps = {
  project: SwmmProject;
  objId: string;
  onClose: () => void;
  onProjectChange: (p: SwmmProject) => void;
};

const overlayClass = "fixed inset-0 bg-black/40 flex items-center justify-center z-[1000] backdrop-blur-[1px]";
const modalClass = "bg-white border border-[#d0d8e8] rounded-lg shadow-2xl flex flex-col max-h-[80vh] min-w-[420px] overflow-hidden";
const modalWide = "w-[720px] max-w-[90vw]";
const modalLarge = "w-[800px] max-w-[90vw] max-h-[85vh]";
const headerClass = "flex justify-between items-center px-4 py-2.5 bg-[#f0f0f4] border-b border-[#d0d8e8]";
const titleClass = "font-bold text-[13px] text-[#2c3e6b]";
const bodyClass = "flex-1 overflow-y-auto p-4";
const footerClass = "flex justify-end gap-2 px-4 py-2.5 bg-[#f0f0f4] border-t border-[#d0d8e8]";
const btnCancel = "px-5 py-1.5 rounded text-[12px] font-semibold bg-[#e8e8f0] text-[#4a4a5a] hover:bg-[#d8d8e4] cursor-pointer border-0";
const btnSave = "px-5 py-1.5 rounded text-[12px] font-semibold bg-[#2c6eb5] text-white hover:bg-[#245a96] cursor-pointer border-0";
const helpTextClass = "text-[11px] text-[#6b6b7b] px-3 py-2 bg-[#f8f9ff] rounded border-l-3 border-[#2c6eb5] mb-3 leading-relaxed";
const tableClass = "w-full border-collapse text-[11px]";
const thClass = "bg-[#f0f0f4] text-[#4a4a5a] px-2 py-1.5 text-left border-b border-[#d0d8e8] font-semibold text-[10px] uppercase tracking-wide whitespace-nowrap sticky top-0 z-[1]";
const tdClass = "px-1 py-0.5 border-b border-[#f0f0f4]";
const inputClass = "w-full px-2 py-1 bg-white border border-[#d0d8e8] rounded text-[11px] text-[#2a2a3e] focus:border-[#2c6eb5] focus:outline-none font-mono";
const selectClass = "w-full px-1 py-1 bg-white border border-[#d0d8e8] rounded text-[11px] text-[#2a2a3e] focus:border-[#2c6eb5] focus:outline-none";
const addRowClass = "w-full py-1.5 bg-[#f8f9ff] border border-dashed border-[#d0d8e8] text-[#2c6eb5] rounded cursor-pointer text-[11px] font-semibold mt-2 hover:bg-[#e8f0ff] hover:border-solid flex items-center justify-center gap-1";
const deleteBtn = "bg-transparent border-0 text-[#9090a0] cursor-pointer text-[12px] p-1 rounded hover:bg-red-100 hover:text-red-600";

function CloseBtn({ onClick }: { onClick: () => void }) {
  return <button className="bg-transparent border-0 text-[#9090a0] cursor-pointer text-[16px] p-1 rounded hover:bg-[#e8e8f0] hover:text-[#e74c3c]" onClick={onClick} data-testid="subdialog-close"><X className="w-4 h-4" /></button>;
}

export function DirectInflowEditor({ project, objId, onClose, onProjectChange }: SubDialogProps) {
  type InflowRow = { constituent: string; timeSeries: string; type: string; unitsFactor: number; scaleFactor: number; baseline: number; pattern: string };
  const [rows, setRows] = useState<InflowRow[]>([]);

  useEffect(() => {
    const existing: InflowRow[] = [];
    const raw = project.rawSections['INFLOWS'] || [];
    for (const line of raw) {
      const t = line.trim();
      if (!t || t.startsWith(';') || t.startsWith('[')) continue;
      const parts = t.split(/\s+/);
      if (parts[0] === objId) {
        existing.push({
          constituent: parts[1] || 'FLOW',
          timeSeries: parts[2] || '',
          type: parts[3] || 'FLOW',
          unitsFactor: parseFloat(parts[4]) || 1.0,
          scaleFactor: parseFloat(parts[5]) || 1.0,
          baseline: parseFloat(parts[6]) || 0,
          pattern: parts[7] || '',
        });
      }
    }
    if (existing.length === 0) {
      existing.push({ constituent: 'FLOW', timeSeries: '', type: 'FLOW', unitsFactor: 1.0, scaleFactor: 1.0, baseline: 0, pattern: '' });
    }
    setRows(existing);
  }, [project, objId]);

  const tsNames = Object.keys(project.timeseries);
  const patNames = Object.keys(project.patterns);
  const pollNames = project.pollutants?.map(p => p.id) || [];

  const update = (i: number, field: keyof InflowRow, val: string | number) => {
    setRows(prev => { const u = [...prev]; u[i] = { ...u[i], [field]: val }; return u; });
  };

  const handleSave = () => {
    const otherLines = (project.rawSections['INFLOWS'] || []).filter(l => {
      const t = l.trim();
      if (!t || t.startsWith(';') || t.startsWith('[')) return true;
      return t.split(/\s+/)[0] !== objId;
    });
    const newLines = rows.filter(r => r.timeSeries || r.baseline > 0).map(r =>
      `${objId} ${r.constituent} ${r.timeSeries || '""'} ${r.type} ${r.unitsFactor} ${r.scaleFactor} ${r.baseline} ${r.pattern}`.trim()
    );
    const updated = { ...project, rawSections: { ...project.rawSections, INFLOWS: [...otherLines, ...newLines] } };
    onProjectChange(updated);
    onClose();
  };

  return (
    <div className={overlayClass} onClick={e => { if (e.target === e.currentTarget) onClose(); }} data-testid="subdialog-directInflow">
      <div className={`${modalClass} ${modalWide}`}>
        <div className={headerClass}>
          <span className={titleClass}>Direct Inflows — {objId}</span>
          <CloseBtn onClick={onClose} />
        </div>
        <div className={bodyClass}>
          <div className={helpTextClass}>
            Define external flow or pollutant time series entering this node. Each row represents an inflow for one constituent (FLOW or a pollutant).
          </div>
          <div className="max-h-[280px] overflow-y-auto border border-[#d0d8e8] rounded">
            <table className={tableClass}>
              <thead><tr>
                <th className={thClass}>Constituent</th>
                <th className={thClass}>Time Series</th>
                <th className={thClass}>Type</th>
                <th className={thClass}>Units Factor</th>
                <th className={thClass}>Scale Factor</th>
                <th className={thClass}>Baseline</th>
                <th className={thClass}>Pattern</th>
                <th className={thClass}></th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className={tdClass}>
                      <select className={selectClass} value={r.constituent} onChange={e => update(i, 'constituent', e.target.value)} data-testid={`inflow-constituent-${i}`}>
                        <option value="FLOW">FLOW</option>
                        {pollNames.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>
                    <td className={tdClass}>
                      <select className={selectClass} value={r.timeSeries} onChange={e => update(i, 'timeSeries', e.target.value)} data-testid={`inflow-ts-${i}`}>
                        <option value="">-- None --</option>
                        {tsNames.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className={tdClass}>
                      <select className={selectClass} value={r.type} onChange={e => update(i, 'type', e.target.value)}>
                        <option value="FLOW">FLOW</option>
                        <option value="CONCEN">CONCEN</option>
                        <option value="MASS">MASS</option>
                      </select>
                    </td>
                    <td className={tdClass}><input className={inputClass} type="number" value={r.unitsFactor} step="0.1" onChange={e => update(i, 'unitsFactor', parseFloat(e.target.value) || 1)} /></td>
                    <td className={tdClass}><input className={inputClass} type="number" value={r.scaleFactor} step="0.1" onChange={e => update(i, 'scaleFactor', parseFloat(e.target.value) || 1)} /></td>
                    <td className={tdClass}><input className={inputClass} type="number" value={r.baseline} step="0.01" onChange={e => update(i, 'baseline', parseFloat(e.target.value) || 0)} /></td>
                    <td className={tdClass}>
                      <select className={selectClass} value={r.pattern} onChange={e => update(i, 'pattern', e.target.value)}>
                        <option value="">-- None --</option>
                        {patNames.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>
                    <td className={tdClass}><button className={deleteBtn} onClick={() => setRows(prev => prev.filter((_, j) => j !== i))}><Trash2 className="w-3 h-3" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className={addRowClass} onClick={() => setRows(prev => [...prev, { constituent: 'FLOW', timeSeries: '', type: 'FLOW', unitsFactor: 1.0, scaleFactor: 1.0, baseline: 0, pattern: '' }])} data-testid="inflow-add-row"><Plus className="w-3 h-3" /> Add Inflow</button>
        </div>
        <div className={footerClass}>
          <button className={btnCancel} onClick={onClose}>Cancel</button>
          <button className={btnSave} onClick={handleSave} data-testid="subdialog-save">OK</button>
        </div>
      </div>
    </div>
  );
}

export function DWFEditor({ project, objId, onClose, onProjectChange }: SubDialogProps) {
  type DWFRow = { constituent: string; avgValue: number; pat1: string; pat2: string; pat3: string; pat4: string };
  const [rows, setRows] = useState<DWFRow[]>([]);

  useEffect(() => {
    const existing = project.dwf.filter(d => d.nodeId === objId).map(d => ({
      constituent: d.constituent,
      avgValue: d.baseline,
      pat1: d.patterns[0] || '',
      pat2: d.patterns[1] || '',
      pat3: d.patterns[2] || '',
      pat4: d.patterns[3] || '',
    }));
    if (existing.length === 0) {
      existing.push({ constituent: 'FLOW', avgValue: 0, pat1: '', pat2: '', pat3: '', pat4: '' });
    }
    setRows(existing);
  }, [project, objId]);

  const patNames = Object.keys(project.patterns);
  const update = (i: number, field: keyof DWFRow, val: string | number) => {
    setRows(prev => { const u = [...prev]; u[i] = { ...u[i], [field]: val }; return u; });
  };

  const handleSave = () => {
    const otherDwf = project.dwf.filter(d => d.nodeId !== objId);
    const newDwf = rows.filter(r => r.avgValue > 0).map(r => ({
      nodeId: objId,
      constituent: r.constituent,
      baseline: r.avgValue,
      patterns: [r.pat1, r.pat2, r.pat3, r.pat4].filter(Boolean),
    } as DWFEntry));
    onProjectChange({ ...project, dwf: [...otherDwf, ...newDwf] });
    onClose();
  };

  return (
    <div className={overlayClass} onClick={e => { if (e.target === e.currentTarget) onClose(); }} data-testid="subdialog-dwfInflow">
      <div className={`${modalClass} ${modalWide}`}>
        <div className={headerClass}>
          <span className={titleClass}>Dry Weather Flow — {objId}</span>
          <CloseBtn onClick={onClose} />
        </div>
        <div className={bodyClass}>
          <div className={helpTextClass}>
            Dry weather flow is the average sanitary/base flow at this node. Up to 4 time patterns can modify the average value (monthly, daily, hourly, weekend).
          </div>
          <div className="max-h-[280px] overflow-y-auto border border-[#d0d8e8] rounded">
            <table className={tableClass}>
              <thead><tr>
                <th className={thClass}>Constituent</th>
                <th className={thClass}>Average Value</th>
                <th className={thClass}>Pattern 1 (Monthly)</th>
                <th className={thClass}>Pattern 2 (Daily)</th>
                <th className={thClass}>Pattern 3 (Hourly)</th>
                <th className={thClass}>Pattern 4 (Weekend)</th>
                <th className={thClass}></th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className={tdClass}>
                      <select className={selectClass} value={r.constituent} onChange={e => update(i, 'constituent', e.target.value)}>
                        <option value="FLOW">FLOW</option>
                        {(project.pollutants || []).map(p => <option key={p.id} value={p.id}>{p.id}</option>)}
                      </select>
                    </td>
                    <td className={tdClass}><input className={inputClass} type="number" value={r.avgValue} step="0.001" onChange={e => update(i, 'avgValue', parseFloat(e.target.value) || 0)} data-testid={`dwf-avg-${i}`} /></td>
                    {(['pat1', 'pat2', 'pat3', 'pat4'] as const).map(pk => (
                      <td key={pk} className={tdClass}>
                        <select className={selectClass} value={r[pk]} onChange={e => update(i, pk, e.target.value)}>
                          <option value="">-- None --</option>
                          {patNames.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </td>
                    ))}
                    <td className={tdClass}><button className={deleteBtn} onClick={() => setRows(prev => prev.filter((_, j) => j !== i))}><Trash2 className="w-3 h-3" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className={addRowClass} onClick={() => setRows(prev => [...prev, { constituent: 'FLOW', avgValue: 0, pat1: '', pat2: '', pat3: '', pat4: '' }])}><Plus className="w-3 h-3" /> Add DWF Record</button>
        </div>
        <div className={footerClass}>
          <button className={btnCancel} onClick={onClose}>Cancel</button>
          <button className={btnSave} onClick={handleSave} data-testid="subdialog-save">OK</button>
        </div>
      </div>
    </div>
  );
}

export function TimeSeriesEditor({ project, objId, onClose, onProjectChange }: SubDialogProps) {
  const [name, setName] = useState(objId || '');
  const [data, setData] = useState<{ time: string; value: number }[]>([]);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ts = project.timeseries[objId];
    if (ts && Array.isArray(ts)) {
      setData(ts.map(p => ({ time: p.dateTime, value: p.value })));
    }
  }, [project, objId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    const m = { top: 12, right: 12, bottom: 25, left: 48 };
    const pW = W - m.left - m.right, pH = H - m.top - m.bottom;

    ctx.fillStyle = '#f8f9ff';
    ctx.fillRect(0, 0, W, H);

    const values = data.map(d => d.value);
    const yMax = Math.max(...values) * 1.1 || 1;
    const xS = (i: number) => m.left + (i / Math.max(1, data.length - 1)) * pW;
    const yS = (v: number) => m.top + pH - (v / yMax) * pH;

    ctx.strokeStyle = '#e0e4f0';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = m.top + (pH * i) / 4;
      ctx.beginPath(); ctx.moveTo(m.left, y); ctx.lineTo(m.left + pW, y); ctx.stroke();
      ctx.fillStyle = '#9090a0';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText((yMax - (i / 4) * yMax).toFixed(2), m.left - 4, y + 3);
    }

    ctx.strokeStyle = '#2c6eb5';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    data.forEach((d, i) => { const x = xS(i), y = yS(d.value); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.stroke();

    ctx.fillStyle = 'rgba(44,110,181,0.12)';
    ctx.beginPath();
    ctx.moveTo(xS(0), yS(0));
    data.forEach((d, i) => ctx.lineTo(xS(i), yS(d.value)));
    ctx.lineTo(xS(data.length - 1), yS(0));
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#9090a0';
    ctx.textAlign = 'center';
    ctx.font = '8px sans-serif';
    const step = Math.max(1, Math.floor(data.length / 8));
    for (let i = 0; i < data.length; i += step) {
      ctx.fillText(data[i].time || String(i), xS(i), H - 5);
    }

    ctx.strokeStyle = '#d0d8e8';
    ctx.lineWidth = 1;
    ctx.strokeRect(m.left, m.top, pW, pH);
  }, [data]);

  const updateRow = (i: number, field: 'time' | 'value', val: string | number) => {
    setData(prev => { const u = [...prev]; u[i] = { ...u[i], [field]: val }; return u; });
  };

  const importCSV = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.csv,.txt,.dat';
    inp.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const lines = (ev.target?.result as string).split(/\r?\n/);
        const parsed: { time: string; value: number }[] = [];
        for (const line of lines) {
          const parts = line.trim().split(/[,\t\s]+/);
          if (parts.length >= 2) {
            const value = parseFloat(parts[parts.length - 1]);
            if (!isNaN(value)) parsed.push({ time: parts.slice(0, -1).join(' '), value });
          }
        }
        if (parsed.length > 0) setData(parsed);
      };
      reader.readAsText(file);
    };
    inp.click();
  };

  const handleSave = () => {
    if (!name) return;
    const tsData: TimeSeriesPoint[] = data.map(d => ({ dateTime: d.time, value: d.value }));
    const updated = { ...project, timeseries: { ...project.timeseries, [name]: tsData } };
    onProjectChange(updated);
    onClose();
  };

  return (
    <div className={overlayClass} onClick={e => { if (e.target === e.currentTarget) onClose(); }} data-testid="subdialog-timeSeries">
      <div className={`${modalClass} ${modalLarge}`}>
        <div className={headerClass}>
          <span className={titleClass}>Time Series Editor — {name || 'New'}</span>
          <CloseBtn onClick={onClose} />
        </div>
        <div className={`${bodyClass} flex flex-col gap-2`}>
          <div className="flex items-center gap-2 mb-1">
            <label className="text-[11px] text-[#4a4a5a] font-semibold whitespace-nowrap">Name:</label>
            <input className={`${inputClass} w-[180px]`} value={name} onChange={e => setName(e.target.value)} data-testid="ts-name" />
          </div>
          {project.timeseriesFiles?.[objId] && (
            <div className="text-[10px] text-[#b06000] bg-[#fff8ec] border border-[#f0d8a8] rounded px-2 py-1.5" data-testid="ts-file-notice">
              This time series is backed by an external file ({project.timeseriesFiles[objId]}). The file reference is preserved when saving the project. Editing values here creates in-project data that overrides nothing in the external file.
            </div>
          )}

          <div className="h-[140px] border border-[#d0d8e8] rounded overflow-hidden">
            <canvas ref={canvasRef} className="w-full h-full block" />
          </div>
          <div className="flex items-center gap-2 py-1">
            <button className="px-3 py-1 bg-[#f0f0f4] border border-[#d0d8e8] rounded text-[10px] font-semibold cursor-pointer hover:bg-[#e0e4f0] flex items-center gap-1" onClick={importCSV} data-testid="ts-import"><Upload className="w-3 h-3" /> Import CSV</button>
            <button className="px-3 py-1 bg-[#f0f0f4] border border-[#d0d8e8] rounded text-[10px] font-semibold cursor-pointer hover:bg-[#e0e4f0] flex items-center gap-1" onClick={() => setData(prev => [...prev, { time: prev.length > 0 ? prev[prev.length - 1].time : '0', value: 0 }])}><Plus className="w-3 h-3" /> Add Row</button>
            <span className="ml-auto text-[10px] text-[#9090a0]">{data.length} rows</span>
          </div>
          <div className="max-h-[200px] overflow-y-auto border border-[#d0d8e8] rounded">
            <table className={tableClass}>
              <thead><tr>
                <th className={thClass}>#</th>
                <th className={thClass}>Date/Time</th>
                <th className={thClass}>Value</th>
                <th className={thClass}></th>
              </tr></thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i}>
                    <td className={`${tdClass} text-center text-[9px] text-[#9090a0] w-[30px]`}>{i + 1}</td>
                    <td className={tdClass}><input className={inputClass} value={row.time} onChange={e => updateRow(i, 'time', e.target.value)} /></td>
                    <td className={tdClass}><input className={`${inputClass} text-right`} type="number" value={row.value} step="any" onChange={e => updateRow(i, 'value', parseFloat(e.target.value) || 0)} /></td>
                    <td className={tdClass}><button className={deleteBtn} onClick={() => setData(prev => prev.filter((_, j) => j !== i))}><Trash2 className="w-3 h-3" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className={footerClass}>
          <button className={btnCancel} onClick={onClose}>Cancel</button>
          <button className={btnSave} onClick={handleSave} data-testid="subdialog-save">OK</button>
        </div>
      </div>
    </div>
  );
}

const CURVE_TYPES: Record<string, { xLabel: string; yLabel: string; desc: string }> = {
  STORAGE: { xLabel: 'Depth (ft)', yLabel: 'Area (ft²)', desc: 'Storage depth vs. surface area' },
  PUMP1: { xLabel: 'Volume (ft³)', yLabel: 'Flow (CFS)', desc: 'Type 1: Volume vs. Flow' },
  PUMP2: { xLabel: 'Depth (ft)', yLabel: 'Flow (CFS)', desc: 'Type 2: Depth vs. Flow' },
  PUMP3: { xLabel: 'Head (ft)', yLabel: 'Flow (CFS)', desc: 'Type 3: Head vs. Flow' },
  PUMP4: { xLabel: 'Depth (ft)', yLabel: 'Flow (CFS)', desc: 'Type 4: Depth vs. Flow' },
  RATING: { xLabel: 'Head (ft)', yLabel: 'Flow (CFS)', desc: 'Head vs. outflow rating' },
  TIDAL: { xLabel: 'Hour of Day', yLabel: 'Stage (ft)', desc: 'Tidal stage variation' },
  DIVERSION: { xLabel: 'Inflow (CFS)', yLabel: 'Diverted Flow (CFS)', desc: 'Inflow vs. diverted flow' },
  SHAPE: { xLabel: 'Depth Fraction', yLabel: 'Width Fraction', desc: 'Custom cross-section shape' },
  CONTROL: { xLabel: 'Controller Value', yLabel: 'Setting', desc: 'Control curve for rules' },
};

export function CurveEditor({ project, objId, onClose, onProjectChange }: SubDialogProps) {
  const [name, setName] = useState(objId || '');
  const [curveType, setCurveType] = useState('STORAGE');
  const [data, setData] = useState<{ x: number; y: number }[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const curve = project.curves[objId];
    if (curve && Array.isArray(curve)) {
      if (curve.length > 0 && curve[0].type) setCurveType(curve[0].type!);
      setData(curve.map(p => ({ x: p.x, y: p.y })));
    }
  }, [project, objId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    const m = { top: 15, right: 15, bottom: 30, left: 50 };
    const pW = W - m.left - m.right, pH = H - m.top - m.bottom;

    ctx.fillStyle = '#f8f9ff';
    ctx.fillRect(0, 0, W, H);

    const xVals = data.map(d => d.x), yVals = data.map(d => d.y);
    const xMin = Math.min(0, ...xVals), xMax = Math.max(...xVals) || 1;
    const yMin = Math.min(0, ...yVals), yMax = Math.max(...yVals) * 1.1 || 1;
    const xS = (v: number) => m.left + ((v - xMin) / (xMax - xMin)) * pW;
    const yS = (v: number) => m.top + pH - ((v - yMin) / (yMax - yMin)) * pH;

    ctx.strokeStyle = '#e0e4f0';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = m.top + (pH * i) / 4;
      ctx.beginPath(); ctx.moveTo(m.left, y); ctx.lineTo(m.left + pW, y); ctx.stroke();
      ctx.fillStyle = '#9090a0'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText((yMax - (i / 4) * (yMax - yMin)).toFixed(1), m.left - 4, y + 3);
    }
    for (let i = 0; i <= 4; i++) {
      const x = m.left + (pW * i) / 4;
      ctx.beginPath(); ctx.moveTo(x, m.top); ctx.lineTo(x, m.top + pH); ctx.stroke();
      ctx.fillStyle = '#9090a0'; ctx.textAlign = 'center';
      ctx.fillText((xMin + (i / 4) * (xMax - xMin)).toFixed(1), x, H - m.bottom + 15);
    }

    const sorted = [...data].sort((a, b) => a.x - b.x);
    ctx.strokeStyle = '#27ae60';
    ctx.lineWidth = 2;
    ctx.beginPath();
    sorted.forEach((d, i) => { const x = xS(d.x), y = yS(d.y); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.stroke();

    sorted.forEach(d => {
      ctx.fillStyle = '#27ae60';
      ctx.beginPath(); ctx.arc(xS(d.x), yS(d.y), 3, 0, Math.PI * 2); ctx.fill();
    });

    const ti = CURVE_TYPES[curveType] || {};
    ctx.fillStyle = '#6b6b7b'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(ti.xLabel || 'X', m.left + pW / 2, H - 3);
    ctx.save(); ctx.translate(10, m.top + pH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText(ti.yLabel || 'Y', 0, 0); ctx.restore();

    ctx.strokeStyle = '#d0d8e8'; ctx.lineWidth = 1;
    ctx.strokeRect(m.left, m.top, pW, pH);
  }, [data, curveType]);

  const handleSave = () => {
    if (!name) return;
    const curveData: CurvePoint[] = data.map(d => ({ type: curveType, x: d.x, y: d.y }));
    onProjectChange({ ...project, curves: { ...project.curves, [name]: curveData } });
    onClose();
  };

  const ti = CURVE_TYPES[curveType] || { xLabel: 'X', yLabel: 'Y', desc: '' };

  return (
    <div className={overlayClass} onClick={e => { if (e.target === e.currentTarget) onClose(); }} data-testid="subdialog-curve">
      <div className={`${modalClass} ${modalLarge}`}>
        <div className={headerClass}>
          <span className={titleClass}>Curve Editor — {name || 'New'}</span>
          <CloseBtn onClick={onClose} />
        </div>
        <div className={`${bodyClass} flex flex-col gap-2`}>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-[#4a4a5a] font-semibold">Name:</label>
            <input className={`${inputClass} w-[160px]`} value={name} onChange={e => setName(e.target.value)} data-testid="curve-name" />
            <label className="text-[11px] text-[#4a4a5a] font-semibold ml-3">Type:</label>
            <select className={`${selectClass} w-[160px]`} value={curveType} onChange={e => setCurveType(e.target.value)} data-testid="curve-type">
              {Object.keys(CURVE_TYPES).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {ti.desc && <div className={helpTextClass}>{ti.desc}</div>}
          <div className="h-[150px] border border-[#d0d8e8] rounded overflow-hidden">
            <canvas ref={canvasRef} className="w-full h-full block" />
          </div>
          <div className="flex items-center gap-2 py-1">
            <button className="px-3 py-1 bg-[#f0f0f4] border border-[#d0d8e8] rounded text-[10px] font-semibold cursor-pointer hover:bg-[#e0e4f0] flex items-center gap-1" onClick={() => setData(prev => [...prev, { x: prev.length > 0 ? prev[prev.length - 1].x + 1 : 0, y: 0 }])} data-testid="curve-add-point"><Plus className="w-3 h-3" /> Add Point</button>
            <span className="ml-auto text-[10px] text-[#9090a0]">{data.length} points</span>
          </div>
          <div className="max-h-[160px] overflow-y-auto border border-[#d0d8e8] rounded">
            <table className={tableClass}>
              <thead><tr>
                <th className={thClass}>#</th>
                <th className={thClass}>{ti.xLabel}</th>
                <th className={thClass}>{ti.yLabel}</th>
                <th className={thClass}></th>
              </tr></thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i}>
                    <td className={`${tdClass} text-center text-[9px] text-[#9090a0] w-[30px]`}>{i + 1}</td>
                    <td className={tdClass}><input className={`${inputClass} text-right`} type="number" value={row.x} step="any" onChange={e => setData(prev => { const u = [...prev]; u[i] = { ...u[i], x: parseFloat(e.target.value) || 0 }; return u; })} /></td>
                    <td className={tdClass}><input className={`${inputClass} text-right`} type="number" value={row.y} step="any" onChange={e => setData(prev => { const u = [...prev]; u[i] = { ...u[i], y: parseFloat(e.target.value) || 0 }; return u; })} /></td>
                    <td className={tdClass}><button className={deleteBtn} onClick={() => setData(prev => prev.filter((_, j) => j !== i))}><Trash2 className="w-3 h-3" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className={footerClass}>
          <button className={btnCancel} onClick={onClose}>Cancel</button>
          <button className={btnSave} onClick={handleSave} data-testid="subdialog-save">OK</button>
        </div>
      </div>
    </div>
  );
}

const PATTERN_CONFIGS: Record<string, { count: number; labels: string[] }> = {
  MONTHLY: { count: 12, labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] },
  DAILY: { count: 7, labels: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] },
  HOURLY: { count: 24, labels: Array.from({ length: 24 }, (_, i) => `${i}:00`) },
  WEEKEND: { count: 24, labels: Array.from({ length: 24 }, (_, i) => `${i}:00`) },
};

export function PatternEditor({ project, objId, onClose, onProjectChange }: SubDialogProps) {
  const [name, setName] = useState(objId || '');
  const [patType, setPatType] = useState('MONTHLY');
  const [multipliers, setMultipliers] = useState<number[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const pat = project.patterns[objId];
    if (pat) {
      setPatType(pat.type || 'MONTHLY');
      const config = PATTERN_CONFIGS[pat.type || 'MONTHLY'];
      const m = [...pat.multipliers];
      while (m.length < config.count) m.push(1.0);
      setMultipliers(m.slice(0, config.count));
    } else {
      const config = PATTERN_CONFIGS['MONTHLY'];
      setMultipliers(Array(config.count).fill(1.0));
    }
  }, [project, objId]);

  useEffect(() => {
    const config = PATTERN_CONFIGS[patType];
    if (multipliers.length !== config.count) {
      const m = [...multipliers];
      while (m.length < config.count) m.push(1.0);
      setMultipliers(m.slice(0, config.count));
    }
  }, [patType]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || multipliers.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    const m = { top: 15, right: 10, bottom: 30, left: 40 };
    const pW = W - m.left - m.right, pH = H - m.top - m.bottom;

    ctx.fillStyle = '#f8f9ff';
    ctx.fillRect(0, 0, W, H);

    const maxVal = Math.max(1, ...multipliers) * 1.15;
    const barW = pW / multipliers.length * 0.75;
    const gap = pW / multipliers.length * 0.25;

    ctx.strokeStyle = '#e0e4f0'; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = m.top + (pH * i) / 4;
      ctx.beginPath(); ctx.moveTo(m.left, y); ctx.lineTo(m.left + pW, y); ctx.stroke();
      ctx.fillStyle = '#9090a0'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText((maxVal - (i / 4) * maxVal).toFixed(2), m.left - 4, y + 3);
    }

    const refY = m.top + pH - (1.0 / maxVal) * pH;
    ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(m.left, refY); ctx.lineTo(m.left + pW, refY); ctx.stroke();
    ctx.setLineDash([]);

    const config = PATTERN_CONFIGS[patType];
    multipliers.forEach((val, i) => {
      const x = m.left + i * (pW / multipliers.length) + gap / 2;
      const barH = (val / maxVal) * pH;
      const y = m.top + pH - barH;
      const t = val / maxVal;
      ctx.fillStyle = `rgb(${Math.round(44 + t * 90)},${Math.round(110 + t * 20)},${Math.round(181 - t * 50)})`;
      ctx.fillRect(x, y, barW, barH);
      ctx.fillStyle = '#9090a0'; ctx.font = '7px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(config.labels[i] || String(i), x + barW / 2, H - m.bottom + 12);
    });

    ctx.strokeStyle = '#d0d8e8'; ctx.lineWidth = 1;
    ctx.strokeRect(m.left, m.top, pW, pH);
  }, [multipliers, patType]);

  const handleSave = () => {
    if (!name) return;
    const patData: PatternData = { type: patType, multipliers: [...multipliers] };
    onProjectChange({ ...project, patterns: { ...project.patterns, [name]: patData } });
    onClose();
  };

  const config = PATTERN_CONFIGS[patType];

  return (
    <div className={overlayClass} onClick={e => { if (e.target === e.currentTarget) onClose(); }} data-testid="subdialog-pattern">
      <div className={`${modalClass} ${modalLarge}`}>
        <div className={headerClass}>
          <span className={titleClass}>Pattern Editor — {name || 'New'}</span>
          <CloseBtn onClick={onClose} />
        </div>
        <div className={`${bodyClass} flex flex-col gap-2`}>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-[#4a4a5a] font-semibold">Name:</label>
            <input className={`${inputClass} w-[160px]`} value={name} onChange={e => setName(e.target.value)} data-testid="pattern-name" />
            <label className="text-[11px] text-[#4a4a5a] font-semibold ml-3">Type:</label>
            <select className={`${selectClass} w-[200px]`} value={patType} onChange={e => setPatType(e.target.value)} data-testid="pattern-type">
              <option value="MONTHLY">Monthly (12 values)</option>
              <option value="DAILY">Daily (7 values)</option>
              <option value="HOURLY">Hourly (24 values)</option>
              <option value="WEEKEND">Weekend (24 values)</option>
            </select>
          </div>
          <div className={helpTextClass}>Multipliers adjust the base value. A value of 1.0 = no adjustment. The dashed orange line shows the 1.0 reference.</div>
          <div className="h-[140px] border border-[#d0d8e8] rounded overflow-hidden">
            <canvas ref={canvasRef} className="w-full h-full block" />
          </div>
          <div className="grid gap-1 py-1" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(68px, 1fr))` }}>
            {multipliers.map((val, i) => (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <label className="text-[8px] text-[#9090a0] uppercase">{config.labels[i]}</label>
                <input className={`${inputClass} w-[58px] text-center`} type="number" value={val} step="0.01" min="0"
                  onChange={e => setMultipliers(prev => { const u = [...prev]; u[i] = parseFloat(e.target.value) || 0; return u; })} />
              </div>
            ))}
          </div>
        </div>
        <div className={footerClass}>
          <button className={btnCancel} onClick={onClose}>Cancel</button>
          <button className={btnSave} onClick={handleSave} data-testid="subdialog-save">OK</button>
        </div>
      </div>
    </div>
  );
}

export function LIDUsageEditor({ project, objId, onClose, onProjectChange }: SubDialogProps) {
  type LIDRow = { lidControl: string; number: number; area: number; width: number; initSat: number; fromImperv: number; toPerv: number; rptFile: string; drainTo: string; fromPerv: number };
  const [rows, setRows] = useState<LIDRow[]>([]);

  useEffect(() => {
    const existing = project.lidUsage.filter(l => l.subcatchId === objId).map(l => ({
      lidControl: l.lidId,
      number: l.number,
      area: l.area,
      width: l.width,
      initSat: l.initSat,
      fromImperv: l.fromImperv,
      toPerv: l.toPerv,
      rptFile: l.rptFile === '*' ? '' : (l.rptFile || ''),
      drainTo: l.drainTo === '*' ? '' : (l.drainTo || ''),
      fromPerv: l.fromPerv || 0,
    }));
    setRows(existing);
  }, [project, objId]);

  const lidControlNames = project.lidControls?.map(c => c.id) || [];
  const drainTargets = [
    ...project.junctions.map(j => j.id),
    ...project.outfalls.map(o => o.id),
    ...project.storageUnits.map(s => s.id),
    ...project.dividers.map(d => d.id),
    ...project.subcatchments.map(s => s.id),
  ];
  const update = (i: number, field: keyof LIDRow, val: string | number) => {
    setRows(prev => { const u = [...prev]; u[i] = { ...u[i], [field]: val }; return u; });
  };

  const handleSave = () => {
    const otherUsage = project.lidUsage.filter(l => l.subcatchId !== objId);
    const newUsage: LidUsage[] = rows.filter(r => r.lidControl).map(r => ({
      subcatchId: objId,
      lidId: r.lidControl,
      number: r.number,
      area: r.area,
      width: r.width,
      initSat: r.initSat,
      fromImperv: r.fromImperv,
      toPerv: r.toPerv,
      rptFile: r.rptFile,
      drainTo: r.drainTo,
      fromPerv: r.fromPerv,
    }));
    onProjectChange({ ...project, lidUsage: [...otherUsage, ...newUsage] });
    onClose();
  };

  return (
    <div className={overlayClass} onClick={e => { if (e.target === e.currentTarget) onClose(); }} data-testid="subdialog-lidUsage">
      <div className={`${modalClass} ${modalWide}`}>
        <div className={headerClass}>
          <span className={titleClass}>LID Controls — {objId}</span>
          <CloseBtn onClick={onClose} />
        </div>
        <div className={bodyClass}>
          <div className={helpTextClass}>Assign Low Impact Development (LID) controls to this subcatchment. Each row represents one type of LID practice applied.</div>
          <div className="max-h-[280px] overflow-y-auto border border-[#d0d8e8] rounded">
            <table className={tableClass}>
              <thead><tr>
                <th className={thClass}>LID Control</th>
                <th className={thClass}>Number</th>
                <th className={thClass}>Area (ft²)</th>
                <th className={thClass}>Width (ft)</th>
                <th className={thClass}>Init Sat (%)</th>
                <th className={thClass}>From Imperv (%)</th>
                <th className={thClass}>To Perv</th>
                <th className={thClass}>Drain To</th>
                <th className={thClass}></th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className={tdClass}>
                      <select className={selectClass} value={r.lidControl} onChange={e => update(i, 'lidControl', e.target.value)} data-testid={`lid-control-${i}`}>
                        <option value="">-- Select --</option>
                        {lidControlNames.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                    <td className={tdClass}><input className={inputClass} type="number" value={r.number} min="1" step="1" onChange={e => update(i, 'number', parseInt(e.target.value) || 1)} /></td>
                    <td className={tdClass}><input className={inputClass} type="number" value={r.area} min="0" step="10" onChange={e => update(i, 'area', parseFloat(e.target.value) || 0)} /></td>
                    <td className={tdClass}><input className={inputClass} type="number" value={r.width} min="0" step="1" onChange={e => update(i, 'width', parseFloat(e.target.value) || 0)} /></td>
                    <td className={tdClass}><input className={inputClass} type="number" value={r.initSat} min="0" max="100" step="1" onChange={e => update(i, 'initSat', parseFloat(e.target.value) || 0)} /></td>
                    <td className={tdClass}><input className={inputClass} type="number" value={r.fromImperv} min="0" max="100" step="1" onChange={e => update(i, 'fromImperv', parseFloat(e.target.value) || 0)} /></td>
                    <td className={tdClass}><input className={inputClass} type="number" value={r.toPerv} min="0" max="1" step="1" onChange={e => update(i, 'toPerv', parseInt(e.target.value) || 0)} /></td>
                    <td className={tdClass}>
                      <select className={selectClass} value={r.drainTo} onChange={e => update(i, 'drainTo', e.target.value)} data-testid={`lid-drainto-${i}`}>
                        <option value="">-- Default --</option>
                        {drainTargets.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                    <td className={tdClass}><button className={deleteBtn} onClick={() => setRows(prev => prev.filter((_, j) => j !== i))}><Trash2 className="w-3 h-3" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className={addRowClass} onClick={() => setRows(prev => [...prev, { lidControl: '', number: 1, area: 0, width: 0, initSat: 0, fromImperv: 0, toPerv: 0, rptFile: '', drainTo: '', fromPerv: 0 }])} data-testid="lid-add-row"><Plus className="w-3 h-3" /> Add LID Control</button>
          {rows.length === 0 && <div className="text-center py-5 text-[11px] text-[#9090a0] italic">No LID controls assigned. Click "+ Add LID Control" to add green infrastructure.</div>}
        </div>
        <div className={footerClass}>
          <button className={btnCancel} onClick={onClose}>Cancel</button>
          <button className={btnSave} onClick={handleSave} data-testid="subdialog-save">OK</button>
        </div>
      </div>
    </div>
  );
}

export function RDIIEditor({ project, objId, onClose, onProjectChange }: SubDialogProps) {
  const [unitHydrograph, setUnitHydrograph] = useState('');
  const [sewerArea, setSewerArea] = useState(0);

  useEffect(() => {
    const raw = project.rawSections['RDII'] || [];
    for (const line of raw) {
      const t = line.trim();
      if (!t || t.startsWith(';') || t.startsWith('[')) continue;
      const parts = t.split(/\s+/);
      if (parts[0] === objId) {
        setUnitHydrograph(parts[1] || '');
        setSewerArea(parseFloat(parts[2]) || 0);
        break;
      }
    }
  }, [project, objId]);

  const uhNames = Array.from(new Set(
    (project.rawSections['HYDROGRAPHS'] || [])
      .map(l => l.trim().split(/\s+/)[0])
      .filter(n => n && !n.startsWith(';'))
  ));

  const handleSave = () => {
    const otherLines = (project.rawSections['RDII'] || []).filter(l => {
      const t = l.trim();
      if (!t || t.startsWith(';') || t.startsWith('[')) return true;
      return t.split(/\s+/)[0] !== objId;
    });
    const newLines = unitHydrograph ? [`${objId.padEnd(16)} ${unitHydrograph.padEnd(16)} ${sewerArea}`] : [];
    onProjectChange({ ...project, rawSections: { ...project.rawSections, RDII: [...otherLines, ...newLines] } });
    onClose();
  };

  return (
    <div className={overlayClass} onClick={e => { if (e.target === e.currentTarget) onClose(); }} data-testid="subdialog-rdiiInflow">
      <div className={`${modalClass} w-[460px] max-w-[90vw]`}>
        <div className={headerClass}>
          <span className={titleClass}>RDII Inflow — {objId}</span>
          <CloseBtn onClick={onClose} />
        </div>
        <div className={bodyClass}>
          <div className={helpTextClass}>
            Rainfall-Derived Infiltration/Inflow (RDII) at this node is computed from a unit hydrograph group applied over a sewershed area.
            Unit hydrograph groups are defined in the [HYDROGRAPHS] section.
          </div>
          <div className="flex items-center gap-2 py-1">
            <label className="text-[11px] text-[#4a4a5a] w-[150px] shrink-0">Unit Hydrograph Group</label>
            {uhNames.length > 0 ? (
              <select className={`${selectClass} flex-1`} value={unitHydrograph} onChange={e => setUnitHydrograph(e.target.value)} data-testid="rdii-uh">
                <option value="">-- None --</option>
                {uhNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            ) : (
              <input className={`${inputClass} flex-1`} value={unitHydrograph} onChange={e => setUnitHydrograph(e.target.value)} placeholder="Hydrograph group name" data-testid="rdii-uh" />
            )}
          </div>
          <div className="flex items-center gap-2 py-1">
            <label className="text-[11px] text-[#4a4a5a] w-[150px] shrink-0">Sewershed Area</label>
            <input className={`${inputClass} w-[120px]`} type="number" step="any" min="0" value={sewerArea}
              onChange={e => setSewerArea(parseFloat(e.target.value) || 0)} data-testid="rdii-area" />
            <span className="text-[9px] text-[#9090a0]">acres (or hectares in SI)</span>
          </div>
          {uhNames.length === 0 && (
            <div className="text-[10px] text-[#b06000] bg-[#fff8ec] border border-[#f0d8a8] rounded px-2 py-1.5 mt-2">
              No [HYDROGRAPHS] groups found in this project. Enter a group name manually or add hydrographs to the INP file.
            </div>
          )}
        </div>
        <div className={footerClass}>
          <button className={btnCancel} onClick={onClose}>Cancel</button>
          <button className={btnSave} onClick={handleSave} data-testid="subdialog-save">OK</button>
        </div>
      </div>
    </div>
  );
}

export function GroundwaterEditor({ project, objId, onClose, onProjectChange }: SubDialogProps) {
  const [gw, setGw] = useState<Groundwater>({
    subcatchId: objId,
    aquiferId: '',
    nodeId: '',
    surfElev: 0,
    a1: 0, b1: 0, a2: 0, b2: 0, a3: 0,
    fixedDepth: 0,
    threshold: 0,
    params: [],
  });

  useEffect(() => {
    const existing = project.groundwater.find(g => g.subcatchId === objId);
    if (existing) setGw({ ...existing });
  }, [project, objId]);

  const aquiferNames = project.aquifers?.map(a => a.id) || [];
  const nodeNames = [
    ...project.junctions.map(j => j.id),
    ...project.outfalls.map(o => o.id),
    ...project.storageUnits.map(s => s.id),
    ...project.dividers.map(d => d.id),
  ];

  const handleSave = () => {
    const otherGw = project.groundwater.filter(g => g.subcatchId !== objId);
    const newGw = gw.aquiferId ? [...otherGw, gw] : otherGw;
    onProjectChange({ ...project, groundwater: newGw });
    onClose();
  };

  const fieldRow = (label: string, key: keyof Groundwater, unit?: string) => (
    <div className="flex items-center gap-2 py-0.5">
      <label className="text-[11px] text-[#4a4a5a] w-[160px] shrink-0">{label}</label>
      <input className={`${inputClass} w-[120px]`} type="number" step="any" value={gw[key] as number}
        onChange={e => setGw(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))} />
      {unit && <span className="text-[9px] text-[#9090a0]">{unit}</span>}
    </div>
  );

  return (
    <div className={overlayClass} onClick={e => { if (e.target === e.currentTarget) onClose(); }} data-testid="subdialog-groundwater">
      <div className={`${modalClass} w-[500px] max-w-[90vw]`}>
        <div className={headerClass}>
          <span className={titleClass}>Groundwater — {objId}</span>
          <CloseBtn onClick={onClose} />
        </div>
        <div className={bodyClass}>
          <div className={helpTextClass}>Configure groundwater interaction for this subcatchment. Requires an aquifer and a receiving node.</div>
          <div className="flex items-center gap-2 py-1">
            <label className="text-[11px] text-[#4a4a5a] w-[160px] shrink-0">Aquifer</label>
            <select className={`${selectClass} flex-1`} value={gw.aquiferId} onChange={e => setGw(prev => ({ ...prev, aquiferId: e.target.value }))} data-testid="gw-aquifer">
              <option value="">-- None --</option>
              {aquiferNames.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 py-1">
            <label className="text-[11px] text-[#4a4a5a] w-[160px] shrink-0">Receiving Node</label>
            <select className={`${selectClass} flex-1`} value={gw.nodeId} onChange={e => setGw(prev => ({ ...prev, nodeId: e.target.value }))} data-testid="gw-node">
              <option value="">-- None --</option>
              {nodeNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          {fieldRow('Surface Elevation', 'surfElev', 'ft')}
          {fieldRow('Lateral Flow Coeff. (A1)', 'a1')}
          {fieldRow('Lateral Flow Exponent (B1)', 'b1')}
          {fieldRow('Deep Flow Coeff. (A2)', 'a2')}
          {fieldRow('Deep Flow Exponent (B2)', 'b2')}
          {fieldRow('Interflow Coeff. (A3)', 'a3')}
          {fieldRow('Fixed Surface Water Depth', 'fixedDepth', 'ft')}
          {fieldRow('Threshold GW Elevation', 'threshold', 'ft')}
        </div>
        <div className={footerClass}>
          <button className={btnCancel} onClick={onClose}>Cancel</button>
          <button className={btnSave} onClick={handleSave} data-testid="subdialog-save">OK</button>
        </div>
      </div>
    </div>
  );
}

export function TreatmentEditor({ project, objId, onClose, onProjectChange }: SubDialogProps) {
  type TreatRow = { pollutant: string; expression: string };
  const [rows, setRows] = useState<TreatRow[]>([]);

  useEffect(() => {
    const raw = project.rawSections['TREATMENT'] || [];
    const existing: TreatRow[] = [];
    for (const line of raw) {
      const t = line.trim();
      if (!t || t.startsWith(';') || t.startsWith('[')) continue;
      const parts = t.split(/\s+/);
      if (parts[0] === objId) {
        existing.push({ pollutant: parts[1] || '', expression: parts.slice(2).join(' ') });
      }
    }
    if (existing.length === 0 && project.pollutants.length > 0) {
      existing.push({ pollutant: project.pollutants[0].id, expression: 'R = C * (1 - 0.5)' });
    }
    setRows(existing);
  }, [project, objId]);

  const handleSave = () => {
    const otherLines = (project.rawSections['TREATMENT'] || []).filter(l => {
      const t = l.trim();
      if (!t || t.startsWith(';') || t.startsWith('[')) return true;
      return t.split(/\s+/)[0] !== objId;
    });
    const newLines = rows.filter(r => r.pollutant && r.expression).map(r => `${objId} ${r.pollutant} ${r.expression}`);
    onProjectChange({ ...project, rawSections: { ...project.rawSections, TREATMENT: [...otherLines, ...newLines] } });
    onClose();
  };

  return (
    <div className={overlayClass} onClick={e => { if (e.target === e.currentTarget) onClose(); }} data-testid="subdialog-treatment">
      <div className={`${modalClass} w-[600px] max-w-[90vw]`}>
        <div className={headerClass}>
          <span className={titleClass}>Treatment — {objId}</span>
          <CloseBtn onClick={onClose} />
        </div>
        <div className={bodyClass}>
          <div className={helpTextClass}>
            Define treatment expressions for pollutant removal at this node. Use R = removal function or C = concentration function.
            Variables: C (pollutant concentration), HRT (hydraulic retention time in hours), DT (time step in seconds), Q (flow rate).
          </div>
          <div className="max-h-[250px] overflow-y-auto border border-[#d0d8e8] rounded">
            <table className={tableClass}>
              <thead><tr>
                <th className={thClass}>Pollutant</th>
                <th className={thClass}>Treatment Expression</th>
                <th className={thClass}></th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className={`${tdClass} w-[140px]`}>
                      <select className={selectClass} value={r.pollutant} onChange={e => setRows(prev => { const u = [...prev]; u[i] = { ...u[i], pollutant: e.target.value }; return u; })} data-testid={`treat-poll-${i}`}>
                        <option value="">-- Select --</option>
                        {(project.pollutants || []).map(p => <option key={p.id} value={p.id}>{p.id}</option>)}
                      </select>
                    </td>
                    <td className={tdClass}>
                      <input className={`${inputClass} font-mono`} value={r.expression}
                        onChange={e => setRows(prev => { const u = [...prev]; u[i] = { ...u[i], expression: e.target.value }; return u; })}
                        placeholder="R = C * (1 - 0.5)" data-testid={`treat-expr-${i}`} />
                    </td>
                    <td className={tdClass}><button className={deleteBtn} onClick={() => setRows(prev => prev.filter((_, j) => j !== i))}><Trash2 className="w-3 h-3" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className={addRowClass} onClick={() => setRows(prev => [...prev, { pollutant: project.pollutants[0]?.id || '', expression: '' }])}><Plus className="w-3 h-3" /> Add Treatment</button>
        </div>
        <div className={footerClass}>
          <button className={btnCancel} onClick={onClose}>Cancel</button>
          <button className={btnSave} onClick={handleSave} data-testid="subdialog-save">OK</button>
        </div>
      </div>
    </div>
  );
}

export function ControlRulesEditor({ project, objId, onClose, onProjectChange }: SubDialogProps) {
  const [rulesText, setRulesText] = useState('');
  const [errors, setErrors] = useState<{ line: number; message: string }[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setRulesText(project.controls?.join('\n') || '');
  }, [project]);

  const validate = (text: string) => {
    const errs: { line: number; message: string }[] = [];
    const lines = text.split('\n');
    let inRule = false, ruleHasThen = false;
    lines.forEach((line, lineNum) => {
      const trimmed = line.trim().toUpperCase();
      if (!trimmed || trimmed.startsWith(';')) return;
      if (trimmed.startsWith('RULE')) {
        if (inRule && !ruleHasThen) errs.push({ line: lineNum, message: 'Previous RULE has no THEN clause' });
        inRule = true; ruleHasThen = false;
        if (trimmed.split(/\s+/).length < 2) errs.push({ line: lineNum + 1, message: 'RULE needs a name' });
      } else if (trimmed.startsWith('IF') || trimmed.startsWith('AND') || trimmed.startsWith('OR')) {
        if (!inRule) errs.push({ line: lineNum + 1, message: `${trimmed.split(' ')[0]} outside of RULE block` });
      } else if (trimmed.startsWith('THEN') || trimmed.startsWith('ELSE')) {
        if (!inRule) errs.push({ line: lineNum + 1, message: `${trimmed.split(' ')[0]} outside of RULE block` });
        if (trimmed.startsWith('THEN')) ruleHasThen = true;
      } else if (trimmed.startsWith('PRIORITY')) { /* ok */ }
    });
    if (inRule && !ruleHasThen) errs.push({ line: lines.length, message: 'Last RULE has no THEN clause' });
    return errs;
  };

  const handleTextChange = (text: string) => {
    setRulesText(text);
    setErrors(validate(text));
  };

  const insertTemplate = () => {
    const template = `RULE PumpControl1\nIF NODE WetWell1 DEPTH > 5.0\nTHEN PUMP Pump1 STATUS = ON\nPRIORITY 1\n\nRULE PumpControl2\nIF NODE WetWell1 DEPTH < 1.0\nTHEN PUMP Pump1 STATUS = OFF\nPRIORITY 1`;
    setRulesText(prev => prev + (prev ? '\n\n' : '') + template);
  };

  const handleSave = () => {
    const lines = rulesText.split('\n');
    onProjectChange({ ...project, controls: lines });
    onClose();
  };

  const KEYWORDS = ['RULE','IF','AND','OR','THEN','ELSE','PRIORITY','NODE','LINK','CONDUIT','PUMP','ORIFICE','WEIR','DEPTH','HEAD','VOLUME','INFLOW','FLOW','STATUS','SETTING','ON','OFF','OPEN','CLOSED'];

  return (
    <div className={overlayClass} onClick={e => { if (e.target === e.currentTarget) onClose(); }} data-testid="subdialog-controlRules">
      <div className={`${modalClass} ${modalLarge}`}>
        <div className={headerClass}>
          <span className={titleClass}>Control Rules Editor</span>
          <CloseBtn onClick={onClose} />
        </div>
        <div className={`${bodyClass} flex flex-col gap-2`}>
          <div className={helpTextClass}>
            Define operational rules for pumps, orifices, and weirs. Syntax: RULE name / IF condition / THEN action / PRIORITY n
          </div>
          <div className="flex items-center gap-2 py-1">
            <button className="px-3 py-1 bg-[#f0f0f4] border border-[#d0d8e8] rounded text-[10px] font-semibold cursor-pointer hover:bg-[#e0e4f0]" onClick={insertTemplate} data-testid="rules-insert-template">Insert Template</button>
            <span className="ml-auto text-[10px]">
              {errors.length === 0 ? <span className="text-green-600">No errors</span> : <span className="text-orange-600">{errors.length} issue(s)</span>}
            </span>
          </div>
          <div className="flex border border-[#d0d8e8] rounded overflow-hidden h-[240px]">
            <div className="bg-[#f0f0f4] py-2 min-w-[36px] border-r border-[#d0d8e8] overflow-y-hidden select-none">
              {rulesText.split('\n').map((_, i) => (
                <div key={i} className={`px-2 text-[10px] text-[#9090a0] leading-[1.65] text-right font-mono ${errors.some(e => e.line === i + 1) ? 'bg-red-100 text-red-500' : ''}`}>{i + 1}</div>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              className="flex-1 p-2 bg-white border-0 text-[#2a2a3e] font-mono text-[12px] leading-[1.65] resize-none outline-none"
              value={rulesText}
              onChange={e => handleTextChange(e.target.value)}
              spellCheck={false}
              placeholder="Enter control rules here..."
              data-testid="rules-textarea"
            />
          </div>
          {errors.length > 0 && (
            <div className="max-h-[80px] overflow-y-auto border border-[#d0d8e8] rounded">
              {errors.map((err, i) => (
                <div key={i} className="flex gap-2 px-2 py-1 text-[10px] cursor-pointer border-b border-[#f0f0f4] hover:bg-red-50"
                  onClick={() => {
                    const lines = rulesText.split('\n');
                    let pos = 0;
                    for (let j = 0; j < err.line - 1 && j < lines.length; j++) pos += lines[j].length + 1;
                    textareaRef.current?.setSelectionRange(pos, pos);
                    textareaRef.current?.focus();
                  }}>
                  <span className="text-red-500 font-semibold whitespace-nowrap">Line {err.line}:</span>
                  <span className="text-[#4a4a5a]">{err.message}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1 items-center py-1">
            <span className="text-[9px] text-[#9090a0] font-semibold uppercase">Keywords:</span>
            {KEYWORDS.map(kw => (
              <span key={kw} className="bg-[#f0f4ff] text-[#2c6eb5] px-1.5 py-0.5 rounded text-[9px] font-mono cursor-pointer hover:bg-[#e0ecff]"
                onClick={() => {
                  const ta = textareaRef.current;
                  if (ta) {
                    const start = ta.selectionStart;
                    const newText = rulesText.slice(0, start) + kw + ' ' + rulesText.slice(start);
                    setRulesText(newText);
                    ta.focus();
                  }
                }}>{kw}</span>
            ))}
          </div>
        </div>
        <div className={footerClass}>
          <button className={btnCancel} onClick={onClose}>Cancel</button>
          <button className={btnSave} onClick={handleSave} data-testid="subdialog-save">OK</button>
        </div>
      </div>
    </div>
  );
}

export type SubDialogState = {
  type: string;
  objId: string;
} | null;

export function SubDialogRouter({ state, project, onClose, onProjectChange }: {
  state: SubDialogState;
  project: SwmmProject;
  onClose: () => void;
  onProjectChange: (p: SwmmProject) => void;
}) {
  if (!state) return null;
  const props = { project, objId: state.objId, onClose, onProjectChange };
  switch (state.type) {
    case 'directInflow': return <DirectInflowEditor {...props} />;
    case 'dwfInflow': return <DWFEditor {...props} />;
    case 'rdiiInflow': return <RDIIEditor {...props} />;
    case 'timeSeries': return <TimeSeriesEditor {...props} />;
    case 'curve': return <CurveEditor {...props} />;
    case 'pattern': return <PatternEditor {...props} />;
    case 'lidUsage': return <LIDUsageEditor {...props} />;
    case 'groundwater': return <GroundwaterEditor {...props} />;
    case 'treatment': return <TreatmentEditor {...props} />;
    case 'controlRules': return <ControlRulesEditor {...props} />;
    default: return null;
  }
}
