import { useEffect, useMemo, useRef, useState } from 'react';
import { X, BarChart3 } from 'lucide-react';
import type { SwmmProject } from '@/lib/swmm-types';

interface SectionDef {
  name: string;
  columns: string[];
  rows: (project: SwmmProject) => (string | number)[][];
}

const fmt = (v: unknown): string | number => {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v === 'number' || typeof v === 'string') return v;
  return String(v);
};

const SECTION_DEFS: SectionDef[] = [
  {
    name: 'Title',
    columns: ['Line'],
    rows: p => p.title.map(t => [t]),
  },
  {
    name: 'Options',
    columns: ['Option', 'Value'],
    rows: p => Object.entries(p.options).map(([k, v]) => [k, v]),
  },
  {
    name: 'Report Options',
    columns: ['Option', 'Value'],
    rows: p => Object.entries(p.reportOptions).map(([k, v]) => [k, v]),
  },
  {
    name: 'Rain Gages',
    columns: ['Name', 'Format', 'Interval', 'SCF', 'Source', 'Source Name'],
    rows: p => p.raingages.map(r => [r.id, r.format, r.interval, r.scf, r.sourceType, r.sourceName]),
  },
  {
    name: 'Subcatchments',
    columns: ['Name', 'Rain Gage', 'Outlet', 'Area', '%Imperv', 'Width', 'Slope', 'Curb Length', 'Snow Pack'],
    rows: p => p.subcatchments.map(s => [s.id, s.rainGage, s.outlet, s.area, s.pctImperv, s.width, s.slope, s.curbLen, fmt(s.snowPack)]),
  },
  {
    name: 'Subareas',
    columns: ['Subcatchment', 'N-Imperv', 'N-Perv', 'S-Imperv', 'S-Perv', '%Zero', 'Route To', '%Routed'],
    rows: p => Object.entries(p.subareas).map(([id, sa]) => [id, sa.nImperv, sa.nPerv, sa.sImperv, sa.sPerv, sa.pctZero, sa.routeTo, fmt(sa.pctRouted)]),
  },
  {
    name: 'Infiltration',
    columns: ['Subcatchment', 'Method', 'Param 1', 'Param 2', 'Param 3', 'Param 4', 'Param 5'],
    rows: p => Object.entries(p.infiltration).map(([id, inf]) => [id, fmt(inf.method), ...[0, 1, 2, 3, 4].map(i => fmt(inf.values[i]))]),
  },
  {
    name: 'Junctions',
    columns: ['Name', 'Invert Elev', 'Max Depth', 'Init Depth', 'Surcharge Depth', 'Ponded Area'],
    rows: p => p.junctions.map(j => [j.id, j.elevation, j.maxDepth, j.initDepth, j.surDepth, j.aponded]),
  },
  {
    name: 'Outfalls',
    columns: ['Name', 'Invert Elev', 'Type', 'Stage Data', 'Tide Gate', 'Route To'],
    rows: p => p.outfalls.map(o => [o.id, o.elevation, o.type, fmt(o.stageData), o.gated, fmt(o.routeTo)]),
  },
  {
    name: 'Dividers',
    columns: ['Name', 'Invert Elev', 'Diverted Link', 'Type', 'Cutoff Flow', 'Curve', 'Max Depth', 'Init Depth', 'Surcharge Depth', 'Ponded Area'],
    rows: p => p.dividers.map(d => [d.id, d.elevation, d.divertedLink, d.type, fmt(d.cutoffFlow), fmt(d.curve), d.maxDepth, d.initDepth, d.surDepth, d.aponded]),
  },
  {
    name: 'Storage',
    columns: ['Name', 'Invert Elev', 'Max Depth', 'Init Depth', 'Shape', 'Curve Params', 'Surcharge Depth', 'Evap Factor', 'Suction', 'Ksat', 'IMD'],
    rows: p => p.storageUnits.map(s => [s.id, s.elevation, s.maxDepth, s.initDepth, s.shape, s.curveParams.join(' '), s.surDepth, s.fevap, fmt(s.psi), fmt(s.ksat), fmt(s.imd)]),
  },
  {
    name: 'Conduits',
    columns: ['Name', 'From Node', 'To Node', 'Length', 'Roughness', 'In Offset', 'Out Offset', 'Init Flow', 'Max Flow'],
    rows: p => p.conduits.map(c => [c.id, c.fromNode, c.toNode, c.length, c.roughness, c.inOffset, c.outOffset, c.initFlow, c.maxFlow]),
  },
  {
    name: 'Pumps',
    columns: ['Name', 'From Node', 'To Node', 'Pump Curve', 'Status', 'Startup Depth', 'Shutoff Depth'],
    rows: p => p.pumps.map(pu => [pu.id, pu.fromNode, pu.toNode, pu.pumpCurve, pu.status, fmt(pu.startupDepth), fmt(pu.shutoffDepth)]),
  },
  {
    name: 'Orifices',
    columns: ['Name', 'From Node', 'To Node', 'Type', 'Offset', 'Discharge Coeff', 'Gated', 'Close Time'],
    rows: p => p.orifices.map(o => [o.id, o.fromNode, o.toNode, o.type, o.offset, o.cd, o.gated, o.closeTime]),
  },
  {
    name: 'Weirs',
    columns: ['Name', 'From Node', 'To Node', 'Type', 'Crest Height', 'Discharge Coeff', 'Gated', 'End Contractions', 'End Coeff', 'Surcharge', 'Width'],
    rows: p => p.weirs.map(w => [w.id, w.fromNode, w.toNode, w.type, w.crestHeight, w.cd, w.gated, w.ec, w.cd2, w.surcharge, fmt(w.width)]),
  },
  {
    name: 'Outlets',
    columns: ['Name', 'From Node', 'To Node', 'Offset', 'Type', 'Curve/Table'],
    rows: p => p.outlets.map(o => [o.id, o.fromNode, o.toNode, o.offset, o.type, o.curveOrTable]),
  },
  {
    name: 'Cross-Sections',
    columns: ['Link', 'Shape', 'Geom1', 'Geom2', 'Geom3', 'Geom4', 'Barrels', 'Culvert'],
    rows: p => Object.entries(p.xsections).map(([id, xs]) => [id, xs.shape, fmt(xs.geom1), xs.geom2, xs.geom3, xs.geom4, xs.barrels, fmt(xs.culvert)]),
  },
  {
    name: 'Losses',
    columns: ['Link', 'Entry', 'Exit', 'Average', 'Flap Gate', 'Seepage'],
    rows: p => Object.entries(p.losses).map(([id, l]) => [id, l.entryLoss, l.exitLoss, l.avgLoss, l.flapGate, l.seepageRate]),
  },
  {
    name: 'Time Series',
    columns: ['Name', 'Date/Time', 'Value'],
    rows: p => Object.entries(p.timeseries).flatMap(([name, pts]) => pts.map(pt => [name, pt.dateTime, pt.value] as (string | number)[])),
  },
  {
    name: 'Curves',
    columns: ['Name', 'Type', 'X-Value', 'Y-Value'],
    rows: p => Object.entries(p.curves).flatMap(([name, pts]) => {
      const type = pts[0]?.type || '';
      return pts.map(pt => [name, type, pt.x, pt.y] as (string | number)[]);
    }),
  },
  {
    name: 'Patterns',
    columns: ['Name', 'Type', 'Index', 'Multiplier'],
    rows: p => Object.entries(p.patterns).flatMap(([name, pat]) => pat.multipliers.map((m, i) => [name, pat.type, i + 1, m] as (string | number)[])),
  },
  {
    name: 'Controls',
    columns: ['Rule Line'],
    rows: p => p.controls.map(c => [c]),
  },
  {
    name: 'Dry Weather Flow',
    columns: ['Node', 'Constituent', 'Baseline', 'Patterns'],
    rows: p => p.dwf.map(d => [d.nodeId, d.constituent, d.baseline, d.patterns.join(' ')]),
  },
  {
    name: 'Pollutants',
    columns: ['Name', 'Units', 'Rain Conc', 'GW Conc', 'RDII Conc', 'Decay Coeff', 'Snow Only', 'Co-Pollutant', 'Co-Fraction', 'DWF Conc', 'Init Conc'],
    rows: p => p.pollutants.map(po => [po.id, po.units, po.cRain, po.cGW, po.cRDII, po.kDecay, po.snowOnly, po.coPollutant, po.coFraction, po.cDWF, po.cInit]),
  },
  {
    name: 'Land Uses',
    columns: ['Name', 'Sweep Interval', 'Sweep Availability', 'Last Swept'],
    rows: p => p.landuses.map(l => [l.id, l.sweepInterval, l.sweepAvail, l.sweepLast]),
  },
  {
    name: 'LID Controls',
    columns: ['Name', 'Type', 'Layer', 'Parameters'],
    rows: p => p.lidControls.flatMap(lc =>
      lc.layers.length
        ? lc.layers.map(layer => [lc.id, lc.type, layer[0] || '', layer.slice(1).join(' ')] as (string | number)[])
        : [[lc.id, lc.type, '', ''] as (string | number)[]]
    ),
  },
  {
    name: 'LID Usage',
    columns: ['Subcatchment', 'LID', 'Number', 'Area', 'Width', 'Init Sat', 'From Imperv', 'To Perv', 'Report File', 'Drain To', 'From Perv'],
    rows: p => p.lidUsage.map(u => [u.subcatchId, u.lidId, u.number, u.area, u.width, u.initSat, u.fromImperv, u.toPerv, u.rptFile, u.drainTo, u.fromPerv]),
  },
  {
    name: 'Aquifers',
    columns: ['Name', 'Porosity', 'Wilt Point', 'Field Capacity', 'Conductivity', 'Cond. Slope', 'Tension Slope', 'Upper Evap', 'Lower Evap', 'Lower GW Loss', 'Bottom Elev', 'Water Table', 'Unsat Moisture'],
    rows: p => p.aquifers.map(a => [a.id, a.porosity, a.wiltPoint, a.fieldCap, a.conductivity, a.conductSlope, a.tensionSlope, a.upperEvap, a.lowerEvap, a.lowerGWLoss, a.bottomElev, a.waterTableElev, a.unsatMoisture]),
  },
  {
    name: 'Groundwater',
    columns: ['Subcatchment', 'Aquifer', 'Node', 'Surface Elev', 'A1', 'B1', 'A2', 'B2', 'A3', 'Fixed Depth', 'Threshold'],
    rows: p => p.groundwater.map(g => [g.subcatchId, g.aquiferId, g.nodeId, g.surfElev, g.a1, g.b1, g.a2, g.b2, g.a3, g.fixedDepth, g.threshold]),
  },
  {
    name: 'Snow Packs',
    columns: ['Name', 'Surface Type', 'Parameters'],
    rows: p => p.snowpacks.flatMap(sp => Object.entries(sp.parameters).map(([k, vals]) => [sp.id, k, vals.join(' ')] as (string | number)[])),
  },
  {
    name: 'Transects',
    columns: ['Name', 'Stations', 'Left N', 'Right N', 'Channel N', 'Left Bank', 'Right Bank'],
    rows: p => p.transects.map(t => [t.id, t.stations.length, t.roughness.left, t.roughness.right, t.roughness.channel, t.bankStations.left, t.bankStations.right]),
  },
  {
    name: 'Streets',
    columns: ['Name', 'Parameters'],
    rows: p => p.streets.map(s => [s.id, s.params.join(' ')]),
  },
  {
    name: 'Inlets',
    columns: ['Name', 'Type', 'Parameters'],
    rows: p => p.inlets.map(i => [i.id, i.type, i.params.join(' ')]),
  },
  {
    name: 'Inlet Usage',
    columns: ['Link', 'Inlet', 'Node', 'Number', '%Clogged', 'Max Flow', 'Extra Params'],
    rows: p => p.inletUsage.map(iu => [iu.linkId, iu.inletId, iu.nodeId, iu.number, iu.pctClogged, iu.maxFlow, iu.params.join(' ')]),
  },
  {
    name: 'Map Labels',
    columns: ['X', 'Y', 'Text', 'Anchor Node', 'Font', 'Size'],
    rows: p => p.labels.map(l => [l.x, l.y, l.text, fmt(l.anchorNode), fmt(l.font), fmt(l.size)]),
  },
  {
    name: 'Coordinates',
    columns: ['Node', 'X', 'Y'],
    rows: p => Object.entries(p.coordinates).map(([id, [x, y]]) => [id, x, y]),
  },
  {
    name: 'Vertices',
    columns: ['Link', 'X', 'Y'],
    rows: p => Object.entries(p.vertices).flatMap(([id, pts]) => pts.map(([x, y]) => [id, x, y] as (string | number)[])),
  },
  {
    name: 'Polygons',
    columns: ['Subcatchment', 'X', 'Y'],
    rows: p => Object.entries(p.polygons).flatMap(([id, pts]) => pts.map(([x, y]) => [id, x, y] as (string | number)[])),
  },
  {
    name: 'Symbols',
    columns: ['Gage', 'X', 'Y'],
    rows: p => Object.entries(p.symbols).map(([id, [x, y]]) => [id, x, y]),
  },
];

