/**
 * Line-and-token diff for two engine reports shown side by side.
 *
 * Two .rpt files from different engines are mostly the same document, and that
 * is the problem: the eye slides over a thousand identical rows and stops
 * noticing. In practice the finding is one column in one row — a peak that
 * arrives at 00:59 instead of 01:00 — sitting in a table whose every other
 * figure matches. Reading that off two independently scrolling panes is not a
 * comparison, it is a memory test.
 *
 * So this aligns the two texts line by line, pairs the lines that correspond,
 * and marks the tokens that actually differ.
 *
 * It also classifies each difference, because a diff that reports everything
 * equally is only marginally better than no diff. Every pair of runs differs in
 * its timestamps and its engine banner; if those are counted alongside a
 * changed peak flow, the count is dominated by noise and the real finding is
 * buried again. Volatile rows are still shown — hiding them would be its own
 * dishonesty — but they are marked as such and kept out of the headline count.
 */

export type RowKind = 'same' | 'changed' | 'onlyA' | 'onlyB';

/** How a changed row differs, once the tokens are compared. */
export type ChangeClass = 'numeric' | 'time' | 'text' | 'volatile' | 'spacing';

export interface TokenSpan {
  text: string;
  /** True when this token differs from its counterpart, or has none. */
  differs: boolean;
}

export interface DiffRow {
  kind: RowKind;
  a: string | null;
  b: string | null;
  /** Present only for 'changed' rows. */
  aSpans?: TokenSpan[];
  bSpans?: TokenSpan[];
  cls?: ChangeClass;
  /**
   * Largest relative change across the numeric tokens on this row, as a
   * fraction of |A|. NaN when the row has no comparable numeric pair, or when
   * the A-side value is zero and a relative change is undefined.
   */
  delta?: number;
}

export interface ReportDiff {
  rows: DiffRow[];
  /** Rows differing in a way that is not run-to-run noise. */
  substantive: number;
  /** Rows differing only in timestamps or the engine banner. */
  volatile: number;
  /** Rows whose two sides differ only in column padding. */
  spacing: number;
  /** Indices into `rows` of every substantive difference, in order. */
  jumpTargets: number[];
  identical: boolean;
  /** True when some region was too large to align and was compared by position. */
  approximate: boolean;
}

/* ────────────────────────────── volatile lines ─────────────────────────────
 * Lines that differ between any two runs of anything and therefore say nothing
 * about the engines.
 *
 * These patterns are deliberately anchored and specific. An earlier version
 * matched the bare substring "OpenSWMM" or "SWMM 6" anywhere in a line, which
 * silently reclassified any real data row that happened to name the engine as
 * run-to-run noise — excluding a genuine difference from the count and from
 * the jump list, which is the exact failure this tool exists to prevent. A
 * volatile pattern that can match substantive content is worse than none.
 */
const VOLATILE = [
  /^\s*Analysis begun on:/i,
  /^\s*Analysis ended on:/i,
  /^\s*Total elapsed time:/i,
  // The engine title/version banner, anchored to the start of the line.
  /^\s*(EPA STORM WATER MANAGEMENT MODEL|OPENSWMM ENGINE)\b/i,
  /^\s*Version\s+\d+\.\d+/i,
];

const isVolatileLine = (s: string | null) => !!s && VOLATILE.some(r => r.test(s));

/* ─────────────────────────────── line alignment ────────────────────────────
 * Hirschberg's algorithm: the same alignment as the full dynamic-programming
 * table, in O(min(n,m)) space instead of O(n·m).
 *
 * The space matters here. The quadratic table for two 4,000-line regions is
 * about 64 MiB allocated synchronously on the UI thread — enough to stall or
 * kill a constrained browser tab at the moment the user clicks a tab. Linear
 * space removes that failure mode entirely and costs only a second pass.
 */

