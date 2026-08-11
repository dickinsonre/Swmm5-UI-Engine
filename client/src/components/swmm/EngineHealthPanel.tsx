// Engine Health dashboard: compact strip of diagnostic metric cards shown after a run,
// plus a full dialog with Continuity, Timestep Explorer, and Assumptions tabs.
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { SwmmProject, SimulationResults } from '@/lib/swmm-types';
import {
  parseRptEngineMetrics, classifyContinuity, computeResultHealth,
  buildAssumptions, optionsFromInpText, explainTimestepDrop,
  type RptEngineMetrics, type ComputedHealth,
} from '@/lib/engine-insights';

export interface HealthHighlight {
  ids: Set<string>;
  type: 'node' | 'link';
}

interface Props {
  project: SwmmProject;
  results: SimulationResults;
  onHighlight: (h: HealthHighlight | null) => void;
  activeHighlightKey: string | null;
  setActiveHighlightKey: (k: string | null) => void;
  onShowRegime: () => void;
  onOpenInspector: () => void;
}

function MetricCard({ label, value, sub, color, bg, onClick, active, testId }: {
  label: string; value: string; sub?: string; color: string; bg: string;
  onClick?: () => void; active?: boolean; testId: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      data-testid={testId}
      title={onClick ? 'Click to highlight on map' : undefined}
      className={`shrink-0 text-left rounded-md border px-2 py-1 leading-tight transition-colors ${onClick ? 'cursor-pointer hover:brightness-95' : 'cursor-default'} ${active ? 'ring-2 ring-[#2c6eb5]' : ''}`}
      style={{ backgroundColor: bg, borderColor: active ? '#2c6eb5' : '#d0d0d8' }}
    >
      <div className="text-[9px] uppercase tracking-wide text-[#6b6b7b]">{label}</div>
      <div className="text-[12px] font-semibold" style={{ color }}>{value}</div>
      {sub && <div className="text-[9px] text-[#6b6b7b]">{sub}</div>}
    </button>
  );
}

export function useEngineHealth(project: SwmmProject, results: SimulationResults | null) {
  const rptMetrics = useMemo<RptEngineMetrics | null>(
    () => (results?.reportContent ? parseRptEngineMetrics(results.reportContent) : null),
    [results?.reportContent],
  );
  const computed = useMemo<ComputedHealth>(
    () => computeResultHealth(project, results),
    [project, results],
  );
  return { rptMetrics, computed };
}

