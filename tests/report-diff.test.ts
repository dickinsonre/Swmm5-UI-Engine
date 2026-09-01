/**
 * Side-by-side report diff: find the difference, and do not invent ones.
 *
 * Two engine reports are near-identical documents where the finding is one
 * column of one row — a peak arriving at 00:59 instead of 01:00 in a table
 * whose every other figure matches. Two failure modes make such a view worse
 * than useless, and both look fine on screen:
 *
 *   1. MISSING a real difference. A line that pairs with the wrong counterpart,
 *      or a token marked as equal when it is not, hides exactly the thing the
 *      user opened the view to find, while the report still LOOKS diffed.
 *
 *   2. DROWNING it. Every pair of runs differs in its timestamps and engine
 *      banner. Counting those alongside a changed flow makes every comparison
 *      report differences, so the count stops carrying information.
 *
 * So this suite pins the alignment (an inserted line must not cascade into
 * every following line reading as changed), the token marking, the
 * classification, and the arithmetic of the count — including on the real
 * fixture pair, where the only input change was conduit roughness.
 *
 * Run: npx tsx tests/report-diff.test.ts
 */

import { readFileSync } from 'fs';
import { blockRows, diffReports } from '../client/src/lib/report-diff';

let passed = 0;
let failed = 0;
const check = (label: string, cond: boolean, detail?: string) => {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (label: string, a: unknown, b: unknown) =>
  check(label, Object.is(a, b), `expected ${String(b)}, got ${String(a)}`);

/** Tokens marked as differing on one side of a changed row. */
const marked = (spans: { text: string; differs: boolean }[] | undefined) =>
  (spans ?? []).filter(s => s.differs && s.text.trim() !== '').map(s => s.text);

console.log('\n1. Identical documents say so and stop\n');

{
  const text = 'Link  Flow\nC1    0.881\nC2    0.437\n';
  const d = diffReports(text, text);
  check('identical is reported', d.identical);
  eq('no substantive differences', d.substantive, 0);
  eq('no volatile differences', d.volatile, 0);
  eq('nothing to jump to', d.jumpTargets.length, 0);
  check('every row is a match', d.rows.every(r => r.kind === 'same'));
}

console.log('\n2. The screenshot case: one column, one row\n');

{
  const a = 'Link      Type      Flow   Time\nC5        CONDUIT   0.151  01:00\nC6        CONDUIT   0.044  01:00\n';
  const b = 'Link      Type      Flow   Time\nC5        CONDUIT   0.151  00:59\nC6        CONDUIT   0.044  00:59\n';
  const d = diffReports(a, b);
  eq('exactly the two changed rows are found', d.substantive, 2);
  const row = d.rows.find(r => r.kind === 'changed');
  check('the changed row is classified as a time change', row?.cls === 'time', row?.cls);
  eq('only the time token is marked on A', marked(row?.aSpans).join(','), '01:00');
  eq('only the time token is marked on B', marked(row?.bSpans).join(','), '00:59');
  check('the identical flow figure is NOT marked',
    !marked(row?.aSpans).includes('0.151'));
  check('the link name is NOT marked', !marked(row?.aSpans).includes('C5'));
}

console.log('\n3. Numbers are classified as numbers, with their size\n');

{
  const d = diffReports('C1  0.881\n', 'C1  0.912\n');
  const row = d.rows.find(r => r.kind === 'changed');
  eq('classified numeric', row?.cls, 'numeric');
  check('relative change is reported',
    Math.abs((row?.delta ?? 0) - Math.abs(0.912 - 0.881) / 0.881) < 1e-12,
    String(row?.delta));

  // A change away from zero has no relative size; it must not be reported as
  // infinite or as a hundred-per-cent change.
  const z = diffReports('C1  0.000\n', 'C1  0.044\n');
  const zr = z.rows.find(r => r.kind === 'changed');
  eq('a change from zero is still numeric', zr?.cls, 'numeric');
  check('but its relative size is undefined, not infinite', Number.isNaN(zr?.delta ?? 0), String(zr?.delta));
}

console.log('\n4. Run-to-run noise is shown, labelled, and not counted\n');

{
  const a = 'Analysis begun on:  Mon Sep  1 07:00:00 2026\nC1  0.881\n';
  const b = 'Analysis begun on:  Mon Sep  1 09:30:12 2026\nC1  0.881\n';
  const d = diffReports(a, b);
  eq('the timestamp is not counted as a finding', d.substantive, 0);
  eq('but it is counted as noise', d.volatile, 1);
  check('and it is still present in the output, not hidden',
    d.rows.some(r => r.cls === 'volatile' && /Analysis begun/.test(r.a ?? '')));
  eq('nothing to jump to', d.jumpTargets.length, 0);

  // The same line pair alongside a real change must not mask it.
  const d2 = diffReports(a + 'C2  0.437\n', b + 'C2  0.500\n');
  eq('a real change beside noise is still counted once', d2.substantive, 1);
  eq('and the noise is still separated', d2.volatile, 1);
}

console.log('\n5. An inserted line must not cascade\n');

{
  // B has one extra line near the top. Naive index alignment would report
  // every subsequent line as changed.
  const a = 'H1\nC1  0.881\nC2  0.437\nC3  0.275\n';
  const b = 'H1\nWARNING 04: minimum elevation drop used\nC1  0.881\nC2  0.437\nC3  0.275\n';
  const d = diffReports(a, b);
  eq('exactly one difference is reported', d.substantive, 1);
  const only = d.rows.find(r => r.kind !== 'same');
  eq('and it is the inserted line', only?.kind, 'onlyB');
  check('the inserted text is carried', /WARNING 04/.test(only?.b ?? ''));
  check('every data row still pairs as unchanged',
    ['C1  0.881', 'C2  0.437', 'C3  0.275']
      .every(l => d.rows.some(r => r.kind === 'same' && r.a === l && r.b === l)));
}

console.log('\n6. A row present on one side only is an absence, not a blank\n');

{
  const d = diffReports('C1  0.881\nC2  0.437\n', 'C1  0.881\n');
  const only = d.rows.find(r => r.kind === 'onlyA');
  check('the extra row is attributed to A', !!only);
  eq('its B side is null, not an empty string', only?.b, null);
  eq('it counts as a difference', d.substantive, 1);
}

console.log('\n7. Alignment invariant: unchanged blocks are equal on both sides\n');

{
  const a = 'H\nC1  1\nC2  2\nC3  3\nC4  4\nT\n';
  const b = 'H\nC1  1\nX\nC2  9\nC3  3\nC4  4\nT\n';
  const d = diffReports(a, b);
  const blocks = blockRows(d.rows, { onlyDifferences: false });
  const bad = blocks.filter(bl =>
    bl.kind === 'same' &&
    (bl.aText ?? '').split('\n').length !== (bl.bText ?? '').split('\n').length);
  eq('every unchanged block has the same line count on both sides', bad.length, 0);
  check('so the two columns cannot drift apart', bad.length === 0);
}

console.log('\n8. "Only differences" keeps context and drops the rest\n');

{
  const lines = Array.from({ length: 60 }, (_, i) => `C${i}  ${i}.000`);
  const a = lines.join('\n');
  const changed = [...lines];
  changed[30] = 'C30  99.000';
  const b = changed.join('\n');

  const d = diffReports(a, b);
  eq('one difference in sixty lines', d.substantive, 1);

  const all = blockRows(d.rows, { onlyDifferences: false });
  const some = blockRows(d.rows, { onlyDifferences: true, contextLines: 2 });
  // Count source lines actually on screen; a gap marker is a label, not a line.
  const count = (bl: ReturnType<typeof blockRows>) =>
    bl.reduce((n, x) => n + (x.kind === 'same' ? (x.lines ?? 0) : x.kind === 'row' ? 1 : 0), 0);
  eq('the full view shows every line', count(all), 60);
  eq('the filtered view shows the difference plus two lines either side', count(some), 5);
  check('the difference itself survives the filter',
    some.some(x => x.kind === 'row' && x.row?.a === 'C30  30.000'));
}

{
  // Two DISTANT differences. With the unchanged bulk hidden, the context after
  // the first must not run straight into the context before the second: that
  // would put line 12 directly above line 498 and quietly assert they are
  // neighbours. A single-difference fixture cannot catch this.
  const lines = Array.from({ length: 200 }, (_, i) => `C${i}  ${i}.000`);
  const a = lines.join('\n');
  const changed = [...lines];
  changed[10] = 'C10  99.000';
  changed[150] = 'C150  99.000';
  const b = changed.join('\n');

  const d = diffReports(a, b);
  eq('both distant differences are found', d.substantive, 2);

  const some = blockRows(d.rows, { onlyDifferences: true, contextLines: 2 });
  const gaps = some.filter(x => x.kind === 'gap');
  check('the hidden stretches are marked as gaps, not elided silently',
    gaps.length >= 3, `${gaps.length} gap blocks (leading, middle, trailing)`);
  check('each gap states how many lines it hides',
    gaps.every(g => (g.lines ?? 0) > 0));

  // The invariant that matters: no rendered block of unchanged text may contain
  // two lines that were not adjacent in the source.
  const sameBlocks = some.filter(x => x.kind === 'same');
  const nonAdjacent = sameBlocks.filter(bl => {
    const ls = (bl.aText ?? '').split('\n');
    for (let i = 1; i < ls.length; i++) {
      const prev = Number(ls[i - 1].match(/^C(\d+)/)?.[1] ?? NaN);
      const cur = Number(ls[i].match(/^C(\d+)/)?.[1] ?? NaN);
      if (Number.isFinite(prev) && Number.isFinite(cur) && cur !== prev + 1) return true;
    }
    return false;
  });
  eq('no unchanged block splices non-adjacent lines together', nonAdjacent.length, 0);

  // Hidden lines must be accounted for, not lost.
  const shown = some.reduce((n, x) => n + (x.kind === 'same' ? (x.lines ?? 0) : x.kind === 'row' ? 1 : 0), 0);
  const hidden = gaps.reduce((n, g) => n + (g.lines ?? 0), 0);
  eq('every source line is either shown or counted as hidden', shown + hidden, d.rows.length);

  // With nothing filtered there is nothing to hide, so no gap may appear.
  const all = blockRows(d.rows, { onlyDifferences: false });
  eq('the full view has no gaps', all.filter(x => x.kind === 'gap').length, 0);
}

console.log('\n9. Table columns correspond by position, not by content\n');

{
  // The failure this guards against looks harmless on screen. Matching tokens
  // by content pairs A's third column with B's second because both read "20",
  // marks only 10 and 30, and reports a 200 % change — while the column that
  // genuinely moved (20 -> 30) is left unmarked.
  const d = diffReports('C1  10  20\n', 'C1  20  30\n');
  const row = d.rows.find(r => r.kind === 'changed');
  eq('both changed columns are marked on A', marked(row?.aSpans).join(','), '10,20');
  eq('both changed columns are marked on B', marked(row?.bSpans).join(','), '20,30');
  check('the unchanged label is not marked', !marked(row?.aSpans).includes('C1'));
  eq('classified numeric', row?.cls, 'numeric');
  check('the reported size is the largest real column change',
    Math.abs((row?.delta ?? 0) - 1.0) < 1e-12, String(row?.delta));

  // Two values swapping is a change in every column, not a change in none.
  const sw = diffReports('C1  1  2\n', 'C1  2  1\n');
  const swRow = sw.rows.find(r => r.kind === 'changed');
  eq('a swap is counted', sw.substantive, 1);
  eq('both swapped columns are marked', marked(swRow?.aSpans).join(','), '1,2');
  check('and it is not reported as a zero change',
    (swRow?.delta ?? 0) > 0, String(swRow?.delta));

  // Where the token counts differ there is no column correspondence, so the
  // row must be reported without inventing a magnitude for it.
  const orph = diffReports('C1  10\n', 'C1  10  20\n');
  const orphRow = orph.rows.find(r => r.kind === 'changed');
  eq('a row with an extra column is still counted', orph.substantive, 1);
  check('but no delta is fabricated for it', Number.isNaN(orphRow?.delta ?? 0), String(orphRow?.delta));
}

console.log('\n10. Noise patterns must not swallow real content\n');

{
  // A data line that merely names the engine is not a banner. Matching the bare
  // substring would grey this out and drop it from the count entirely.
  const d = diffReports('OpenSWMM 6 peak flow  1.0\n', 'OpenSWMM 6 peak flow  2.0\n');
  eq('a data line naming the engine is counted', d.substantive, 1);
  eq('and is not written off as noise', d.volatile, 0);
  eq('and is classified on its numbers', d.rows.find(r => r.kind === 'changed')?.cls, 'numeric');

  // The actual banners still are noise.
  const banner = diffReports(
    '  EPA STORM WATER MANAGEMENT MODEL - VERSION 5.2 (Build 5.2.4)\n',
    '  OPENSWMM ENGINE - VERSION 6.0.0-alpha.3\n');
  eq('the engine banner is not counted', banner.substantive, 0);
  eq('but it is reported as noise', banner.volatile, 1);

  // A banner opposite a data row is a misalignment, not noise. Requiring only
  // one side to look volatile would hide it.
  const mixed = diffReports('  EPA STORM WATER MANAGEMENT MODEL - VERSION 5.2\n', 'C1  0.881\n');
  eq('a banner paired with a data row is counted', mixed.substantive, 1);
  eq('and not dismissed as a banner difference', mixed.volatile, 0);
}

{
  // A banner or timestamp line present on ONE side only is a structural
  // difference between the two reports. Treating it as noise because the line
  // LOOKS like a timestamp drops a real output difference from both the count
  // and the jump list — the tool silently answering "no difference here".
  const patterns = [
    'Analysis begun on:  Mon Sep  1 07:00:00 2026',
    'Analysis ended on:  Mon Sep  1 07:00:03 2026',
    'Total elapsed time: 00:00:03',
    '  EPA STORM WATER MANAGEMENT MODEL - VERSION 5.2 (Build 5.2.4)',
    '  Version 5.2.4',
  ];
  for (const line of patterns) {
    const label = line.trim().slice(0, 28);
    const d = diffReports(`${line}\nC1  1\n`, 'C1  1\n');
    eq(`a missing "${label}" line is counted`, d.substantive, 1);
    eq('  and is not dismissed as noise', d.volatile, 0);
    eq('  and is reachable from the jump list', d.jumpTargets.length, 1);
    const row = d.rows.find(r => r.kind === 'onlyA');
    check('  and is attributed to the side that has it', !!row);
  }

  // The paired case must still be treated as noise, or the count is flooded.
  const paired = diffReports(
    'Analysis begun on:  Mon Sep  1 07:00:00 2026\nC1  1\n',
    'Analysis begun on:  Tue Sep  2 09:30:12 2026\nC1  1\n');
  eq('a timestamp whose value differs is still not counted', paired.substantive, 0);
  eq('and is still reported as noise', paired.volatile, 1);
}

console.log('\n11. Column padding is formatting, not a result\n');

{
  const d = diffReports('C1     0.881\n', 'C1   0.881\n');
  eq('a padding-only difference is not counted as a finding', d.substantive, 0);
  eq('it is reported separately', d.spacing, 1);
  const row = d.rows.find(r => r.kind === 'changed');
  check('and no token is highlighted, because no value changed',
    marked(row?.aSpans).length === 0, marked(row?.aSpans).join(','));

  // Padding must not mask a real change sharing the same line.
  const real = diffReports('C1     0.881\n', 'C1   0.912\n');
  eq('a real change under different padding is still counted', real.substantive, 1);
  eq('and still classified numeric', real.rows.find(r => r.kind === 'changed')?.cls, 'numeric');
}

console.log('\n12. Large reports align exactly, without a huge allocation\n');

{
  // 6,000 lines a side with scattered changes: the anchor split must keep this
  // exact and fast. The quadratic table for this pair would be ~144 MiB.
  const big = Array.from({ length: 6000 }, (_, i) => `C${i}  ${(i * 0.001).toFixed(3)}  CONDUIT`);
  const bigB = [...big];
  for (let i = 250; i < 6000; i += 250) bigB[i] = `C${i}  9.999  CONDUIT`;
  const t0 = Date.now();
  const d = diffReports(big.join('\n'), bigB.join('\n'));
  const ms = Date.now() - t0;
  eq('every scattered change is found', d.substantive, 23);
  check('the alignment stays exact at this size', !d.approximate);
  check('and completes promptly', ms < 3000, `${ms} ms`);

  // Pathological: nothing in common at all, so there is no anchor to split on.
  // This must degrade to a positional comparison and SAY so, not hang.
  const x = Array.from({ length: 3000 }, (_, i) => `left-${i}`).join('\n');
  const y = Array.from({ length: 3000 }, (_, i) => `right-${i}`).join('\n');
  const t1 = Date.now();
  const d2 = diffReports(x, y);
  const ms2 = Date.now() - t1;
  check('a pair with nothing in common still returns', d2.rows.length > 0);
  check('it admits the comparison is positional', d2.approximate);
  check('and does not hang', ms2 < 3000, `${ms2} ms`);
}

{
  // A single pathologically wide line must not allocate an unbounded table.
  // This view also diffs generated .inp text, so line width is not guaranteed.
  const wideA = Array.from({ length: 900 }, (_, i) => `t${i}`).join(' ');
  const wideB = Array.from({ length: 1200 }, (_, i) => `t${i}`).join(' ');
  const t2 = Date.now();
  const d3 = diffReports(wideA + '\n', wideB + '\n');
  const ms3 = Date.now() - t2;
  eq('the wide line is reported as one difference', d3.substantive, 1);
  check('and it completes promptly', ms3 < 3000, `${ms3} ms`);
  const wideRow = d3.rows.find(r => r.kind === 'changed');
  check('with no fabricated magnitude', Number.isNaN(wideRow?.delta ?? 0));
}

console.log('\n13. The real fixture pair (roughness 0.010 -> 0.013)\n');

{
  const a = readFileSync('tests/fixtures/verify-a.rpt', 'latin1');
  const b = readFileSync('tests/fixtures/verify-b.rpt', 'latin1');
  const d = diffReports(a, b);

  check('the two reports are not identical', !d.identical);
  check('real differences are found', d.substantive > 0, `substantive=${d.substantive}`);
  check('the alignment is exact, not positional', !d.approximate);

  const changed = d.rows.filter(r => r.kind === 'changed');
  const numeric = changed.filter(r => r.cls === 'numeric').length;
  check('most differences are numeric, as a roughness change implies',
    numeric > changed.length / 2, `${numeric} of ${changed.length}`);

  // The point of the token marking: a changed row must not light up entirely.
  const widest = changed
    .filter(r => r.cls !== 'volatile')
    .map(r => marked(r.aSpans).length / Math.max(1, (r.aSpans ?? []).filter(s => s.text.trim() !== '').length));
  const typical = widest.sort((x, y) => x - y)[Math.floor(widest.length / 2)] ?? 1;
  check('a typical changed row marks a minority of its tokens', typical < 0.5,
    `median marked fraction ${typical.toFixed(2)}`);

  check('every jump target really is a difference',
    d.jumpTargets.every(i => d.rows[i].kind !== 'same' && d.rows[i].cls !== 'volatile'));
  eq('the jump list matches the count', d.jumpTargets.length, d.substantive);

  // Same file against itself must come back clean, or the diff is finding
  // differences in its own reading of a file.
  const self = diffReports(a, a);
  check('a report against itself is identical', self.identical);
  eq('and reports nothing', self.substantive, 0);
}

console.log(`\n${'═'.repeat(46)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(46)}\n`);

if (failed > 0) process.exit(1);