/** LCS length of every prefix pair, returned as the final row. O(m) space. */
function lcsRow(x: number[], y: number[], xs: number, xe: number, ys: number, ye: number, reverse: boolean): Int32Array {
  const m = ye - ys;
  let prev = new Int32Array(m + 1);
  let cur = new Int32Array(m + 1);
  const n = xe - xs;
  for (let i = 1; i <= n; i++) {
    const xv = reverse ? x[xe - i] : x[xs + i - 1];
    for (let j = 1; j <= m; j++) {
      const yv = reverse ? y[ye - j] : y[ys + j - 1];
      cur[j] = xv === yv ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    const t = prev; prev = cur; cur = t;
    cur.fill(0);
  }
  return prev;
}

/** Fill `out[i] = matched index in y`, or leave -1, for x[xs..xe) vs y[ys..ye). */
function hirschberg(x: number[], y: number[], xs: number, xe: number, ys: number, ye: number, out: Int32Array): void {
  const n = xe - xs;
  const m = ye - ys;
  if (n === 0 || m === 0) return;
  if (n === 1) {
    for (let j = ys; j < ye; j++) {
      if (y[j] === x[xs]) { out[xs] = j; return; }
    }
    return;
  }
  const xmid = xs + (n >> 1);
  const left = lcsRow(x, y, xs, xmid, ys, ye, false);
  const right = lcsRow(x, y, xmid, xe, ys, ye, true);
  let best = -1;
  let bestJ = ys;
  for (let j = 0; j <= m; j++) {
    const score = left[j] + right[m - j];
    if (score > best) { best = score; bestJ = ys + j; }
  }
  hirschberg(x, y, xs, xmid, ys, bestJ, out);
  hirschberg(x, y, xmid, xe, bestJ, ye, out);
}

/**
 * Anchor on lines that appear exactly once in each side and are equal.
 *
 * Reports are full of such lines — section headings, element IDs, separators.
 * Splitting on them turns one enormous alignment into many tiny ones, so a
 * 20,000-line report pair aligns exactly and quickly instead of falling back to
 * comparing by position (which cascades after a single inserted line and makes
 * every subsequent row read as changed).
 */
function uniqueCommonAnchors(x: number[], y: number[], xs: number, xe: number, ys: number, ye: number): Array<[number, number]> {
  const countX = new Map<number, number>();
  const countY = new Map<number, number>();
  const posX = new Map<number, number>();
  const posY = new Map<number, number>();
  for (let i = xs; i < xe; i++) { countX.set(x[i], (countX.get(x[i]) ?? 0) + 1); posX.set(x[i], i); }
  for (let j = ys; j < ye; j++) { countY.set(y[j], (countY.get(y[j]) ?? 0) + 1); posY.set(y[j], j); }

  const cand: Array<[number, number]> = [];
  countX.forEach((c, v) => {
    if (c === 1 && countY.get(v) === 1) cand.push([posX.get(v)!, posY.get(v)!]);
  });
  cand.sort((p, q) => p[0] - q[0]);

  // Longest increasing subsequence on the B positions: anchors must not cross.
  const tails: number[] = [];
  const tailIdx: number[] = [];
  const prev = new Int32Array(cand.length).fill(-1);
  for (let i = 0; i < cand.length; i++) {
    const v = cand[i][1];
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid] < v) lo = mid + 1; else hi = mid; }
    tails[lo] = v;
    tailIdx[lo] = i;
    prev[i] = lo > 0 ? tailIdx[lo - 1] : -1;
  }
  const out: Array<[number, number]> = [];
  let k = tails.length ? tailIdx[tails.length - 1] : -1;
  while (k >= 0) { out.push(cand[k]); k = prev[k]; }
  out.reverse();
  return out;
}

interface AlignState { approximate: boolean; budget: number }

/** Matched-index array for a region, using anchors then Hirschberg. */
function alignRegion(x: number[], y: number[], xs: number, xe: number, ys: number, ye: number, out: Int32Array, st: AlignState): void {
  const n = xe - xs;
  const m = ye - ys;
  if (n === 0 || m === 0) return;

  if (n * m <= st.budget) { hirschberg(x, y, xs, xe, ys, ye, out); return; }

  const anchors = uniqueCommonAnchors(x, y, xs, xe, ys, ye);
  if (anchors.length === 0) {
    // Nothing shared to pivot on and too large to align: compare by position
    // and record that the result is approximate rather than implying exactness.
    st.approximate = true;
    const k = Math.min(n, m);
    for (let i = 0; i < k; i++) if (x[xs + i] === y[ys + i]) out[xs + i] = ys + i;
    return;
  }
  let px = xs;
  let py = ys;
  for (const [ax, ay] of anchors) {
    alignRegion(x, y, px, ax, py, ay, out, st);
    out[ax] = ay;
    px = ax + 1;
    py = ay + 1;
  }
  alignRegion(x, y, px, xe, py, ye, out, st);
}

/* ────────────────────────────── token alignment ──────────────────────────── */

interface Tok { text: string; ws: boolean }

function tokenize(line: string): Tok[] {
  return line.split(/(\s+)/).filter(t => t !== '').map(text => ({ text, ws: /^\s+$/.test(text) }));
}

interface TokenPair { a: string; b: string }

interface TokenAlignment {
  aSpans: TokenSpan[];
  bSpans: TokenSpan[];
  /** Corresponding value tokens, in order. */
  pairs: TokenPair[];
  /** True when a token on either side had no counterpart. */
  orphans: boolean;
}

