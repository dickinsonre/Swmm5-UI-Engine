import { useMemo, useRef, useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Equal } from 'lucide-react';
import { blockRows, diffReports, type DiffRow, type TokenSpan } from '@/lib/report-diff';

/**
 * Side-by-side reports with the differences actually marked.
 *
 * Two engine reports are near-identical documents, so the useful question is
 * never "what do they say" but "where do they disagree" — and that is exactly
 * what two independently scrolling panes of monospace text cannot answer. The
 * panes here are aligned line by line and share one scrollbar, differing
 * tokens are marked inside the line, and a counter says how many differences
 * exist so nobody has to conclude "looks the same" by scrolling.
 *
 * Timestamps and engine banners differ between any two runs. They are shown,
 * dimmed and labelled, and excluded from the count — counting them would make
 * every comparison report differences and mean nothing.
 */

const HL = {
  numeric: 'bg-[#ffe9b3] text-[#7a4b00]',
  time: 'bg-[#d9e7ff] text-[#1c3f80]',
  text: 'bg-[#ffd9d9] text-[#8a1c1c]',
  volatile: 'bg-transparent text-[#a0a0b0]',
  spacing: 'bg-transparent text-[#a0a0b0]',
} as const;

const ROW_BG = {
  numeric: 'bg-[#fffaf0]',
  time: 'bg-[#f4f8ff]',
  text: 'bg-[#fff5f5]',
  volatile: 'bg-transparent',
  spacing: 'bg-transparent',
} as const;

function highlightSearch(text: string, term: string, key: string) {
  if (!term) return text;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    i % 2 === 1
      ? <mark key={`${key}-${i}`} className="bg-yellow-200 text-[#2a2a3e]">{part}</mark>
      : <span key={`${key}-${i}`}>{part}</span>
  );
}

function Spans({ spans, cls, term, side }: { spans: TokenSpan[] | undefined; cls: string; term: string; side: string }) {
  if (!spans) return null;
  return (
    <>
      {spans.map((s, i) =>
        s.differs && s.text.trim() !== ''
          ? <span key={`${side}-${i}`} className={`${cls} rounded-[2px]`}>{s.text}</span>
          : <span key={`${side}-${i}`}>{highlightSearch(s.text, term, `${side}-${i}`)}</span>
      )}
    </>
  );
}

/** One side of a differing row. A missing side is shown as an absence, not a blank. */
function RowSide({ line, spans, cls, term, side, present }: {
  line: string | null; spans?: TokenSpan[]; cls: string; term: string; side: string; present: boolean;
}) {
  if (!present) {
    return <span className="italic text-[#b0b0bd]">— not present —</span>;
  }
  if (spans) return <Spans spans={spans} cls={cls} term={term} side={side} />;
  return <>{highlightSearch(line ?? '', term, side)}</>;
}

export interface ReportSplitDiffProps {
  aText: string | null;
  bText: string | null;
  labelA: string;
  labelB: string;
  colorA: string;
  colorB: string;
  searchTerm: string;
}

