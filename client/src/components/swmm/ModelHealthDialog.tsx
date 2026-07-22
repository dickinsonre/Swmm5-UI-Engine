import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronDown, ChevronRight, TriangleAlert, AlertTriangle, CheckCircle, HeartPulse, Lock } from 'lucide-react';
import type { SwmmProject, SimulationResults } from '@/lib/swmm-types';
import { buildModelHealthReport, type HealthFinding, type HealthSection, type HealthSeverity } from '@/lib/model-health';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: SwmmProject;
  results: SimulationResults | null;
  onSelectObject?: (objType: string, id: string) => void;
}

function SeverityIcon({ s }: { s: HealthSeverity }) {
  if (s === 'error') return <TriangleAlert className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />;
  if (s === 'warning') return <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0 mt-0.5" />;
  return <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />;
}

function sectionCounts(sec: HealthSection) {
  let e = 0, w = 0;
  for (const f of sec.findings) {
    if (f.severity === 'error') e++;
    else if (f.severity === 'warning') w++;
  }
  return { e, w };
}

function findingKind(f: HealthFinding): string {
  return f.message
    .replace(/"[^"]*"/g, '"…"')
    .replace(/-?\d+(\.\d+)?/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

interface FindingGroup {
  kind: string;
  label: string;
  severity: HealthSeverity;
  findings: HealthFinding[];
}

const SEV_ORDER: Record<HealthSeverity, number> = { error: 0, warning: 1, info: 2 };

function groupFindings(findings: HealthFinding[]): FindingGroup[] {
  const map = new Map<string, FindingGroup>();
  for (const f of findings) {
    const kind = `${f.severity}|${findingKind(f)}`;
    let g = map.get(kind);
    if (!g) {
      g = { kind, label: findingKind(f), severity: f.severity, findings: [] };
      map.set(kind, g);
    }
    g.findings.push(f);
  }
  return Array.from(map.values()).sort((a, b) =>
    SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.findings.length - a.findings.length
  );
}

export default function ModelHealthDialog({ open, onOpenChange, project, results, onSelectObject }: Props) {
  const report = useMemo(() => (open ? buildModelHealthReport(project, results) : null), [open, project, results]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  const toggle = (key: string) => {
    setCollapsed(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  const handleClick = (f: HealthFinding) => {
    if (f.objectId && f.objectType && onSelectObject) {
      onSelectObject(f.objectType, f.objectId);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0" data-testid="dialog-model-health">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-[#2a2a3e] text-sm">
            <HeartPulse className="w-4 h-4 text-[#2c6eb5]" />
            Model Health Dashboard
          </DialogTitle>
          <DialogDescription className="text-[11px] text-[#6b6b7b]">
            Pre-run checks on model inputs and hydraulic setup, plus post-run numerical and result diagnostics. Click a finding to locate it on the map.
          </DialogDescription>
        </DialogHeader>

        {report && (
          <div className="px-4 pb-2 flex items-center gap-2 shrink-0" data-testid="health-summary">
            <span className="text-[10px] font-semibold text-[#4a4a5a]">Overall:</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold" data-testid="health-error-count">{report.errorCount} errors</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 font-bold" data-testid="health-warning-count">{report.warningCount} warnings</span>
            {!report.hasResults && (
              <span className="text-[10px] text-[#6b6b7b] ml-auto flex items-center gap-1">
                <Lock className="w-3 h-3" /> Post-run sections unlock after a simulation
              </span>
            )}
          </div>
        )}

        <ScrollArea className="flex-1 min-h-0 border-t border-[#e0e0e8]">
          <div className="p-3 space-y-2">
            {report?.sections.map(sec => {
              const { e, w } = sectionCounts(sec);
              const locked = sec.requiresResults && !report.hasResults;
              const isCollapsed = collapsed.has(sec.key);
              return (
                <div key={sec.key} className="border border-[#d0d0d8] rounded overflow-hidden" data-testid={`health-section-${sec.key}`}>
                  <div
                    className="flex items-center gap-2 px-2.5 py-1.5 bg-[#f0f0f4] cursor-pointer hover:bg-[#e8e8ee] transition-colors"
                    onClick={() => toggle(sec.key)}
                    data-testid={`health-section-header-${sec.key}`}
                  >
                    {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-[#6b6b7b]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#6b6b7b]" />}
                    <span className="text-[11px] font-bold text-[#2a2a3e] flex-1">{sec.title}</span>
                    {sec.requiresResults && <span className="text-[9px] text-[#6b6b7b] uppercase tracking-wide">post-run</span>}
                    {!locked && e > 0 && <span className="text-[9px] bg-red-100 text-red-600 rounded px-1.5 font-bold">{e}E</span>}
                    {!locked && w > 0 && <span className="text-[9px] bg-yellow-100 text-yellow-700 rounded px-1.5 font-bold">{w}W</span>}
                    {!locked && e === 0 && w === 0 && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
                    {locked && <Lock className="w-3.5 h-3.5 text-[#a0a0ac]" />}
                  </div>
                  {!isCollapsed && (
                    <div className="bg-white">
                      {locked ? (
                        <div className="px-3 py-2 text-[10px] text-[#8a8a96] italic" data-testid={`health-locked-${sec.key}`}>
                          Run a simulation to evaluate this section.
                        </div>
                      ) : sec.findings.length === 0 ? (
                        <div className="px-3 py-2 text-[10px] text-[#8a8a96] italic">No findings.</div>
                      ) : (
                        groupFindings(sec.findings).map((g, gi) => {
                          if (g.findings.length === 1) {
                            const f = g.findings[0];
                            const clickable = !!(f.objectId && f.objectType);
                            return (
                              <div
                                key={f.id}
                                className={`flex items-start gap-2 px-3 py-1.5 border-t border-[#f0f0f4] ${clickable ? 'cursor-pointer hover:bg-[#f0f6ff]' : ''}`}
                                onClick={() => handleClick(f)}
                                data-testid={`health-finding-${sec.key}-${f.id}`}
                              >
                                <SeverityIcon s={f.severity} />
                                <span className="text-[10.5px] text-[#3a3a4a] leading-snug flex-1">{f.message}</span>
                                {clickable && (
                                  <span className="text-[9px] text-[#2c6eb5] font-mono shrink-0 mt-0.5 underline decoration-dotted">{f.objectId}</span>
                                )}
                              </div>
                            );
                          }
                          const gKey = `${sec.key}|${g.kind}`;
                          const gOpen = expandedGroups.has(gKey);
                          return (
                            <div key={gKey} className="border-t border-[#f0f0f4]" data-testid={`health-group-${sec.key}-${g.severity}-${gi}`}>
                              <div
                                className="flex items-start gap-2 px-3 py-1.5 cursor-pointer hover:bg-[#f5f5f8]"
                                onClick={() => toggleGroup(gKey)}
                              >
                                {gOpen ? <ChevronDown className="w-3 h-3 text-[#6b6b7b] shrink-0 mt-0.5" /> : <ChevronRight className="w-3 h-3 text-[#6b6b7b] shrink-0 mt-0.5" />}
                                <SeverityIcon s={g.severity} />
                                <span className="text-[10.5px] font-semibold text-[#3a3a4a] leading-snug flex-1">{g.label}</span>
                                <span className={`text-[9px] rounded px-1.5 font-bold shrink-0 mt-0.5 ${g.severity === 'error' ? 'bg-red-100 text-red-600' : g.severity === 'warning' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                                  {g.findings.length}
                                </span>
                              </div>
                              {gOpen && g.findings.map(f => {
                                const clickable = !!(f.objectId && f.objectType);
                                return (
                                  <div
                                    key={f.id}
                                    className={`flex items-start gap-2 pl-9 pr-3 py-1 border-t border-[#f6f6f9] bg-[#fafafc] ${clickable ? 'cursor-pointer hover:bg-[#f0f6ff]' : ''}`}
                                    onClick={() => handleClick(f)}
                                    data-testid={`health-finding-${sec.key}-${f.id}`}
                                  >
                                    <span className="text-[10px] text-[#4a4a5a] leading-snug flex-1">{f.message}</span>
                                    {clickable && (
                                      <span className="text-[9px] text-[#2c6eb5] font-mono shrink-0 underline decoration-dotted">{f.objectId}</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
