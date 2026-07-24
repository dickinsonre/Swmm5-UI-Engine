import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { SwmmProject, SimulationResults, XSection, CurvePoint, TimeSeriesPoint } from '@/lib/swmm-types';
import { CrossSectionSvg } from '@/components/swmm/Panels';

// ---- Design system (per SWMM5 Graphics Diagram Suite spec) ----
const C = {
  page: '#fafaf8', card: '#ffffff', border: '#e4e1da', ink: '#2f3439', muted: '#757a80',
  grid: '#e7e4de', axis: '#b9b4aa',
  blue: '#46677f', teal: '#4d8577', amber: '#c07f2e', red: '#b04a41', slate: '#66727d',
  mauve: '#7a6a8a', olive: '#8a7a4d', cyanSlate: '#4d7a85', tan: '#96684d',
  rampLo: '#2e5a82', rampMid: '#d6a450', rampHi: '#b04a41',
};
const SERIES = [C.blue, C.teal, C.amber, C.red, C.mauve, C.olive, C.cyanSlate, C.tan];

function lerpColor(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  const p = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${p.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}
function capacityRamp(t: number): string {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5 ? lerpColor(C.rampLo, C.rampMid, c * 2) : lerpColor(C.rampMid, C.rampHi, (c - 0.5) * 2);
}
const IMPERV_RAMP = ['#e3ebdd', '#bcd0af', '#94b482', '#6f9358', '#4f7042'];

function isSI(project: SwmmProject): boolean {
  const fu = (project.options['FLOW_UNITS'] || 'CFS').toUpperCase();
  return ['LPS', 'CMS', 'MLD'].includes(fu);
}
function niceTicks(min: number, max: number, count = 5): number[] {
  if (!isFinite(min) || !isFinite(max) || min === max) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(v);
  return ticks;
}
function fmt(v: number): string {
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1).replace(/\.0$/, '');
  if (Math.abs(v) >= 0.01 || v === 0) return String(Math.round(v * 100) / 100);
  return v.toExponential(1);
}

// ---- Generic framed-axes chart ----
interface Series { name: string; color: string; pts: [number, number][]; dashed?: boolean; dots?: boolean; bars?: boolean }
function Chart({ w = 380, h = 220, series, xLabel, yLabel, annotations, xTicksFmt }: {
  w?: number; h?: number; series: Series[]; xLabel: string; yLabel: string;
  annotations?: { x: number; y: number; text: string; color?: string }[];
  xTicksFmt?: (v: number) => string;
}) {
  const m = { l: 48, r: 10, t: 10, b: 34 };
  const all = series.flatMap(s => s.pts);
  if (all.length === 0) return <div className="text-xs" style={{ color: C.muted }}>No data</div>;
  let xMin = Math.min(...all.map(p => p[0])), xMax = Math.max(...all.map(p => p[0]));
  let yMin = Math.min(0, ...all.map(p => p[1])), yMax = Math.max(...all.map(p => p[1]));
  if (xMin === xMax) { xMin -= 1; xMax += 1; }
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  yMax += (yMax - yMin) * 0.06;
  const sx = (x: number) => m.l + ((x - xMin) / (xMax - xMin)) * (w - m.l - m.r);
  const sy = (y: number) => h - m.b - ((y - yMin) / (yMax - yMin)) * (h - m.t - m.b);
  const xT = niceTicks(xMin, xMax), yT = niceTicks(yMin, yMax);
  return (
    <svg width={w} height={h} style={{ maxWidth: '100%' }}>
      {yT.map(t => <line key={`gy${t}`} x1={m.l} x2={w - m.r} y1={sy(t)} y2={sy(t)} stroke={C.grid} />)}
      {xT.map(t => <line key={`gx${t}`} x1={sx(t)} x2={sx(t)} y1={m.t} y2={h - m.b} stroke={C.grid} />)}
      <rect x={m.l} y={m.t} width={w - m.l - m.r} height={h - m.t - m.b} fill="none" stroke={C.axis} />
      {series.map((s, si) => s.bars
        ? s.pts.map((p, i) => {
            const bw = Math.max(1, (w - m.l - m.r) / Math.max(1, s.pts.length) * 0.7);
            return <rect key={`b${si}-${i}`} x={sx(p[0]) - bw / 2} y={Math.min(sy(p[1]), sy(0))} width={bw} height={Math.abs(sy(p[1]) - sy(0))} fill={s.color} opacity={0.85} />;
          })
        : s.dots
        ? s.pts.map((p, i) => <circle key={`d${si}-${i}`} cx={sx(p[0])} cy={sy(p[1])} r={2.2} fill={s.color} />)
        : <polyline key={si} points={s.pts.map(p => `${sx(p[0])},${sy(p[1])}`).join(' ')} fill="none" stroke={s.color} strokeWidth={1.6} strokeDasharray={s.dashed ? '5 3' : undefined} />
      )}
      {xT.map(t => <text key={`tx${t}`} x={sx(t)} y={h - m.b + 13} fontSize={10} fill={C.muted} textAnchor="middle">{xTicksFmt ? xTicksFmt(t) : fmt(t)}</text>)}
      {yT.map(t => <text key={`ty${t}`} x={m.l - 5} y={sy(t) + 3} fontSize={10} fill={C.muted} textAnchor="end">{fmt(t)}</text>)}
      <text x={(m.l + w - m.r) / 2} y={h - 4} fontSize={10.5} fill={C.ink} fontStyle="italic" textAnchor="middle">{xLabel}</text>
      <text x={12} y={(m.t + h - m.b) / 2} fontSize={10.5} fill={C.ink} fontStyle="italic" textAnchor="middle" transform={`rotate(-90 12 ${(m.t + h - m.b) / 2})`}>{yLabel}</text>
      {annotations?.map((a, i) => (
        <g key={i}>
          <line x1={sx(a.x)} x2={sx(a.x)} y1={m.t} y2={h - m.b} stroke={a.color || C.red} strokeDasharray="4 3" />
          <text x={Math.min(sx(a.x) + 4, w - 90)} y={m.t + 12 + i * 12} fontSize={9.5} fill={a.color || C.red}>{a.text}</text>
        </g>
      ))}
      <g>
        {series.filter(s => s.name).map((s, i) => (
          <g key={s.name} transform={`translate(${m.l + 8}, ${m.t + 6 + i * 13})`}>
            <rect width={10} height={4} y={-3} fill={s.color} />
            <text x={14} fontSize={9.5} fill={C.ink}>{s.name}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

// ---- Card wrapper ----
function Card({ id, group, title, tags, note, children, testId }: {
  id: string; group: 'A' | 'B'; title: string; tags: string[]; note: string; children: React.ReactNode; testId: string;
}) {
  return (
    <div data-testid={testId} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12, breakInside: 'avoid' }}>
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span style={{ background: group === 'A' ? C.blue : C.teal, color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 9 }}>{id}</span>
        <span style={{ color: C.ink, fontSize: 13, fontWeight: 600 }}>{title}</span>
        {tags.map(t => <span key={t} style={{ fontFamily: 'monospace', fontSize: 9, color: C.muted, background: C.page, border: `1px solid ${C.border}`, padding: '0 4px', borderRadius: 3 }}>{t}</span>)}
      </div>
      <div className="overflow-x-auto">{children}</div>
      <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6, borderTop: `1px solid ${C.border}`, paddingTop: 4 }}>{note}</div>
    </div>
  );
}
function NeedsRun() {
  return <div className="flex items-center justify-center h-32 text-xs" style={{ color: C.muted }}>Run a simulation to populate this diagram</div>;
}

// ================= Group A =================

function D1XSectionGallery({ project }: { project: SwmmProject }) {
  const groups = useMemo(() => {
    const byShape = new Map<string, { count: number; sample: XSection }>();
    for (const xs of Object.values(project.xsections)) {
      const g = byShape.get(xs.shape);
      if (g) g.count++;
      else byShape.set(xs.shape, { count: 1, sample: xs });
    }
    return Array.from(byShape.entries()).sort((a, b) => b[1].count - a[1].count);
  }, [project]);
  if (groups.length === 0) return <div className="text-xs" style={{ color: C.muted }}>No [XSECTIONS] in model</div>;
  return (
    <div className="flex flex-wrap gap-2">
      {groups.map(([shape, g]) => (
        <div key={shape} data-testid={`d1-shape-${shape}`} className="flex flex-col items-center" style={{ width: 110, border: `1px solid ${C.border}`, borderRadius: 4, padding: 6, background: C.page }}>
          <CrossSectionSvg xs={g.sample} size={72} />
          <div style={{ fontSize: 9.5, color: C.ink, fontWeight: 600, marginTop: 2, textAlign: 'center' }}>{shape}</div>
          <div style={{ fontSize: 9, color: C.amber }}>Geom1 = {typeof g.sample.geom1 === 'number' ? fmt(g.sample.geom1) : g.sample.geom1}</div>
          <span style={{ fontSize: 9, background: C.blue, color: '#fff', borderRadius: 8, padding: '0 6px', marginTop: 2 }}>{g.count} conduit{g.count === 1 ? '' : 's'}</span>
        </div>
      ))}
    </div>
  );
}

function pumpCurveFamilies(project: SwmmProject) {
  const fams = new Map<string, { name: string; pts: CurvePoint[] }[]>();
  for (const [name, pts] of Object.entries(project.curves)) {
    const t = (pts[0]?.type || '').toUpperCase();
    if (t.startsWith('PUMP')) {
      if (!fams.has(t)) fams.set(t, []);
      fams.get(t)!.push({ name, pts });
    }
  }
  return fams;
}
const PUMP_AXES: Record<string, [string, string]> = {
  PUMP1: ['Wet-well volume', 'Outflow'], PUMP2: ['Depth', 'Outflow'],
  PUMP3: ['Flow', 'Head'], PUMP4: ['Depth', 'Outflow'], PUMP5: ['Head', 'Outflow'],
};
function D2PumpCurves({ project }: { project: SwmmProject }) {
  const fams = useMemo(() => pumpCurveFamilies(project), [project]);
  if (fams.size === 0) return <div className="text-xs" style={{ color: C.muted }}>No pump curves in [CURVES]</div>;
  return (
    <div className="flex flex-wrap gap-3">
      {Array.from(fams.entries()).map(([fam, curves]) => (
        <div key={fam}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: C.ink }}>{fam} ({curves.length})</div>
          <Chart w={300} h={190} xLabel={PUMP_AXES[fam]?.[0] || 'X'} yLabel={PUMP_AXES[fam]?.[1] || 'Y'}
            series={curves.map((c, i) => ({ name: c.name, color: SERIES[i % SERIES.length], pts: c.pts.map(p => [p.x, p.y] as [number, number]) }))} />
        </div>
      ))}
    </div>
  );
}

