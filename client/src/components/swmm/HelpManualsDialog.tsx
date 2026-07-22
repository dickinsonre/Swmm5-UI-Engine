import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BookOpen, ChevronDown, ChevronRight, FileText, ExternalLink } from 'lucide-react';

interface Manual {
  key: string;
  title: string;
  dir: string;
  hhc: string;
  home: string;
}

const MANUALS: Manual[] = [
  { key: 'userguide', title: 'User Guide', dir: 'userguide', hhc: 'epaswmm5.hhc', home: 'introduction.htm' },
  { key: 'basic', title: 'Basic Tutorial', dir: 'basic', hhc: 'tutorial.hhc', home: 'introduction.htm' },
  { key: 'inlets', title: 'Inlets Tutorial', dir: 'inlets', hhc: 'InletTutorial.hhc', home: 'inlet_analysis_with_swmm.htm' },
];

export interface TocNode {
  name: string;
  local?: string;
  children: TocNode[];
}

export function parseHhc(html: string): TocNode[] {
  // CHM .hhc files are loosely-structured HTML sitemaps:
  // <UL><LI><OBJECT>..params..</OBJECT> [<UL>children</UL>] ...
  const root: TocNode = { name: 'root', children: [] };
  const stack: TocNode[] = [root];
  let lastNode: TocNode | null = null;
  const tokens = html.split(/(<UL>|<\/UL>|<OBJECT[\s\S]*?<\/OBJECT>)/gi);
  for (const tok of tokens) {
    const t = tok.trim();
    if (!t) continue;
    if (/^<UL>$/i.test(t)) {
      if (lastNode) { stack.push(lastNode); }
    } else if (/^<\/UL>$/i.test(t)) {
      if (stack.length > 1) stack.pop();
    } else if (/^<OBJECT/i.test(t)) {
      if (!/type="?text\/sitemap"?/i.test(t)) continue;
      const nameM = t.match(/name="Name"\s+value="([^"]*)"/i);
      const localM = t.match(/name="Local"\s+value="([^"]*)"/i);
      if (!nameM) continue;
      const node: TocNode = { name: nameM[1], local: localM?.[1], children: [] };
      stack[stack.length - 1].children.push(node);
      lastNode = node;
    }
  }
  return root.children;
}

function TocTree({ nodes, depth, current, onOpen, expanded, toggle, path }: {
  nodes: TocNode[];
  depth: number;
  current: string | null;
  onOpen: (local: string) => void;
  expanded: Set<string>;
  toggle: (key: string) => void;
  path: string;
}) {
  return (
    <>
      {nodes.map((n, i) => {
        const key = `${path}/${i}`;
        const hasKids = n.children.length > 0;
        const isOpen = expanded.has(key);
        const active = !!n.local && n.local === current;
        return (
          <div key={key}>
            <div
              className={`flex items-start gap-1 py-[3px] pr-2 rounded cursor-pointer text-[10.5px] leading-snug transition-colors
                ${active ? 'bg-[#2c6eb5] text-white' : 'text-[#3a3a4a] hover:bg-[#eef2f8]'}`}
              style={{ paddingLeft: 4 + depth * 12 }}
              onClick={() => {
                if (n.local) onOpen(n.local);
                if (hasKids) toggle(key);
              }}
              data-testid={`help-toc-item-${key.replace(/\//g, '-')}`}
            >
              {hasKids ? (
                isOpen
                  ? <ChevronDown className={`w-3 h-3 shrink-0 mt-0.5 ${active ? 'text-white/80' : 'text-[#6b6b7b]'}`} />
                  : <ChevronRight className={`w-3 h-3 shrink-0 mt-0.5 ${active ? 'text-white/80' : 'text-[#6b6b7b]'}`} />
              ) : (
                <FileText className={`w-3 h-3 shrink-0 mt-0.5 ${active ? 'text-white/80' : 'text-[#9090a0]'}`} />
              )}
              <span className="flex-1">{n.name}</span>
            </div>
            {hasKids && isOpen && (
              <TocTree nodes={n.children} depth={depth + 1} current={current} onOpen={onOpen} expanded={expanded} toggle={toggle} path={key} />
            )}
          </div>
        );
      })}
    </>
  );
}