export function EngineHealthStrip({
  project, results, onHighlight, activeHighlightKey, setActiveHighlightKey, onShowRegime, onOpenInspector,
}: Props) {
  const [showDialog, setShowDialog] = useState(false);
  const { rptMetrics, computed } = useEngineHealth(project, results);
  if (!rptMetrics) return null;

  const routing = rptMetrics.continuity.find(c => c.key === 'routing');
  const runoff = rptMetrics.continuity.find(c => c.key === 'runoff');
  const contClass = classifyContinuity(routing?.errorPct ?? runoff?.errorPct ?? null);
  const t = rptMetrics.timeStep;
  const hasTimeSeries = results.timeSteps.length > 0;

  const toggleHighlight = (key: string, ids: string[], type: 'node' | 'link') => {
    if (activeHighlightKey === key) {
      setActiveHighlightKey(null);
      onHighlight(null);
    } else if (ids.length > 0) {
      setActiveHighlightKey(key);
      onHighlight({ ids: new Set(ids), type });
    }
  };

  const minDtWarn = t.requestedSec != null && t.minSec != null && t.minSec < t.requestedSec * 0.25;
  const nonConv = t.pctNotConverging ?? 0;

  return (
    <>
      <div
        className="flex items-center gap-1.5 px-2 py-1 border-b overflow-x-auto"
        style={{ backgroundColor: '#f4f6f9', borderColor: '#d0d0d8' }}
        data-testid="engine-health-strip"
      >
        <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-[#2c3e6b]">Engine Health</span>
        <MetricCard
          label="Continuity" testId="hc-continuity"
          value={`${(routing?.errorPct ?? runoff?.errorPct ?? 0).toFixed(2)}% — ${contClass.label}`}
          color={contClass.color} bg={contClass.bg}
          onClick={() => setShowDialog(true)}
        />
        <MetricCard
          label="Min Δt" testId="hc-min-dt"
          value={t.minSec != null ? `${t.minSec.toFixed(2)} s${minDtWarn ? ' ⚠' : ''}` : '—'}
          sub={t.requestedSec != null ? `req ${t.requestedSec.toFixed(0)} s · avg ${t.avgSec?.toFixed(1) ?? '—'} s` : undefined}
          color={minDtWarn ? '#b0730a' : '#2a2a3e'} bg={minDtWarn ? '#fdf3df' : '#ffffff'}
          onClick={() => setShowDialog(true)}
        />
        <MetricCard
          label="Non-converging" testId="hc-nonconv"
          value={`${nonConv.toFixed(1)}%`}
          sub={rptMetrics.nonconvergingNodes.length > 0 ? `${rptMetrics.nonconvergingNodes.length} nodes listed` : undefined}
          color={nonConv > 5 ? '#c62828' : nonConv > 1 ? '#b0730a' : '#1a7f37'}
          bg={nonConv > 5 ? '#fdeaea' : nonConv > 1 ? '#fdf3df' : '#e6f4ea'}
          onClick={() => toggleHighlight('nonconv', rptMetrics.nonconvergingNodes.map(n => n.id), 'node')}
          active={activeHighlightKey === 'nonconv'}
        />
        {hasTimeSeries && (
          <MetricCard
            label="Surcharged" testId="hc-surcharged"
            value={`${computed.surchargedNodeIds.length} nodes`}
            sub={computed.floodedNodeIds.length > 0 ? `${computed.floodedNodeIds.length} flooded` : undefined}
            color={computed.surchargedNodeIds.length > 0 ? '#7b3fa0' : '#1a7f37'}
            bg={computed.surchargedNodeIds.length > 0 ? '#f3ebfa' : '#e6f4ea'}
            onClick={() => toggleHighlight('surcharge', computed.surchargedNodeIds, 'node')}
            active={activeHighlightKey === 'surcharge'}
          />
        )}
        {hasTimeSeries && (
          <MetricCard
            label="Reversals" testId="hc-reversals"
            value={`${computed.reversalLinkIds.length} links`}
            color={computed.reversalLinkIds.length > 0 ? '#b0730a' : '#1a7f37'}
            bg={computed.reversalLinkIds.length > 0 ? '#fdf3df' : '#e6f4ea'}
            onClick={() => toggleHighlight('reversal', computed.reversalLinkIds, 'link')}
            active={activeHighlightKey === 'reversal'}
          />
        )}
        {computed.hasFroude && (
          <MetricCard
            label="Max Froude" testId="hc-froude"
            value={computed.maxFroude.value.toFixed(2)}
            sub={computed.maxFroude.linkId ? `link ${computed.maxFroude.linkId}` : undefined}
            color={computed.maxFroude.value > 1.5 ? '#c62828' : computed.maxFroude.value > 1 ? '#b0730a' : '#2a2a3e'}
            bg={computed.maxFroude.value > 1 ? '#fdf3df' : '#ffffff'}
            onClick={() => toggleHighlight('froude', computed.maxFroude.linkId ? [computed.maxFroude.linkId] : [], 'link')}
            active={activeHighlightKey === 'froude'}
          />
        )}
        {rptMetrics.instabilityLinks.length > 0 && (
          <MetricCard
            label="Instability" testId="hc-instability"
            value={`${rptMetrics.instabilityLinks.length} links`}
            sub={`worst: ${rptMetrics.instabilityLinks[0].id} (${rptMetrics.instabilityLinks[0].index})`}
            color="#c62828" bg="#fdeaea"
            onClick={() => toggleHighlight('instability', rptMetrics.instabilityLinks.map(l => l.id), 'link')}
            active={activeHighlightKey === 'instability'}
          />
        )}
        <div className="w-px h-6 bg-[#d0d0d8] shrink-0" />
        {hasTimeSeries && (
          <>
            <button
              onClick={onShowRegime}
              className="shrink-0 text-[10px] px-2 py-1 rounded border bg-white text-[#2a2a3e] border-[#d0d0d8] hover:bg-[#e8f0fb]"
              data-testid="btn-show-regime"
              title="Color links by flow regime (dry / subcritical / supercritical / critical / full)"
            >
              Flow Regime Map
            </button>
            <button
              onClick={onOpenInspector}
              className="shrink-0 text-[10px] px-2 py-1 rounded border bg-white text-[#2a2a3e] border-[#d0d0d8] hover:bg-[#e8f0fb]"
              data-testid="btn-open-inspector"
              title="Inspect the full calculation chain for a conduit at a timestep"
            >
              🔬 Inspector
            </button>
          </>
        )}
        <button
          onClick={() => setShowDialog(true)}
          className="shrink-0 text-[10px] px-2 py-1 rounded border bg-white text-[#2a2a3e] border-[#d0d0d8] hover:bg-[#e8f0fb]"
          data-testid="btn-engine-health-details"
        >
          Details…
        </button>
      </div>
      <EngineHealthDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        project={project}
        results={results}
        rptMetrics={rptMetrics}
        computed={computed}
      />
    </>
  );
}

function EngineHealthDialog({ open, onClose, project, results, rptMetrics, computed }: {
  open: boolean; onClose: () => void; project: SwmmProject; results: SimulationResults;
  rptMetrics: RptEngineMetrics; computed: ComputedHealth;
}) {
  const [tab, setTab] = useState<'continuity' | 'timestep' | 'assumptions'>('continuity');
  // Prefer the [OPTIONS] of the .inp that actually ran; fall back to the current model.
  const { assumptions, fromRun } = useMemo(() => {
    const runOpts = results.inpUsed ? optionsFromInpText(results.inpUsed) : null;
    return {
      assumptions: buildAssumptions(runOpts ?? project.options ?? {}),
      fromRun: !!runOpts,
    };
  }, [results.inpUsed, project.options]);
  const reasons = useMemo(() => explainTimestepDrop(rptMetrics), [rptMetrics]);
  const t = rptMetrics.timeStep;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col bg-white text-[#2a2a3e]" data-testid="engine-health-dialog">
        <DialogHeader>
          <DialogTitle className="text-sm text-[#2a2a3e]">Engine Health</DialogTitle>
        </DialogHeader>
        <div className="flex gap-1 border-b pb-1" style={{ borderColor: '#e0e0e8' }}>
          {([['continuity', 'Continuity'], ['timestep', 'Timestep Explorer'], ['assumptions', 'Assumptions']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`text-[11px] px-3 py-1.5 rounded-t border-b-2 ${tab === k ? 'border-[#2c6eb5] text-[#2c6eb5] font-semibold' : 'border-transparent text-[#6b6b7b] hover:text-[#2a2a3e]'}`}
              data-testid={`tab-eh-${k}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto pr-1 text-[11px]">
          {tab === 'continuity' && (
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {rptMetrics.continuity.map(c => {
                  const cls = classifyContinuity(c.errorPct);
                  return (
                    <div key={c.key} className="rounded-md border p-2" style={{ backgroundColor: cls.bg, borderColor: '#d0d0d8' }} data-testid={`cont-card-${c.key}`}>
                      <div className="text-[9px] uppercase tracking-wide text-[#6b6b7b]">{c.title.replace(' Continuity', '')}</div>
                      <div className="text-[15px] font-bold" style={{ color: cls.color }}>
                        {c.errorPct != null ? `${c.errorPct.toFixed(3)}%` : '—'}
                      </div>
                      <div className="text-[10px] font-medium" style={{ color: cls.color }}>{cls.label}</div>
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] text-[#6b6b7b]">
                Classification: &lt;1% Excellent · 1–2% Good · 2–5% Investigate · &gt;5% Warning
              </div>
              {rptMetrics.highestContinuityNodes.length > 0 && (
                <div>
                  <div className="font-semibold mb-1">Highest node continuity errors</div>
                  <table className="w-full text-[11px]">
                    <tbody>
                      {rptMetrics.highestContinuityNodes.map(n => (
                        <tr key={n.id} className="border-b" style={{ borderColor: '#eee' }}>
                          <td className="py-0.5 font-mono">{n.id}</td>
                          <td className="py-0.5 text-right" style={{ color: Math.abs(n.pct) > 10 ? '#c62828' : '#2a2a3e' }}>{n.pct.toFixed(2)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {rptMetrics.continuity.map(c => c.rows.length > 0 && (
                <details key={c.key} className="rounded border" style={{ borderColor: '#e0e0e8' }}>
                  <summary className="cursor-pointer px-2 py-1 font-medium bg-[#f8f8fa]">{c.title} — full budget</summary>
                  <table className="w-full text-[10px]">
                    <tbody>
                      {c.rows.map((r, i) => (
                        <tr key={i} className="border-b" style={{ borderColor: '#f0f0f4' }}>
                          <td className="px-2 py-0.5">{r.label}</td>
                          <td className="px-2 py-0.5 text-right font-mono">{r.v1}</td>
                          <td className="px-2 py-0.5 text-right font-mono">{r.v2}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              ))}
            </div>
          )}
          {tab === 'timestep' && (
            <div className="space-y-3 pt-2" data-testid="timestep-explorer">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-md border p-2 bg-white" style={{ borderColor: '#d0d0d8' }}>
                  <div className="text-[9px] uppercase text-[#6b6b7b]">Requested step</div>
                  <div className="text-[14px] font-bold">{t.requestedSec != null ? `${t.requestedSec} s` : '—'}</div>
                  <div className="text-[10px] text-[#6b6b7b]">Variable: {t.variableStep == null ? '—' : t.variableStep ? 'ON' : 'OFF'}</div>
                </div>
                <div className="rounded-md border p-2 bg-white" style={{ borderColor: '#d0d0d8' }}>
                  <div className="text-[9px] uppercase text-[#6b6b7b]">Minimum step</div>
                  <div className="text-[14px] font-bold">{t.minSec != null ? `${t.minSec.toFixed(2)} s` : '—'}</div>
                </div>
                <div className="rounded-md border p-2 bg-white" style={{ borderColor: '#d0d0d8' }}>
                  <div className="text-[9px] uppercase text-[#6b6b7b]">Average step</div>
                  <div className="text-[14px] font-bold">{t.avgSec != null ? `${t.avgSec.toFixed(2)} s` : '—'}</div>
                  <div className="text-[10px] text-[#6b6b7b]">{t.avgIterations != null ? `${t.avgIterations.toFixed(2)} iterations/step` : ''}</div>
                </div>
                <div className="rounded-md border p-2 bg-white" style={{ borderColor: '#d0d0d8' }}>
                  <div className="text-[9px] uppercase text-[#6b6b7b]">Not converging</div>
                  <div className="text-[14px] font-bold" style={{ color: (t.pctNotConverging ?? 0) > 5 ? '#c62828' : '#2a2a3e' }}>
                    {t.pctNotConverging != null ? `${t.pctNotConverging.toFixed(1)}%` : '—'}
                  </div>
                  <div className="text-[10px] text-[#6b6b7b]">{t.pctSteady != null ? `steady state ${t.pctSteady.toFixed(1)}%` : ''}</div>
                </div>
              </div>
              {t.frequencies.length > 0 && (
                <div>
                  <div className="font-semibold mb-1">Timestep frequency distribution</div>
                  {t.frequencies.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 py-0.5">
                      <div className="w-40 font-mono text-[10px]">{f.range}</div>
                      <div className="flex-1 h-3 rounded bg-[#eef1f5] overflow-hidden">
                        <div className="h-full rounded" style={{ width: `${Math.max(f.pct, f.pct > 0 ? 2 : 0)}%`, backgroundColor: '#2c6eb5' }} />
                      </div>
                      <div className="w-14 text-right font-mono text-[10px]">{f.pct.toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <div className="font-semibold mb-1">Why did the timestep behave this way?</div>
                <ul className="list-disc pl-4 space-y-1">
                  {reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
              {rptMetrics.timeStepCriticalElements.length > 0 && (
                <div>
                  <div className="font-semibold mb-1">Time-step critical elements</div>
                  {rptMetrics.timeStepCriticalElements.map(l => (
                    <div key={`${l.kind}-${l.id}`} className="font-mono text-[10px]">{l.kind === 'node' ? 'Node' : 'Link'} {l.id} — controls {l.pct.toFixed(2)}% of steps</div>
                  ))}
                </div>
              )}
            </div>
          )}
          {tab === 'assumptions' && (
            <div className="pt-2" data-testid="assumptions-drawer">
              <div className="text-[10px] text-[#6b6b7b] mb-2">
                {fromRun
                  ? 'Exactly what engine settings produced this result — read from the [OPTIONS] of the .inp file that was run.'
                  : 'Engine settings from the current model\u2019s [OPTIONS] — the model may have been edited since this run.'}
              </div>
              <table className="w-full text-[11px]">
                <tbody>
                  {(assumptions.length > 0 ? assumptions : []).map(a => (
                    <tr key={a.key} className="border-b" style={{ borderColor: '#f0f0f4' }}>
                      <td className="py-1 text-[#6b6b7b]">{a.label}</td>
                      <td className="py-1 font-mono text-right">{a.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rptMetrics.analysisOptions.length > 0 && (
                <details className="mt-3 rounded border" style={{ borderColor: '#e0e0e8' }}>
                  <summary className="cursor-pointer px-2 py-1 font-medium bg-[#f8f8fa]">Engine-reported Analysis Options (.rpt)</summary>
                  <table className="w-full text-[10px]">
                    <tbody>
                      {rptMetrics.analysisOptions.map((o, i) => (
                        <tr key={i} className="border-b" style={{ borderColor: '#f0f0f4' }}>
                          <td className="px-2 py-0.5">{o.label}</td>
                          <td className="px-2 py-0.5 font-mono text-right">{o.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