const MAX_ROWS = 2000;

const SECTION_COUNTS: Record<string, (p: SwmmProject) => number> = {
  'Title': p => p.title.length,
  'Options': p => Object.keys(p.options).length,
  'Report Options': p => Object.keys(p.reportOptions).length,
  'Rain Gages': p => p.raingages.length,
  'Subcatchments': p => p.subcatchments.length,
  'Subareas': p => Object.keys(p.subareas).length,
  'Infiltration': p => Object.keys(p.infiltration).length,
  'Junctions': p => p.junctions.length,
  'Outfalls': p => p.outfalls.length,
  'Dividers': p => p.dividers.length,
  'Storage': p => p.storageUnits.length,
  'Conduits': p => p.conduits.length,
  'Pumps': p => p.pumps.length,
  'Orifices': p => p.orifices.length,
  'Weirs': p => p.weirs.length,
  'Outlets': p => p.outlets.length,
  'Cross-Sections': p => Object.keys(p.xsections).length,
  'Losses': p => Object.keys(p.losses).length,
  'Time Series': p => Object.values(p.timeseries).reduce((n, pts) => n + pts.length, 0),
  'Curves': p => Object.values(p.curves).reduce((n, pts) => n + pts.length, 0),
  'Patterns': p => Object.values(p.patterns).reduce((n, pat) => n + pat.multipliers.length, 0),
  'Controls': p => p.controls.length,
  'Dry Weather Flow': p => p.dwf.length,
  'Pollutants': p => p.pollutants.length,
  'Land Uses': p => p.landuses.length,
  'LID Controls': p => p.lidControls.reduce((n, lc) => n + Math.max(1, lc.layers.length), 0),
  'LID Usage': p => p.lidUsage.length,
  'Aquifers': p => p.aquifers.length,
  'Groundwater': p => p.groundwater.length,
  'Snow Packs': p => p.snowpacks.reduce((n, sp) => n + Object.keys(sp.parameters).length, 0),
  'Transects': p => p.transects.length,
  'Streets': p => p.streets.length,
  'Inlets': p => p.inlets.length,
  'Inlet Usage': p => p.inletUsage.length,
  'Map Labels': p => p.labels.length,
  'Coordinates': p => Object.keys(p.coordinates).length,
  'Vertices': p => Object.values(p.vertices).reduce((n, pts) => n + pts.length, 0),
  'Polygons': p => Object.values(p.polygons).reduce((n, pts) => n + pts.length, 0),
  'Symbols': p => Object.keys(p.symbols).length,
};

