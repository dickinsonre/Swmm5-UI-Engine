import { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Layers, FolderOpen, X, Play, Square, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { parseInpFile } from '@/lib/inp-parser';
import { createLocalEngine, createWasmEngine, createWasm6Engine, createRemoteEngine, runWasmEngineInWorker } from '@/lib/swmm-engine';
import type { SwmmEngine } from '@/lib/swmm-engine';
import type { SimulationResults } from '@/lib/swmm-types';
import {
  parseReportMetrics, extractEngineVersion, buildComparison,
  BATCH_ENGINE_LABELS,
} from '@/lib/batch-compare';
import type { BatchEngineId, BatchFileResult, EngineRun, ComparisonSummary, FileComparison } from '@/lib/batch-compare';
import EngineScatterCompare from '@/components/swmm/EngineScatterCompare';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  availableEngines: BatchEngineId[];
}

interface BatchFile {
  id: number;
  name: string;
  text: string;
}

type FileState = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';

const ENGINE_FACTORIES: Record<BatchEngineId, () => SwmmEngine> = {
  local: createLocalEngine,
  wasm: createWasmEngine,
  wasm6: () => createWasm6Engine('wasm6'),
  wasm6dev: () => createWasm6Engine('wasm6dev'),
  remote: createRemoteEngine,
};

const ENGINE_DOT: Record<BatchEngineId, string> = {
  local: '#2a8a4a', wasm: '#e88a1a', wasm6: '#8a4ae2', wasm6dev: '#c24ae2', remote: '#2c6eb5',
};

