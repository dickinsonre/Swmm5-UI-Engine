import { useState, useMemo, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { GitCompareArrows, FolderOpen, FileText, X, RefreshCw } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Returns the current project serialized as INP text, and its file name. */
  getCurrentInp: () => { name: string; text: string };
}

interface LoadedFile {
  name: string;
  text: string;
}

type DiffOp = { type: 'same' | 'add' | 'del'; a?: number; b?: number; text: string };

const MAX_LINES = 200000;

/** Line diff: trims common prefix/suffix, then LCS on the middle (with a size cap). */
function diffLines(aText: string, bText: string): { ops: DiffOp[]; fallbackUsed: boolean } {
  let fallbackUsed = false;
  const a = aText.split(/\r?\n/);
  const b = bText.split(/\r?\n/);
  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    throw new Error(`File too large to diff (limit ${MAX_LINES.toLocaleString()} lines)`);
  }
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }

  const ops: DiffOp[] = [];
  for (let i = 0; i < start; i++) ops.push({ type: 'same', a: i + 1, b: i + 1, text: a[i] });

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length, m = midB.length;

  if (n * m > 4_000_000) {
    // Too big for LCS DP table — fall back to plain replace block.
    fallbackUsed = true;
    for (let i = 0; i < n; i++) ops.push({ type: 'del', a: start + i + 1, text: midA[i] });
    for (let j = 0; j < m; j++) ops.push({ type: 'add', b: start + j + 1, text: midB[j] });
  } else if (n === 0) {
    for (let j = 0; j < m; j++) ops.push({ type: 'add', b: start + j + 1, text: midB[j] });
  } else if (m === 0) {
    for (let i = 0; i < n; i++) ops.push({ type: 'del', a: start + i + 1, text: midA[i] });
  } else {
    // LCS via DP with Int32Array rows.
    const prev = new Int32Array(m + 1);
    const table: Int32Array[] = [];
    for (let i = 1; i <= n; i++) {
      const rowPrev = i === 1 ? prev : table[i - 2];
      const cur = new Int32Array(m + 1);
      for (let j = 1; j <= m; j++) {
        cur[j] = midA[i - 1] === midB[j - 1] ? rowPrev[j - 1] + 1 : Math.max(rowPrev[j], cur[j - 1]);
      }
      table.push(cur);
    }
    // Backtrack
    const rev: DiffOp[] = [];
    let i = n, j = m;
    const rowAt = (k: number) => (k === 0 ? prev : table[k - 1]);
    while (i > 0 && j > 0) {
      if (midA[i - 1] === midB[j - 1]) {
        rev.push({ type: 'same', a: start + i, b: start + j, text: midA[i - 1] });
        i--; j--;
      } else if (rowAt(i - 1)[j] >= rowAt(i)[j - 1]) {
        rev.push({ type: 'del', a: start + i, text: midA[i - 1] });
        i--;
      } else {
        rev.push({ type: 'add', b: start + j, text: midB[j - 1] });
        j--;
      }
    }
    while (i > 0) { rev.push({ type: 'del', a: start + i, text: midA[i - 1] }); i--; }
    while (j > 0) { rev.push({ type: 'add', b: start + j, text: midB[j - 1] }); j--; }
    for (let k = rev.length - 1; k >= 0; k--) ops.push(rev[k]);
  }

  for (let i = endA; i < a.length; i++) {
    ops.push({ type: 'same', a: i + 1, b: i + 1 - endA + endB, text: a[i] });
  }
  return { ops, fallbackUsed };
}

/** Group ops into display rows, collapsing long unchanged runs when changesOnly. */
function buildRows(ops: DiffOp[], changesOnly: boolean, context = 3): (DiffOp | { type: 'skip'; count: number })[] {
  if (!changesOnly) return ops;
  const keep = new Array(ops.length).fill(false);
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].type !== 'same') {
      for (let k = Math.max(0, i - context); k <= Math.min(ops.length - 1, i + context); k++) keep[k] = true;
    }
  }
  const rows: (DiffOp | { type: 'skip'; count: number })[] = [];
  let skip = 0;
  for (let i = 0; i < ops.length; i++) {
    if (keep[i]) {
      if (skip > 0) { rows.push({ type: 'skip', count: skip }); skip = 0; }
      rows.push(ops[i]);
    } else skip++;
  }
  if (skip > 0) rows.push({ type: 'skip', count: skip });
  return rows;
}