function D3StorageCurves({ project }: { project: SwmmProject }) {
  const tabular = useMemo(() =>
    Object.entries(project.curves).filter(([, pts]) => (pts[0]?.type || '').toUpperCase() === 'STORAGE'), [project]);
  const functional = useMemo(() =>
    project.storageUnits.filter(s => s.shape.toUpperCase() === 'FUNCTIONAL' && s.curveParams.length >= 1), [project]);
  const volSeries: Series[] = functional.slice(0, 4).map((s, i) => {
    const A = parseFloat(s.curveParams[0]) || 0, B = parseFloat(s.curveParams[1]) || 0, Cc = parseFloat(s.curveParams[2]) || 0;
    const pts: [number, number][] = [];
    const dMax = s.maxDepth || 1;
    for (let k = 0; k <= 20; k++) {
      const d = (dMax * k) / 20;
      const vol = B === 0 ? (A + Cc) * d : (A * Math.pow(d, B + 1)) / (B + 1) + Cc * d;
      pts.push([d, vol]);
    }
    return { name: s.id, color: SERIES[i % SERIES.length], pts };
  });
  if (tabular.length === 0 && volSeries.length === 0) return <div className="text-xs" style={{ color: C.muted }}>No storage curves or functional storage units</div>;
  return (
    <div className="flex flex-wrap gap-3">
      {tabular.length > 0 && (
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: C.ink }}>Tabular depth–area ({tabular.length})</div>
          <Chart w={340} h={210} xLabel="Surface area" yLabel="Depth"
            series={tabular.slice(0, 8).map(([name, pts], i) => ({ name, color: SERIES[i % SERIES.length], pts: pts.map(p => [p.y, p.x] as [number, number]) }))} />
        </div>
      )}
      {volSeries.length > 0 && (
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: C.ink }}>Functional units — accumulated volume V(d)</div>
          <Chart w={340} h={210} xLabel="Depth" yLabel="Volume" series={volSeries} />
        </div>
      )}
    </div>
  );
}

function tsToHours(pts: TimeSeriesPoint[]): [number, number][] {
  // dateTime is either "H:MM" elapsed or "date time"; normalize to elapsed hours
  let t0: number | null = null;
  return pts.map((p, i) => {
    const dt = p.dateTime.trim();
    if (/^\d+:\d+$/.test(dt)) {
      const [h, mn] = dt.split(':').map(Number);
      return [h + mn / 60, p.value] as [number, number];
    }
    const d = new Date(dt);
    if (!isNaN(d.getTime())) {
      if (t0 === null) t0 = d.getTime();
      return [(d.getTime() - t0) / 3600000, p.value] as [number, number];
    }
    return [i, p.value] as [number, number];
  });
}

function D4Hyetographs({ project }: { project: SwmmProject }) {
  const gageBindings = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const g of project.raingages) {
      if (g.sourceType?.toUpperCase() === 'TIMESERIES' && g.sourceName) {
        const nm = g.sourceName;
        if (!map.has(nm)) map.set(nm, []);
        map.get(nm)!.push(g.id);
      }
    }
    return map;
  }, [project]);
  const storms = useMemo(() => {
    const entries = Object.entries(project.timeseries).filter(([name]) =>
      /year|storm|rain|design/i.test(name) || gageBindings.has(name));
    const list = entries.length > 0 ? entries : Object.entries(project.timeseries).slice(0, 6);
    return list.slice(0, 6);
  }, [project, gageBindings]);
  if (storms.length === 0) return <div className="text-xs" style={{ color: C.muted }}>No rainfall time series in model</div>;
  const maxI = Math.max(...storms.flatMap(([, pts]) => pts.map(p => p.value)), 0.001);
  return (
    <div className="flex flex-wrap gap-3">
      {storms.map(([name, pts]) => {
        const hp = tsToHours(pts);
        const peak = hp.reduce((a, b) => (b[1] > a[1] ? b : a), hp[0]);
        let cum = 0;
        const cumPts: [number, number][] = hp.map((p, i) => {
          const dt = i === 0 ? (hp.length > 1 ? hp[1][0] - hp[0][0] : 1) : p[0] - hp[i - 1][0];
          cum += p[1] * Math.max(dt, 0);
          return [p[0], cum];
        });
        const total = cum || 1;
        const cumScaled: [number, number][] = cumPts.map(p => [p[0], (p[1] / total) * maxI]);
        const bound = gageBindings.get(name);
        return (
          <div key={name} data-testid={`d4-storm-${name}`}>
            <div className="flex items-center gap-1">
              <span style={{ fontSize: 10.5, fontWeight: 600, color: C.ink }}>{name}</span>
              {bound && <span style={{ fontSize: 8.5, background: C.teal, color: '#fff', borderRadius: 6, padding: '0 5px' }}>{bound.join(', ')}</span>}
            </div>
            <Chart w={250} h={170} xLabel="hr" yLabel="Intensity"
              series={[
                { name: '', color: C.blue, pts: hp, bars: true },
                { name: '', color: C.amber, pts: cumScaled },
              ]}
              annotations={[{ x: peak[0], y: peak[1], text: `pk ${fmt(peak[1])} · tot ${fmt(total)}`, color: C.red }]} />
          </div>
        );
      })}
    </div>
  );
}

