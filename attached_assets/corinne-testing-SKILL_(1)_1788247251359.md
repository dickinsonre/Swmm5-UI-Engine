---
name: corinne-testing
description: Corinne-type testing, the discipline from Corinne Wiesner-Friedman's exact-cross-section article (HydroCouple, Aug 2026). Ten checks that decide whether a physics or engine claim in one of Bob's apps is honest. Two descriptions agree by derivative, round-trip is the identity, diff the .out files instead of trusting continuity, null-effect control, census the test network, noise floor before any speed ratio, both sides of a knot, parity contract, numbered defect register, and a what-this-does-not-show block. Use whenever Bob (1) says Corinne-type testing, Wiesner-Friedman testing, test it her way, or the two-tables test, (2) claims a number is engine-verified, matches SWMM5/SWMM6/ICM/HEC-RAS, or is more accurate, (3) compares two engines, builds, .inp options or .out files, (4) quotes any speed ratio, (5) builds a Verify tab, comparator, sweep or round-trip, (6) writes a verification section for a post, TAC note or paper, or (7) finds an engine defect. Scripts verified on EPA 5.2.4; run, do not re-derive.
---

# Corinne-type testing

Her article moved a dynamic-wave hydrograph by 7% of peak, showed that the
model's own quality check could not see it, and was believed — with no
observed flow anywhere in the piece. That is the standard for any claim one of
Bob's apps makes about an engine: every number links to the measurement behind
it, every comparison carries its control, and the write-up says out loud what
it did not test.

The existing gates (engine-verified numbers, jsdom smoke, contrast, regression
fingerprint) check that an app *works*. These ten check that what it *says* is
true. Use them when the app's output is a claim, not just a picture.

## The ten tests

Each is a rule, the tell that it is being skipped, and where it lands in the
app sprint. Pick the ones the claim actually needs; the report template in
`references/verification-report.md` has a slot for each.

1. **Two descriptions of one object must agree by derivative.**
   T = dA/dy is the instance; the rule is general. Any time an app holds a
   stored quantity and something derivable from it — area and width, section
   factor and A·R^(2/3), .out volume and integrated flow, storage curve and
   reported depth-volume, runoff volume and rain × area × coefficient —
   differentiate or integrate one and diff it against the other over the whole
   range. Report the median disagreement, the fraction of range past 10 %, and
   the value where the app actually operates (dry-weather depth, not full).
   *Tell:* "both tables look right". *Lands in:* X-Section Explorer, Fourier
   fitter, any .out reader, any storage/LID app. `scripts/table-consistency.js`.

2. **A round trip is the identity, not "accurate".**
   depthOfArea ∘ areaOfDepth = id, or a still pond does not stay still. The
   physics form is the lake-at-rest test: zero forcing in, exactly zero change
   out; two cells at equal free surface with different inverts reconstruct the
   same surface. Any solver the app embeds gets this as a gate, with the
   tolerance stated. *Tell:* a round trip reported as "within 1 %". *Lands in:*
   Moonshine, Phase Space, Slot-Free, the St Venant probe, any FV or explicit
   scheme ported into JS.

3. **Never let the engine's own quality number be the only evidence.**
   Continuity balances volumes computed from the very geometry under test, so
   it closes whether or not the geometry is right. Measure the difference
   directly: every reporting period, per element, normalised to that element's
   own peak, after a magnitude floor removes elements whose peak is noise, as a
   distribution (fraction past 1 / 10 / 25 %, median, p90) at both the worst
   instant and time-averaged, and with the change in the peak itself reported
   separately from the change in shape and timing. *Tell:* "continuity 0.08 %
   in both runs, so nothing happened". *Lands in:* Differential Sweep,
   Four-Engine Comparator, Self-Play Lab, any A/B. `scripts/out-diff.js`.

4. **Every comparison carries a null-effect control.**
   Feature on but applied to nothing must reproduce the baseline byte for
   byte; the same input run twice must produce the same .out. Without this, a
   diff can be attributed to the wrong cause and nobody notices. *Tell:* a
   result table with no row where the answer is "identical". *Lands in:*
   everything that has a compare button. The Coverage tab's inert mutation is
   the same instrument on the .inp side.

