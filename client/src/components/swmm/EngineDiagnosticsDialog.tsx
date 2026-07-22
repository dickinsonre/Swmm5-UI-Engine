import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Activity, CheckCircle2, XCircle, MinusCircle, PlayCircle } from 'lucide-react';
import {
  probeAllEngines,
  getCachedEngineStatuses,
  runEngineSelfTest,
  ENGINE_LABELS,
  ENGINE_COLORS,
  type EngineStatus,
  type RunProvenance,
  type SelfTestSummary,
} from '@/lib/engine-diagnostics';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  provenance: RunProvenance | null;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

export default function EngineDiagnosticsDialog({ open, onOpenChange, provenance }: Props) {
  const [statuses, setStatuses] = useState<EngineStatus[] | null>(getCachedEngineStatuses());
  const [probing, setProbing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const [selfTest, setSelfTest] = useState<SelfTestSummary | null>(null);

  const refresh = useCallback(async (force: boolean) => {
    setProbing(true);
    try {
      const s = await probeAllEngines(force);
      setStatuses(s);
    } finally {
      setProbing(false);
    }
  }, []);

  useEffect(() => {
    if (open && !statuses) refresh(false);
  }, [open, statuses, refresh]);

  const handleSelfTest = useCallback(async () => {
    setTesting(true);
    setSelfTest(null);
    setTestMsg('Preparing self-test model...');
    try {
      const s = statuses ?? (await probeAllEngines(false));
      setStatuses(s);
      const summary = await runEngineSelfTest(s, setTestMsg);
      setSelfTest(summary);
    } catch (e: any) {
      setSelfTest({
        results: [],
        comparison: { checked: false, withinTolerance: false, detail: `Self-test failed: ${e.message}` },
      });
    } finally {
      setTesting(false);
      setTestMsg('');
    }
  }, [statuses]);

  const statusIcon = (s: string) => {
    if (s === 'passed') return <CheckCircle2 className="w-3.5 h-3.5 text-[#2a8a4a]" />;
    if (s === 'failed') return <XCircle className="w-3.5 h-3.5 text-[#c0392b]" />;
    return <MinusCircle className="w-3.5 h-3.5 text-[#9090a0]" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-white border-[#d0d0d8]" data-testid="dialog-engine-diagnostics">
        <DialogHeader>
          <DialogTitle className="text-[#2c3e6b] flex items-center gap-2">
            <Activity className="w-5 h-5" /> Engine Diagnostics
          </DialogTitle>
          <DialogDescription>Status of all simulation engines, last run provenance, and self-test</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm text-[#2a2a3e]">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs font-semibold text-[#2c3e6b]">Engine Status</div>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => refresh(true)}
                disabled={probing}
                data-testid="button-refresh-engines"
              >
                {probing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                Refresh
              </Button>
            </div>
            <table className="w-full text-xs border border-[#d0d0d8]">
              <thead>
                <tr className="bg-[#f0f0f4] text-[#6b6b7b]">
                  <th className="text-left px-2 py-1 font-medium">Engine</th>
                  <th className="text-left px-2 py-1 font-medium">Status</th>
                  <th className="text-left px-2 py-1 font-medium">Version</th>
                  <th className="text-left px-2 py-1 font-medium">Last check</th>
                </tr>
              </thead>
              <tbody>
                {(statuses || []).map(s => (
                  <tr key={s.engine} className="border-t border-[#e0e0e8]" data-testid={`row-engine-${s.engine}`}>
                    <td className="px-2 py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ background: ENGINE_COLORS[s.engine] }} />
                        {ENGINE_LABELS[s.engine]}
                      </span>
                    </td>
                    <td className="px-2 py-1.5" data-testid={`status-engine-${s.engine}`}>
                      {s.ready
                        ? <span className="text-[#2a8a4a] font-medium">Ready</span>
                        : <span className="text-[#c0392b] font-medium">Unavailable</span>}
                    </td>
                    <td className="px-2 py-1.5">{s.version}</td>
                    <td className="px-2 py-1.5 text-[#6b6b7b]">
                      {s.detail} <span className="text-[10px]">({fmtTime(s.checkedAt)})</span>
                    </td>
                  </tr>
                ))}
                {!statuses && (
                  <tr><td colSpan={4} className="px-2 py-3 text-center text-[#6b6b7b]">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Probing engines...
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div>
            <div className="text-xs font-semibold text-[#2c3e6b] mb-1.5">Last Run Provenance</div>
            {provenance ? (
              <div className="border border-[#d0d0d8] rounded p-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs" data-testid="panel-run-provenance">
                <div><span className="text-[#6b6b7b]">Engine used:</span>{' '}
                  <span className="font-medium inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: ENGINE_COLORS[provenance.engine] }} />
                    {ENGINE_LABELS[provenance.engine]}
                  </span>
                </div>
                <div><span className="text-[#6b6b7b]">Runtime:</span> <span className="font-medium">{(provenance.runtimeMs / 1000).toFixed(1)} s</span></div>
                <div><span className="text-[#6b6b7b]">Started:</span> {fmtTime(provenance.startedAt)}</div>
                <div><span className="text-[#6b6b7b]">Finished:</span> {fmtTime(provenance.finishedAt)}</div>
                <div><span className="text-[#6b6b7b]">Report periods:</span> {provenance.reportingSteps} ({fmtDuration(provenance.totalDuration)})</div>
                <div><span className="text-[#6b6b7b]">Routing model:</span> {provenance.routingModel}</div>
                <div><span className="text-[#6b6b7b]">Report size:</span> {fmtBytes(provenance.outputBytes)}</div>
                <div><span className="text-[#6b6b7b]">Warnings:</span> {provenance.warningCount}</div>
                <div><span className="text-[#6b6b7b]">Runoff continuity:</span> {provenance.continuityErrors.runoff.toFixed(2)}%</div>
                <div><span className="text-[#6b6b7b]">Flow continuity:</span> {provenance.continuityErrors.flow.toFixed(2)}%</div>
              </div>
            ) : (
              <div className="border border-dashed border-[#d0d0d8] rounded p-3 text-xs text-[#6b6b7b]" data-testid="text-no-provenance">
                No simulation has been run yet this session.
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs font-semibold text-[#2c3e6b]">Engine Self-Test</div>
              <Button
                size="sm"
                className="h-6 px-2 text-[11px] bg-[#2c6eb5] hover:bg-[#245a94] text-white"
                onClick={handleSelfTest}
                disabled={testing}
                data-testid="button-run-self-test"
              >
                {testing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <PlayCircle className="w-3 h-3 mr-1" />}
                Run engine self-test
              </Button>
            </div>
            <p className="text-[11px] text-[#6b6b7b] mb-1.5">
              Runs a tiny bundled model through every available engine and cross-checks peak outfall flow within a 5% tolerance.
            </p>
            {testing && (
              <div className="text-xs text-[#2c6eb5] flex items-center gap-1.5 py-2" data-testid="text-self-test-progress">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> {testMsg || 'Running...'}
              </div>
            )}
            {selfTest && (
              <div className="space-y-2">
                <table className="w-full text-xs border border-[#d0d0d8]" data-testid="table-self-test">
                  <thead>
                    <tr className="bg-[#f0f0f4] text-[#6b6b7b]">
                      <th className="text-left px-2 py-1 font-medium">Engine</th>
                      <th className="text-left px-2 py-1 font-medium">Result</th>
                      <th className="text-left px-2 py-1 font-medium">Peak flow (CFS)</th>
                      <th className="text-left px-2 py-1 font-medium">Continuity err</th>
                      <th className="text-left px-2 py-1 font-medium">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selfTest.results.map(r => (
                      <tr key={r.engine} className="border-t border-[#e0e0e8]" data-testid={`row-selftest-${r.engine}`}>
                        <td className="px-2 py-1.5">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full inline-block" style={{ background: ENGINE_COLORS[r.engine] }} />
                            {ENGINE_LABELS[r.engine]}
                          </span>
                        </td>
                        <td className="px-2 py-1.5">
                          <span className="inline-flex items-center gap-1 capitalize">{statusIcon(r.status)} {r.status}</span>
                        </td>
                        <td className="px-2 py-1.5">{r.peakOutfallFlow !== null ? r.peakOutfallFlow.toFixed(3) : '—'}</td>
                        <td className="px-2 py-1.5">{r.flowContinuityError !== null ? `${r.flowContinuityError.toFixed(2)}%` : '—'}</td>
                        <td className="px-2 py-1.5 text-[#6b6b7b]">{r.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div
                  className={`text-xs rounded px-2.5 py-1.5 border ${
                    selfTest.comparison.withinTolerance
                      ? 'bg-[rgba(42,138,74,0.08)] border-[#2a8a4a] text-[#2a8a4a]'
                      : 'bg-[rgba(192,57,43,0.08)] border-[#c0392b] text-[#c0392b]'
                  }`}
                  data-testid="text-self-test-comparison"
                >
                  {selfTest.comparison.withinTolerance ? 'PASS: ' : 'FAIL: '}{selfTest.comparison.detail}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} data-testid="button-close-diagnostics">Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