function D5BoundaryCurves({ project }: { project: SwmmProject }) {
  const ratings = useMemo(() =>
    Object.entries(project.curves).filter(([, pts]) => (pts[0]?.type || '').toUpperCase() === 'RATING'), [project]);
  const boundaryTs = useMemo(() => {
    const names = new Set(project.outfalls.filter(o => o.stageData && project.timeseries[o.stageData]).map(o => o.stageData!));
    for (const nm of Object.keys(project.timeseries)) if (/river|tide|stage|level|boundary/i.test(nm)) names.add(nm);
    return Array.from(names).slice(0, 4).map(nm => ({ name: nm, pts: tsToHours(project.timeseries[nm] || []) })).filter(s => s.pts.length > 0);
  }, [project]);
  if (ratings.length === 0 && boundaryTs.length === 0) return <div className="text-xs" style={{ color: C.muted }}>No rating curves or boundary time series</div>;
  return (
    <div className="flex flex-wrap gap-3">
      {ratings.length > 0 && (
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: C.ink }}>Rating curves</div>
          <Chart w={320} h={200} xLabel="Head" yLabel="Outflow"
            series={ratings.slice(0, 4).map(([name, pts], i) => ({ name, color: SERIES[i % SERIES.length], pts: pts.map(p => [p.x, p.y] as [number, number]) }))} />
        </div>
      )}
      {boundaryTs.length > 0 && (
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: C.ink }}>Boundary time series</div>
          <Chart w={320} h={200} xLabel="hr" yLabel="Value"
            series={boundaryTs.map((s, i) => ({ name: s.name, color: SERIES[(i + 1) % SERIES.length], pts: s.pts, dashed: i % 2 === 1 }))} />
        </div>
      )}
    </div>
  );
}

const LID_LAYER_COLORS: Record<string, string> = {
  SURFACE: '#8fae7c', PAVEMENT: '#9a9a94', SOIL: '#96684d', STORAGE: '#b9b4aa',
  DRAIN: '#4d7a85', DRAINMAT: '#7a6a8a', REMOVALS: C.slate,
};
function D6LidLayers({ project }: { project: SwmmProject }) {
  if (project.lidControls.length === 0) return <div className="text-xs" style={{ color: C.muted }}>No LID controls in model</div>;
  return (
    <div className="flex flex-wrap gap-3">
      {project.lidControls.map(lid => {
        const layers = lid.layers
          .map(l => ({ name: (l[0] || '').toUpperCase(), thick: parseFloat(l[1]) || 0 }))
          .filter(l => l.name && l.name !== 'REMOVALS');
        const total = layers.reduce((s, l) => s + Math.max(l.thick, 2), 0) || 1;
        const H = 150;
        return (
          <div key={lid.id} data-testid={`d6-lid-${lid.id}`} className="flex flex-col items-center" style={{ width: 130 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: C.ink }}>{lid.id}</div>
            <div style={{ fontSize: 9, color: C.muted, marginBottom: 2 }}>{lid.type}</div>
            <svg width={120} height={H + 10}>
              {(() => {
                let y = 5;
                return layers.map(l => {
                  const hh = (Math.max(l.thick, 2) / total) * H;
                  const rect = (
                    <g key={l.name + y}>
                      <rect x={15} y={y} width={90} height={hh} fill={LID_LAYER_COLORS[l.name] || C.slate} stroke={C.border} />
                      <text x={60} y={y + hh / 2 + 3} fontSize={8.5} fill="#fff" textAnchor="middle">{l.name}{l.thick > 0 ? ` ${fmt(l.thick)}` : ''}</text>
                    </g>
                  );
                  y += hh;
                  return rect;
                });
              })()}
            </svg>
          </div>
        );
      })}
    </div>
  );
}

function D7SubcatchIdeal({ project }: { project: SwmmProject }) {
  const [subId, setSubId] = useState(project.subcatchments[0]?.id || '');
  const sub = project.subcatchments.find(s => s.id === subId) || project.subcatchments[0];
  if (!sub) return <div className="text-xs" style={{ color: C.muted }}>No subcatchments in model</div>;
  const si = isSI(project);
  const areaM2 = sub.area * (si ? 10000 : 43560); // ha→m², ac→ft²
  const flowLen = sub.width > 0 ? areaM2 / sub.width : 0;
  const fImp = Math.max(0, Math.min(1, sub.pctImperv / 100));
  const W = 340, H = 190, skew = 45;
  const px = 30, py = 40, pw = W - 100, ph = H - 80;
  const splitX = px + skew * 0.5 + (pw - skew * 0.5) * fImp;
  const sa = project.subareas[sub.id];
  return (
    <div className="flex gap-4 flex-wrap">
      <div>
        <select data-testid="d7-sub-select" value={sub.id} onChange={e => setSubId(e.target.value)}
          style={{ fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 3, marginBottom: 4 }}>
          {project.subcatchments.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
        </select>
        <svg width={W} height={H}>
          <polygon points={`${px + skew},${py} ${px + pw},${py} ${px + pw - skew},${py + ph} ${px},${py + ph}`} fill="#dfe8d8" stroke={C.axis} />
          <polygon points={`${px + skew},${py} ${splitX + skew * (1 - fImp) * 0},${py} ${splitX},${py + ph} ${px},${py + ph}`} fill="#a8adb3" stroke={C.axis} />
          <text x={px + 30} y={py + ph / 2} fontSize={9.5} fill="#fff">Imperv {fmt(sub.pctImperv)}%</text>
          <text x={px + pw - 90} y={py + ph / 2} fontSize={9.5} fill={C.ink}>Perv {fmt(100 - sub.pctImperv)}%</text>
          {[0.25, 0.55, 0.85].map(t => (
            <g key={t}>
              <line x1={px + skew + (pw - skew) * t} y1={py + 12} x2={px + (pw - skew) * t + skew - 14} y2={py + ph - 12} stroke="#fff" strokeWidth={1.5} markerEnd="url(#d7arrow)" />
            </g>
          ))}
          <defs><marker id="d7arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#fff" /></marker></defs>
          <line x1={px + skew} y1={py - 10} x2={px + pw} y2={py - 10} stroke={C.amber} strokeWidth={1.4} />
          <text x={(px + skew + px + pw) / 2} y={py - 15} fontSize={9.5} fill={C.amber} textAnchor="middle">Width = {fmt(sub.width)}</text>
          <line x1={px + pw / 2 - 20} y1={py + ph} x2={px + pw / 2 + 40} y2={py + ph} stroke={C.teal} strokeWidth={2.5} markerEnd="url(#d7arrow2)" />
          <defs><marker id="d7arrow2" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill={C.teal} /></marker></defs>
          <text x={px + pw / 2 + 45} y={py + ph + 4} fontSize={9.5} fill={C.teal}>→ {sub.outlet}</text>
          <ellipse cx={W - 45} cy={22} rx={26} ry={12} fill="#cfd8e0" stroke={C.axis} />
          <text x={W - 45} y={25} fontSize={8.5} fill={C.ink} textAnchor="middle">{sub.rainGage}</text>
          {[0, 1, 2].map(i => <line key={i} x1={W - 58 + i * 12} y1={34} x2={W - 62 + i * 12} y2={44} stroke={C.blue} strokeWidth={1.2} />)}
        </svg>
      </div>
      <table style={{ fontSize: 10.5, color: C.ink, alignSelf: 'center' }}>
        <tbody>
          {[['Area', `${fmt(sub.area)} ${si ? 'ha' : 'ac'}`], ['Width', fmt(sub.width)], ['% Imperv', fmt(sub.pctImperv)], ['Slope', `${fmt(sub.slope)} %`],
            ['Flow length', fmt(flowLen)], ['Rain gage', sub.rainGage], ['Outlet', sub.outlet],
            ...(sa ? [['N-Imperv / N-Perv', `${sa.nImperv} / ${sa.nPerv}`], ['Route to', sa.routeTo]] : [])]
            .map(([k, v]) => <tr key={k as string}><td style={{ color: C.muted, paddingRight: 8 }}>{k}</td><td style={{ fontWeight: 600 }}>{v}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

function D8Patterns({ project }: { project: SwmmProject }) {
  const entries = Object.entries(project.patterns);
  if (entries.length === 0) return <div className="text-xs" style={{ color: C.muted }}>No [PATTERNS] in model</div>;
  const hourly = entries.filter(([, p]) => ['HOURLY', 'WEEKEND'].includes(p.type.toUpperCase()));
  const monthly = entries.filter(([, p]) => p.type.toUpperCase() === 'MONTHLY');
  const daily = entries.filter(([, p]) => p.type.toUpperCase() === 'DAILY');
  return (
    <div className="flex flex-wrap gap-3">
      {hourly.length > 0 && (
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: C.ink }}>Hourly / weekend multipliers</div>
          <Chart w={360} h={210} xLabel="Hour" yLabel="Multiplier"
            series={[
              ...hourly.slice(0, 5).map(([name, p], i) => ({ name, color: SERIES[i % SERIES.length], pts: p.multipliers.map((v, h) => [h, v] as [number, number]) })),
              { name: '', color: C.axis, dashed: true, pts: [[0, 1], [23, 1]] as [number, number][] },
            ]} />
        </div>
      )}
      {monthly.length > 0 && (
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: C.ink }}>Monthly (seasonal)</div>
          <Chart w={300} h={210} xLabel="Month" yLabel="Multiplier"
            series={[
              { name: monthly[0][0], color: C.amber, bars: true, pts: monthly[0][1].multipliers.map((v, m) => [m + 1, v] as [number, number]) },
              { name: '', color: C.axis, dashed: true, pts: [[1, 1], [12, 1]] as [number, number][] },
            ]} />
        </div>
      )}
      {daily.length > 0 && (
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: C.ink }}>Daily (Sun–Sat)</div>
          <Chart w={300} h={210} xLabel="Day (1=Sun)" yLabel="Multiplier"
            series={daily.slice(0, 3).map(([name, p], i) => ({ name, color: SERIES[(i + 2) % SERIES.length], bars: i === 0, pts: p.multipliers.map((v, d) => [d + 1, v] as [number, number]) }))} />
        </div>
      )}
    </div>
  );
}