type ColStats = {
  sectionName: string;
  colName: string;
  total: number;
  numeric: number[];
  nonEmpty: number;
  min?: number; max?: number; mean?: number; median?: number; stdev?: number; sum?: number;
  freq: { value: string; count: number }[];
  distinct: number;
};

function computeColStats(sectionName: string, colName: string, rows: (string | number)[][], ci: number): ColStats {
  const raw = rows.map(r => r[ci]).filter(v => v !== undefined && v !== null && v !== '');
  const numeric: number[] = [];
  const counts = new Map<string, number>();
  for (const v of raw) {
    const s = String(v);
    counts.set(s, (counts.get(s) || 0) + 1);
    if (typeof v === 'number') {
      if (isFinite(v)) numeric.push(v);
    } else if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(s.trim())) {
      const n = Number(s.trim());
      if (isFinite(n)) numeric.push(n);
    }
  }
  const stats: ColStats = {
    sectionName, colName,
    total: rows.length,
    nonEmpty: raw.length,
    numeric,
    freq: Array.from(counts.entries()).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
    distinct: counts.size,
  };
  if (numeric.length > 0) {
    const sorted = [...numeric].sort((a, b) => a - b);
    const sum = numeric.reduce((a, b) => a + b, 0);
    const mean = sum / numeric.length;
    const mid = Math.floor(sorted.length / 2);
    stats.min = sorted[0];
    stats.max = sorted[sorted.length - 1];
    stats.sum = sum;
    stats.mean = mean;
    stats.median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    stats.stdev = numeric.length > 1 ? Math.sqrt(numeric.reduce((a, b) => a + (b - mean) ** 2, 0) / (numeric.length - 1)) : 0;
  }
  return stats;
}