const VERDICT_STYLE: Record<FileComparison['verdict'], { label: string; cls: string }> = {
  'match': { label: 'Match', cls: 'bg-green-500/15 text-green-600 dark:text-green-400' },
  'differs': { label: 'Differs', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  'status-mismatch': { label: 'Status mismatch', cls: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  'inconclusive': { label: 'Inconclusive', cls: 'bg-muted text-muted-foreground' },
};

/** Aggregate cap on retained report text across the whole batch (chars ≈ bytes). */
const REPORT_CACHE_CAP = 64 * 1024 * 1024;

function fmt(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return '—';
  return Math.abs(v) >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(Math.round(v * 10000) / 10000);
}

export default function BatchRunnerDialog({ open, onOpenChange, availableEngines }: Props) {
  const [files, setFiles] = useState<BatchFile[]>([]);
  const [selectedEngines, setSelectedEngines] = useState<BatchEngineId[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Record<string, FileState>>({}); // key: engine\0fileId
  const [currentLabel, setCurrentLabel] = useState('');
  const [comparison, setComparison] = useState<ComparisonSummary | null>(null);
  const [partialNotice, setPartialNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const cancelRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextIdRef = useRef(1);
  // Single-owner report storage (engine\0fileId -> rpt text), bounded in aggregate.
  const reportCacheRef = useRef(new Map<string, string>());
  const reportCacheSizeRef = useRef(0);
  // Map comparison cells back to cache keys: comparison uses (engineIdx, fileName+occurrence),
  // so we stash the cache key on each result.
  const cacheKeyOf = (engine: BatchEngineId, fileId: number) => `${engine}\u0000${fileId}`;

  /** Any change to inputs invalidates previous run/comparison state. */
  const invalidateResults = useCallback(() => {
    setProgress({});
    setComparison(null);
    setPartialNotice(null);
    setExpanded(new Set());
    reportCacheRef.current.clear();
    reportCacheSizeRef.current = 0;
  }, []);

  const addFiles = useCallback(async (list: FileList | File[]) => {
    const added: BatchFile[] = [];
    for (const f of Array.from(list)) {
      if (!/\.inp$/i.test(f.name)) continue;
      try { added.push({ id: nextIdRef.current++, name: f.name, text: await f.text() }); } catch { /* skip unreadable */ }
    }
    if (added.length) {
      setFiles(prev => [...prev, ...added]);
      invalidateResults();
    }
  }, [invalidateResults]);

  const removeFile = (id: number) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    invalidateResults();
  };

  const toggleEngine = (id: BatchEngineId) => {
    setSelectedEngines(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
    invalidateResults();
  };

  const cacheReport = (key: string, rpt: string | undefined) => {
    if (!rpt) return false;
    if (reportCacheSizeRef.current + rpt.length > REPORT_CACHE_CAP) return false;
    reportCacheRef.current.set(key, rpt);
    reportCacheSizeRef.current += rpt.length;
    return true;
  };

  const startBatch = useCallback(async () => {
    if (!files.length || !selectedEngines.length) return;
    const batchFiles = files; // snapshot — list edits during a run are disabled in the UI
    setRunning(true);
    invalidateResults();
    cancelRef.current = false;
    const abortCtrl = new AbortController();
    abortRef.current = abortCtrl;

    const engineRuns: EngineRun[] = [];
    const completedEngines: EngineRun[] = []; // only fully-completed engine passes
    let cancelled = false;

    for (const engineId of selectedEngines) {
      const results: BatchFileResult[] = [];
      let engineComplete = true;
      for (const file of batchFiles) {
        const key = cacheKeyOf(engineId, file.id);
        if (cancelRef.current) {
          cancelled = true;
          engineComplete = false;
          results.push({ fileName: file.name, status: 'cancelled', cacheKey: key });
          setProgress(p => ({ ...p, [key]: 'cancelled' }));
          continue;
        }
        setProgress(p => ({ ...p, [key]: 'running' }));
        setCurrentLabel(`${BATCH_ENGINE_LABELS[engineId]}: ${file.name}`);
        const t0 = performance.now();
        try {
          const project = parseInpFile(file.text);
          let res: SimulationResults;
          if (engineId === 'wasm' || engineId === 'wasm6' || engineId === 'wasm6dev') {
            // In-browser engines run in a dedicated web worker: the UI stays
            // responsive and Cancel hard-terminates the in-flight run.
            res = await runWasmEngineInWorker(engineId, project, { signal: abortCtrl.signal });
          } else {
            const engine = ENGINE_FACTORIES[engineId]();
            res = await engine.run(project);
          }
          const rpt = res.reportContent || '';
          const hasReport = cacheReport(key, rpt);
          results.push({
            fileName: file.name,
            status: 'success',
            processingTime: Math.round((performance.now() - t0) / 100) / 10,
            hasReport,
            cacheKey: key,
            engineVersion: rpt ? extractEngineVersion(rpt) : undefined,
            parsedMetrics: rpt ? parseReportMetrics(rpt) : undefined,
          });
          setProgress(p => ({ ...p, [key]: 'success' }));
        } catch (err: any) {
          if (err?.name === 'AbortError') {
            // Hard-cancelled mid-run: the worker was terminated immediately.
            cancelled = true;
            engineComplete = false;
            results.push({ fileName: file.name, status: 'cancelled', cacheKey: key });
            setProgress(p => ({ ...p, [key]: 'cancelled' }));
            continue;
          }
          const rpt = typeof err?.reportContent === 'string' ? err.reportContent : undefined;
          const hasReport = cacheReport(key, rpt);
          results.push({
            fileName: file.name,
            status: 'failed',
            error: err?.message || String(err),
            processingTime: Math.round((performance.now() - t0) / 100) / 10,
            hasReport,
            cacheKey: key,
            parsedMetrics: rpt ? parseReportMetrics(rpt) : undefined,
          });
          setProgress(p => ({ ...p, [key]: 'failed' }));
        }
      }
      engineRuns.push({ engine: engineId, label: BATCH_ENGINE_LABELS[engineId], results });
      if (engineComplete) completedEngines.push(engineRuns[engineRuns.length - 1]);
      if (cancelRef.current) { cancelled = true; break; }
    }

    abortRef.current = null;
    setCurrentLabel('');
    setRunning(false);

    // Never render cross-engine verdicts for an incomplete matrix: compare only
    // engines that finished the full file list. A cancelled batch is shown as
    // partial, and single-engine data is a plain summary without verdicts.
    if (cancelled) {
      const skipped = selectedEngines.length - completedEngines.length;
      setPartialNotice(
        `Batch cancelled — showing ${completedEngines.length} of ${selectedEngines.length} engine pass(es); ${skipped} pass(es) incomplete or skipped.`
      );
    }
    const toCompare = cancelled ? completedEngines : engineRuns;
    if (toCompare.length > 0) setComparison(buildComparison(toCompare));
  }, [files, selectedEngines, invalidateResults]);

  const toggleExpand = (name: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const downloadRpt = (r: BatchFileResult, engineLabel: string) => {
    const rpt = r.cacheKey ? reportCacheRef.current.get(r.cacheKey) : undefined;
    if (!rpt) return;
    const blob = new Blob([rpt], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${r.fileName.replace(/\.inp$/i, '')}_${engineLabel.replace(/\s+/g, '_')}.rpt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const showVerdicts = !!comparison && comparison.engines.length >= 2;

  return (
    <Dialog open={open} onOpenChange={v => { if (!running) onOpenChange(v); }}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col" data-testid="dialog-batch-runner">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Layers className="w-4 h-4" /> Batch Runner &amp; Engine Comparison</DialogTitle>
          <DialogDescription>
            Run multiple INP files across engines and compare continuity, runoff, flow, and flooding metrics.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* File list */}
          <div
            className="border border-dashed rounded-md p-3"
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); if (!running) addFiles(e.dataTransfer.files); }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Models ({files.length})</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={running} data-testid="btn-batch-add-files">
                  <FolderOpen className="w-3.5 h-3.5 mr-1" /> Add INP files
                </Button>
                {files.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => { setFiles([]); invalidateResults(); }} disabled={running} data-testid="btn-batch-clear">
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear
                  </Button>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept=".inp" multiple className="hidden"
                onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
            </div>
            {files.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Drop .inp files here or click Add INP files</p>
            ) : (
              <div className="max-h-40 overflow-y-auto space-y-0.5">
                {files.map(f => (
                  <div key={f.id} className="flex items-center gap-2 text-xs py-0.5">
                    <span className="flex-1 truncate font-mono">{f.name}</span>
                    {selectedEngines.map(eng => {
                      const st = progress[cacheKeyOf(eng, f.id)];
                      return (
                        <span key={eng} className={`w-2 h-2 rounded-full inline-block ${
                          st === 'success' ? 'bg-green-500' :
                          st === 'failed' ? 'bg-red-500' :
                          st === 'running' ? 'bg-blue-500 animate-pulse' :
                          st === 'cancelled' ? 'bg-gray-400' : 'bg-muted'
                        }`} title={`${BATCH_ENGINE_LABELS[eng]}: ${st || 'pending'}`} />
                      );
                    })}
                    {!running && (
                      <button onClick={() => removeFile(f.id)} className="text-muted-foreground hover:text-foreground" aria-label={`Remove ${f.name}`}>
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Engine selection + run controls */}
          <div className="flex flex-wrap items-center gap-4">
            {availableEngines.map(id => (
              <label key={id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <Checkbox checked={selectedEngines.includes(id)} onCheckedChange={() => toggleEngine(id)} disabled={running} data-testid={`chk-batch-engine-${id}`} />
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: ENGINE_DOT[id] }} />
                {BATCH_ENGINE_LABELS[id]}
              </label>
            ))}
            <div className="ml-auto flex items-center gap-2">
              {running ? (
                <Button size="sm" variant="destructive" onClick={() => { cancelRef.current = true; abortRef.current?.abort(); }} data-testid="btn-batch-cancel">
                  <Square className="w-3.5 h-3.5 mr-1" /> Cancel
                </Button>
              ) : (
                <Button size="sm" onClick={startBatch} disabled={!files.length || !selectedEngines.length} data-testid="btn-batch-run">
                  <Play className="w-3.5 h-3.5 mr-1" /> Run batch
                </Button>
              )}
            </div>
          </div>
          {running && currentLabel && (
            <p className="text-xs text-muted-foreground" data-testid="text-batch-progress">Running — {currentLabel} (Cancel stops in-browser engine runs immediately)</p>
          )}
          {partialNotice && (
            <p className="text-xs px-2 py-1.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400" data-testid="text-batch-partial">{partialNotice}</p>
          )}

          {/* Comparison results */}
          {comparison && (
            <div className="space-y-2">
              {showVerdicts && (
                <div className="flex flex-wrap gap-3 text-xs" data-testid="text-batch-summary">
                  <span className="px-2 py-0.5 rounded bg-green-500/15 text-green-600 dark:text-green-400">{comparison.matchCount} match</span>
                  <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">{comparison.differCount} differ</span>
                  <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-600 dark:text-red-400">{comparison.statusMismatchCount} status mismatch</span>
                  <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground">{comparison.inconclusiveCount} inconclusive</span>
                </div>
              )}
              <div className="border rounded-md divide-y">
                {comparison.files.map(fc => (
                  <div key={fc.fileName}>
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 text-left"
                      onClick={() => toggleExpand(fc.fileName)}
                      data-testid={`row-batch-file-${fc.fileName}`}
                    >
                      {expanded.has(fc.fileName) ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
                      <span className="flex-1 truncate font-mono text-xs">{fc.fileName}</span>
                      {fc.statuses.map((s, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted font-mono" title={comparison.engines[i]?.label}>
                          {s}
                        </span>
                      ))}
                      {showVerdicts && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${VERDICT_STYLE[fc.verdict].cls}`}>{VERDICT_STYLE[fc.verdict].label}</span>
                      )}
                    </button>
                    {expanded.has(fc.fileName) && (
                      <div className="px-3 pb-3 overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-muted-foreground">
                              <th className="text-left font-medium py-1">Metric</th>
                              {comparison.engines.map((e, i) => (
                                <th key={e.engine} className="text-right font-medium py-1">
                                  {e.label}{fc.results[i]?.engineVersion ? ` (${fc.results[i]!.engineVersion})` : ''}
                                </th>
                              ))}
                              <th className="text-right font-medium py-1">Δ max</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fc.metrics.map(m => (
                              <tr key={m.key} className={m.differs ? 'bg-amber-500/10' : ''}>
                                <td className="py-0.5">{m.label}</td>
                                {m.values.map((v, i) => <td key={i} className="text-right py-0.5 font-mono">{fmt(v)}</td>)}
                                <td className="text-right py-0.5 font-mono">{m.differs ? fmt(m.maxDelta) : ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="flex gap-2 mt-2">
                          {fc.results.map((r, i) => r?.hasReport ? (
                            <Button key={i} size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => downloadRpt(r, comparison.engines[i].label)}>
                              Download {comparison.engines[i].label} .rpt
                            </Button>
                          ) : null)}
                        </div>
                        {fc.results.some(r => r?.error) && (
                          <div className="mt-2 space-y-1">
                            {fc.results.map((r, i) => r?.error ? (
                              <p key={i} className="text-[11px] text-red-500 font-mono">{comparison.engines[i].label}: {r.error}</p>
                            ) : null)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {showVerdicts && (
                <EngineScatterCompare
                  comparison={comparison}
                  getReport={key => reportCacheRef.current.get(key)}
                />
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
