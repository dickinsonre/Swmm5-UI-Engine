import { useMemo } from 'react';
import type { SwmmProject, SimulationResults } from '@/lib/swmm-types';
import type { ModelHealthReport } from '@/lib/model-health';
import { listSnapshots, clearSnapshots, formatSnapshotTime, formatSnapshotSize, type AutosaveSnapshot } from '@/lib/autosave';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertTriangle, FileWarning, FlaskConical, Pencil, Trash2, RotateCcw, X } from 'lucide-react';

export type IntegrityState = 'complete' | 'modified' | 'warnings' | 'errors' | 'unsupported' | 'mock';

export interface IntegrityInfo {
  state: IntegrityState;
  label: string;
  color: string;
  bg: string;
  health: ModelHealthReport | null;
  unsupportedSections: string[];
  isModified: boolean;
  isMockResults: boolean;
  engineUsed: string | null;
}

export function computeIntegrityInfo(
  project: SwmmProject,
  results: SimulationResults | null,
  health: ModelHealthReport | null,
  isModified: boolean,
): IntegrityInfo {
  const unsupportedSections = Object.keys(project.rawSections || {}).filter(
    k => (project.rawSections[k] || []).length > 0
  );
  const isMockResults = results?.engineUsed === 'mock';
  const errorCount = health?.errorCount ?? 0;
  const warningCount = health?.warningCount ?? 0;

  let state: IntegrityState;
  let label: string;
  let color: string;
  let bg: string;

  if (errorCount > 0) {
    state = 'errors';
    label = `${errorCount} Error${errorCount > 1 ? 's' : ''}`;
    color = '#ffb3b3';
    bg = 'rgba(220,60,60,0.25)';
  } else if (isMockResults) {
    state = 'mock';
    label = 'Mock Results';
    color = '#d8d8e0';
    bg = 'rgba(140,140,160,0.3)';
  } else if (warningCount > 0) {
    state = 'warnings';
    label = `${warningCount} Warning${warningCount > 1 ? 's' : ''}`;
    color = '#ffd9a8';
    bg = 'rgba(232,138,26,0.22)';
  } else if (unsupportedSections.length > 0) {
    state = 'unsupported';
    label = 'Unsupported Data';
    color = '#d8c4f0';
    bg = 'rgba(150,100,220,0.25)';
  } else if (isModified) {
    state = 'modified';
    label = 'Modified';
    color = '#a8ccf0';
    bg = 'rgba(44,110,181,0.3)';
  } else {
    state = 'complete';
    label = 'Complete';
    color = '#a8e8c0';
    bg = 'rgba(42,138,74,0.28)';
  }

  return { state, label, color, bg, health, unsupportedSections, isModified, isMockResults, engineUsed: results?.engineUsed || null };
}

function StateIcon({ state, className }: { state: IntegrityState; className?: string }) {
  switch (state) {
    case 'errors': return <AlertTriangle className={className} />;
    case 'warnings': return <AlertTriangle className={className} />;
    case 'unsupported': return <FileWarning className={className} />;
    case 'mock': return <FlaskConical className={className} />;
    case 'modified': return <Pencil className={className} />;
    default: return <CheckCircle2 className={className} />;
  }
}

export function IntegrityChip({ info, onClick }: { info: IntegrityInfo; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors shrink-0"
      style={{ backgroundColor: info.bg, color: info.color }}
      title={`Model status: ${info.label}. Click for integrity report.`}
      data-testid="chip-integrity-status"
    >
      <StateIcon state={info.state} className="w-3 h-3" />
      <span className="mobile-hidden">{info.label}</span>
      {info.isModified && info.state !== 'modified' && (
        <span className="w-1.5 h-1.5 rounded-full bg-[#8ab4e8]" title="Unsaved changes" />
      )}
    </button>
  );
}

const SEV_COLORS: Record<string, string> = { error: '#c0392b', warning: '#e88a1a', info: '#2c6eb5' };