5. **Census the test network before claiming coverage.**
   Bellinge was 953 circular pipes and 78 the feature could not compile, so it
   said nothing about gothic — and she said so. Count what the network
   contains (shapes, link types, routing options, surcharge state) and stratify
   the claim by it. The 1729 corpus is already stratified by node count;
   stratify by shape and feature when the claim is about a shape or feature.
   *Tell:* "tested on N models" with no breakdown. *Lands in:* the 2030 suite,
   the comparison selector, any sweep.

6. **Measure the noise floor before quoting a ratio.**
   Her machine showed 18 % run-to-run spread, so an uncontrolled before-and-
   after could not resolve the build-flag question, and she left it open.
   Interleave A and B, repeat, report the spread and the per-pair ratio range;
   if the range straddles 1.0 the ratio is not resolved. Label per-call
   microbenchmarks as such — they are a different measurement from whole-run
   wall time. *Tell:* "1.6× faster" with one run each. *Lands in:* every WASM
   timing, the optimizer racer, Anderson tests. `scripts/interleave-timing.js`.

7. **Evaluate both sides of a knot.**
   A slope quoted at a table node, a polygon vertex or a critical height is
   two numbers, because the derivative jumps there; she printed −34 % / +22 %
   for circular at 2 % depth and explained why. Any point metric checks whether
   its point sits on a knot of either description and reports both sides.
   *Tell:* one number at y/D = 0.02. *Lands in:* Two Tables, the Fourier
   fitter, anything with a piecewise fit or a critical-height split.

8. **State the parity contract and what breaks it.**
   Her LEGACY path is exact-equality against EPA 5.2.4, enforced by a build
   flag (`-ffp-contract=off`), and a contraction change moved 26 % of FV
   values. Every app that embeds an engine says which reference it matches,
   how closely (byte-for-byte .out, three decimals, continuity band) and on
   which models; a WASM build compared with the native binary on the same
   .inp files is the minimum. *Tell:* "runs the real engine" with no parity
   number. *Lands in:* every WASM runner, the browser runners, Lua playground.

9. **Keep a numbered defect register with reproductions.**
   `legacy_defects.md`, LD-1, LD-2 … each with the constants, the
   reproduction and the fix status. Engine findings scattered across project
   notes (MODIFIED_HORTON MaxInfil, SLOT vs EXTRAN, terminal-inlet ON-SAG,
   the alpha.2 metric-units inflow defect, MODBASKETHANDLE Geom2 = 0) are
   register entries waiting to be numbered. Template in
   `references/verification-report.md`. *Lands in:* the 2030 suite, the
   upstreaming work, every "found during the build" note.

10. **Separate the correctness claim from the predictive claim, then say what
    was not shown.** "The geometry is demonstrably more correct" is settled by
    construction; "the model is more accurate" needs observations she did not
    have, so she claimed the first and not the second. Every verification
    section ends with a *What this does not show* block: no field data, one
    network, one machine, dry weather, peak unchanged, exact for which shapes.
    *Tell:* a write-up with findings and no limits. *Lands in:* every Verify
    tab, every swmm5.org post, every TAC note.

## Controls that run before anything is said

- Same question: element sets, period counts, report step and flow units must
  match, or the comparison is refused rather than aligned by guesswork.
- Null effect: byte-identical files are reported as byte-identical and the
  comparison stops there. That line is a result, not a failure.