/** Per-section change counts for INP-style files ([SECTION] headers). */
function sectionSummary(ops: DiffOp[]): { section: string; adds: number; dels: number }[] {
  const map = new Map<string, { adds: number; dels: number }>();
  let section = '(header)';
  for (const op of ops) {
    const m = op.text.match(/^\s*\[([^\]]+)\]/);
    if (m) section = m[1].toUpperCase();
    if (op.type === 'same') continue;
    const e = map.get(section) || { adds: 0, dels: 0 };
    if (op.type === 'add') e.adds++; else e.dels++;
    map.set(section, e);
  }
  return Array.from(map.entries()).map(([s, v]) => ({ section: s, ...v }));
}

function FileSlot({ label, file, onLoad, onClear, extraAction, testId }: {
  label: string;
  file: LoadedFile | null;
  onLoad: (f: LoadedFile) => void;
  onClear: () => void;
  extraAction?: { label: string; onClick: () => void };
  testId: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => onLoad({ name: f.name, text: String(rd.result || '') });
    rd.readAsText(f);
    e.target.value = '';
  }, [onLoad]);
  return (
    <div className="flex-1 min-w-0 border border-[#d0d0d8] rounded-lg p-2 bg-[#fafafc]">
      <div className="text-[10px] font-semibold text-[#6b6b7b] uppercase mb-1">{label}</div>
      <input ref={inputRef} type="file" accept=".inp,.rpt,.txt,.out.rpt" className="hidden" onChange={pick} data-testid={`${testId}-input`} />
      {file ? (
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-[#2c6eb5] shrink-0" />
          <span className="text-[12px] text-[#2a2a3e] truncate" title={file.name}>{file.name}</span>
          <span className="text-[10px] text-[#6b6b7b] shrink-0">{file.text.split(/\r?\n/).length.toLocaleString()} lines</span>
          <button onClick={onClear} className="ml-auto text-[#6b6b7b] hover:text-[#c0392b] shrink-0" title="Clear" data-testid={`${testId}-clear`}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => inputRef.current?.click()} data-testid={`${testId}-browse`}>
            <FolderOpen className="w-3.5 h-3.5 mr-1" /> Choose file…
          </Button>
          {extraAction && (
            <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={extraAction.onClick} data-testid={`${testId}-current`}>
              {extraAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function DiffToolDialog({ open, onOpenChange, getCurrentInp }: Props) {
  const [fileA, setFileA] = useState<LoadedFile | null>(null);
  const [fileB, setFileB] = useState<LoadedFile | null>(null);
  const [changesOnly, setChangesOnly] = useState(true);

  const result = useMemo(() => {
    if (!fileA || !fileB) return null;
    try {
      const { ops, fallbackUsed } = diffLines(fileA.text, fileB.text);
      const adds = ops.filter(o => o.type === 'add').length;
      const dels = ops.filter(o => o.type === 'del').length;
      const isInp = /\.inp$/i.test(fileA.name) || /\.inp$/i.test(fileB.name) || /^\s*\[/m.test(fileA.text.slice(0, 2000));
      return { ops, adds, dels, fallbackUsed, sections: isInp ? sectionSummary(ops) : null, error: null as string | null };
    } catch (e: any) {
      return { ops: [] as DiffOp[], adds: 0, dels: 0, fallbackUsed: false, sections: null, error: e.message as string };
    }
  }, [fileA, fileB]);

  const rows = useMemo(() => (result && !result.error ? buildRows(result.ops, changesOnly) : []), [result, changesOnly]);

  const useCurrent = useCallback((setter: (f: LoadedFile) => void) => {
    const { name, text } = getCurrentInp();
    setter({ name: `${name} (current project)`, text });
  }, [getCurrentInp]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[85vh] flex flex-col p-4" data-testid="dialog-diff-tool">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-[14px]">
            <GitCompareArrows className="w-4 h-4 text-[#2c6eb5]" /> File Compare (Diff)
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            Compare two INP or RPT files line by line. Removed lines come from File A, added lines from File B.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 shrink-0 mt-1">
          <FileSlot
            label="File A (old)" file={fileA} onLoad={setFileA} onClear={() => setFileA(null)}
            extraAction={{ label: 'Use current project', onClick: () => useCurrent(setFileA) }}
            testId="diff-file-a"
          />
          <FileSlot
            label="File B (new)" file={fileB} onLoad={setFileB} onClear={() => setFileB(null)}
            extraAction={{ label: 'Use current project', onClick: () => useCurrent(setFileB) }}
            testId="diff-file-b"
          />
        </div>

        {result && !result.error && (
          <div className="flex items-center gap-3 shrink-0 mt-2 text-[11px]">
            <span className="font-semibold text-[#2a2a3e]" data-testid="diff-summary">
              {result.adds + result.dels === 0
                ? 'Files are identical'
                : <><span className="text-[#1e7e34]">+{result.adds} added</span>{' / '}<span className="text-[#c0392b]">−{result.dels} removed</span></>}
            </span>
            {result.fallbackUsed && (
              <span className="text-[10px] text-[#b26a00]" data-testid="diff-fallback-note">
                Files differ too much for line matching — showing changed region as a full replace block.
              </span>
            )}
            <label className="flex items-center gap-1 cursor-pointer text-[#3a5070] ml-auto">
              <input type="checkbox" checked={changesOnly} onChange={e => setChangesOnly(e.target.checked)} data-testid="diff-changes-only" />
              Changes only
            </label>
          </div>
        )}

        {result?.error && (
          <div className="text-[12px] text-[#c0392b] mt-2 shrink-0" data-testid="diff-error">{result.error}</div>
        )}

        {result && !result.error && result.sections && result.sections.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 shrink-0 max-h-[64px] overflow-y-auto">
            {result.sections.map(s => (
              <span key={s.section} className="text-[10px] px-1.5 py-0.5 rounded bg-[#e8f0fb] text-[#2c3e6b] border border-[#d0d0d8]">
                [{s.section}] <span className="text-[#1e7e34]">+{s.adds}</span> <span className="text-[#c0392b]">−{s.dels}</span>
              </span>
            ))}
          </div>
        )}

        <div className="flex-1 min-h-0 mt-2 border border-[#d0d0d8] rounded-lg overflow-auto bg-white font-mono text-[11px] leading-[1.5]" data-testid="diff-output">
          {!fileA || !fileB ? (
            <div className="h-full flex items-center justify-center text-[#6b6b7b] text-[12px] font-sans">
              Load two files above to compare them.
            </div>
          ) : result?.error ? null : (
            <table className="w-full border-collapse">
              <tbody>
                {rows.map((r, i) =>
                  r.type === 'skip' ? (
                    <tr key={i}>
                      <td colSpan={3} className="px-3 py-0.5 text-center text-[#8a8a96] bg-[#f5f6fa] border-y border-[#e8e8f0] select-none">
                        ⋯ {r.count.toLocaleString()} unchanged line{r.count === 1 ? '' : 's'} ⋯
                      </td>
                    </tr>
                  ) : (
                    <tr key={i} className={r.type === 'add' ? 'bg-[#e6f4ea]' : r.type === 'del' ? 'bg-[#fdecea]' : ''}>
                      <td className="w-12 px-1 text-right text-[#a0a0ac] select-none align-top">{(r as DiffOp).a ?? ''}</td>
                      <td className="w-12 px-1 text-right text-[#a0a0ac] select-none align-top border-r border-[#e8e8f0]">{(r as DiffOp).b ?? ''}</td>
                      <td className="px-2 whitespace-pre align-top">
                        <span className={r.type === 'add' ? 'text-[#1e7e34]' : r.type === 'del' ? 'text-[#c0392b]' : 'text-[#2a2a3e]'}>
                          {r.type === 'add' ? '+ ' : r.type === 'del' ? '− ' : '  '}{(r as DiffOp).text || '\u00a0'}
                        </span>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