// ================= Group B =================

function sysSeries(results: SimulationResults, key: string): [number, number][] {
  return results.timeSteps.map(ts => [ts.time / 3600, ts.system?.extended?.[key] ?? 0] as [number, number]);
}

function D9SystemHydrograph({ results, flowUnits }: { results: SimulationResults; flowUnits: string }) {
  const rain = sysSeries(results, 'sysRainfall');
  const runoff = sysSeries(results, 'sysRunoff');
  const inflow = sysSeries(results, 'sysTotalInflow');
  const outflow = sysSeries(results, 'sysOutflow');
  const hasSys = rain.some(p => p[1] !== 0) || runoff.some(p => p[1] !== 0) || outflow.some(p => p[1] !== 0);
  if (!hasSys) {
    // fall back to summing subcatchment runoff + outfall totals
    const run2: [number, number][] = results.timeSteps.map(ts => [ts.time / 3600,
      Object.values(ts.subcatchments).reduce((s, r) => s + (r.runoff || 0), 0)]);
    const rain2: [number, number][] = results.timeSteps.map(ts => {
      const subs = Object.values(ts.subcatchments);
      return [ts.time / 3600, subs.length ? subs.reduce((s, r) => s + (r.rainfall || 0), 0) / subs.length : 0];
    });
    const pk = run2.reduce((a, b) => (b[1] > a[1] ? b : a), run2[0] || [0, 0]);
    return <Chart w={640} h={260} xLabel="Elapsed time (hr)" yLabel={`Flow (${flowUnits})`}
      series={[{ name: 'Rainfall (avg)', color: C.slate, pts: rain2, bars: true }, { name: 'Runoff', color: C.teal, pts: run2 }]}
      annotations={pk && pk[1] > 0 ? [{ x: pk[0], y: pk[1], text: `peak ${fmt(pk[1])} @ ${fmt(pk[0])} hr` }] : []} />;
  }
  const pk = runoff.reduce((a, b) => (b[1] > a[1] ? b : a), runoff[0]);
  return (
    <div>
      <Chart w={640} h={90} xLabel="" yLabel="Rain" series={[{ name: '', color: C.blue, pts: rain, bars: true }]} />
      <Chart w={640} h={230} xLabel="Elapsed time (hr)" yLabel={`Flow (${flowUnits})`}
        series={[
          { name: 'Runoff', color: C.teal, pts: runoff },
          { name: 'Lateral inflow', color: C.amber, pts: inflow },
          { name: 'Outfall flow', color: C.blue, pts: outflow },
        ]}
        annotations={pk[1] > 0 ? [{ x: pk[0], y: pk[1], text: `peak runoff ${fmt(pk[1])} @ ${fmt(pk[0])} hr` }] : []} />
    </div>
  );
}