export function IntegrityReportDialog({
  open, onClose, info, fileName, autosaveError, onRestoreSnapshot, onClearSnapshots, snapshotRefresh,
}: {
  open: boolean;
  onClose: () => void;
  info: IntegrityInfo;
  fileName: string;
  autosaveError: string | null;
  onRestoreSnapshot: (snap: AutosaveSnapshot) => void;
  onClearSnapshots: () => void;
  snapshotRefresh: number;
}) {
  const snapshots = useMemo(() => (open ? listSnapshots().slice().reverse() : []), [open, snapshotRefresh]);
  const health = info.health;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <StateIcon state={info.state} className="w-4 h-4" />
            Model Integrity — {fileName}
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Current status: <span className="font-semibold">{info.label}</span>
            {info.isModified && ' · unsaved changes since load'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-[12px]">
          <div className="grid grid-cols-2 gap-2">
            <div className="border rounded p-2" style={{ borderColor: '#d0d0d8' }} data-testid="text-integrity-modified">
              <div className="text-[10px] font-semibold text-[#6b6b7b] uppercase">Modification State</div>
              <div>{info.isModified ? 'Modified since load — unsaved changes exist' : 'Unchanged since load'}</div>
            </div>
            <div className="border rounded p-2" style={{ borderColor: '#d0d0d8' }} data-testid="text-integrity-provenance">
              <div className="text-[10px] font-semibold text-[#6b6b7b] uppercase">Result Provenance</div>
              <div>
                {info.engineUsed
                  ? info.isMockResults
                    ? 'Mock engine — synthetic results, not for engineering use'
                    : `Computed by ${info.engineUsed} engine`
                  : 'No simulation results'}
              </div>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-bold text-[#2c3e6b] mb-1">Unsupported / Preserved Sections</div>
            {info.unsupportedSections.length === 0 ? (
              <div className="text-[#6b6b7b]">All sections in this model are fully supported by the editor.</div>
            ) : (
              <div className="border rounded p-2" style={{ borderColor: '#d0d0d8' }}>
                <div className="mb-1 text-[#6b6b7b]">
                  These INP sections are preserved verbatim but not editable in the UI:
                </div>
                <div className="flex flex-wrap gap-1">
                  {info.unsupportedSections.map(s => (
                    <span key={s} className="px-1.5 py-0.5 rounded bg-[#f0e8fa] text-[#6a4a9a] text-[10px] font-mono" data-testid={`badge-raw-section-${s}`}>
                      [{s}]
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="text-[11px] font-bold text-[#2c3e6b] mb-1">
              Warnings & Errors {health ? `(${health.errorCount} errors, ${health.warningCount} warnings)` : ''}
            </div>
            {!health || (health.errorCount === 0 && health.warningCount === 0) ? (
              <div className="text-[#6b6b7b]">No integrity issues detected.</div>
            ) : (
              <div className="border rounded max-h-52 overflow-y-auto" style={{ borderColor: '#d0d0d8' }}>
                {health.sections.map(sec =>
                  sec.findings.filter(f => f.severity !== 'info').map((f, i) => (
                    <div key={`${sec.key}-${i}`} className="flex items-start gap-2 px-2 py-1 border-b last:border-b-0" style={{ borderColor: '#eee' }} data-testid={`row-finding-${sec.key}-${i}`}>
                      <span className="mt-0.5 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: SEV_COLORS[f.severity] }} />
                      <span className="flex-1">
                        {f.objectId && <span className="font-mono font-semibold mr-1">{f.objectId}</span>}
                        {f.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] font-bold text-[#2c3e6b]">Autosave Snapshots</div>
              {snapshots.length > 0 && (
                <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={onClearSnapshots} data-testid="button-clear-snapshots">
                  <Trash2 className="w-3 h-3 mr-1" /> Clear All
                </Button>
              )}
            </div>
            {autosaveError && (
              <div className="mb-1 px-2 py-1 rounded bg-[#fdecea] text-[#c0392b] text-[11px]" data-testid="text-autosave-error">{autosaveError}</div>
            )}
            {snapshots.length === 0 ? (
              <div className="text-[#6b6b7b]">No snapshots saved yet. The model is autosaved to browser storage shortly after each edit.</div>
            ) : (
              <div className="border rounded" style={{ borderColor: '#d0d0d8' }}>
                {snapshots.map(snap => (
                  <div key={snap.timestamp} className="flex items-center gap-2 px-2 py-1 border-b last:border-b-0" style={{ borderColor: '#eee' }} data-testid={`row-snapshot-${snap.timestamp}`}>
                    <span className="flex-1 truncate">
                      <span className="font-semibold">{snap.fileName}</span>
                      <span className="text-[#6b6b7b] ml-2">{formatSnapshotTime(snap.timestamp)} · {formatSnapshotSize(snap.inp)}</span>
                    </span>
                    <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => onRestoreSnapshot(snap)} data-testid={`button-restore-snapshot-${snap.timestamp}`}>
                      <RotateCcw className="w-3 h-3 mr-1" /> Restore
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RecoveryDialog({
  open, snapshot, onRecover, onDismiss, onDiscard,
}: {
  open: boolean;
  snapshot: AutosaveSnapshot | null;
  onRecover: () => void;
  onDismiss: () => void;
  onDiscard: () => void;
}) {
  if (!snapshot) return null;
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onDismiss(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Recover Autosaved Model?</DialogTitle>
          <DialogDescription className="text-[12px]">
            An autosaved snapshot from a previous session was found in browser storage.
          </DialogDescription>
        </DialogHeader>
        <div className="text-[12px] border rounded p-2" style={{ borderColor: '#d0d0d8' }} data-testid="text-recovery-info">
          <div className="font-semibold">{snapshot.fileName}</div>
          <div className="text-[#6b6b7b]">Saved {formatSnapshotTime(snapshot.timestamp)} · {formatSnapshotSize(snapshot.inp)}</div>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" size="sm" className="text-[11px]" onClick={onDiscard} data-testid="button-discard-recovery">
            <Trash2 className="w-3 h-3 mr-1" /> Discard
          </Button>
          <Button variant="outline" size="sm" className="text-[11px]" onClick={onDismiss} data-testid="button-dismiss-recovery">
            <X className="w-3 h-3 mr-1" /> Not Now
          </Button>
          <Button size="sm" className="bg-[#2c6eb5] hover:bg-[#245a96] text-white text-[11px]" onClick={onRecover} data-testid="button-recover-snapshot">
            <RotateCcw className="w-3 h-3 mr-1" /> Recover
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