/**
 * Cap on the within-line token table. Report rows are a handful of columns, but
 * this view also diffs generated .inp text, so the input is not guaranteed
 * narrow. Beyond this the line is paired by position instead of allocating an
 * unbounded table for a single line.
 */
const MAX_TOKEN_CELLS = 250_000;

/** Small dense LCS, used only for short token runs where the table is tiny. */
function tokenLcs(x: string[], y: string[]): number[] {
  const n = x.length;
  const m = y.length;
  const w = m + 1;
  const dp = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = x[i] === y[j]
        ? dp[(i + 1) * w + (j + 1)] + 1
        : Math.max(dp[(i + 1) * w + j], dp[i * w + (j + 1)]);
    }
  }
  const out = new Array<number>(n).fill(-1);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { out[i] = j; i++; j++; }
    else if (dp[(i + 1) * w + j] >= dp[i * w + (j + 1)]) i++;
    else j++;
  }
  return out;
}

/**
 * Match the value tokens of two corresponding lines.
 *
 * Report rows are positional: column three is column three on both sides. When
 * both lines carry the same number of value tokens they are paired by column,
 * never by content. Content matching (an LCS) looks reasonable and is wrong
 * here — given `C1 10 20` against `C1 20 30` it pairs A's third column with B's
 * second because both read "20", then reports the row as a single 10→30 change
 * and leaves the genuinely changed 20→30 column unmarked. Two columns moved and
 * the view showed one. Worse, `1 2` against `2 1` matches both tokens across
 * and reports no numeric change at all for a row whose values swapped.
 *
 * The LCS is kept only for lines whose token counts differ, where there is no
 * column correspondence to rely on — and in that case no delta is claimed.
 */
function alignTokens(a: string, b: string): TokenAlignment {
  const at = tokenize(a);
  const bt = tokenize(b);
  const aVal = at.filter(t => !t.ws);
  const bVal = bt.filter(t => !t.ws);

  const aDiffers = new Array<boolean>(aVal.length).fill(false);
  const bDiffers = new Array<boolean>(bVal.length).fill(false);
  const pairs: TokenPair[] = [];
  let orphans = false;

  if (aVal.length === bVal.length) {
    for (let i = 0; i < aVal.length; i++) {
      pairs.push({ a: aVal[i].text, b: bVal[i].text });
      if (aVal[i].text !== bVal[i].text) { aDiffers[i] = true; bDiffers[i] = true; }
    }
  } else if (aVal.length * bVal.length > MAX_TOKEN_CELLS) {
    // Pathologically wide line: pair by position as far as both sides go and
    // treat the remainder as unmatched. Marked orphaned, so no delta is claimed.
    orphans = true;
    const k = Math.min(aVal.length, bVal.length);
    for (let i = 0; i < k; i++) {
      if (aVal[i].text !== bVal[i].text) { aDiffers[i] = true; bDiffers[i] = true; }
    }
    for (let i = k; i < aVal.length; i++) aDiffers[i] = true;
    for (let j = k; j < bVal.length; j++) bDiffers[j] = true;
  } else {
    orphans = true;
    const match = tokenLcs(aVal.map(t => t.text), bVal.map(t => t.text));
    const bMatched = new Set<number>();
    for (let i = 0; i < match.length; i++) {
      if (match[i] >= 0) { bMatched.add(match[i]); pairs.push({ a: aVal[i].text, b: bVal[match[i]].text }); }
      else aDiffers[i] = true;
    }
    for (let j = 0; j < bVal.length; j++) if (!bMatched.has(j)) bDiffers[j] = true;
  }

  // Project the per-value flags back onto the full token list so whitespace is
  // never highlighted; a changed column width is not a change worth marking.
  let ai = 0;
  const aSpans = at.map(t => ({ text: t.text, differs: t.ws ? false : aDiffers[ai++] }));
  let bi = 0;
  const bSpans = bt.map(t => ({ text: t.text, differs: t.ws ? false : bDiffers[bi++] }));

  return { aSpans, bSpans, pairs, orphans };
}

const NUMERIC = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const TIME = /^\d{1,3}:\d{2}(:\d{2})?$/;

/**
 * Classify a changed row from the token pairs that differ.
 *
 * A delta is only reported when the columns actually correspond. Where the two
 * lines have different token counts there is no column correspondence, so the
 * row is reported as changed without a fabricated magnitude.
 */
