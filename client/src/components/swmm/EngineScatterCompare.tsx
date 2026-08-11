import { useMemo, useState } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip as ChartTooltip, ResponsiveContainer, ReferenceLine,
  LineChart, Line, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { extractScatterValues, rSquared } from '@/lib/summary-scatter';
import { buildWorstOverlays } from '@/lib/series-overlays';
import type { ComparisonSummary } from '@/lib/batch-compare';

// Rossman QA-report style scatter plots (EPA/600/R-06/097): peak link flows,
// maximum node heads/depths, and peak subcatchment runoff from one engine
// plotted against another, with a 45-degree line of equality and R².

interface Props {
  comparison: ComparisonSummary;
  /** Look up cached .rpt text by the result's cacheKey. */
  getReport: (cacheKey: string) => string | undefined;
}

interface ScatterPoint { x: number; y: number; name: string }

export default function EngineScatterCompare({ comparison, getReport }: Props) {
  // Files where at least two engines succeeded with a retained report.
  const eligible = useMemo(() =>
    comparison.files.filter(fc =>
      fc.results.filter(r => r?.status === 'success' && r.hasReport && r.cacheKey).length >= 2
    ), [comparison]);

  const [fileName, setFileName] = useState<string>('');
  const [selected, setSelected] = useState<{ chart: string; name: string; x: number; y: number } | null>(null);
  const activeName = fileName && eligible.some(f => f.fileName === fileName)
    ? fileName : (eligible[0]?.fileName || '');
  const active = eligible.find(f => f.fileName === activeName);

  // Pick the two runs to compare. Prefer a SWMM5-family engine on x and
  // SWMM6 on y so the plots read "SWMM6 vs SWMM5"; otherwise first two.
  const pair = useMemo(() => {
    if (!active) return null;
    const withContent: { label: string; content: string; engine: string }[] = [];
    active.results.forEach((r, i) => {
      if (r?.status === 'success' && r.hasReport && r.cacheKey) {
        const content = getReport(r.cacheKey);
        if (content) withContent.push({ label: comparison.engines[i].label, engine: comparison.engines[i].engine, content });
      }
    });
    if (withContent.length < 2) return null;
    const isSwmm6 = (e: string) => e === 'wasm6' || e === 'wasm6dev';
    let a = withContent[0], b = withContent[1];
    if (isSwmm6(a.engine) && !isSwmm6(b.engine)) [a, b] = [b, a];
    else if (!isSwmm6(b.engine)) {
      const six = withContent.find(e => isSwmm6(e.engine));
      if (six) b = six;
    }
    return [a, b] as const;
  }, [active, comparison, getReport]);

  const vals = useMemo(() => {
    if (!pair) return null;
    return [extractScatterValues(pair[0].content), extractScatterValues(pair[1].content)] as const;
  }, [pair]);

  const charts = useMemo(() => {
    if (!pair || !vals) return [];
    const [valsX, valsY] = vals;
    const specs: { id: string; title: string; x: Map<string, number>; y: Map<string, number> }[] = [
      { id: 'flows', title: 'Peak Link Flows', x: valsX.flows, y: valsY.flows },
      // When both reports have an HGL column, show HGL and depths separately;
      // otherwise "heads" already equals max depths, so skip the duplicate.
      ...(valsX.headsLabel === 'Maximum HGL' && valsY.headsLabel === 'Maximum HGL'
        ? [
            { id: 'heads', title: 'Maximum Node HGL (Heads)', x: valsX.heads, y: valsY.heads },
            { id: 'node-depths', title: 'Maximum Node Depths', x: valsX.nodeDepths, y: valsY.nodeDepths },
          ]
        : [{ id: 'node-depths', title: 'Maximum Node Depths', x: valsX.nodeDepths, y: valsY.nodeDepths }]),
      { id: 'link-depths', title: 'Max Link Depth (fraction of full)', x: valsX.linkDepths, y: valsY.linkDepths },
      { id: 'runoff', title: 'Peak Subcatchment Runoff (flow)', x: valsX.runoff, y: valsY.runoff },
    ];
    return specs.map(spec => {
      const points: ScatterPoint[] = [];
      spec.x.forEach((x, name) => {
        const y = spec.y.get(name);
        if (y !== undefined) points.push({ x, y, name });
      });
      return { spec, points, r2: rSquared(points) };
    }).filter(c => c.points.length > 0);
  }, [pair, vals]);

  // Time-series overlays for the elements where the two engines disagree most.
  const overlays = useMemo(() => {
    if (!pair || !vals) return [];
    return buildWorstOverlays(pair[0].content, pair[1].content, vals[0], vals[1]);
  }, [pair, vals]);

  if (comparison.engines.length < 2 || eligible.length === 0) return null;

  const xLabel = pair?.[0].label || 'Engine A';
  const yLabel = pair?.[1].label || 'Engine B';

  return (
    <Card data-testid="card-scatter-compare">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm">
            Per-Element Peak Comparison ({yLabel} vs {xLabel})
          </CardTitle>
          <Select value={activeName} onValueChange={n => { setFileName(n); setSelected(null); }}>
            <SelectTrigger className="w-56 h-8 text-xs" data-testid="select-scatter-file">
              <SelectValue placeholder="Pick a file" />
            </SelectTrigger>
            <SelectContent>
              {eligible.map(f => (
                <SelectItem key={f.fileName} value={f.fileName}>{f.fileName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          Scatter plots in the style of the EPA SWMM 5 QA report — each point is one element;
          the dashed line marks perfect agreement. Click a point to identify the element.
        </p>
      </CardHeader>
      <CardContent>
        {pair && charts.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="text-scatter-no-tables">
            No comparable summary tables (link flows, node depths, runoff) were found in both reports.
          </p>
        )}
        {selected && (
          <p className="text-xs mb-3 px-2 py-1.5 rounded bg-muted font-mono" data-testid="text-scatter-selected">
            {selected.chart}: <span className="font-semibold">{selected.name}</span>
            {' — '}{xLabel}: {selected.x.toPrecision(5)}, {yLabel}: {selected.y.toPrecision(5)}
            {' '}(Δ {(selected.y - selected.x).toPrecision(4)})
          </p>
        )}
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {charts.map(({ spec, points, r2 }) => {
            const maxV = Math.max(...points.map(p => Math.max(p.x, p.y)), 1e-6) * 1.05;
            return (
              <div key={spec.id} data-testid={`chart-scatter-${spec.id}`}>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 8, right: 12, left: 4, bottom: 22 }}>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.4} />
                      <XAxis type="number" dataKey="x" domain={[0, maxV]}
                        label={{ value: xLabel, position: 'insideBottom', offset: -12, fontSize: 11 }}
                        fontSize={10} tickFormatter={(v: number) => v.toPrecision(3)} />
                      <YAxis type="number" dataKey="y" domain={[0, maxV]}
                        label={{ value: yLabel, angle: -90, position: 'insideLeft', fontSize: 11 }}
                        fontSize={10} tickFormatter={(v: number) => v.toPrecision(3)} />
                      <ChartTooltip
                        content={({ payload }) => {
                          const p = payload?.[0]?.payload as ScatterPoint | undefined;
                          if (!p) return null;
                          return (
                            <div className="bg-popover border rounded px-2 py-1 text-xs">
                              <div className="font-medium">{p.name}</div>
                              <div>{xLabel}: {p.x.toFixed(3)}</div>
                              <div>{yLabel}: {p.y.toFixed(3)}</div>
                            </div>
                          );
                        }}
                      />
                      <ReferenceLine segment={[{ x: 0, y: 0 }, { x: maxV, y: maxV }]} stroke="#888" strokeDasharray="4 4" />
                      <Scatter data={points} fill="#1d4ed8" isAnimationActive={false} cursor="pointer"
                        onClick={(p: any) => {
                          const pt = p?.payload as ScatterPoint | undefined;
                          if (pt) setSelected({ chart: spec.title, name: pt.name, x: pt.x, y: pt.y });
                        }} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-muted-foreground mt-1 text-center">
                  {spec.title} — {points.length} elements{r2 !== undefined ? `, R² = ${r2.toFixed(4)}` : ''}
                </p>
              </div>
            );
          })}
        </div>
        {overlays.map(ov => (
          <div key={ov.id} className="mt-6" data-testid={`chart-${ov.id}`}>
            <p className="text-xs font-medium mb-1">{ov.title}</p>
            {ov.rows && ov.rows.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={ov.rows} margin={{ top: 8, right: 12, left: 4, bottom: 22 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.4} />
                    <XAxis dataKey="h" type="number" domain={['dataMin', 'dataMax']}
                      label={{ value: 'Elapsed Time (hours)', position: 'insideBottom', offset: -12, fontSize: 11 }}
                      fontSize={10} tickFormatter={(v: number) => v.toFixed(1)} />
                    <YAxis fontSize={10}
                      label={{ value: ov.yAxis, angle: -90, position: 'insideLeft', fontSize: 11 }}
                      tickFormatter={(v: number) => v.toPrecision(3)} />
                    <ChartTooltip
                      formatter={(value: number) => value.toFixed(3)}
                      labelFormatter={(h: number) => `${h.toFixed(2)} h`}
                    />
                    <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="a" name={xLabel} stroke="#1d4ed8"
                      dot={false} strokeWidth={2} isAnimationActive={false} />
                    <Line type="monotone" dataKey="b" name={yLabel} stroke="#d97706"
                      dot={false} strokeWidth={2} strokeDasharray="6 4" isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground" data-testid={`text-${ov.id}-no-series`}>
                {ov.reason === 'missing-link'
                  ? <>The reports include time series, but not for {ov.kind === 'link' ? 'Link' : 'Node'} {ov.name} in
                    both engines — check that the [REPORT] section lists the same elements for each run.</>
                  : <>These reports don&apos;t include {ov.kind} time series, so the comparison for
                    {' '}{ov.kind === 'link' ? 'Link' : 'Node'} {ov.name} can&apos;t be drawn. (Reports only contain
                    time series when the model&apos;s [REPORT] section lists the elements.)</>}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
