import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Layers, Play, Pause, SkipBack } from 'lucide-react';
import type { SimulationResults } from '@/lib/swmm-types';

// ---------------------------------------------------------------------------
// Consolidated .lid report parsing
// ---------------------------------------------------------------------------

// [RESULTS] variable order (after Subcatch/LID/Unit/Date/Elapsed columns)
const V = {
  inflow: 0, evap: 1, surfInfil: 2, pavePerc: 3, soilPerc: 4, storExfil: 5,
  runoff: 6, drain: 7, surfLevel: 8, paveLevel: 9, soilMoist: 10, storLevel: 11,
} as const;

interface LidLayerParams { [k: string]: number[]; }
interface LidControl { type: string; layers: LidLayerParams; }
interface LidUnitSeries {
  key: string; subcatch: string; lid: string; unitNo: number;
  t: Float64Array;              // elapsed hours
  dates: string[];
  vars: Float64Array[];         // 12 arrays
}
export interface LidReport {
  project: string;
  flowUnits: string;
  us: boolean;                  // US units (inches / in/hr)
  controls: Map<string, LidControl>;
  units: LidUnitSeries[];
}

// Budgets keeping huge consolidated reports from stalling/killing the tab:
// beyond MAX_TEXT_BYTES we refuse to parse; beyond MAX_ROWS_PER_UNIT rows
// are decimated by stride (first/last kept) for display purposes.
const MAX_TEXT_BYTES = 60 * 1024 * 1024;
const MAX_ROWS_PER_UNIT = 20000;
const MAX_CHART_POINTS = 1500;

function decimate<T>(arr: T[], maxLen: number): T[] {
  if (arr.length <= maxLen) return arr;
  const out: T[] = [];
  const stride = (arr.length - 1) / (maxLen - 1);
  for (let i = 0; i < maxLen; i++) out.push(arr[Math.round(i * stride)]);
  return out;
}

export function parseLidReport(text: string): LidReport | null {
  if (!text) return null;
  if (text.length > MAX_TEXT_BYTES) return null; // too large to render safely
  const controls = new Map<string, LidControl>();
  const rows = new Map<string, { t: number[]; dates: string[]; vars: number[][] }>();
  let project = '', flowUnits = '', us = false;
  let section = '';
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) continue;
    if (line.startsWith('[')) { section = line.trim(); continue; }
    if (line.startsWith(';')) continue;
    if (section === '[META]') {
      const [k, v] = line.split('\t');
      if (k === 'Project') project = (v || '').trim();
      else if (k === 'FlowUnits') flowUnits = (v || '').trim();
      else if (k === 'Units') us = /in\/hr/.test(v || '');
    } else if (section === '[CONTROLS]') {
      const cols = line.split('\t');
      if (cols.length === 2) {
        controls.set(cols[0], { type: cols[1], layers: {} });
      } else if (cols.length > 2) {
        const c = controls.get(cols[0]);
        if (c) c.layers[cols[1]] = cols.slice(2).map(Number);
      }
    } else if (section === '[RESULTS]') {
      const cols = line.split('\t');
      if (cols.length < 17) continue;
      const key = `${cols[0]}\t${cols[1]}\t${cols[2]}`;
      let r = rows.get(key);
      if (!r) { r = { t: [], dates: [], vars: Array.from({ length: 12 }, () => []) }; rows.set(key, r); }
      r.dates.push(cols[3].trim());
      r.t.push(parseFloat(cols[4]));
      for (let i = 0; i < 12; i++) r.vars[i].push(parseFloat(cols[5 + i]));
    }
  }
  if (rows.size === 0) return null;
  const units: LidUnitSeries[] = [];
  rows.forEach((r, key) => {
    const [subcatch, lid, unitNo] = key.split('\t');
    // decimate oversized series by index stride (same indices for all columns)
    let idx: number[] | null = null;
    if (r.t.length > MAX_ROWS_PER_UNIT) {
      idx = decimate(Array.from({ length: r.t.length }, (_, i) => i), MAX_ROWS_PER_UNIT);
    }
    const pick = (a: number[]) => (idx ? idx.map((i) => a[i]) : a);
    units.push({
      key, subcatch, lid, unitNo: parseInt(unitNo, 10) || 1,
      t: Float64Array.from(pick(r.t)),
      dates: idx ? idx.map((i) => r.dates[i]) : r.dates,
      vars: r.vars.map((a) => Float64Array.from(pick(a))),
    });
  });
  units.sort((a, b) => a.key.localeCompare(b.key));
  return { project, flowUnits, us, controls, units };
}

