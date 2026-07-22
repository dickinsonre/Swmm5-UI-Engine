import { useMemo, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import type { SwmmProject, SimulationResults } from '@/lib/swmm-types';
import {
  extractTrajectory, computeDerivatives, computePhaseMetrics, computeAttentionSweep, computeManningCurve,
  isLinkObjType, isNodeObjType,
  type PhaseMetrics,
} from '@/lib/phase-space';
import { Activity, ArrowUpRight, ArrowDownRight, Table2, LineChart as LineChartIcon } from 'lucide-react';

export interface PhaseSpaceTarget {
  id: string;
  elementType: 'link' | 'node';
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: SwmmProject;
  results: SimulationResults | null;
  target: PhaseSpaceTarget | null;
  onTargetChange: (t: PhaseSpaceTarget | null) => void;
}

export function objTypeToElementType(objType: string): 'link' | 'node' | null {
  if (isLinkObjType(objType)) return 'link';
  if (isNodeObjType(objType)) return 'node';
  return null;
}

function fmt(v: number, digits = 3): string {
  if (!isFinite(v)) return '—';
  return Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(digits);
}

function MetricChip({ label, value, warn, testId }: { label: string; value: string; warn: boolean; testId: string }) {
  return (
    <div
      className="flex flex-col px-3 py-1.5 rounded border"
      style={{ borderColor: warn ? '#e0a030' : '#d0d0d8', backgroundColor: warn ? '#fdf6e8' : '#f8f8fa' }}
      data-testid={testId}
    >
      <span className="text-[9px] uppercase tracking-wide text-[#6b6b7b]">{label}</span>
      <span className="text-[13px] font-semibold" style={{ color: warn ? '#b07010' : '#2a2a3e' }}>{value}</span>
    </div>
  );
}

export default function PhaseSpaceDialog({ open, onOpenChange, project, results, target, onTargetChange }: Props) {
  const [view, setView] = useState<'phase' | 'sweep'>('phase');

  useEffect(() => {
    if (open) setView(target ? 'phase' : 'sweep');
  }, [open, target]);

  const hasResults = !!(results && results.timeSteps.length > 3);

  const sweep = useMemo<PhaseMetrics[]>(() => {
    if (!open || !hasResults || !results) return [];
    return computeAttentionSweep(project, results);
  }, [open, hasResults, project, results]);

  const traj = useMemo(() => {
    if (!hasResults || !results || !target) return [];
    return extractTrajectory(results, target.id, target.elementType);
  }, [hasResults, results, target]);

  const derivs = useMemo(() => computeDerivatives(traj), [traj]);

  const metrics = useMemo(() => {
    if (!hasResults || !results || !target) return null;
    return computePhaseMetrics(project, results, target.id, target.elementType);
  }, [hasResults, project, results, target]);

  const manningCurve = useMemo(() => {
    if (!target || target.elementType !== 'link') return null;
    return computeManningCurve(project, target.id);
  }, [project, target]);

  const rising = traj.filter(p => p.rising);
  const falling = traj.filter(p => !p.rising);

  const manningData = useMemo(() => {
    if (!manningCurve || traj.length === 0) return null;
    const maxDepth = Math.max(...traj.map(p => p.depth)) * 1.1;
    return manningCurve.filter(p => p.depth <= Math.max(maxDepth, manningCurve[manningCurve.length - 1].depth * 0.5))
      .map(p => ({ depth: p.depth, flow: p.qNormal }));
  }, [manningCurve, traj]);

  const isLink = target?.elementType === 'link';
  const flowLabel = isLink ? 'Flow' : 'Total Inflow';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-phase-space">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#2a2a3e]">
            <Activity className="w-4 h-4 text-[#2c6eb5]" />
            Phase-Space Diagnostics
          </DialogTitle>
          <DialogDescription>
            Flow–depth trajectories and instability indexes that reveal oscillation, chatter, and reversals hidden in time-series plots.
          </DialogDescription>
        </DialogHeader>

        {!hasResults && (
          <div className="py-8 text-center text-sm text-[#6b6b7b]" data-testid="text-phase-no-results">
            Run a simulation first — phase-space diagnostics need timestep results.
          </div>
        )}

        {hasResults && (
          <div className="space-y-3">
            <div className="flex items-center gap-1 border-b border-[#d0d0d8] pb-1">
              <button
                onClick={() => setView('phase')}
                disabled={!target}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-t ${view === 'phase' ? 'bg-[#2c6eb5] text-white' : 'text-[#2a2a3e] hover:bg-black/[0.04]'} ${!target ? 'opacity-40 cursor-not-allowed' : ''}`}
                data-testid="tab-phase-plot"
              >
                <LineChartIcon className="w-3 h-3" /> Phase Plot {target ? `— ${target.id}` : ''}
              </button>
              <button
                onClick={() => setView('sweep')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-t ${view === 'sweep' ? 'bg-[#2c6eb5] text-white' : 'text-[#2a2a3e] hover:bg-black/[0.04]'}`}
                data-testid="tab-attention-sweep"
              >
                <Table2 className="w-3 h-3" /> Attention Sweep
              </button>
            </div>

            {view === 'phase' && target && (
              <>
                {metrics && (
                  <div className="flex flex-wrap gap-2" data-testid="phase-metrics">
                    <MetricChip label="Depth Reversal %" value={`${metrics.depthReversalPct.toFixed(1)}%`} warn={metrics.depthReversalPct > 15} testId="metric-depth-reversal" />
                    <MetricChip label="Oscillation Index" value={`${(metrics.oscillationIndex * 100).toFixed(0)}%`} warn={metrics.oscillationIndex > 0.3} testId="metric-oscillation" />
                    <MetricChip label="Surcharge Chatter" value={`${metrics.chatterCount}`} warn={metrics.chatterCount > 4} testId="metric-chatter" />
                    <MetricChip label="Flow Sign Reversals" value={`${metrics.signReversals}`} warn={metrics.signReversals > 2} testId="metric-sign-reversals" />
                    <MetricChip label="Instability Score" value={metrics.score.toFixed(0)} warn={metrics.score > 40} testId="metric-score" />
                  </div>
                )}

                <div className="border border-[#d0d0d8] rounded p-2 bg-white">
                  <div className="text-[11px] font-medium text-[#2a2a3e] mb-1 flex items-center gap-3">
                    <span>{flowLabel} vs Depth Trajectory</span>
                    <span className="flex items-center gap-1 text-[10px] text-[#2a8a4a]"><ArrowUpRight className="w-3 h-3" /> Rising</span>
                    <span className="flex items-center gap-1 text-[10px] text-[#c05050]"><ArrowDownRight className="w-3 h-3" /> Falling</span>
                    {manningData && <span className="text-[10px] text-[#6b6b7b]">— — Manning normal flow</span>}
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <ScatterChart margin={{ top: 8, right: 16, bottom: 16, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4ea" />
                      <XAxis type="number" dataKey="depth" name="Depth" tick={{ fontSize: 10 }} label={{ value: 'Depth', position: 'insideBottom', offset: -8, fontSize: 10 }} domain={['auto', 'auto']} />
                      <YAxis type="number" dataKey="flow" name={flowLabel} tick={{ fontSize: 10 }} label={{ value: flowLabel, angle: -90, position: 'insideLeft', fontSize: 10 }} domain={['auto', 'auto']} />
                      <Tooltip
                        formatter={(v: any) => fmt(Number(v))}
                        labelFormatter={() => ''}
                        contentStyle={{ fontSize: 11 }}
                      />
                      {manningData && (
                        <Scatter name="Manning normal flow" data={manningData} fill="none" line={{ stroke: '#8b949e', strokeWidth: 1.5, strokeDasharray: '5 4' }} shape={() => <g />} legendType="none" isAnimationActive={false} />
                      )}
                      <Scatter name="Rising" data={rising} fill="#2a8a4a" isAnimationActive={false} shape="circle" />
                      <Scatter name="Falling" data={falling} fill="#c05050" isAnimationActive={false} shape="circle" />
                    </ScatterChart>
                  </ResponsiveContainer>
                  {isLink && !manningData && (
                    <div className="text-[10px] text-[#6b6b7b] px-1" data-testid="text-no-manning">
                      Manning reference curve unavailable for this link (unsupported shape or missing geometry).
                    </div>
                  )}
                </div>

                <div className="border border-[#d0d0d8] rounded p-2 bg-white">
                  <div className="text-[11px] font-medium text-[#2a2a3e] mb-1">State Derivatives — dQ/dt vs dh/dt</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <ScatterChart margin={{ top: 8, right: 16, bottom: 16, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4ea" />
                      <XAxis type="number" dataKey="dhdt" name="dh/dt" tick={{ fontSize: 10 }} label={{ value: 'dh/dt', position: 'insideBottom', offset: -8, fontSize: 10 }} domain={['auto', 'auto']} />
                      <YAxis type="number" dataKey="dQdt" name="dQ/dt" tick={{ fontSize: 10 }} label={{ value: 'dQ/dt', angle: -90, position: 'insideLeft', fontSize: 10 }} domain={['auto', 'auto']} />
                      <ReferenceLine x={0} stroke="#b0b0b8" />
                      <ReferenceLine y={0} stroke="#b0b0b8" />
                      <Tooltip formatter={(v: any) => fmt(Number(v), 5)} labelFormatter={() => ''} contentStyle={{ fontSize: 11 }} />
                      <Scatter name="dQ/dt vs dh/dt" data={derivs} fill="#2c6eb5" isAnimationActive={false} />
                    </ScatterChart>
                  </ResponsiveContainer>
                  <div className="text-[10px] text-[#6b6b7b] px-1">
                    A tight cluster near the origin means smooth behavior; wide scatter across quadrants indicates numerical oscillation.
                  </div>
                </div>
              </>
            )}

            {view === 'sweep' && (
              <div className="border border-[#d0d0d8] rounded bg-white overflow-hidden">
                <div className="px-3 py-2 text-[11px] text-[#6b6b7b] border-b border-[#d0d0d8] bg-[#f8f8fa]">
                  All simulated elements ranked by instability score. Click a row to open its phase plot.
                </div>
                <div className="max-h-[340px] overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-[#f0f0f4]">
                      <tr className="text-left text-[#6b6b7b]">
                        <th className="px-3 py-1.5 font-medium">#</th>
                        <th className="px-2 py-1.5 font-medium">Element</th>
                        <th className="px-2 py-1.5 font-medium">Type</th>
                        <th className="px-2 py-1.5 font-medium text-right">Score</th>
                        <th className="px-2 py-1.5 font-medium text-right">Depth Rev %</th>
                        <th className="px-2 py-1.5 font-medium text-right">Osc Index</th>
                        <th className="px-2 py-1.5 font-medium text-right">Chatter</th>
                        <th className="px-2 py-1.5 font-medium text-right">Sign Flips</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sweep.slice(0, 100).map((m, i) => (
                        <tr
                          key={`${m.elementType}-${m.id}`}
                          className="border-t border-[#eeeef2] hover:bg-[#eef4fb] cursor-pointer"
                          onClick={() => { onTargetChange({ id: m.id, elementType: m.elementType }); setView('phase'); }}
                          data-testid={`row-sweep-${m.id}`}
                        >
                          <td className="px-3 py-1 text-[#6b6b7b]">{i + 1}</td>
                          <td className="px-2 py-1 font-medium text-[#2c6eb5]">{m.id}</td>
                          <td className="px-2 py-1 text-[#6b6b7b]">{m.objType}</td>
                          <td className="px-2 py-1 text-right font-semibold" style={{ color: m.score > 40 ? '#b07010' : '#2a2a3e' }}>{m.score.toFixed(0)}</td>
                          <td className="px-2 py-1 text-right">{m.depthReversalPct.toFixed(1)}</td>
                          <td className="px-2 py-1 text-right">{(m.oscillationIndex * 100).toFixed(0)}%</td>
                          <td className="px-2 py-1 text-right">{m.chatterCount}</td>
                          <td className="px-2 py-1 text-right">{m.signReversals}</td>
                        </tr>
                      ))}
                      {sweep.length === 0 && (
                        <tr><td colSpan={8} className="px-3 py-4 text-center text-[#6b6b7b]">No elements with enough timestep data.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