function classify(al: TokenAlignment): { cls: ChangeClass; delta: number } {
  const changed = al.pairs.filter(p => p.a !== p.b);

  if (changed.length === 0) {
    // Only whitespace or orphan tokens differ.
    return { cls: 'text', delta: NaN };
  }

  const numericPairs = changed.filter(p => NUMERIC.test(p.a) && NUMERIC.test(p.b));
  const timePairs = changed.filter(p => TIME.test(p.a) && TIME.test(p.b));

  if (numericPairs.length + timePairs.length < changed.length) {
    return { cls: 'text', delta: NaN };
  }

  if (numericPairs.length === 0) return { cls: 'time', delta: NaN };

  // Orphan tokens mean the columns do not line up; report the change, not a size.
  if (al.orphans) return { cls: 'numeric', delta: NaN };

  let worst = NaN;
  for (const p of numericPairs) {
    const x = Number(p.a);
    const y = Number(p.b);
    // A change away from zero has no relative size; report it as present but
    // unmeasured rather than as infinite or as a hundred per cent.
    const rel = x === 0 ? NaN : Math.abs(y - x) / Math.abs(x);
    if (Number.isFinite(rel) && !(worst >= rel)) worst = rel;
  }
  return { cls: 'numeric', delta: worst };
}

/* ──────────────────────────────── the diff ─────────────────────────────── */

export interface DiffOptions {
  /**
   * Cell budget for one exact alignment region. Regions larger than this are
   * split on anchor lines first; only a region with no shared anchor at all
   * falls back to positional comparison.
   */
  maxCells?: number;
}

function intern(all: string[][]): number[][] {
  const ids = new Map<string, number>();
  return all.map(list => list.map(s => {
    let v = ids.get(s);
    if (v === undefined) { v = ids.size; ids.set(s, v); }
    return v;
  }));
}

export function diffReports(aText: string, bText: string, opts: DiffOptions = {}): ReportDiff {
  const budget = opts.maxCells ?? 4_000_000;
  const aLines = aText.split('\n');
  const bLines = bText.split('\n');

  if (aText === bText) {
    return {
      rows: aLines.map(l => ({ kind: 'same' as const, a: l, b: l })),
      substantive: 0,
      volatile: 0,
      spacing: 0,
      jumpTargets: [],
      identical: true,
      approximate: false,
    };
  }

  // Trim the common head and tail; reports share long identical runs and the
  // alignment only needs to work on what is left.
  let head = 0;
  while (head < aLines.length && head < bLines.length && aLines[head] === bLines[head]) head++;
  let tail = 0;
  while (
    tail < aLines.length - head &&
    tail < bLines.length - head &&
    aLines[aLines.length - 1 - tail] === bLines[bLines.length - 1 - tail]
  ) tail++;

  const aMid = aLines.slice(head, aLines.length - tail);
  const bMid = bLines.slice(head, bLines.length - tail);

  const [ax, bx] = intern([aMid, bMid]);
  const match = new Int32Array(aMid.length).fill(-1);
  const st: AlignState = { approximate: false, budget };
  alignRegion(ax, bx, 0, aMid.length, 0, bMid.length, match, st);

  // Unmatched runs on each side are paired up as changed rows, so a table row
  // whose numbers moved lines up beside its counterpart instead of appearing as
  // an unrelated deletion and insertion.
  const midRows: DiffRow[] = [];
  let j = 0;
  let pendingA: string[] = [];
  const flush = (upto: number) => {
    const pendingB: string[] = [];
    while (j < upto) { pendingB.push(bMid[j]); j++; }
    const paired = Math.min(pendingA.length, pendingB.length);
    for (let k = 0; k < paired; k++) midRows.push(makeRow(pendingA[k], pendingB[k]));
    for (let k = paired; k < pendingA.length; k++) midRows.push(makeRow(pendingA[k], null));
    for (let k = paired; k < pendingB.length; k++) midRows.push(makeRow(null, pendingB[k]));
    pendingA = [];
  };
  for (let i = 0; i < aMid.length; i++) {
    const m = match[i];
    if (m < 0) { pendingA.push(aMid[i]); continue; }
    flush(m);
    midRows.push({ kind: 'same', a: aMid[i], b: bMid[m] });
    j = m + 1;
  }
  flush(bMid.length);

  const rows: DiffRow[] = [];
  for (let i = 0; i < head; i++) rows.push({ kind: 'same', a: aLines[i], b: bLines[i] });
  rows.push(...midRows);
  for (let i = tail - 1; i >= 0; i--) {
    const ia = aLines.length - 1 - i;
    rows.push({ kind: 'same', a: aLines[ia], b: bLines[bLines.length - 1 - i] });
  }

  let substantive = 0;
  let volatileCount = 0;
  let spacingCount = 0;
  const jumpTargets: number[] = [];
  rows.forEach((r, i) => {
    if (r.kind === 'same') return;
    if (r.cls === 'volatile') { volatileCount++; return; }
    if (r.cls === 'spacing') { spacingCount++; return; }
    substantive++;
    jumpTargets.push(i);
  });

  return {
    rows, substantive, volatile: volatileCount, spacing: spacingCount,
    jumpTargets, identical: false, approximate: st.approximate,
  };
}