function buildTrunkPath(project: SwmmProject): { nodes: string[]; links: string[] } {
  // Longest path (by cumulative conduit length) ending at an outfall, via memoized DFS
  // over the full downstream adjacency (all outgoing conduits per node, not just the first).
  const adj = new Map<string, { to: string; link: string; len: number }[]>();
  for (const c of project.conduits) {
    if (!adj.has(c.fromNode)) adj.set(c.fromNode, []);
    adj.get(c.fromNode)!.push({ to: c.toNode, link: c.id, len: c.length || 0 });
  }
  const outfallIds = new Set(project.outfalls.map(o => o.id));
  // memo: node -> best {dist to outfall, next edge}; null while unresolved, undefined-dist = no outfall reachable
  const memo = new Map<string, { dist: number; next: { to: string; link: string } | null }>();
  const visiting = new Set<string>();
  const solve = (node: string): { dist: number; next: { to: string; link: string } | null } | null => {
    if (memo.has(node)) return memo.get(node)!;
    if (visiting.has(node)) return null; // cycle guard
    if (outfallIds.has(node)) {
      const r = { dist: 0, next: null };
      memo.set(node, r);
      return r;
    }
    visiting.add(node);
    let best: { dist: number; next: { to: string; link: string } | null } | null = null;
    for (const e of adj.get(node) || []) {
      const sub = solve(e.to);
      if (sub && (!best || sub.dist + e.len > best.dist)) best = { dist: sub.dist + e.len, next: { to: e.to, link: e.link } };
    }
    visiting.delete(node);
    if (best) memo.set(node, best);
    return best;
  };
  let bestStart: string | null = null; let bestDist = -1;
  for (const node of adj.keys()) {
    const r = solve(node);
    if (r && r.dist > bestDist) { bestDist = r.dist; bestStart = node; }
  }
  if (!bestStart) {
    // no path reaches an outfall — fall back to any longest simple chain
    let fb: { nodes: string[]; links: string[] } = { nodes: [], links: [] };
    for (const start of Array.from(adj.keys()).slice(0, 100)) {
      const nodes = [start]; const links: string[] = []; const seen = new Set([start]);
      let cur = start;
      while ((adj.get(cur) || []).length > 0) {
        const e = adj.get(cur)![0];
        if (seen.has(e.to)) break;
        nodes.push(e.to); links.push(e.link); seen.add(e.to); cur = e.to;
        if (nodes.length > 500) break;
      }
      if (nodes.length > fb.nodes.length) fb = { nodes, links };
    }
    return fb;
  }
  const nodes = [bestStart]; const links: string[] = [];
  let cur = bestStart;
  while (true) {
    const r = memo.get(cur);
    if (!r || !r.next) break;
    nodes.push(r.next.to); links.push(r.next.link); cur = r.next.to;
    if (nodes.length > 1000) break;
  }
  return { nodes, links };
}
function nodeElev(project: SwmmProject, id: string): number {
  return project.junctions.find(j => j.id === id)?.elevation
    ?? project.outfalls.find(o => o.id === id)?.elevation
    ?? project.storageUnits.find(s => s.id === id)?.elevation
    ?? project.dividers.find(d => d.id === id)?.elevation ?? 0;
}
function D10HglProfile({ project, results }: { project: SwmmProject; results: SimulationResults }) {
  const path = useMemo(() => buildTrunkPath(project), [project]);
  const [snapIdx, setSnapIdx] = useState(-1); // -1 = max HGL
  if (path.nodes.length < 2) return <div className="text-xs" style={{ color: C.muted }}>No conduit path to an outfall found</div>;
  const dists: number[] = [0];
  for (let i = 0; i < path.links.length; i++) {
    const c = project.conduits.find(cc => cc.id === path.links[i]);
    dists.push(dists[i] + (c?.length || 0));
  }
  const invert: [number, number][] = path.nodes.map((n, i) => [dists[i], nodeElev(project, n)]);
  const crown: [number, number][] = path.nodes.map((n, i) => {
    const linkId = path.links[Math.min(i, path.links.length - 1)];
    const xs = project.xsections[linkId];
    const g1 = typeof xs?.geom1 === 'number' ? xs.geom1 : 0;
    return [dists[i], nodeElev(project, n) + g1];
  });
  const hgl: [number, number][] = path.nodes.map((n, i) => {
    let depth = 0;
    if (snapIdx >= 0) depth = results.timeSteps[snapIdx]?.nodes[n]?.depth || 0;
    else for (const ts of results.timeSteps) depth = Math.max(depth, ts.nodes[n]?.depth || 0);
    return [dists[i], nodeElev(project, n) + depth];
  });
  const nSteps = results.timeSteps.length;
  const snapChoices = [-1, 0, Math.floor(nSteps / 2), nSteps - 1].filter((v, i, a) => a.indexOf(v) === i && v < nSteps);
  return (
    <div>
      <div className="flex gap-2 items-center mb-1">
        <span style={{ fontSize: 10, color: C.muted }}>{path.nodes[0]} → {path.nodes[path.nodes.length - 1]} · {path.nodes.length} nodes · {fmt(dists[dists.length - 1])} length</span>
        {snapChoices.map(v => (
          <button key={v} data-testid={`d10-snap-${v}`} onClick={() => setSnapIdx(v)}
            style={{ fontSize: 9.5, padding: '1px 7px', borderRadius: 3, border: `1px solid ${C.border}`, background: snapIdx === v ? C.teal : C.page, color: snapIdx === v ? '#fff' : C.ink }}>
            {v === -1 ? 'Max HGL' : `t=${fmt((results.timeSteps[v]?.time || 0) / 3600)} hr`}
          </button>
        ))}
      </div>
      <Chart w={640} h={250} xLabel="Distance along path" yLabel="Elevation"
        series={[
          { name: 'Invert', color: C.slate, pts: invert },
          { name: 'Crown', color: C.tan, pts: crown, dashed: true },
          { name: snapIdx === -1 ? 'Max HGL' : 'HGL snapshot', color: C.blue, pts: hgl },
        ]} />
    </div>
  );
}

function linkFlowSeries(results: SimulationResults, id: string): [number, number][] {
  return results.timeSteps.map(ts => [ts.time / 3600, Math.abs(ts.links[id]?.flow || 0)] as [number, number]);
}
function topFlowLinks(results: SimulationResults, n: number): string[] {
  const maxFlow = new Map<string, number>();
  for (const ts of results.timeSteps)
    for (const [id, lr] of Object.entries(ts.links))
      maxFlow.set(id, Math.max(maxFlow.get(id) || 0, Math.abs(lr.flow || 0)));
  return Array.from(maxFlow.entries()).sort((a, b) => b[1] - a[1]).slice(0, n).map(e => e[0]);
}

function D11FlowDuration({ results, flowUnits }: { results: SimulationResults; flowUnits: string }) {
  const links = useMemo(() => topFlowLinks(results, 40), [results]);
  const [linkId, setLinkId] = useState(links[0] || '');
  const [logScale, setLogScale] = useState(false);
  const active = links.includes(linkId) ? linkId : links[0];
  if (!active) return <div className="text-xs" style={{ color: C.muted }}>No link results</div>;
  const flows = results.timeSteps.map(ts => Math.abs(ts.links[active]?.flow || 0)).sort((a, b) => b - a);
  const N = flows.length;
  const pts: [number, number][] = flows.map((q, i) => {
    const p = ((i + 1) / N) * 100;
    return [logScale ? Math.log10(Math.max(p, 0.1)) : p, q];
  });
  const p50 = flows[Math.floor(N * 0.5)] || 0, p90 = flows[Math.floor(N * 0.9)] || 0;
  return (
    <div>
      <div className="flex gap-2 items-center mb-1">
        <select data-testid="d11-link-select" value={active} onChange={e => setLinkId(e.target.value)} style={{ fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 3 }}>
          {links.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <label style={{ fontSize: 10.5, color: C.ink }} className="flex items-center gap-1">
          <input type="checkbox" data-testid="d11-log-toggle" checked={logScale} onChange={e => setLogScale(e.target.checked)} /> log % axis
        </label>
        <span style={{ fontSize: 10, color: C.muted }}>P50 = {fmt(p50)} · P90 = {fmt(p90)} {flowUnits}</span>
      </div>
      <Chart w={520} h={240} xLabel={logScale ? 'log₁₀ % time exceeded' : '% of time flow equaled or exceeded'} yLabel={`Flow (${flowUnits})`}
        series={[{ name: active, color: C.blue, pts }]} />
    </div>
  );
}

function D12DepthFlowScatter({ results, flowUnits, lenUnits }: { results: SimulationResults; flowUnits: string; lenUnits: string }) {
  const links = useMemo(() => topFlowLinks(results, 40), [results]);
  const [linkId, setLinkId] = useState(links[0] || '');
  const active = links.includes(linkId) ? linkId : links[0];
  if (!active) return <div className="text-xs" style={{ color: C.muted }}>No link results</div>;
  const samples = results.timeSteps.map(ts => ts.links[active]).filter(Boolean) as { flow: number; depth: number; capacity: number }[];
  const maxCap = Math.max(...samples.map(s => s.capacity || 0), 0.001);
  const flows = samples.map(s => Math.abs(s.flow));
  const depths = samples.map(s => s.depth);
  const xMax = Math.max(...flows, 0.001), yMax = Math.max(...depths, 0.001);
  const w = 460, h = 240, m = { l: 48, r: 60, t: 10, b: 34 };
  const sx = (x: number) => m.l + (x / xMax) * (w - m.l - m.r);
  const sy = (y: number) => h - m.b - (y / yMax) * (h - m.t - m.b);
  return (
    <div>
      <div className="flex gap-2 items-center mb-1">
        <select data-testid="d12-link-select" value={active} onChange={e => setLinkId(e.target.value)} style={{ fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 3 }}>
          {links.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <span style={{ fontSize: 10, color: C.muted }}>hue = capacity fraction (rescaled to observed max {fmt(maxCap)})</span>
      </div>
      <svg width={w} height={h} style={{ maxWidth: '100%' }}>
        {niceTicks(0, yMax).map(t => <line key={`g${t}`} x1={m.l} x2={w - m.r} y1={sy(t)} y2={sy(t)} stroke={C.grid} />)}
        <rect x={m.l} y={m.t} width={w - m.l - m.r} height={h - m.t - m.b} fill="none" stroke={C.axis} />
        {samples.map((s, i) => <circle key={i} cx={sx(Math.abs(s.flow))} cy={sy(s.depth)} r={2.5} fill={capacityRamp((s.capacity || 0) / maxCap)} opacity={0.8} />)}
        {niceTicks(0, xMax).map(t => <text key={`x${t}`} x={sx(t)} y={h - m.b + 13} fontSize={10} fill={C.muted} textAnchor="middle">{fmt(t)}</text>)}
        {niceTicks(0, yMax).map(t => <text key={`y${t}`} x={m.l - 5} y={sy(t) + 3} fontSize={10} fill={C.muted} textAnchor="end">{fmt(t)}</text>)}
        <text x={(m.l + w - m.r) / 2} y={h - 4} fontSize={10.5} fill={C.ink} fontStyle="italic" textAnchor="middle">Flow ({flowUnits})</text>
        <text x={12} y={h / 2} fontSize={10.5} fill={C.ink} fontStyle="italic" textAnchor="middle" transform={`rotate(-90 12 ${h / 2})`}>Depth ({lenUnits})</text>
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
          <g key={t}>
            <rect x={w - 45} y={m.t + 20 + i * 22} width={12} height={22} fill={capacityRamp(1 - t)} />
            <text x={w - 30} y={m.t + 26 + i * 22} fontSize={8.5} fill={C.muted}>{fmt(maxCap * (1 - t))}</text>
          </g>
        ))}
        <text x={w - 45} y={m.t + 12} fontSize={8.5} fill={C.muted}>cap</text>
      </svg>
    </div>
  );
}