export function ReportSplitDiff({ aText, bText, labelA, labelB, colorA, colorB, searchTerm }: ReportSplitDiffProps) {
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [cursor, setCursor] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());

  const diff = useMemo(
    () => diffReports(aText ?? '', bText ?? ''),
    [aText, bText],
  );
  const blocks = useMemo(
    () => blockRows(diff.rows, { onlyDifferences: onlyDiff, contextLines: 2 }),
    [diff.rows, onlyDiff],
  );

  // A new pair of reports invalidates the position in the old one.
  useEffect(() => { setCursor(0); }, [aText, bText]);

  const targets = diff.jumpTargets;
  const jump = (dir: 1 | -1) => {
    if (!targets.length) return;
    const next = (cursor + dir + targets.length) % targets.length;
    setCursor(next);
    const el = rowRefs.current.get(targets[next]);
    const box = scrollRef.current;
    if (el && box) {
      box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - box.clientHeight / 2;
    }
  };

  const paneHeader = (label: string, color: string, side: string) => (
    <div
      className="text-[10px] font-bold px-2 py-1 border-b"
      style={{ color: '#ffffff', backgroundColor: color, borderColor: color }}
      data-testid={`report-split-header-${side}`}
    >
      {label}
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col" style={{ maxHeight: 'calc(85vh - 200px)' }} data-testid="report-split-view">
      <div className="flex items-center gap-2 mb-1 flex-wrap text-[10px]" data-testid="report-diff-toolbar">
        {diff.identical ? (
          <span className="inline-flex items-center gap-1 text-[#14705f] font-semibold" data-testid="report-diff-identical">
            <Equal className="w-3 h-3" /> The two reports are identical, character for character.
          </span>
        ) : (
          <>
            <span className="font-semibold text-[#2a2a3e]" data-testid="report-diff-count">
              {diff.substantive} differing line{diff.substantive === 1 ? '' : 's'}
            </span>
            {(diff.volatile > 0 || diff.spacing > 0) && (
              <span className="text-[#8a8a9a]" data-testid="report-diff-volatile">
                +{diff.volatile > 0 ? ` ${diff.volatile} banner/timestamp` : ''}
                {diff.volatile > 0 && diff.spacing > 0 ? ' and' : ''}
                {diff.spacing > 0 ? ` ${diff.spacing} spacing-only` : ''}
                {' '}line{diff.volatile + diff.spacing === 1 ? '' : 's'} (not counted)
              </span>
            )}
            {diff.substantive > 0 && (
              <span className="inline-flex items-center gap-1">
                <button
                  onClick={() => jump(-1)}
                  className="px-1.5 py-0.5 rounded border border-[#d0d0d8] hover:bg-[#e8f0fb]"
                  title="Previous difference"
                  data-testid="btn-diff-prev"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <span className="tabular-nums text-[#6b6b7b]" data-testid="report-diff-cursor">
                  {cursor + 1} / {targets.length}
                </span>
                <button
                  onClick={() => jump(1)}
                  className="px-1.5 py-0.5 rounded border border-[#d0d0d8] hover:bg-[#e8f0fb]"
                  title="Next difference"
                  data-testid="btn-diff-next"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </span>
            )}
            <label className="inline-flex items-center gap-1 cursor-pointer select-none text-[#4a4a5a]">
              <input
                type="checkbox"
                checked={onlyDiff}
                onChange={e => setOnlyDiff(e.target.checked)}
                data-testid="chk-only-differences"
              />
              Only differences
            </label>
            {diff.approximate && (
              <span className="text-[#8a5a06]" data-testid="report-diff-approximate">
                Reports too large to align exactly — compared line by position, so an inserted line
                shifts everything after it.
              </span>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 shrink-0">
        {paneHeader(labelA, colorA, '5')}
        {paneHeader(labelB, colorB, '6')}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-auto border border-t-0 border-[#d0d0d8] rounded-b bg-[#f8f8fa]"
        data-testid="report-split-scroll"
      >
        <div className="text-[10px] leading-[1.4] font-mono">
          {blocks.map((blk, bi) => {
            if (blk.kind === 'same') {
              return (
                <div key={`s${bi}`} className="grid grid-cols-2 gap-2">
                  <pre className="whitespace-pre px-2 overflow-hidden">{highlightSearch(blk.aText ?? '', searchTerm, `a${bi}`)}</pre>
                  <pre className="whitespace-pre px-2 overflow-hidden">{highlightSearch(blk.bText ?? '', searchTerm, `b${bi}`)}</pre>
                </div>
              );
            }
            if (blk.kind === 'gap') {
              return (
                <div
                  key={`g${bi}`}
                  className="flex items-center gap-2 px-2 py-0.5 text-[9px] text-[#8a8a9a] bg-[#eef0f4] border-y border-[#dcdce4]"
                  data-testid="report-diff-gap"
                >
                  <span className="flex-1 border-t border-dashed border-[#c4c4d0]" />
                  {blk.lines} unchanged line{blk.lines === 1 ? '' : 's'} hidden
                  <span className="flex-1 border-t border-dashed border-[#c4c4d0]" />
                </div>
              );
            }
            const row = blk.row as DiffRow;
            const cls = row.cls ?? 'text';
            const isCursor = targets[cursor] === blk.index;
            return (
              <div
                key={`r${bi}`}
                ref={el => { if (el && blk.index !== undefined) rowRefs.current.set(blk.index, el); }}
                className={`grid grid-cols-2 gap-2 ${ROW_BG[cls]} ${isCursor ? 'ring-1 ring-[#2c6eb5]' : ''}`}
                data-testid={`report-diff-row-${cls}`}
                data-diff-index={blk.index}
              >
                <pre className="whitespace-pre px-2 overflow-hidden">
                  <RowSide line={row.a} spans={row.aSpans} cls={HL[cls]} term={searchTerm} side={`a${bi}`} present={row.a !== null} />
                </pre>
                <pre className="whitespace-pre px-2 overflow-hidden">
                  <RowSide line={row.b} spans={row.bSpans} cls={HL[cls]} term={searchTerm} side={`b${bi}`} present={row.b !== null} />
                </pre>
              </div>
            );
          })}
        </div>
      </div>

      {!diff.identical && (
        <div className="flex gap-3 pt-1 text-[9px] text-[#6b6b7b] flex-wrap">
          <span><span className={`${HL.numeric} px-1 rounded-[2px]`}>0.881</span> number changed</span>
          <span><span className={`${HL.time} px-1 rounded-[2px]`}>01:00</span> time changed</span>
          <span><span className={`${HL.text} px-1 rounded-[2px]`}>text</span> other change</span>
          <span className="text-[#a0a0b0]">grey — engine banner, timestamp or column padding, not counted</span>
        </div>
      )}
    </div>
  );
}