function makeRow(a: string | null, b: string | null): DiffRow {
  if (a !== null && b !== null) {
    const al = alignTokens(a, b);
    // Both sides must look like the same generated banner or timestamp line.
    // Requiring both prevents a misaligned pair — a banner opposite a data row —
    // from being written off as noise.
    // Two engines may pad their columns differently. Every row then differs as
    // text while not one figure has changed, and a count that included them
    // would report hundreds of differences in two identical result sets — the
    // same drowning that counting timestamps causes.
    const sameIgnoringPadding = a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();
    const cls = isVolatileLine(a) && isVolatileLine(b)
      ? { cls: 'volatile' as const, delta: NaN }
      : sameIgnoringPadding
        ? { cls: 'spacing' as const, delta: NaN }
        : classify(al);
    return { kind: 'changed', a, b, aSpans: al.aSpans, bSpans: al.bSpans, cls: cls.cls, delta: cls.delta };
  }
  // A line present on one side only is a structural difference between the two
  // reports, even when that line is a banner or a timestamp. "Volatile" means
  // the VALUE on this line differs between any two runs — it never means the
  // line may go missing. One report emitting a timestamp line that the other
  // omits is exactly the kind of output difference this view is asked about, so
  // it must be counted and reachable from the jump list.
  return {
    kind: a !== null ? 'onlyA' : 'onlyB',
    a, b,
    cls: 'text',
    delta: NaN,
  };
}

/* ─────────────────────────────── rendering ─────────────────────────────── */

/**
 * Contiguous runs of unchanged rows, collapsed to one block each.
 *
 * A full report is thousands of lines; rendering one element per line makes the
 * dialog crawl. Unchanged runs carry no per-line marking, so they can be one
 * text node — and because both sides of an unchanged run have equal length, the
 * two columns stay aligned.
 */
export interface DiffBlock {
  kind: 'same' | 'row' | 'gap';
  /** For 'same': the joined text of each side. */
  aText?: string;
  bText?: string;
  lines?: number;
  /** For 'row': the single differing row. */
  row?: DiffRow;
  /** Index of this row within ReportDiff.rows, for jump targeting. */
  index?: number;
}

/**
 * A 'gap' block marks unchanged lines that were skipped. It must be rendered,
 * not silently dropped: without it the last context line before the gap sits
 * directly above the first one after it, and the view claims two distant rows
 * are neighbours.
 */
export function blockRows(
  rows: DiffRow[],
  opts: { onlyDifferences?: boolean; contextLines?: number } = {},
): DiffBlock[] {
  const context = opts.contextLines ?? 2;
  const keep = new Uint8Array(rows.length);
  if (opts.onlyDifferences) {
    rows.forEach((r, i) => {
      if (r.kind === 'same') return;
      for (let k = Math.max(0, i - context); k <= Math.min(rows.length - 1, i + context); k++) keep[k] = 1;
    });
  } else {
    keep.fill(1);
  }

  const blocks: DiffBlock[] = [];
  let runA: string[] = [];
  let runB: string[] = [];
  const flushRun = () => {
    if (!runA.length && !runB.length) return;
    blocks.push({ kind: 'same', aText: runA.join('\n'), bText: runB.join('\n'), lines: runA.length });
    runA = [];
    runB = [];
  };

  let skipped = 0;
  for (let i = 0; i < rows.length; i++) {
    if (!keep[i]) { skipped++; continue; }
    // A break in the kept range means lines were hidden. Close the current run
    // and say how many, so nothing implies these two lines are adjacent. This
    // includes a break at the very start: without it the view opens on line 400
    // dressed as the top of the document.
    if (skipped > 0) {
      flushRun();
      blocks.push({ kind: 'gap', lines: skipped });
    }
    skipped = 0;
    const r = rows[i];
    if (r.kind === 'same') {
      runA.push(r.a ?? '');
      runB.push(r.b ?? '');
    } else {
      flushRun();
      blocks.push({ kind: 'row', row: r, index: i });
    }
  }
  flushRun();
  if (skipped > 0) blocks.push({ kind: 'gap', lines: skipped });
  return blocks;
}