export default function HelpManualsDialog({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [manualKey, setManualKey] = useState('userguide');
  const manual = useMemo(() => MANUALS.find(m => m.key === manualKey)!, [manualKey]);
  const [tocs, setTocs] = useState<Record<string, TocNode[]>>({});
  const [tocError, setTocError] = useState<string | null>(null);
  const [page, setPage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    if (tocs[manual.key]) return;
    setTocError(null);
    fetch(`/help/${manual.dir}/${manual.hhc}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
      .then(text => {
        const nodes = parseHhc(text);
        setTocs(prev => ({ ...prev, [manual.key]: nodes }));
      })
      .catch(e => setTocError(`Could not load table of contents: ${e.message}`));
  }, [open, manual, tocs]);

  useEffect(() => {
    if (open) {
      setPage(manual.home);
      setExpanded(new Set(['/0']));
    }
  }, [open, manualKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  const openPage = (local: string) => {
    // Only allow simple relative .htm/.html paths from the parsed TOC
    if (/^[\w][\w .%()-]*\.html?$/i.test(local) && !local.includes('..')) {
      setPage(local);
    }
  };

  const toc = tocs[manual.key];
  const pageUrl = page ? `/help/${manual.dir}/${page}` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[92vw] h-[85vh] flex flex-col p-0 gap-0" data-testid="dialog-help-manuals">
        <DialogHeader className="px-4 pt-3 pb-2 shrink-0 border-b border-[#e0e0e8]">
          <DialogTitle className="flex items-center gap-2 text-[#2a2a3e] text-sm">
            <BookOpen className="w-4 h-4 text-[#2c6eb5]" />
            SWMM 5 Manuals
          </DialogTitle>
          <DialogDescription className="text-[11px] text-[#6b6b7b]">
            Official EPA SWMM 5 documentation: User Guide, Basic Tutorial, and Inlets Tutorial.
          </DialogDescription>
          <div className="flex items-center gap-1 pt-1">
            {MANUALS.map(m => (
              <button
                key={m.key}
                onClick={() => setManualKey(m.key)}
                className={`text-[10px] px-2.5 py-1 rounded border transition-colors
                  ${m.key === manualKey
                    ? 'bg-[#2c6eb5] border-[#2c6eb5] text-white font-semibold'
                    : 'bg-white border-[#d0d0d8] text-[#4a4a5a] hover:bg-[#f0f0f4]'}`}
                data-testid={`btn-manual-${m.key}`}
              >
                {m.title}
              </button>
            ))}
            {pageUrl && (
              <a
                href={pageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1 text-[10px] text-[#2c6eb5] hover:underline"
                data-testid="link-help-open-tab"
              >
                <ExternalLink className="w-3 h-3" /> Open in new tab
              </a>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex">
          <div className="w-[260px] shrink-0 border-r border-[#e0e0e8] bg-[#f8f8fa] flex flex-col">
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-2">
                {tocError ? (
                  <div className="text-[10px] text-red-600 p-2">{tocError}</div>
                ) : !toc ? (
                  <div className="text-[10px] text-[#8a8a96] italic p-2">Loading contents…</div>
                ) : (
                  <TocTree nodes={toc} depth={0} current={page} onOpen={openPage} expanded={expanded} toggle={toggle} path="" />
                )}
              </div>
            </ScrollArea>
          </div>
          <div className="flex-1 min-w-0 bg-white">
            {pageUrl ? (
              <iframe
                key={pageUrl}
                src={pageUrl}
                sandbox=""
                title={`${manual.title} page`}
                className="w-full h-full border-0"
                data-testid="iframe-help-page"
              />
            ) : (
              <div className="h-full flex items-center justify-center text-[11px] text-[#8a8a96]">
                Select a topic from the contents
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
