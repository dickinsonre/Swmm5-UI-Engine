import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Layers, Play, Pause, SkipBack, Maximize2, Minimize2 } from 'lucide-react';
import type { SimulationResults } from '@/lib/swmm-types';

// ---------------------------------------------------------------------------
// Consolidated .lid report parsing
// ---------------------------------------------------------------------------

// [RESULTS] variable order (after Subcatch/LID/Unit/Date/Elapsed columns)
const V = {
  inflow: 0, evap: 1, surfInfil: 2, pavePerc: 3, soilPerc: 4, storExfil: 5,
  runoff: 6, drain: 7, surfLevel: 8, paveLevel: 9, soilMoist: 10, storLevel: 11,
} as const;

// One palette shared by the cross-section arrows and the chart legend, so a
// colour in the diagram can be read off the chart without matching numbers.
const C = {
  inflow: '#2f6fb5',
  evap: '#e67e22',
  infil: '#3aa0c9',   // surface -> soil/pavement infiltration
  perc: '#5bbcd6',    // percolation between internal layers
  exfil: '#16a085',   // storage -> native soil
  runoff: '#c0392b',
  drain: '#8e44ad',
  water: '#4a9fd8',
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

/** Index of the row nearest to elapsed time h. */
function nearestIndex(u: LidUnitSeries, h: number): number {
  const t = u.t, n = t.length;
  if (n === 0) return 0;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= h) lo = m; else hi = m; }
  return Math.abs(t[lo] - h) <= Math.abs(t[hi] - h) ? lo : hi;
}

/** Median reporting interval (hours); rows further apart are dry-period gaps. */
function medianStep(u: LidUnitSeries): number {
  if (u.t.length < 2) return 0;
  const dts = Array.from({ length: u.t.length - 1 }, (_, i) => u.t[i + 1] - u.t[i]).sort((a, b) => a - b);
  return dts[dts.length >> 1] || 0;
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
  const gapLimit = medianStep(u) * 2.5;
  let s = 0;
  for (let i = 1; i < t.length; i++) {
    const dt = t[i] - t[i - 1];
    if (gapLimit > 0 && dt > gapLimit) continue; // dry-period gap: contributes 0
    s += 0.5 * (v[i] + v[i - 1]) * dt;
  }
  return s;
}

/**
 * Water stored in the unit at row index i, as an equivalent depth.
 * Mirrors SWMM's own volume terms: surface and storage depths are scaled by
 * their void fractions, soil contributes theta x thickness.
 */
function storedDepth(u: LidUnitSeries, ctrl: LidControl | undefined, i: number): number {
  const L = ctrl?.layers || {};
  const surfVoid = L.SURFACE?.[1] ?? 1;
  const paveVoid = L.PAVEMENT?.[1] ?? 0;
  const soilTh = L.SOIL?.[0] ?? 0;
  const storVoid = L.STORAGE?.[1] ?? L.DRAINMAT?.[1] ?? 0;
  return (
    u.vars[V.surfLevel][i] * surfVoid +
    u.vars[V.paveLevel][i] * paveVoid +
    u.vars[V.soilMoist][i] * soilTh +
    u.vars[V.storLevel][i] * storVoid
  );
}

// ---------------------------------------------------------------------------
// .rpt LID Performance Summary parsing (for the mass-balance panel)
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
  // A green roof's drainage mat IS its storage: SWMM copies the drain mat's
  // thickness/void fraction into the storage layer during validation, so both
  // blocks appear in [CONTROLS] and both are driven by the one StorLevel.
  // Render the real drain mat only, never the synthesized duplicate.
  if (L.DRAINMAT) s.push({ name: 'DRAINMAT', thickness: L.DRAINMAT[0], color: '#6b7a8f' });
  else if (L.STORAGE) s.push({ name: 'STORAGE', thickness: L.STORAGE[0], color: '#c2b280' });
  return s;
}

function fmt(v: number, d = 3): string {
  if (!isFinite(v)) return '—';
  return Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(d);
}

