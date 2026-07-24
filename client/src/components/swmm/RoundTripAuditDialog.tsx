import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle, AlertTriangle, TriangleAlert, MinusCircle, PlusCircle, FileWarning, ShieldCheck, ChevronDown, ChevronRight } from 'lucide-react';
import type { SwmmProject } from '@/lib/swmm-types';
import { runRoundTripAudit, fmtVal, type RoundTripDiff } from '@/lib/roundtrip-audit';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: SwmmProject;
}

const KIND_META: Record<RoundTripDiff['kind'], { label: string; color: string; icon: JSX.Element }> = {
  altered: { label: 'Altered', color: 'text-yellow-600', icon: <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0 mt-0.5" /> },
  omitted: { label: 'Omitted', color: 'text-red-600', icon: <MinusCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" /> },
  added: { label: 'Added', color: 'text-blue-600', icon: <PlusCircle className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" /> },
};

function Section({ title, count, countColor, defaultOpen, children, testId }: {
  title: string; count: number; countColor: string; defaultOpen?: boolean; children: React.ReactNode; testId: string;
}) {
  const [expanded, setExpanded] = useState(!!defaultOpen);
  return (
    <div className="border border-[#d0d0d8] rounded bg-white">
      <button
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold text-[#2a2a3e] hover:bg-[#f0f0f4]"
        onClick={() => setExpanded(e => !e)}
        data-testid={testId}
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        {title}
        <span className={`ml-auto text-[10px] font-bold ${countColor}`}>{count}</span>
      </button>
      {expanded && <div className="px-2 pb-2">{children}</div>}
    </div>
  );
}

export default function RoundTripAuditDialog({ open, onOpenChange, project }: Props) {
  const report = useMemo(() => (open ? runRoundTripAudit(project) : null), [open, project]);

  const grouped = useMemo(() => {
    if (!report) return { altered: [] as RoundTripDiff[], omitted: [] as RoundTripDiff[], added: [] as RoundTripDiff[] };
    return {
      altered: report.diffs.filter(d => d.kind === 'altered'),
      omitted: report.diffs.filter(d => d.kind === 'omitted'),
      added: report.diffs.filter(d => d.kind === 'added'),
    };
  }, [report]);

  const clean = report && !report.error && report.diffs.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0" data-testid="dialog-roundtrip-audit">
        <DialogHeader className="px-4 pt-3 pb-2 border-b border-[#d0d0d8]">
          <DialogTitle className="text-[13px] text-[#2a2a3e] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#2c6eb5]" />
            Round-Trip Audit
          </DialogTitle>
          <DialogDescription className="text-[10px] text-[#6b6b7b]">
            Exports the current model to INP format, re-parses it, and compares every field. Shows what would survive a save.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 space-y-2">
            {report?.error && (
              <div className="flex items-start gap-2 p-2 border border-red-300 bg-red-50 rounded text-[11px] text-red-700" data-testid="text-audit-error">
                <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Audit failed</div>
                  <div className="font-mono text-[10px]">{report.error}</div>
                </div>
              </div>
            )}

            {clean && (
              <div className="flex items-center gap-2 p-2 border border-green-300 bg-green-50 rounded text-[11px] text-green-700" data-testid="text-audit-clean">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span className="font-semibold">All parsed model fields survive export and re-import unchanged.</span>
              </div>
            )}

            {report && !report.error && report.diffs.length > 0 && (
              <div className="flex items-center gap-2 p-2 border border-yellow-300 bg-yellow-50 rounded text-[11px] text-yellow-800" data-testid="text-audit-summary">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span><b>{report.diffs.length}</b> field difference(s) detected between the current model and its saved form.</span>
              </div>
            )}

            {report && !report.error && (
              <>
                {(['omitted', 'altered', 'added'] as const).map(kind => {
                  const diffs = grouped[kind];
                  if (!diffs.length) return null;
                  const meta = KIND_META[kind];
                  return (
                    <Section
                      key={kind}
                      title={`${meta.label} fields`}
                      count={diffs.length}
                      countColor={meta.color}
                      defaultOpen
                      testId={`section-${kind}`}
                    >
                      <div className="space-y-1">
                        {diffs.slice(0, 200).map((d, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-[10px] font-mono text-[#2a2a3e]" data-testid={`row-diff-${kind}-${i}`}>
                            {meta.icon}
                            <div className="min-w-0 break-all">
                              <span className="text-[#6b6b7b]">{d.path.replace(/^\$\./, '')}</span>
                              {kind === 'altered' && <span> {fmtVal(d.before)} → {fmtVal(d.after)}</span>}
                              {kind === 'omitted' && <span> was {fmtVal(d.before)}</span>}
                              {kind === 'added' && <span> now {fmtVal(d.after)}</span>}
                            </div>
                          </div>
                        ))}
                        {diffs.length > 200 && (
                          <div className="text-[10px] text-[#6b6b7b] italic">… and {diffs.length - 200} more</div>
                        )}
                      </div>
                    </Section>
                  );
                })}

                {report.unsupportedSections.length > 0 && (
                  <Section
                    title="Pass-through sections (preserved verbatim, not editable in UI)"
                    count={report.unsupportedSections.length}
                    countColor="text-[#6b6b7b]"
                    testId="section-unsupported"
                  >
                    <div className="flex flex-wrap gap-1">
                      {report.unsupportedSections.map(s => (
                        <span key={s} className="flex items-center gap-1 px-1.5 py-0.5 bg-[#f0f0f4] border border-[#d0d0d8] rounded text-[10px] font-mono text-[#2a2a3e]" data-testid={`chip-unsupported-${s}`}>
                          <FileWarning className="w-3 h-3 text-[#e88a1a]" />
                          [{s}]
                        </span>
                      ))}
                    </div>
                    <div className="text-[9px] text-[#6b6b7b] mt-1.5">
                      These sections are copied to the saved file exactly as loaded. Edits made elsewhere in the model do not update them.
                    </div>
                  </Section>
                )}

                <Section
                  title="Fully preserved sections"
                  count={report.preservedSections.length}
                  countColor="text-green-600"
                  testId="section-preserved"
                >
                  <div className="flex flex-wrap gap-1">
                    {report.preservedSections.map(s => (
                      <span key={s} className="flex items-center gap-1 px-1.5 py-0.5 bg-green-50 border border-green-200 rounded text-[10px] font-mono text-green-800" data-testid={`chip-preserved-${s}`}>
                        <CheckCircle className="w-3 h-3 text-green-500" />
                        [{s}]
                      </span>
                    ))}
                    {report.preservedSections.length === 0 && (
                      <span className="text-[10px] text-[#6b6b7b] italic">No populated sections found.</span>
                    )}
                  </div>
                </Section>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