const numFmt = (v: number | undefined): string => {
  if (v === undefined) return '—';
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return v.toLocaleString();
  const a = Math.abs(v);
  if (a !== 0 && (a < 0.001 || a >= 1e7)) return v.toExponential(4);
  return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

function ColumnStatsPanel({ stats, sectionCount, onClose }: { stats: ColStats; sectionCount: number; onClose: () => void }) {
  const histRef = useRef<HTMLCanvasElement>(null);
  const isNumeric = stats.numeric.length > 1 && stats.min !== undefined && stats.max !== undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const canvas = histRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    ctx.fillStyle = '#f8f9ff';
    ctx.fillRect(0, 0, W, H);
    const m = { top: 12, right: 10, bottom: 26, left: 44 };
    const pW = W - m.left - m.right, pH = H - m.top - m.bottom;

    let bars: { label: string; count: number }[];
    if (isNumeric) {
      const min = stats.min!, max = stats.max!;
      const nBins = Math.min(24, Math.max(6, Math.ceil(Math.sqrt(stats.numeric.length))));
      const span = max - min || 1;
      const bins = new Array<number>(nBins).fill(0);
      for (const v of stats.numeric) {
        const b = Math.min(nBins - 1, Math.floor(((v - min) / span) * nBins));
        bins[b]++;
      }
      bars = bins.map((count, i) => ({
        label: numFmt(min + (span * (i + 0.5)) / nBins),
        count,
      }));
    } else {
      bars = stats.freq.slice(0, 20).map(f => ({ label: f.value, count: f.count }));
    }
    if (!bars.length) return;

    const maxCount = Math.max(...bars.map(b => b.count), 1);
    ctx.strokeStyle = '#e0e4f0'; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = m.top + (pH * i) / 4;
      ctx.beginPath(); ctx.moveTo(m.left, y); ctx.lineTo(m.left + pW, y); ctx.stroke();
      ctx.fillStyle = '#9090a0'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(Math.round(maxCount - (i / 4) * maxCount).toLocaleString(), m.left - 4, y + 3);
    }
    const slot = pW / bars.length;
    const barW = slot * 0.78;
    bars.forEach((b, i) => {
      const barH = (b.count / maxCount) * pH;
      const x = m.left + i * slot + (slot - barW) / 2;
      const y = m.top + pH - barH;
      ctx.fillStyle = '#2c6eb5';
      ctx.fillRect(x, y, barW, barH);
    });
    ctx.fillStyle = '#9090a0'; ctx.font = '8px sans-serif';
    const labelEvery = Math.ceil(bars.length / Math.max(1, Math.floor(pW / 52)));
    bars.forEach((b, i) => {
      if (i % labelEvery !== 0) return;
      const x = m.left + i * slot + slot / 2;
      ctx.save();
      ctx.translate(x, H - m.bottom + 4);
      ctx.rotate(-Math.PI / 8);
      ctx.textAlign = 'right';
      ctx.fillText(b.label.length > 10 ? b.label.slice(0, 10) + '…' : b.label, 0, 8);
      ctx.restore();
    });
    ctx.strokeStyle = '#d0d8e8'; ctx.lineWidth = 1;
    ctx.strokeRect(m.left, m.top, pW, pH);
  }, [stats, isNumeric]);

  const truncated = stats.total < sectionCount;

  const statRows: [string, string][] = [
    ['Rows', stats.total.toLocaleString()],
    ['Non-empty', stats.nonEmpty.toLocaleString()],
    ['Distinct values', stats.distinct.toLocaleString()],
    ...(isNumeric || stats.numeric.length === 1 ? ([
      ['Numeric values', stats.numeric.length.toLocaleString()],
      ['Min', numFmt(stats.min)],
      ['Max', numFmt(stats.max)],
      ['Mean', numFmt(stats.mean)],
      ['Median', numFmt(stats.median)],
      ['Std Dev', numFmt(stats.stdev)],
      ['Sum', numFmt(stats.sum)],
    ] as [string, string][]) : []),
  ];

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="column-stats-overlay"
    >
      <div className="bg-white rounded shadow-2xl border border-[#d0d0d8] w-[560px] max-w-[92vw] max-h-[85vh] flex flex-col" data-testid="column-stats-panel">
        <div className="flex items-center gap-2 px-3 py-2 bg-[#2c3e6b] text-white rounded-t">
          <BarChart3 className="w-4 h-4" />
          <span className="text-[12px] font-semibold truncate">
            Column Statistics — {stats.sectionName}: {stats.colName}
          </span>
          <button className="ml-auto p-0.5 hover:bg-white/20 rounded" onClick={onClose} data-testid="column-stats-close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 overflow-y-auto flex flex-col gap-3">
          {truncated && (
            <div className="text-[10px] text-[#a05a00] bg-[#fdf3e3] border border-[#f0ddb8] rounded px-2 py-1" data-testid="column-stats-truncated-note">
              Statistics are based on the first {stats.total.toLocaleString()} of {sectionCount.toLocaleString()} rows.
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[11px]">
            {statRows.map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-[#f0f0f4] py-0.5" data-testid={`colstat-${k.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
                <span className="text-[#6b6b7b]">{k}</span>
                <span className="font-semibold text-[#2a2a3e] tabular-nums">{v}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="text-[10px] font-bold text-[#2c3e6b] mb-1">
              {isNumeric ? 'Histogram' : 'Value Counts (top 20)'}
            </div>
            <div className="h-[170px] border border-[#d0d8e8] rounded overflow-hidden">
              <canvas ref={histRef} className="w-full h-full block" data-testid="column-stats-chart" />
            </div>
          </div>
          {stats.freq.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-[#2c3e6b] mb-1">Most Frequent Values</div>
              <div className="max-h-[130px] overflow-y-auto border border-[#e0e0e8] rounded">
                <table className="w-full text-[10px] border-collapse">
                  <thead className="sticky top-0 bg-[#f0f0f4]">
                    <tr>
                      <th className="text-left px-2 py-1 border-b border-[#d0d0d8] font-semibold text-[#2c3e6b]">Value</th>
                      <th className="text-right px-2 py-1 border-b border-[#d0d0d8] font-semibold text-[#2c3e6b]">Count</th>
                      <th className="text-right px-2 py-1 border-b border-[#d0d0d8] font-semibold text-[#2c3e6b]">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.freq.slice(0, 15).map((f, i) => (
                      <tr key={i} className={i % 2 ? 'bg-[#f8f8fa]' : 'bg-white'}>
                        <td className="px-2 py-0.5 border-b border-[#f0f0f4] text-[#2a2a3e] max-w-[280px] truncate">{f.value}</td>
                        <td className="px-2 py-0.5 border-b border-[#f0f0f4] text-right tabular-nums text-[#2a2a3e]">{f.count.toLocaleString()}</td>
                        <td className="px-2 py-0.5 border-b border-[#f0f0f4] text-right tabular-nums text-[#6b6b7b]">
                          {stats.nonEmpty ? ((f.count / stats.nonEmpty) * 100).toFixed(1) : '0.0'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="text-[9px] text-[#9090a0]">
            Tip: right-click any column header or cell to see statistics for that column.
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SectionGridView({ project }: { project: SwmmProject }) {
  const sections = useMemo(() => {
    const built = SECTION_DEFS.map(def => ({
      def,
      count: SECTION_COUNTS[def.name] ? SECTION_COUNTS[def.name](project) : def.rows(project).length,
    }));
    const raw = Object.entries(project.rawSections).map(([name, rawLines]) => {
      const dataLines = rawLines.filter(l => l.trim() && !l.trim().startsWith(';'));
      const sample = dataLines.slice(0, 200);
      const maxTokens = Math.min(12, sample.reduce((m, l) => Math.max(m, l.trim().split(/\s+/).length), 1));
      const def: SectionDef = {
        name: `[${name}]`,
        columns: Array.from({ length: maxTokens }, (_, i) => `Field ${i + 1}`),
        rows: () => dataLines.slice(0, MAX_ROWS).map(l => {
          const tokens = l.trim().split(/\s+/);
          if (tokens.length > maxTokens) {
            return [...tokens.slice(0, maxTokens - 1), tokens.slice(maxTokens - 1).join(' ')];
          }
          return tokens;
        }),
      };
      return { def, count: dataLines.length };
    });
    return [...built, ...raw];
  }, [project]);

  const populated = sections.filter(s => s.count > 0);
  const [selected, setSelected] = useState<string | null>(null);
  const [colStats, setColStats] = useState<ColStats | null>(null);
  const activeSection = populated.find(s => s.def.name === selected) || populated[0];

  const activeRows = useMemo(
    () => (activeSection ? activeSection.def.rows(project).slice(0, MAX_ROWS) : []),
    [activeSection, project]
  );
  const active = activeSection ? { def: activeSection.def, rows: activeRows, count: activeSection.count } : null;

  if (!populated.length) {
    return <div className="p-6 text-[11px] text-[#6b6b7b]">No data in this project.</div>;
  }

  return (
    <div className="flex flex-1 min-h-0 border border-[#e0e0e8] rounded overflow-hidden">
      <div className="w-44 shrink-0 overflow-y-auto border-r border-[#e0e0e8] bg-[#f8f8fa]" data-testid="grid-section-list">
        {sections.map(({ def, count }) => {
          const isActive = active?.def.name === def.name;
          const empty = count === 0;
          return (
            <button
              key={def.name}
              disabled={empty}
              onClick={() => setSelected(def.name)}
              className={`w-full text-left px-2 py-1 text-[10px] flex justify-between items-center gap-1 border-b border-[#f0f0f4] ${
                isActive ? 'bg-[#2c6eb5] text-white' : empty ? 'text-[#b0b0bc] cursor-default' : 'text-[#2a2a3e] hover:bg-[#eef2f8]'
              }`}
              data-testid={`grid-section-${def.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
            >
              <span className="truncate">{def.name}</span>
              <span className={`tabular-nums ${isActive ? 'text-white/80' : 'text-[#9090a0]'}`}>{count}</span>
            </button>
          );
        })}
      </div>
      <div className="flex-1 min-w-0 overflow-auto bg-white" data-testid="grid-table-container">
        {active && (
          <table className="text-[10px] border-collapse min-w-full">
            <thead className="sticky top-0 bg-[#f0f0f4] z-10">
              <tr>
                {active.def.columns.map((col, ci) => (
                  <th
                    key={col}
                    className="text-left px-2 py-1 border-b border-r border-[#d0d0d8] font-semibold text-[#2c3e6b] whitespace-nowrap cursor-context-menu hover:bg-[#e6ecf5]"
                    title="Right-click for column statistics"
                    onContextMenu={e => {
                      e.preventDefault();
                      setColStats(computeColStats(active.def.name, col, active.def.rows(project), ci));
                    }}
                    data-testid={`grid-col-${ci}`}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {active.rows.map((row, ri) => (
                <tr key={ri} className={ri % 2 ? 'bg-[#f8f8fa]' : 'bg-white'} data-testid={`grid-row-${ri}`}>
                  {active.def.columns.map((col, ci) => (
                    <td
                      key={ci}
                      className="px-2 py-0.5 border-b border-r border-[#f0f0f4] whitespace-nowrap text-[#2a2a3e]"
                      onContextMenu={e => {
                        e.preventDefault();
                        setColStats(computeColStats(active.def.name, col, active.def.rows(project), ci));
                      }}
                    >
                      {row[ci] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {active && active.count > MAX_ROWS && (
          <div className="px-2 py-1 text-[10px] text-[#6b6b7b] bg-[#f8f8fa] border-t border-[#e0e0e8]">
            Showing first {MAX_ROWS.toLocaleString()} of {active.count.toLocaleString()} rows
          </div>
        )}
      </div>
      {colStats && <ColumnStatsPanel stats={colStats} sectionCount={active?.count ?? colStats.total} onClose={() => setColStats(null)} />}
    </div>
  );
}
