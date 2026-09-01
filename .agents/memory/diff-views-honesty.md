---
name: Building a diff view that can be trusted
description: Rules for any side-by-side/diff instrument in this app — token correspondence, noise classes, and alignment cost — and the specific ways each one fails silently.
---

# Building a diff view that can be trusted

A diff over two engine reports has two failure modes, and **both render as a
perfectly normal-looking screen**: it can hide a real difference, or it can
report so many that the count stops meaning anything. Neither throws. Neither
shows up in a screenshot. Only adversarial tests catch them.

## Match table tokens by column position, never by content

Report rows are positional — column three is column three on both sides. An
LCS/content match over tokens is the obvious implementation and it is wrong.

**Why:** given `C1 10 20` against `C1 20 30`, content matching pairs A's third
column with B's second because both read `20`. It then marks only `10` and `30`,
leaves the genuinely changed third column unmarked, and reports the row as a
single 10→30 change (a fabricated 200%). Worse, `1 2` against `2 1` matches both
tokens across and reports *no numeric change* for a row whose values swapped.

**How to apply:** when both lines have the same number of value tokens, pair by
index. Fall back to an LCS only when the counts differ — and in that case report
the row as changed but publish **no delta**, because there is no correspondence
to compute one from. Never highlight whitespace tokens; a changed column width
is not a finding.

## Noise classes must be narrow, and must require both sides

Timestamps, engine banners, and column padding differ between any two runs and
say nothing about results. They have to be excluded from the headline count or
every comparison reports differences. But the exclusion itself is dangerous.

**Why:** a volatile pattern matching the bare substring of an engine name
reclassifies any real data row that happens to name the engine as noise —
dropping a genuine difference from the count *and* from the jump list. That is
precisely the failure the tool exists to prevent, committed by the code meant
to prevent it.

**How to apply:** anchor noise patterns to the start of the line and to known
generated formats. For a changed pair, require **both** sides to match the noise
shape — a banner opposite a data row is a misalignment worth counting, not
noise. Always show excluded rows, dimmed and labelled with which exclusion
applied; never drop them from the document. State the exclusion on screen.

## Alignment cost is a UI-thread hazard, and the fallback lies

The full DP table for two 4,000-line regions is ~64 MiB allocated synchronously
when the user clicks a tab — enough to stall or kill a constrained browser tab.

**How to apply:** use Hirschberg (linear space) for the alignment, and split
large inputs first on **unique common lines** (patience anchoring) so a big
near-identical pair becomes many tiny exact alignments rather than one huge one.
Reports are full of such anchors: section headings and element IDs. Reserve
positional comparison for a region with no shared anchor at all, and surface it
on screen — comparing by position cascades after a single inserted line, so
every following row reads as changed and the view is actively misleading.

## Hiding unchanged bulk requires gap markers

A "differences only" filter that concatenates the context around difference #1
with the context around difference #50 puts two distant lines adjacent and
asserts they are neighbours. Emit an explicit "N lines hidden" marker at every
break — **including a leading one**, or the view opens mid-document dressed as
the top of the file. Test the accounting: shown + hidden must equal the total.