function Gauge({ label, value }: { label: string; value: number }) {
  const min = -1, max = 6;
  const clamped = Math.max(min, Math.min(max, value));
  const angle = -90 + ((clamped - min) / (max - min)) * 180;
  const zone = Math.abs(value) < 1 ? '#4f7042' : Math.abs(value) < 5 ? C.amber : C.red;
  const arc = (a0: number, a1: number, color: string) => {
    const r = 44, cx = 60, cy = 62;
    const p = (a: number) => [cx + r * Math.cos((a - 90) * Math.PI / 180), cy + r * Math.sin((a - 90) * Math.PI / 180)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return <path d={`M${x0},${y0} A44,44 0 0 1 ${x1},${y1}`} fill="none" stroke={color} strokeWidth={9} />;
  };
  const vToA = (v: number) => -90 + ((v - min) / (max - min)) * 180;
  return (
    <svg width={120} height={92} data-testid={`d13-gauge-${label.replace(/\s+/g, '-').toLowerCase()}`}>
      {arc(vToA(min), vToA(-0.999), C.amber)}
      {arc(vToA(-1), vToA(1), '#4f7042')}
      {arc(vToA(1), vToA(5), C.amber)}
      {arc(vToA(5), vToA(max), C.red)}
      <line x1={60} y1={62} x2={60 + 36 * Math.cos((angle - 90) * Math.PI / 180)} y2={62 + 36 * Math.sin((angle - 90) * Math.PI / 180)} stroke={C.ink} strokeWidth={2} />
      <circle cx={60} cy={62} r={3} fill={C.ink} />
      <text x={60} y={80} fontSize={11} fontWeight={700} fill={zone} textAnchor="middle">{value.toFixed(2)} %</text>
      <text x={60} y={90} fontSize={9} fill={C.muted} textAnchor="middle">{label}</text>
    </svg>
  );
}
function D13Continuity({ results }: { results: SimulationResults }) {
  const ce = results.summary.continuityErrors;
  return (
    <div className="flex gap-4 items-center flex-wrap">
      <Gauge label="Runoff" value={ce.runoff} />
      <Gauge label="Flow routing" value={ce.flow} />
      <Gauge label="Quality" value={ce.quality} />
      <div style={{ fontSize: 10.5, color: C.muted, maxWidth: 260 }}>
        Green &lt;1 %, amber 1–5 %, red ≥5 %. Large routing errors usually indicate timestep instability — check the CFL heatmap link theme and Health report.
      </div>
    </div>
  );
}

function D14CapacityHeatmap({ results }: { results: SimulationResults }) {
  const links = useMemo(() => topFlowLinks(results, 16), [results]);
  if (links.length === 0) return <div className="text-xs" style={{ color: C.muted }}>No link results</div>;
  const nT = results.timeSteps.length;
  const colStep = Math.max(1, Math.floor(nT / 200));
  const cols: number[] = [];
  for (let i = 0; i < nT; i += colStep) cols.push(i);
  const cw = Math.max(2, Math.min(5, Math.floor(600 / cols.length))), rh = 14;
  const w = 90 + cols.length * cw + 40, h = links.length * rh + 30;
  let maxCap = 0;
  for (const ts of results.timeSteps) for (const id of links) maxCap = Math.max(maxCap, ts.links[id]?.capacity || 0);
  return (
    <div>
      <svg width={w} height={h} style={{ maxWidth: '100%' }}>
        {links.map((id, r) => (
          <g key={id}>
            <text x={86} y={r * rh + 20} fontSize={9} fill={C.ink} textAnchor="end">{id}</text>
            {cols.map((ti, ci) => {
              const cap = results.timeSteps[ti]?.links[id]?.capacity || 0;
              return <rect key={ci} x={90 + ci * cw} y={r * rh + 10} width={cw} height={rh - 2} fill={capacityRamp(cap)} />;
            })}
          </g>
        ))}
        <text x={90} y={h - 4} fontSize={9.5} fill={C.muted}>t = 0</text>
        <text x={90 + cols.length * cw} y={h - 4} fontSize={9.5} fill={C.muted} textAnchor="end">t = {fmt((results.timeSteps[nT - 1]?.time || 0) / 3600)} hr</text>
        {[0, 0.5, 1].map((t, i) => (
          <g key={t}>
            <rect x={95 + cols.length * cw} y={10 + i * 30} width={12} height={30} fill={capacityRamp(1 - t)} />
            <text x={110 + cols.length * cw} y={18 + i * 30} fontSize={8.5} fill={C.muted}>{fmt(1 - t)}</text>
          </g>
        ))}
      </svg>
      <div style={{ fontSize: 10, color: C.muted }}>Rows = 16 highest-flow links · hue = capacity d/D (0 → ≥1 surcharge) · observed max {fmt(maxCap)}</div>
    </div>
  );
}

function D15StoragePerformance({ project, results, lenUnits }: { project: SwmmProject; results: SimulationResults; lenUnits: string }) {
  if (project.storageUnits.length === 0) return <div className="text-xs" style={{ color: C.muted }}>No storage units in model</div>;
  const stats = project.storageUnits.map(s => {
    let maxDepth = 0;
    for (const ts of results.timeSteps) maxDepth = Math.max(maxDepth, ts.nodes[s.id]?.depth || 0);
    const pct = s.maxDepth > 0 ? (maxDepth / s.maxDepth) * 100 : 0;
    return { id: s.id, maxDepth, pct };
  }).sort((a, b) => b.pct - a.pct);
  const top3 = stats.slice(0, 3);
  const traces: Series[] = top3.map((s, i) => ({
    name: s.id, color: SERIES[i % SERIES.length],
    pts: results.timeSteps.map(ts => [ts.time / 3600, ts.nodes[s.id]?.depth || 0] as [number, number]),
  }));
  const bw = 20, bh = 130;
  const shown = stats.slice(0, 17);
  return (
    <div className="flex flex-wrap gap-4">
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: C.ink }}>Depth hydrographs — most-utilized units</div>
        <Chart w={340} h={210} xLabel="Elapsed time (hr)" yLabel={`Depth (${lenUnits})`} series={traces} />
      </div>
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: C.ink }}>Max % full (depth basis)</div>
        <svg width={Math.max(200, shown.length * (bw + 6)) + 30} height={bh + 60}>
          <line x1={20} x2={shown.length * (bw + 6) + 25} y1={10 + bh * 0} y2={10} stroke="none" />
          {shown.map((s, i) => {
            const hpx = Math.min(1.15, s.pct / 100) * bh;
            const color = s.pct >= 100 ? C.red : s.pct >= 50 ? C.amber : C.teal;
            return (
              <g key={s.id} data-testid={`d15-bar-${s.id}`}>
                <rect x={25 + i * (bw + 6)} y={10 + bh - hpx} width={bw} height={hpx} fill={color} />
                <text x={25 + i * (bw + 6) + bw / 2} y={6 + bh - hpx} fontSize={8} fill={C.ink} textAnchor="middle">{fmt(s.pct)}%</text>
                <text x={25 + i * (bw + 6) + bw / 2} y={bh + 20} fontSize={8} fill={C.muted} textAnchor="middle" transform={`rotate(-45 ${25 + i * (bw + 6) + bw / 2} ${bh + 20})`}>{s.id}</text>
              </g>
            );
          })}
          <line x1={20} x2={shown.length * (bw + 6) + 30} y1={10} y2={10} stroke={C.red} strokeDasharray="3 3" />
        </svg>
      </div>
    </div>
  );
}