/** Elapsed sim time, matching the chart axis convention. */
function elapsedLabel(hours: number): string {
  const totalMin = Math.max(0, Math.round(hours * 60));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  return `Day ${d}, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Compact axis form of the same convention. */
function axisLabel(hours: number): string {
  const totalMin = Math.max(0, Math.round(hours * 60));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  return `${d}d ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Soil moisture colour, wilting point (dry tan) -> porosity (saturated blue). */
function soilColor(theta: number, wp: number, por: number): string {
  const f = Math.max(0, Math.min(1, (theta - wp) / Math.max(por - wp, 1e-6)));
  const mix = (a: number, b: number) => Math.round(a + (b - a) * f);
  return `rgb(${mix(186, 58)}, ${mix(146, 132)}, ${mix(104, 178)})`;
}

/**
 * Flux arrow between layers. Width AND length scale with the rate so relative
 * importance reads without the label; a pathway that exists for this LID but
 * is currently inactive is drawn as a faint dashed ghost rather than removed,
 * so the diagram always shows the complete set of pathways.
 */
function FluxArrow({ x, y, dir, rate, max, label, color, labelSide = 'right', scale = 1 }: {
  x: number; y: number; dir: 'down' | 'up' | 'right'; rate: number; max: number; label: string; color: string;
  /** Which side of the arrow the label sits on — vertical arrows label outside the stack. */
  labelSide?: 'left' | 'right';
  scale?: number;
}) {
  const active = rate > 1e-6;
  const frac = Math.min(1, rate / Math.max(max, 1e-9));
  const w = (active ? 2 + 9 * frac : 1) * scale;
  const len = (active ? 14 + 14 * frac : 16) * scale;
  let x2 = x, y2 = y;
  if (dir === 'down') y2 = y + len; else if (dir === 'up') y2 = y - len; else x2 = x + len;
  const ang = dir === 'down' ? 90 : dir === 'up' ? -90 : 0;
  const op = active ? 0.9 : 0.28;
  const fs = 10 * scale;
  const textX = dir === 'right' ? x2 + 12 * scale : labelSide === 'left' ? x - 9 * scale : x + 9 * scale;
  return (
    <g>
      <line
        x1={x} y1={y} x2={x2} y2={y2} stroke={color} strokeWidth={w} strokeLinecap="round"
        strokeDasharray={active ? undefined : '3 3'} opacity={op}
      />
      <polygon
        points="0,-5 8,0 0,5" fill={color} opacity={op}
        transform={`translate(${x2},${y2}) rotate(${ang}) scale(${scale})`}
      />
      <text
        x={textX}
        y={dir === 'right' ? y2 + fs * 0.36 : (y + y2) / 2 + fs * 0.36}
        textAnchor={dir !== 'right' && labelSide === 'left' ? 'end' : 'start'}
        fontSize={fs} fill={active ? '#2a2a3e' : '#9a9aa8'}
      >{label}</text>
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
  /** Diagram-only layout: the cross-section takes the whole dialog. */
  const [maximized, setMaximized] = useState(false);
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

  // mass balance: integrated .lid totals + storage change vs .rpt summary
  const massBalance = useMemo(() => {
    if (!unit) return null;
    const rpt = rptSummary.get(`${unit.subcatch}\t${unit.lid}`);
    const n = unit.t.length;
    const dStorLid = n > 1 ? storedDepth(unit, ctrl, n - 1) - storedDepth(unit, ctrl, 0) : 0;
    const inflow = integrate(unit, V.inflow);
    const evap = integrate(unit, V.evap);
    const infil = integrate(unit, V.storExfil);
    const runoff = integrate(unit, V.runoff);
    const drain = integrate(unit, V.drain);
    const rows = [
      { name: 'Total Inflow', lid: inflow, rpt: rpt?.inflow, sign: 1 },
      { name: 'Evap Loss', lid: evap, rpt: rpt?.evap, sign: -1 },
      { name: 'Infil Loss', lid: infil, rpt: rpt?.infil, sign: -1 },
      { name: 'Surface Outflow', lid: runoff, rpt: rpt?.runoff, sign: -1 },
      { name: 'Drain Outflow', lid: drain, rpt: rpt?.drain, sign: -1 },
      { name: 'Storage Change', lid: dStorLid, rpt: rpt ? rpt.final - rpt.init : undefined, sign: -1 },
    ];
    const base = Math.max(Math.abs(rpt?.inflow ?? inflow), 1e-6);
    const withDiff = rows.map((r) => ({
      ...r,
      diffPct: r.rpt === undefined ? null : (100 * (r.lid - r.rpt)) / base,
    }));
    // closure: in - out - storage change (should be ~0 for both columns)
    const closeLid = inflow - evap - infil - runoff - drain - dStorLid;
    const closeRpt = rpt ? rpt.inflow - rpt.evap - rpt.infil - rpt.runoff - rpt.drain - (rpt.final - rpt.init) : undefined;
    return {
      rows: withDiff,
      closure: {
        name: 'Balance (in − out − Δstorage)',
        lid: closeLid, rpt: closeRpt,
        lidPct: (100 * closeLid) / base,
        rptPct: closeRpt === undefined ? null : (100 * closeRpt) / base,
      },
    };
  }, [unit, ctrl, rptSummary]);

  const stack = useMemo(() => buildStack(ctrl), [ctrl]);
  const rateMax = Math.max(maxima[V.inflow], maxima[V.drain], maxima[V.runoff], maxima[V.storExfil], maxima[V.surfInfil], 1e-9);

  // stack geometry — wider canvas and taller layers when the diagram is maximized
  const W = maximized ? 700 : 400;
  const PAD = maximized ? 190 : 108;      // left gutter holds the vertical flux labels
  const STACKW = maximized ? 320 : 180;
  const stackH = maximized ? 470 : 300;
  const minLayerH = maximized ? 52 : 34;
  const gScale = maximized ? 1.25 : 1;
  const totalTh = stack.reduce((s, l) => s + Math.max(l.thickness, 1), 0) || 1;
  let yCursor = maximized ? 74 : 58;
  const layerRects = stack.map((l) => {
    const h = Math.max(minLayerH, (Math.max(l.thickness, 1) / totalTh) * stackH);
    const r = { ...l, y: yCursor, h };
    yCursor += h;
    return r;
  });
  const svgH = yCursor + (maximized ? 78 : 62);
  const xFlux = PAD - 30 * gScale;        // vertical flux channel, just left of the stack

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
  const hasStorage = layerRects.some((l) => l.name === 'STORAGE' || l.name === 'DRAINMAT');

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
          <span className="text-sm font-mono text-[#2a2a3e] w-28 text-right" data-testid="lid-time-readout">{elapsedLabel(time)}</span>
          <button
            className={`px-2 py-1 rounded border ${maximized ? 'bg-[#2c3e6b] text-white border-[#2c3e6b]' : 'border-[#d0d0d8] text-[#2a2a3e] hover:bg-[#f0f0f4]'}`}
            onClick={() => setMaximized((m) => !m)}
            title={maximized ? 'Show chart and mass balance' : 'Maximize the cross-section diagram'}
            aria-label={maximized ? 'Restore split view' : 'Maximize diagram'}
            data-testid="lid-maximize"
          >{maximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}</button>
        </div>

        <div className={maximized ? 'grid grid-cols-1' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
          {/* layer stack */}
          <div className="bg-[#f8f8fa] border border-[#d0d0d8] rounded p-2">
            <svg
              viewBox={`0 0 ${W} ${svgH}`} width="100%"
              style={maximized ? { maxHeight: '68vh' } : undefined}
              data-testid="lid-stack-svg"
            >
              {/* inflow / evap at the top of the stack */}
              <FluxArrow x={xFlux} y={16 * gScale} dir="down" rate={cur[V.inflow]} max={rateMax} color={C.inflow} scale={gScale} labelSide="left" label={`In ${fmt(cur[V.inflow])}`} />
              <FluxArrow x={PAD + STACKW - 20 * gScale} y={layerRects[0] ? layerRects[0].y - 6 : 52} dir="up" rate={cur[V.evap]} max={rateMax} color={C.evap} scale={gScale} label={`Evap ${fmt(cur[V.evap])}`} />
              {layerRects.map((l) => {
                const levelVal: number | undefined =
                  l.name === 'SURFACE' ? cur[V.surfLevel]
                  : l.name === 'PAVEMENT' ? cur[V.paveLevel]
                  : (l.name === 'STORAGE' || l.name === 'DRAINMAT') ? cur[V.storLevel]
                  : undefined;
                const waterFrac = levelVal !== undefined && l.thickness > 0
                  ? Math.max(0, Math.min(1, levelVal / l.thickness)) : 0;
                const fill = l.name === 'SOIL' ? soilColor(cur[V.soilMoist], soilWp, soilPor) : l.color;
                const satFrac = l.name === 'SOIL'
                  ? Math.max(0, Math.min(1, (cur[V.soilMoist] - soilWp) / Math.max(soilPor - soilWp, 1e-6)))
                  : 0;
                return (
                  <g key={l.name}>
                    <rect x={PAD} y={l.y} width={STACKW} height={l.h} fill={fill} stroke="#55556a" strokeWidth={1} opacity={l.name === 'SOIL' ? 0.95 : 0.55} />
                    {waterFrac > 0 && (
                      <rect x={PAD} y={l.y + l.h * (1 - waterFrac)} width={STACKW} height={l.h * waterFrac} fill={C.water} opacity={0.78} />
                    )}
                    <text x={PAD + 5 * gScale} y={l.y + 13 * gScale} fontSize={10 * gScale} fontWeight={600} fill="#2a2a3e">{l.name}</text>
                    {/* current / capacity so geometry and state are not conflated */}
                    <text x={PAD + STACKW - 5 * gScale} y={l.y + 13 * gScale} fontSize={9 * gScale} fill="#2a2a3e" textAnchor="end">
                      {levelVal !== undefined ? `${fmt(levelVal, 1)} / ${fmt(l.thickness, 0)} ${depthU}` : `${fmt(l.thickness, 0)} ${depthU}`}
                    </text>
                    {l.name === 'SOIL' && (
                      <>
                        <text x={PAD + 5 * gScale} y={l.y + Math.max(26 * gScale, l.h - 7 * gScale)} fontSize={9 * gScale} fill="#1a1a2e">
                          θ {fmt(cur[V.soilMoist])} (wp {fmt(soilWp, 2)} → n {fmt(soilPor, 2)})
                        </text>
                        {/* saturation bar so the moisture shade is readable quantitatively */}
                        <rect x={PAD + STACKW - 54 * gScale} y={l.y + Math.max(18 * gScale, l.h - 17 * gScale)} width={50 * gScale} height={6 * gScale} fill="#ffffff" stroke="#55556a" strokeWidth={0.5} opacity={0.8} />
                        <rect x={PAD + STACKW - 54 * gScale} y={l.y + Math.max(18 * gScale, l.h - 17 * gScale)} width={50 * gScale * satFrac} height={6 * gScale} fill={C.water} opacity={0.9} />
                      </>
                    )}
                  </g>
                );
              })}
              {/* pathway arrows, coloured to match the chart legend */}
              {layerRects.map((l, i) => {
                const isBottom = i === layerRects.length - 1;
                // Vertical pathways run in a channel left of the stack with
                // their labels outside it, so they never sit on layer text.
                const parts: JSX.Element[] = [];
                const boundaryY = l.y + l.h - 9 * gScale;
                if (l.name === 'SURFACE') {
                  if (!isBottom) parts.push(<FluxArrow key="infil" x={xFlux} y={boundaryY} dir="down" rate={cur[V.surfInfil]} max={rateMax} color={C.infil} scale={gScale} labelSide="left" label={`Infil ${fmt(cur[V.surfInfil])}`} />);
                  parts.push(<FluxArrow key="runoff" x={PAD + STACKW + 4} y={l.y + l.h / 2} dir="right" rate={cur[V.runoff]} max={rateMax} color={C.runoff} scale={gScale} label={`Runoff ${fmt(cur[V.runoff])}`} />);
                } else if (l.name === 'PAVEMENT' && !isBottom) {
                  parts.push(<FluxArrow key="pperc" x={xFlux} y={boundaryY} dir="down" rate={cur[V.pavePerc]} max={rateMax} color={C.perc} scale={gScale} labelSide="left" label={`Perc ${fmt(cur[V.pavePerc])}`} />);
                } else if (l.name === 'SOIL' && !isBottom) {
                  parts.push(<FluxArrow key="sperc" x={xFlux} y={boundaryY} dir="down" rate={cur[V.soilPerc]} max={rateMax} color={C.perc} scale={gScale} labelSide="left" label={`Perc ${fmt(cur[V.soilPerc])}`} />);
                }
                // The bottom layer is where water leaves the unit, whatever it
                // is: a bio-cell may end at SOIL (no storage), in which case
                // SWMM reports the soil-to-native-soil flow as StorExfil.
                if (isBottom) {
                  parts.push(<FluxArrow key="exfil" x={xFlux} y={l.y + l.h + 4 * gScale} dir="down" rate={cur[V.storExfil]} max={rateMax} color={C.exfil} scale={gScale} labelSide="left" label={`Exfil ${fmt(cur[V.storExfil])}`} />);
                  parts.push(<FluxArrow key="drain" x={PAD + STACKW + 4} y={l.y + l.h - 14 * gScale} dir="right" rate={cur[V.drain]} max={rateMax} color={C.drain} scale={gScale} label={`Drain ${fmt(cur[V.drain])}`} />);
                }
                return parts.length ? <g key={`fx-${l.name}`}>{parts}</g> : null;
              })}
              {/* native soil below the unit, where exfiltration goes */}
              {hasStorage && (
                <text x={xFlux + 12 * gScale} y={svgH - 14 * gScale} fontSize={9 * gScale} fill="#9a9aa8">native soil</text>
              )}
            </svg>
          </div>

          {/* right column: strip chart + mass balance (hidden while maximized) */}
          <div className={maximized ? 'hidden' : 'flex flex-col gap-3'}>
            <StripChart
              unit={unit!} time={time} maxima={maxima} depthU={depthU} rateU={rateU}
              onSeek={(h) => { setPlaying(false); setTime(h); }}
            />
            <div className="bg-[#f8f8fa] border border-[#d0d0d8] rounded p-2 text-xs" data-testid="lid-continuity-panel">
              <div className="font-semibold text-[#2c3e6b] mb-1">Mass balance vs report ({depthU})</div>
              <table className="w-full">
                <thead>
                  <tr className="text-[#6b6b7b]"><th className="text-left font-normal">Component</th><th className="text-right font-normal">.lid</th><th className="text-right font-normal">.rpt</th><th className="text-right font-normal">Δ%in</th></tr>
                </thead>
                <tbody>
                  {massBalance?.rows.map((r) => (
                    <tr key={r.name} className="text-[#2a2a3e]">
                      <td>{r.name}</td>
                      <td className="text-right font-mono">{fmt(r.lid, 2)}</td>
                      <td className="text-right font-mono">{r.rpt === undefined ? '—' : fmt(r.rpt, 2)}</td>
                      <td className={`text-right font-mono ${severityClass(r.diffPct)}`}>{r.diffPct === null ? '—' : fmt(r.diffPct, 2)}</td>
                    </tr>
                  ))}
                  {massBalance && (
                    <tr className="border-t border-[#d0d0d8] font-semibold text-[#2a2a3e]">
                      <td>{massBalance.closure.name}</td>
                      <td className={`text-right font-mono ${severityClass(massBalance.closure.lidPct)}`}>{fmt(massBalance.closure.lid, 2)}</td>
                      <td className={`text-right font-mono ${severityClass(massBalance.closure.rptPct)}`}>{massBalance.closure.rpt === undefined ? '—' : fmt(massBalance.closure.rpt, 2)}</td>
                      <td className={`text-right font-mono ${severityClass(massBalance.closure.lidPct)}`}>{fmt(massBalance.closure.lidPct, 2)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="text-[#6b6b7b] mt-1">
                .lid values are integrated between reported time steps (long dry periods are omitted from the file, so they
                contribute nothing); storage change comes from the first and last reported state. Δ% is relative to total
                inflow — green ≤1%, amber ≤5%, red above.
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function severityClass(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !isFinite(pct)) return 'text-[#6b6b7b]';
  const a = Math.abs(pct);
  if (a <= 1) return 'text-green-700';
  if (a <= 5) return 'text-amber-600 font-semibold';
  return 'text-red-600 font-semibold';
}

// ---------------------------------------------------------------------------
// Strip chart: rates + levels over the run, with a time cursor
// ---------------------------------------------------------------------------
type ScaleMode = 'norm' | 'abs' | 'log';
type SeriesGroup = 'rate' | 'depth' | 'frac';

const CHART_SERIES: { vi: number; label: string; color: string; group: SeriesGroup }[] = [
  { vi: V.inflow, label: 'Inflow', color: C.inflow, group: 'rate' },
  { vi: V.runoff, label: 'Runoff', color: C.runoff, group: 'rate' },
  { vi: V.drain, label: 'Drain', color: C.drain, group: 'rate' },
  { vi: V.storExfil, label: 'Exfil', color: C.exfil, group: 'rate' },
  { vi: V.surfInfil, label: 'Infil', color: C.infil, group: 'rate' },
  { vi: V.evap, label: 'Evap', color: C.evap, group: 'rate' },
  { vi: V.surfLevel, label: 'Surf lvl', color: C.water, group: 'depth' },
  { vi: V.storLevel, label: 'Stor lvl', color: '#b8860b', group: 'depth' },
  { vi: V.soilMoist, label: 'Soil θ', color: '#a9805a', group: 'frac' },
];

const DEFAULT_VISIBLE = [V.inflow, V.runoff, V.drain, V.storExfil, V.storLevel];

function StripChart({ unit, time, maxima, depthU, rateU, onSeek }: {
  unit: LidUnitSeries; time: number; maxima: number[]; depthU: string; rateU: string;
  onSeek: (hours: number) => void;
}) {
  const [visible, setVisible] = useState<Set<number>>(new Set(DEFAULT_VISIBLE));
  const [mode, setMode] = useState<ScaleMode>('norm');
  const [hover, setHover] = useState<{ h: number; i: number; px: number } | null>(null);
  const W = 460, H = 190, PL = 8, PR = 8, PT = 8, PB = 20;
  const t0 = unit.t[0] ?? 0, tEnd = unit.t[unit.t.length - 1] ?? 1;
  const xOf = (h: number) => PL + ((h - t0) / (tEnd - t0 || 1)) * (W - PL - PR);
  const hOf = (px: number) => t0 + ((px - PL) / (W - PL - PR)) * (tEnd - t0 || 1);
  const toggle = (vi: number) => setVisible((s) => { const n = new Set(s); n.has(vi) ? n.delete(vi) : n.add(vi); return n; });

  const shown = CHART_SERIES.filter((s) => visible.has(s.vi));
  // group maxima for the shared-scale modes
  const groupMax: Record<SeriesGroup, number> = {
    rate: Math.max(1e-9, ...shown.filter((s) => s.group === 'rate').map((s) => maxima[s.vi])),
    depth: Math.max(1e-9, ...shown.filter((s) => s.group === 'depth').map((s) => maxima[s.vi])),
    frac: 1,
  };
  const scaleOf = (s: { vi: number; group: SeriesGroup }, v: number): number => {
    if (mode === 'norm') return v / Math.max(maxima[s.vi], 1e-9);
    const gm = groupMax[s.group];
    if (mode === 'abs') return v / gm;
    return Math.log10(1 + Math.max(v, 0)) / Math.log10(1 + gm);   // log
  };

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    if (px < PL || px > W - PR) { setHover(null); return; }
    const h = hOf(px);
    setHover({ h, i: nearestIndex(unit, h), px });
  };

  return (
    <div className="bg-[#f8f8fa] border border-[#d0d0d8] rounded p-2 relative" data-testid="lid-strip-chart">
      <div className="flex flex-wrap items-center gap-2 text-[10px] mb-1">
        {CHART_SERIES.map((s) => (
          <button key={s.vi} onClick={() => toggle(s.vi)}
            className={`px-1.5 py-0.5 rounded border ${visible.has(s.vi) ? 'border-transparent text-white' : 'border-[#d0d0d8] text-[#6b6b7b] bg-white'}`}
            style={visible.has(s.vi) ? { backgroundColor: s.color } : undefined}
            data-testid={`lid-series-${s.vi}`}
          >{s.label}{s.group === 'frac' ? '' : ` (${s.group === 'rate' ? rateU : depthU})`}</button>
        ))}
        <span className="ml-auto flex gap-1">
          {(['norm', 'abs', 'log'] as ScaleMode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-1.5 py-0.5 rounded border ${mode === m ? 'bg-[#2c3e6b] text-white border-[#2c3e6b]' : 'border-[#d0d0d8] text-[#2a2a3e] bg-white'}`}
              data-testid={`lid-scale-${m}`}
              title={m === 'norm' ? 'Each series scaled to its own maximum (compare shape)' : m === 'abs' ? 'True magnitude, shared scale per unit group' : 'Log scale, shared per unit group'}
            >{m === 'norm' ? 'Norm' : m === 'abs' ? 'Abs' : 'Log'}</button>
          ))}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`} width="100%"
        onMouseMove={handleMove} onMouseLeave={() => setHover(null)}
        onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); onSeek(hOf(((e.clientX - rect.left) / rect.width) * W)); }}
        style={{ cursor: 'crosshair' }}
      >
        <rect x={PL} y={PT} width={W - PL - PR} height={H - PT - PB} fill="white" stroke="#d0d0d8" />
        {shown.map((s) => {
          const n = unit.t.length;
          const stride = Math.max(1, Math.ceil(n / MAX_CHART_POINTS));
          const pts: string[] = [];
          for (let i = 0; i < n; i += stride) {
            const y = PT + (1 - scaleOf(s, unit.vars[s.vi][i])) * (H - PT - PB);
            pts.push(`${xOf(unit.t[i]).toFixed(1)},${y.toFixed(1)}`);
          }
          return <polyline key={s.vi} points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth={1.2} opacity={0.9} />;
        })}
        <line x1={xOf(time)} y1={PT} x2={xOf(time)} y2={H - PB} stroke="#e74c3c" strokeWidth={1.5} />
        {hover && <line x1={hover.px} y1={PT} x2={hover.px} y2={H - PB} stroke="#6b6b7b" strokeWidth={0.8} strokeDasharray="3 3" />}
        {mode !== 'norm' && (
          <text x={PL + 3} y={PT + 9} fontSize={8} fill="#6b6b7b">
            max {fmt(groupMax.rate, 2)} {rateU}{shown.some((s) => s.group === 'depth') ? ` · ${fmt(groupMax.depth, 1)} ${depthU}` : ''}
          </text>
        )}
        <text x={PL} y={H - 6} fontSize={9} fill="#6b6b7b">{axisLabel(t0)}</text>
        <text x={W - PR} y={H - 6} fontSize={9} fill="#6b6b7b" textAnchor="end">{axisLabel(tEnd)}</text>
      </svg>
      {hover && (
        <div
          className="absolute z-10 bg-white border border-[#d0d0d8] rounded shadow px-2 py-1 text-[10px] text-[#2a2a3e] pointer-events-none"
          style={{ left: `calc(${(hover.px / W) * 100}% + 8px)`, top: 30 }}
          data-testid="lid-chart-tooltip"
        >
          <div className="font-semibold text-[#2c3e6b]">{elapsedLabel(unit.t[hover.i])}</div>
          {shown.map((s) => (
            <div key={s.vi} className="flex gap-2 justify-between">
              <span style={{ color: s.color }}>{s.label}</span>
              <span className="font-mono">{fmt(unit.vars[s.vi][hover.i], 3)}{s.group === 'frac' ? '' : ` ${s.group === 'rate' ? rateU : depthU}`}</span>
            </div>
          ))}
        </div>
      )}
      <div className="text-[10px] text-[#6b6b7b]">
        {mode === 'norm' ? 'Each series scaled to its own maximum — shapes comparable, magnitudes are not.'
          : mode === 'abs' ? 'True magnitude, one shared scale per unit group.'
          : 'Log scale, one shared scale per unit group.'} Click the chart to jump the animation there.
      </div>
    </div>
  );
}