/** Linear interpolation of a variable at elapsed time h (holds ends). */
function interpAt(u: LidUnitSeries, vi: number, h: number): number {
  const t = u.t, v = u.vars[vi], n = t.length;
  if (n === 0) return 0;
  if (h <= t[0]) return v[0];
  if (h >= t[n - 1]) return v[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= h) lo = m; else hi = m; }
  const f = (h - t[lo]) / (t[hi] - t[lo] || 1);
  return v[lo] + f * (v[hi] - v[lo]);
}

/**
 * Trapezoidal integral of a rate variable (units/hr) -> depth units.
 * The .lid report omits long dry periods, so intervals much longer than the
 * typical report step are treated as dry (zero rate) rather than bridged —
 * bridging a gap would invent flow that never happened.
 */
function integrate(u: LidUnitSeries, vi: number): number {
  const t = u.t, v = u.vars[vi];
  if (t.length < 2) return 0;
  // median interval ~ report step
  const dts = Array.from({ length: t.length - 1 }, (_, i) => t[i + 1] - t[i]).sort((a, b) => a - b);
  const step = dts[dts.length >> 1] || 0;
  const gapLimit = step * 2.5;
  let s = 0;
  for (let i = 1; i < t.length; i++) {
    const dt = t[i] - t[i - 1];
    if (gapLimit > 0 && dt > gapLimit) continue; // dry-period gap: contributes 0
    s += 0.5 * (v[i] + v[i - 1]) * dt;
  }
  return s;
}

// ---------------------------------------------------------------------------
// .rpt LID Performance Summary parsing (for the continuity check panel)
// ---------------------------------------------------------------------------
interface RptLidRow { inflow: number; evap: number; infil: number; runoff: number; drain: number; init: number; final: number; err: number; }