function D16MiniMap({ project, results }: { project: SwmmProject; results: SimulationResults | null }) {
  const W = 560, H = 340;
  const pts = Object.values(project.coordinates);
  if (pts.length === 0) return <div className="text-xs" style={{ color: C.muted }}>No coordinates in model</div>;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const polyPts = Object.values(project.polygons).flat();
  for (const p of polyPts) { xs.push(p[0]); ys.push(p[1]); }
  const xMin = Math.min(...xs), xMax = Math.max(...xs), yMin = Math.min(...ys), yMax = Math.max(...ys);
  const pad = 15;
  const scale = Math.min((W - 2 * pad) / Math.max(xMax - xMin, 1e-9), (H - 2 * pad) / Math.max(yMax - yMin, 1e-9));
  const tx = (x: number) => pad + (x - xMin) * scale;
  const ty = (y: number) => H - pad - (y - yMin) * scale;
  const maxQ = new Map<string, number>();
  if (results) for (const ts of results.timeSteps) for (const [id, lr] of Object.entries(ts.links)) maxQ.set(id, Math.max(maxQ.get(id) || 0, Math.abs(lr.flow || 0)));
  const qVals = Array.from(maxQ.values()).sort((a, b) => b - a);
  const q20 = qVals[Math.min(19, qVals.length - 1)] || 0;
  const qMax = qVals[0] || 1;
  const degenerate = project.storageUnits.filter(s => (project.polygons[s.id]?.length || 0) < 3 && project.polygons[s.id]).length;
  const linkColor = (id: string) => {
    const q = maxQ.get(id) || 0;
    if (!results || q < q20 || qMax === 0) return '#c4c1ba';
    const t = q / qMax;
    return t > 0.66 ? C.red : t > 0.33 ? C.amber : C.rampLo;
  };
  const linkWidth = (id: string) => {
    const q = maxQ.get(id) || 0;
    if (!results || q < q20) return 0.7;
    return 0.8 + (q / qMax) * 2.4;
  };
  const nodeGlyph = (id: string, x: number, y: number) => {
    if (project.outfalls.some(o => o.id === id)) return <polygon key={id} points={`${x},${y - 4} ${x - 4},${y + 3} ${x + 4},${y + 3}`} fill={C.blue} />;
    if (project.storageUnits.some(s => s.id === id)) return <rect key={id} x={x - 3} y={y - 3} width={6} height={6} fill={C.tan} />;
    if (project.dividers.some(d => d.id === id)) return <polygon key={id} points={`${x},${y - 4} ${x + 4},${y} ${x},${y + 4} ${x - 4},${y}`} fill={C.mauve} />;
    return <circle key={id} cx={x} cy={y} r={1.6} fill={C.slate} />;
  };
  return (
    <div>
      <svg width={W} height={H} style={{ background: C.page, border: `1px solid ${C.border}`, maxWidth: '100%' }}>
        {project.subcatchments.map(sc => {
          const poly = project.polygons[sc.id];
          if (!poly || poly.length < 3) return null;
          const cls = Math.min(4, Math.floor(sc.pctImperv / 20));
          return <polygon key={sc.id} points={poly.map(p => `${tx(p[0])},${ty(p[1])}`).join(' ')} fill={IMPERV_RAMP[cls]} stroke="#b6c2ab" strokeWidth={0.6} opacity={0.85} />;
        })}
        {[...project.conduits, ...project.pumps, ...project.orifices, ...project.weirs, ...project.outlets].map(l => {
          const a = project.coordinates[l.fromNode], b = project.coordinates[l.toNode];
          if (!a || !b) return null;
          const mid = (project.vertices[l.id] || []).map(v => `${tx(v[0])},${ty(v[1])}`).join(' ');
          return <polyline key={l.id} points={`${tx(a[0])},${ty(a[1])} ${mid} ${tx(b[0])},${ty(b[1])}`} fill="none" stroke={linkColor(l.id)} strokeWidth={linkWidth(l.id)} />;
        })}
        {Object.entries(project.coordinates).map(([id, p]) => nodeGlyph(id, tx(p[0]), ty(p[1])))}
        <g transform={`translate(${W - 120}, ${H - 78})`}>
          <rect width={112} height={70} fill="#ffffffdd" stroke={C.border} />
          {IMPERV_RAMP.map((c, i) => <rect key={i} x={6 + i * 12} y={8} width={12} height={8} fill={c} />)}
          <text x={6} y={26} fontSize={7.5} fill={C.muted}>% Imperv 0 → &gt;80</text>
          {['#c4c1ba', C.rampLo, C.amber, C.red].map((c, i) => <rect key={c} x={6 + i * 15} y={32} width={15} height={3 + i} fill={c} />)}
          <text x={6} y={48} fontSize={7.5} fill={C.muted}>MaxQ class (top 20)</text>
          <circle cx={10} cy={58} r={2} fill={C.slate} /><polygon points="24,55 20,61 28,61" fill={C.blue} />
          <rect x={34} y={55} width={6} height={6} fill={C.tan} /><polygon points="50,54 54,58 50,62 46,58" fill={C.mauve} />
          <text x={60} y={61} fontSize={7} fill={C.muted}>J / O / S / D</text>
        </g>
      </svg>
      {degenerate > 0 && <div style={{ fontSize: 10, color: C.muted }}>{degenerate} degenerate storage polygon{degenerate === 1 ? '' : 's'} (&lt;3 vertices) skipped</div>}
    </div>
  );
}

// ================= Gallery dialog =================