- Magnitude floor: 1 L/s for flow (converted to the file's units), 1 mm for
  depth, adjustable and always printed with the result.
- Conduits only by default. Pumps, orifices, weirs and outlets follow the
  conduits in link order and answer a different question; include them
  deliberately, never by accident.

## The scripts

All three run under plain node with no dependencies and were verified on
2026-09-01 against EPA SWMM 5.2.4 compiled from the v5.2.4 tag, on OWA
Example1 switched to DYNWAVE (A) and the same model with every conduit's n
changed 0.010 → 0.013 (B).

```
node scripts/out-diff.js A.out B.out [--floor F] [--node-floor D] [--all-links] [--csv rows.csv] [--json]
node scripts/table-consistency.js --shape CIRCULAR|GOTHIC [--at 0.02]
node scripts/table-consistency.js --area a.csv --width w.csv [--area-scale k] [--width-scale k] [--inverted] [--at y]
node scripts/interleave-timing.js -n 7 --a "cmd A" [--b "cmd B"]
```

What they measured, so a future run can be checked against it:

- `out-diff.js`: routing continuity moved −0.075 % → −0.069 % between A and B
  ("nothing happened"); 3 of 13 conduits diverged more than 10 % of their own
  peak (max 22.3 %), 12 of 14 node depths more than 10 % (max 73.5 %). The
  peak-change row equalled the worst-instant row — a roughness change
  **rescales** the answer, the opposite signature from her geometry change,
  and the script separates the two. A against a repeat run of A:
  byte-identical, reported as such.
- `table-consistency.js`: reproduces her CIRCULAR row (median 0.7 %, >10 %
  across 5 % of depth, −34 % / +22 % at the y/D = 0.02 knot) and her GOTHIC
  row (14.4 %, 65 %, +202 %) exactly from the 5.2.4 xsect.dat constants under
  plain piecewise-linear resampling. The engine's real `lookup()` applies a
  quadratic correction in the first two intervals and changes only the
  at-2 % column — the two-tables-one-pipe notes hold those numbers.
- `interleave-timing.js`: A median 0.067 s (spread 2.9 %), B 0.063 s (spread
  9.9 %), B/A 0.946× with per-pair ratios 0.880–0.973 — resolved because every
  pair agreed on the sign, quoted with the range.

## Reporting it

The Verify tab and the write-up share one shape, in `references/verification-
report.md`: a five-minute version that names the finding and its control in
one paragraph; the diagnostic that was blind and the measurement that was
not; the mechanism; what it costs, with the noise floor; a *What this does not
show* block; and a one-paragraph reproduction footer naming the files, the
option changed, the script and the flags. Numbers link to the tool result
that produced them; a number with no measurement behind it does not appear.

## Traps, all hit this session or in hers

- A comment or caption written *before* the run is a guess. The first draft of
  the timing script's header predicted the opposite outcome from the one it
  measured. Write the number after the tool result, never before.
- `gcc -O2` on Ubuntu 24 aborts the 5.2.4 CLI with "buffer overflow detected"
  at "Retrieving project data" — a `_FORTIFY_SOURCE` false positive. Build the
  reference engine with `-U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=0`; the
  binary is then reproducible run to run (verified byte-identical).
- "Every reporting period" is thin at an hourly REPORT_STEP. Set the report
  step to the routing step, or close to it, before an A/B is worth reading.
- A slope at a table node is two numbers; a metric evaluated at exactly 2 %,
  50 % or full depth is sitting on one for every 51-point table. Check.
- The gothic-family shapes have no area table: area comes from inverting the
  depth-of-area table, R from (S/A)^1.5 through the S table. Two more
  digitisations, two more chances to describe a different pipe.
- A silted conduit is not a smaller pipe — a flat bed in a round invert is
  wider at the water line. Conserve free-surface elevation, not depth, when a
  section changes mid-run, or adding sediment reads as adding capacity.
- Being outside a parity contract is not the same as differences being
  negligible: an explicit substepping scheme compounds bit-level changes.

## Relationship to the other skills

`swmm-vibe-coding-apps` is the build contract and `dark-mode-default` the
colour; this governs the evidence. The Invariant Console's twelve invariants
gate the *process* (review, SHA, ledger); these ten gate the *claim*. The
`overnight-agentic-runs` evidence rule — every progress claim audited against
a tool result — is the same rule at run time; this skill is what the tool
result has to contain. For the write-up itself use `x-article-writing`; the
two-tables-one-pipe project holds her twelve-move article format if the
piece wants to read like hers as well as test like hers.