function parseRptLidSummary(rpt: string | undefined): Map<string, RptLidRow> {
  const map = new Map<string, RptLidRow>();
  if (!rpt) return map;
  const lines = rpt.split('\n');
  let i = lines.findIndex((l) => l.trim().startsWith('LID Performance Summary'));
  if (i < 0) return map;
  for (i += 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\*{10,}/.test(line) && map.size > 0) break; // next section banner
    const m = line.match(/^\s*(\S+)\s+(\S+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*$/);
    if (m) {
      map.set(`${m[1]}\t${m[2]}`, {
        inflow: +m[3], evap: +m[4], infil: +m[5], runoff: +m[6],
        drain: +m[7], init: +m[8], final: +m[9], err: +m[10],
      });
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Layer stack rendering
// ---------------------------------------------------------------------------
interface StackLayer { name: string; thickness: number; color: string; }

function buildStack(ctrl: LidControl | undefined): StackLayer[] {
  if (!ctrl) return [];
  const L = ctrl.layers;
  const s: StackLayer[] = [];
  if (L.SURFACE) s.push({ name: 'SURFACE', thickness: Math.max(L.SURFACE[0], 0), color: '#7cb26e' });
  if (L.PAVEMENT) s.push({ name: 'PAVEMENT', thickness: L.PAVEMENT[0], color: '#8d8d99' });
  if (L.SOIL) s.push({ name: 'SOIL', thickness: L.SOIL[0], color: '#a9805a' });
  if (L.STORAGE) s.push({ name: 'STORAGE', thickness: L.STORAGE[0], color: '#c2b280' });
  if (L.DRAINMAT) s.push({ name: 'DRAINMAT', thickness: L.DRAINMAT[0], color: '#6b7a8f' });
  return s;
}

function fmt(v: number, d = 3): string {
  if (!isFinite(v)) return '—';
  return Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(d);
}

function hhmm(hours: number): string {
  const totalMin = Math.round(hours * 60);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  return (d > 0 ? `${d}d ` : '') + `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Soil moisture color from wilting point (dry tan) to porosity (saturated blue). */
function soilColor(theta: number, wp: number, por: number): string {
  const f = Math.max(0, Math.min(1, (theta - wp) / Math.max(por - wp, 1e-6)));
  const mix = (a: number, b: number) => Math.round(a + (b - a) * f);
  return `rgb(${mix(169, 74)}, ${mix(128, 199 * 0.6)}, ${mix(90, 190)})`;
}

// Arrow between layers, width scaled by rate / max
function FluxArrow({ x, y, dir, rate, max, label }: { x: number; y: number; dir: 'down' | 'up' | 'right'; rate: number; max: number; label: string }) {
  if (!(rate > 1e-6)) return null;
  const w = 2 + 10 * Math.min(1, rate / Math.max(max, 1e-9));
  const len = 22;
  let x2 = x, y2 = y;
  if (dir === 'down') y2 = y + len; else if (dir === 'up') y2 = y - len; else x2 = x + len;
  const ang = dir === 'down' ? 90 : dir === 'up' ? -90 : 0;
  return (
    <g>
      <line x1={x} y1={y} x2={x2} y2={y2} stroke="#2f6fb5" strokeWidth={w} strokeLinecap="round" opacity={0.85} />
      <polygon points="0,-6 10,0 0,6" fill="#2f6fb5" transform={`translate(${x2},${y2}) rotate(${ang})`} opacity={0.85} />
      <text x={dir === 'right' ? x2 + 14 : x + 16} y={dir === 'right' ? y2 + 4 : (y + y2) / 2 + 4} fontSize={10} fill="#2a2a3e">{label}</text>
    </g>
  );
}

// ---------------------------------------------------------------------------

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  results: SimulationResults | null;
  /** LID units defined in the project — used to explain an empty viewer. */
  lidUsage?: { subcatchId: string; lidId: string; rptFile: string }[];
  /** Turns on detailed reporting for every LID unit (caller re-runs). */
  onEnableReporting?: () => void;
  engineUsed?: string;
}

const SPEEDS = [1, 10, 60];

export default function LidViewerDialog({ open, onOpenChange, results, lidUsage = [], onEnableReporting, engineUsed }: Props) {
  const report = useMemo(() => parseLidReport(results?.lidReportText || ''), [results?.lidReportText]);
  const rptSummary = useMemo(() => parseRptLidSummary(results?.reportContent), [results?.reportContent]);
  const [unitKey, setUnitKey] = useState<string>('');
  const [time, setTime] = useState(0);           // elapsed hours
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  const unit = useMemo(
    () => report?.units.find((u) => u.key === unitKey) || report?.units[0] || null,
    [report, unitKey],
  );
  const ctrl = unit ? report?.controls.get(unit.lid) : undefined;
  const tEnd = unit && unit.t.length ? unit.t[unit.t.length - 1] : 0;
  const t0 = unit && unit.t.length ? unit.t[0] : 0;

  useEffect(() => {
    if (open && report && !report.units.some((u) => u.key === unitKey)) {
      setUnitKey(report.units[0]?.key || '');
      setTime(report.units[0]?.t[0] || 0);
      setPlaying(false);
    }
  }, [open, report, unitKey]);

  // animation loop: `speed` = simulated hours advanced per real second / 10
  useEffect(() => {
    if (!playing || !unit) return;
    lastTickRef.current = performance.now();
    const step = (now: number) => {
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      setTime((t) => {
        const next = t + dt * speed * 0.1;
        if (next >= tEnd) { setPlaying(false); return tEnd; }
        return next;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, speed, unit, tEnd]);

  // per-run maxima for stable arrow/chart scaling
  const maxima = useMemo(() => {
    const m = new Array(12).fill(0);
    if (unit) for (let vi = 0; vi < 12; vi++) for (let i = 0; i < unit.vars[vi].length; i++) m[vi] = Math.max(m[vi], unit.vars[vi][i]);
    return m;
  }, [unit]);

  const depthU = report?.us ? 'in' : 'mm';
  const rateU = report?.us ? 'in/hr' : 'mm/hr';

  // current values
  const cur = useMemo(() => {
    const c = new Array(12).fill(0);
    if (unit) for (let vi = 0; vi < 12; vi++) c[vi] = interpAt(unit, vi, time);
    return c;
  }, [unit, time]);

  // continuity panel: integrated .lid totals vs .rpt LID Performance Summary
  const continuity = useMemo(() => {
    if (!unit) return null;
    const rpt = rptSummary.get(`${unit.subcatch}\t${unit.lid}`);
    const rows = [
      { name: 'Total Inflow', lid: integrate(unit, V.inflow), rpt: rpt?.inflow },
      { name: 'Evap Loss', lid: integrate(unit, V.evap), rpt: rpt?.evap },
      { name: 'Infil Loss', lid: integrate(unit, V.storExfil), rpt: rpt?.infil },
      { name: 'Surface Outflow', lid: integrate(unit, V.runoff), rpt: rpt?.runoff },
      { name: 'Drain Outflow', lid: integrate(unit, V.drain), rpt: rpt?.drain },
    ];
    return rows.map((r) => {
      const base = Math.max(Math.abs(rpt?.inflow ?? 0), 1e-6);
      const diffPct = r.rpt === undefined ? null : (100 * (r.lid - r.rpt)) / base;
      return { ...r, diffPct };
    });
  }, [unit, rptSummary]);

  const stack = useMemo(() => buildStack(ctrl), [ctrl]);
  const rateMax = Math.max(maxima[V.inflow], maxima[V.drain], maxima[V.runoff], maxima[V.storExfil], 1e-9);

  // stack geometry
  const W = 340, PAD = 60, STACKW = 170;
  const totalTh = stack.reduce((s, l) => s + Math.max(l.thickness, 1), 0) || 1;
  const stackH = 300;
  let yCursor = 60;
  const layerRects = stack.map((l) => {
    const h = Math.max(26, (Math.max(l.thickness, 1) / totalTh) * stackH);
    const r = { ...l, y: yCursor, h };
    yCursor += h;
    return r;
  });
  const svgH = yCursor + 70;

  if (!report) {
    const off = lidUsage.filter((u) => !u.rptFile || u.rptFile === '*');
    const wrongEngine = !!results && engineUsed !== undefined && engineUsed !== 'wasm';
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg bg-white" data-testid="lid-viewer-dialog">
          <DialogHeader>
            <DialogTitle className="text-[#2c3e6b] flex items-center gap-2"><Layers className="w-5 h-5" /> LID Viewer</DialogTitle>
            <DialogDescription>Detailed, animated LID results are not available yet for this run.</DialogDescription>
          </DialogHeader>
          <div className="text-sm text-[#2a2a3e] space-y-3">
            {lidUsage.length === 0 && <p>This project has no LID units in <span className="font-mono">[LID_USAGE]</span>.</p>}
            {off.length > 0 && (
              <div>
                <p className="mb-1">
                  {off.length} of {lidUsage.length} LID unit{lidUsage.length === 1 ? '' : 's'} {off.length === 1 ? 'has' : 'have'} detailed
                  reporting turned off (the report-file column is <span className="font-mono">*</span>). SWMM only records
                  layer-by-layer detail for units that ask for it.
                </p>
                <ul className="max-h-28 overflow-y-auto text-xs font-mono text-[#6b6b7b] pl-4 list-disc">
                  {off.slice(0, 20).map((u, i) => <li key={i}>{u.subcatchId} — {u.lidId}</li>)}
                  {off.length > 20 && <li>…and {off.length - 20} more</li>}
                </ul>
                {onEnableReporting && (
                  <button
                    className="mt-2 px-3 py-1.5 rounded bg-[#2c3e6b] text-white text-sm hover:bg-[#22315a]"
                    onClick={() => { onEnableReporting(); onOpenChange(false); }}
                    data-testid="lid-enable-reporting"
                  >Turn on detailed reporting for all LID units</button>
                )}
                <p className="text-xs text-[#6b6b7b] mt-1">You can also set it per unit in the Subcatchment editor’s LID Usage grid.</p>
              </div>
            )}
            {wrongEngine && (
              <p className="text-xs text-[#6b6b7b]">
                Detailed LID output currently comes from the in-browser engine only. This run used{' '}
                <span className="font-mono">{engineUsed}</span> — switch the engine to WASM 5.2.4 and run again.
              </p>
            )}
            {off.length === 0 && lidUsage.length > 0 && !wrongEngine && (
              <p>Reporting is enabled — run the simulation again to generate detailed LID results.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const soilWp = ctrl?.layers.SOIL?.[3] ?? 0;
  const soilPor = ctrl?.layers.SOIL?.[1] ?? 0.5;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl bg-white max-h-[92vh] overflow-y-auto" data-testid="lid-viewer-dialog">
        <DialogHeader>
          <DialogTitle className="text-[#2c3e6b] flex items-center gap-2"><Layers className="w-5 h-5" /> LID Viewer</DialogTitle>
          <DialogDescription>
            Animated layer-by-layer view of detailed LID results (consolidated .lid report). Rates in {rateU}, depths in {depthU}.
          </DialogDescription>
        </DialogHeader>

        {/* controls row */}
        <div className="flex flex-wrap items-center gap-3 pb-2 border-b border-[#d0d0d8]">
          <select
            className="border border-[#d0d0d8] rounded px-2 py-1 text-sm text-[#2a2a3e] bg-white"
            value={unit?.key || ''}
            onChange={(e) => { setUnitKey(e.target.value); setPlaying(false); const u = report.units.find((x) => x.key === e.target.value); setTime(u?.t[0] || 0); }}
            data-testid="lid-unit-select"
          >
            {report.units.map((u) => (
              <option key={u.key} value={u.key}>{u.subcatch} — {u.lid} #{u.unitNo} ({report.controls.get(u.lid)?.type || '?'})</option>
            ))}
          </select>
          <button
            className="px-2 py-1 rounded border border-[#d0d0d8] text-[#2a2a3e] hover:bg-[#f0f0f4]"
            onClick={() => { setTime(t0); setPlaying(false); }}
            title="Back to start" data-testid="lid-rewind"
          ><SkipBack className="w-4 h-4" /></button>
          <button
            className="px-2 py-1 rounded border border-[#d0d0d8] text-[#2a2a3e] hover:bg-[#f0f0f4]"
            onClick={() => { if (time >= tEnd) setTime(t0); setPlaying((p) => !p); }}
            data-testid="lid-play-pause"
          >{playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}</button>
          <div className="flex items-center gap-1 text-xs text-[#6b6b7b]">
            {SPEEDS.map((s) => (
              <button key={s}
                className={`px-2 py-1 rounded border ${speed === s ? 'bg-[#2c3e6b] text-white border-[#2c3e6b]' : 'border-[#d0d0d8] text-[#2a2a3e] hover:bg-[#f0f0f4]'}`}
                onClick={() => setSpeed(s)} data-testid={`lid-speed-${s}`}
              >{s}×</button>
            ))}
          </div>
          <input
            type="range" min={t0} max={tEnd} step={(tEnd - t0) / 2000 || 0.01} value={time}
            onChange={(e) => { setPlaying(false); setTime(parseFloat(e.target.value)); }}
            className="flex-1 min-w-[160px]" data-testid="lid-scrubber"
          />
          <span className="text-sm font-mono text-[#2a2a3e] w-24 text-right" data-testid="lid-time-readout">{hhmm(time)}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* layer stack */}
          <div className="bg-[#f8f8fa] border border-[#d0d0d8] rounded p-2">
            <svg viewBox={`0 0 ${W} ${svgH}`} width="100%" data-testid="lid-stack-svg">
              {/* inflow arrow */}
              <FluxArrow x={PAD + STACKW / 2} y={16} dir="down" rate={cur[V.inflow]} max={rateMax} label={`In ${fmt(cur[V.inflow])}`} />
              {/* evap arrow */}
              <FluxArrow x={PAD + STACKW / 2 + 46} y={52} dir="up" rate={cur[V.evap]} max={rateMax} label={`Evap ${fmt(cur[V.evap])}`} />
              {layerRects.map((l) => {
                let fill = l.color;
                let waterFrac = 0;
                if (l.name === 'SURFACE' && l.thickness > 0) waterFrac = Math.min(1, cur[V.surfLevel] / l.thickness);
                if (l.name === 'PAVEMENT' && l.thickness > 0) waterFrac = Math.min(1, cur[V.paveLevel] / l.thickness);
                if ((l.name === 'STORAGE' || l.name === 'DRAINMAT') && l.thickness > 0) waterFrac = Math.min(1, cur[V.storLevel] / l.thickness);
                if (l.name === 'SOIL') fill = soilColor(cur[V.soilMoist], soilWp, soilPor);
                return (
                  <g key={l.name}>
                    <rect x={PAD} y={l.y} width={STACKW} height={l.h} fill={fill} stroke="#55556a" strokeWidth={1} opacity={0.55} />
                    {waterFrac > 0 && (
                      <rect x={PAD} y={l.y + l.h * (1 - waterFrac)} width={STACKW} height={l.h * waterFrac} fill="#4a9fd8" opacity={0.75} />
                    )}
                    <text x={PAD + 4} y={l.y + 13} fontSize={10} fontWeight={600} fill="#2a2a3e">{l.name}</text>
                    <text x={PAD + STACKW - 4} y={l.y + 13} fontSize={9} fill="#2a2a3e" textAnchor="end">{fmt(l.thickness, 0)} {depthU}</text>
                    {l.name === 'SOIL' && (
                      <text x={PAD + 4} y={l.y + l.h - 5} fontSize={9} fill="#1a1a2e">θ = {fmt(cur[V.soilMoist])}</text>
                    )}
                    {waterFrac > 0 && l.name !== 'SOIL' && (
                      <text x={PAD + 4} y={l.y + l.h - 5} fontSize={9} fill="#0b3d61">
                        {fmt(l.name === 'SURFACE' ? cur[V.surfLevel] : l.name === 'PAVEMENT' ? cur[V.paveLevel] : cur[V.storLevel])} {depthU}
                      </text>
                    )}
                  </g>
                );
              })}
              {/* inter-layer + outlet arrows */}
              {layerRects.map((l, i) => {
                const below = layerRects[i + 1];
                const xMid = PAD + STACKW / 2 - 40;
                if (l.name === 'SURFACE') {
                  return (
                    <g key={`fx-${l.name}`}>
                      <FluxArrow x={xMid} y={l.y + l.h - 10} dir="down" rate={cur[V.surfInfil]} max={rateMax} label={`Infil ${fmt(cur[V.surfInfil])}`} />
                      <FluxArrow x={PAD + STACKW + 6} y={l.y + l.h / 2} dir="right" rate={cur[V.runoff]} max={rateMax} label={`Runoff ${fmt(cur[V.runoff])}`} />
                    </g>
                  );
                }
                if (l.name === 'PAVEMENT') return <FluxArrow key={`fx-${l.name}`} x={xMid} y={l.y + l.h - 10} dir="down" rate={cur[V.pavePerc]} max={rateMax} label={`Perc ${fmt(cur[V.pavePerc])}`} />;
                if (l.name === 'SOIL' && below) return <FluxArrow key={`fx-${l.name}`} x={xMid} y={l.y + l.h - 10} dir="down" rate={cur[V.soilPerc]} max={rateMax} label={`Perc ${fmt(cur[V.soilPerc])}`} />;
                if (l.name === 'STORAGE' || (l.name === 'DRAINMAT' && !layerRects.some((x) => x.name === 'STORAGE'))) {
                  return (
                    <g key={`fx-${l.name}`}>
                      <FluxArrow x={xMid} y={l.y + l.h + 4} dir="down" rate={cur[V.storExfil]} max={rateMax} label={`Exfil ${fmt(cur[V.storExfil])}`} />
                      <FluxArrow x={PAD + STACKW + 6} y={l.y + l.h - 12} dir="right" rate={cur[V.drain]} max={rateMax} label={`Drain ${fmt(cur[V.drain])}`} />
                    </g>
                  );
                }
                return null;
              })}
            </svg>
          </div>

          {/* right column: strip chart + continuity */}
          <div className="flex flex-col gap-3">
            <StripChart unit={unit!} time={time} maxima={maxima} depthU={depthU} rateU={rateU} />
            <div className="bg-[#f8f8fa] border border-[#d0d0d8] rounded p-2 text-xs" data-testid="lid-continuity-panel">
              <div className="font-semibold text-[#2c3e6b] mb-1">Approximate mass check vs report ({depthU})</div>
              <table className="w-full">
                <thead>
                  <tr className="text-[#6b6b7b]"><th className="text-left font-normal">Component</th><th className="text-right font-normal">.lid ∫</th><th className="text-right font-normal">.rpt</th><th className="text-right font-normal">Δ%in</th></tr>
                </thead>
                <tbody>
                  {continuity?.map((r) => (
                    <tr key={r.name} className="text-[#2a2a3e]">
                      <td>{r.name}</td>
                      <td className="text-right font-mono">{fmt(r.lid, 2)}</td>
                      <td className="text-right font-mono">{r.rpt === undefined ? '—' : fmt(r.rpt, 2)}</td>
                      <td className={`text-right font-mono ${r.diffPct !== null && Math.abs(r.diffPct) > 2 ? 'text-red-600 font-semibold' : 'text-green-700'}`}>
                        {r.diffPct === null ? '—' : fmt(r.diffPct, 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-[#6b6b7b] mt-1">Approximate: .lid rows are integrated between reported time steps only (the file omits long dry periods, and storage change is not included). Δ% is relative to total inflow; |Δ| &gt; 2% flagged.</div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Strip chart: rates + levels over the run, with a time cursor
// ---------------------------------------------------------------------------
const CHART_SERIES: { vi: number; label: string; color: string; group: 'rate' | 'depth' }[] = [
  { vi: V.inflow, label: 'Inflow', color: '#2f6fb5', group: 'rate' },
  { vi: V.runoff, label: 'Runoff', color: '#c0392b', group: 'rate' },
  { vi: V.drain, label: 'Drain', color: '#8e44ad', group: 'rate' },
  { vi: V.storExfil, label: 'Exfil', color: '#16a085', group: 'rate' },
  { vi: V.surfLevel, label: 'Surf lvl', color: '#4a9fd8', group: 'depth' },
  { vi: V.storLevel, label: 'Stor lvl', color: '#b8860b', group: 'depth' },
];

function StripChart({ unit, time, maxima, depthU, rateU }: { unit: LidUnitSeries; time: number; maxima: number[]; depthU: string; rateU: string }) {
  const [visible, setVisible] = useState<Set<number>>(new Set(CHART_SERIES.map((s) => s.vi)));
  const W = 460, H = 180, PL = 8, PR = 8, PT = 8, PB = 18;
  const t0 = unit.t[0] ?? 0, tEnd = unit.t[unit.t.length - 1] ?? 1;
  const xOf = (h: number) => PL + ((h - t0) / (tEnd - t0 || 1)) * (W - PL - PR);
  const toggle = (vi: number) => setVisible((s) => { const n = new Set(s); n.has(vi) ? n.delete(vi) : n.add(vi); return n; });
  return (
    <div className="bg-[#f8f8fa] border border-[#d0d0d8] rounded p-2" data-testid="lid-strip-chart">
      <div className="flex flex-wrap gap-2 text-[10px] mb-1">
        {CHART_SERIES.map((s) => (
          <button key={s.vi} onClick={() => toggle(s.vi)}
            className={`px-1.5 py-0.5 rounded border ${visible.has(s.vi) ? 'border-transparent text-white' : 'border-[#d0d0d8] text-[#6b6b7b] bg-white'}`}
            style={visible.has(s.vi) ? { backgroundColor: s.color } : undefined}
          >{s.label} ({s.group === 'rate' ? rateU : depthU})</button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%">
        <rect x={PL} y={PT} width={W - PL - PR} height={H - PT - PB} fill="white" stroke="#d0d0d8" />
        {CHART_SERIES.filter((s) => visible.has(s.vi)).map((s) => {
          const max = Math.max(maxima[s.vi], 1e-9);
          const n = unit.t.length;
          const stride = Math.max(1, Math.ceil(n / 1500));
          const pts: string[] = [];
          for (let i = 0; i < n; i += stride) {
            const y = PT + (1 - unit.vars[s.vi][i] / max) * (H - PT - PB);
            pts.push(`${xOf(unit.t[i]).toFixed(1)},${y.toFixed(1)}`);
          }
          return <polyline key={s.vi} points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth={1.2} opacity={0.9} />;
        })}
        <line x1={xOf(time)} y1={PT} x2={xOf(time)} y2={H - PB} stroke="#e74c3c" strokeWidth={1.5} />
        <text x={PL} y={H - 5} fontSize={9} fill="#6b6b7b">{hhmm(t0)}</text>
        <text x={W - PR} y={H - 5} fontSize={9} fill="#6b6b7b" textAnchor="end">{hhmm(tEnd)}</text>
      </svg>
      <div className="text-[10px] text-[#6b6b7b]">Each series normalized to its own run maximum. Red line = current time.</div>
    </div>
  );
}