export default function DiagramGalleryDialog({ open, onClose, project, results }: {
  open: boolean; onClose: () => void; project: SwmmProject; results: SimulationResults | null;
}) {
  if (!open) return null;
  const si = isSI(project);
  const flowUnits = project.options['FLOW_UNITS'] || 'CFS';
  const lenUnits = si ? 'm' : 'ft';
  const ce = results?.summary.continuityErrors;
  const shapeCount = new Set(Object.values(project.xsections).map(x => x.shape)).size;
  const pumpFams = pumpCurveFamilies(project);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(20,24,32,0.55)' }} data-testid="dialog-diagram-gallery">
      <div className="flex flex-col" style={{ background: C.page, width: 'min(1180px, 96vw)', height: '92vh', borderRadius: 8, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        <div className="flex items-center justify-between px-4 py-2" style={{ background: '#2c3e6b', color: '#fff' }}>
          <div className="flex items-center gap-3">
            <span className="font-semibold text-sm">Diagram Gallery</span>
            <span style={{ fontSize: 11, opacity: 0.75 }}>16 diagrams · Group A inputs (blue) · Group B outputs (teal)</span>
          </div>
          <button onClick={onClose} data-testid="btn-close-diagram-gallery" className="hover:bg-white/10 rounded p-1"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div style={{ fontSize: 11, color: C.muted }}>
            Group A visualizes the input deck for pre-run error detection; Group B builds composite diagnostics from simulation results.
            {!results && ' Run a simulation to populate Group B.'}
          </div>

          <Card id="D1" group="A" title="Cross-Section Shape Gallery" tags={['[XSECTIONS]', '[TRANSECTS]']} testId="card-d1"
            note={`${shapeCount} distinct shapes across ${Object.keys(project.xsections).length} conduits`}>
            <D1XSectionGallery project={project} />
          </Card>

          <Card id="D2" group="A" title="Pump Characteristic Curves" tags={['[CURVES] PUMPx', '[PUMPS]']} testId="card-d2"
            note={pumpFams.size > 0 ? `${project.pumps.length} pumps referencing ${Array.from(pumpFams.values()).reduce((s, v) => s + v.length, 0)} curves in ${pumpFams.size} famil${pumpFams.size === 1 ? 'y' : 'ies'}` : 'No pump curves defined'}>
            <D2PumpCurves project={project} />
          </Card>

          <Card id="D3" group="A" title="Storage Curves (Depth–Area & Volume)" tags={['[CURVES] STORAGE', '[STORAGE]']} testId="card-d3"
            note={`${project.storageUnits.length} storage units (${project.storageUnits.filter(s => s.shape.toUpperCase() === 'TABULAR').length} tabular, ${project.storageUnits.filter(s => s.shape.toUpperCase() === 'FUNCTIONAL').length} functional)`}>
            <D3StorageCurves project={project} />
          </Card>

          <Card id="D4" group="A" title="Design-Storm Hyetographs" tags={['[TIMESERIES]', '[RAINGAGES]']} testId="card-d4"
            note="Shared intensity scale across panels; amber line = normalized cumulative depth; badge = gage bound to storm">
            <D4Hyetographs project={project} />
          </Card>

          <Card id="D5" group="A" title="Boundary & Rating Curves" tags={['[CURVES] RATING', '[OUTFALLS]', '[TIMESERIES]']} testId="card-d5"
            note={`${project.outfalls.length} outfalls — types: ${Array.from(new Set(project.outfalls.map(o => o.type))).join(', ') || 'none'}`}>
            <D5BoundaryCurves project={project} />
          </Card>

          <Card id="D6" group="A" title="LID Control Layer-Cakes" tags={['[LID_CONTROLS]']} testId="card-d6"
            note={`${project.lidControls.length} LID controls; layer heights drawn at relative thickness (parameter 1 of each layer)`}>
            <D6LidLayers project={project} />
          </Card>

          <Card id="D7" group="A" title="Subcatchment Idealization" tags={['[SUBCATCHMENTS]', '[SUBAREAS]', '[RAINGAGES]']} testId="card-d7"
            note="Nonlinear-reservoir idealization: rectangular plane split by % imperviousness, overland flow length = Area / Width">
            <D7SubcatchIdeal project={project} />
          </Card>

          <Card id="D8" group="A" title="DWF & Pattern Library" tags={['[PATTERNS]', '[DWF]']} testId="card-d8"
            note={`${Object.keys(project.patterns).length} patterns; dashed line marks multiplier 1.0; ${project.dwf.length} DWF entries apply them to nodes`}>
            <D8Patterns project={project} />
          </Card>

          <Card id="D9" group="B" title="System Hydrograph" tags={['.OUT system series']} testId="card-d9"
            note={results ? `${results.timeSteps.length} report steps over ${fmt((results.timeSteps[results.timeSteps.length - 1]?.time || 0) / 3600)} hr` : 'Awaiting results'}>
            {results ? <D9SystemHydrograph results={results} flowUnits={flowUnits} /> : <NeedsRun />}
          </Card>

          <Card id="D10" group="B" title="Longitudinal Profile with HGL Snapshots" tags={['.OUT node:depth', '[CONDUITS]', '[XSECTIONS]']} testId="card-d10"
            note="Auto-traced trunk path (longest conduit run to an outfall); toggle Max HGL vs instantaneous snapshots">
            {results ? <D10HglProfile project={project} results={results} /> : <NeedsRun />}
          </Card>

          <Card id="D11" group="B" title="Flow-Duration (Exceedance) Curve" tags={['.OUT link:flow']} testId="card-d11"
            note="Rank-ordered flow record; a long low tail indicates a dry-weather-dominated link, a steep head indicates wet-weather conveyance">
            {results ? <D11FlowDuration results={results} flowUnits={flowUnits} /> : <NeedsRun />}
          </Card>

          <Card id="D12" group="B" title="Depth-vs-Flow Scatter" tags={['.OUT link:flow,depth,capacity']} testId="card-d12"
            note="Point hue = capacity fraction (blue → amber → red), rescaled to the observed max so within-regime variation stays visible">
            {results ? <D12DepthFlowScatter results={results} flowUnits={flowUnits} lenUnits={lenUnits} /> : <NeedsRun />}
          </Card>

          <Card id="D13" group="B" title="Continuity & Mass Balance" tags={['.OUT continuity']} testId="card-d13"
            note={ce ? `Runoff ${ce.runoff.toFixed(2)} % · Flow routing ${ce.flow.toFixed(2)} % · Quality ${ce.quality.toFixed(2)} %` : 'Awaiting results'}>
            {results ? <D13Continuity results={results} /> : <NeedsRun />}
          </Card>

          <Card id="D14" group="B" title="Conduit Capacity Heatmap" tags={['.OUT link:capacity']} testId="card-d14"
            note="Scale deliberately fixed at 0 → ≥1 (surcharge): a uniform blue field means no conduit approaches surcharge">
            {results ? <D14CapacityHeatmap results={results} /> : <NeedsRun />}
          </Card>

          <Card id="D15" group="B" title="Storage Unit Performance" tags={['.OUT node:depth', '[STORAGE]']} testId="card-d15"
            note="Utilization = max depth / design max depth; teal <50 %, amber ≥50 %, red ≥100 % (dashed line)">
            {results ? <D15StoragePerformance project={project} results={results} lenUnits={lenUnits} /> : <NeedsRun />}
          </Card>

          <Card id="D16" group="B" title="Network Thematic Mini-Map" tags={['[MAP]', '[SUBCATCHMENTS]', '.OUT link summary']} testId="card-d16"
            note="Subcatchments on the 5-class imperviousness green ramp; top-20 links by MaxQ on the severity ramp with width scaling; node glyphs by type">
            <D16MiniMap project={project} results={results} />
          </Card>
        </div>
      </div>
    </div>
  );
}
