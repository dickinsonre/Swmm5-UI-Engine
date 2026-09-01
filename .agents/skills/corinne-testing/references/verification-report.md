# Verification report template

One shape for the Verify tab and for the write-up. Fill the slots the claim
actually needs and delete the rest — an empty slot left in is worse than one
removed, because it reads as a measurement that returned nothing.

Two rules govern every slot below:

- **Every number links to the tool result that produced it.** A number with no
  measurement behind it does not appear. Not in a caption, not in a summary
  line, not as "roughly".
- **Write the number after the tool result, never before.** A sentence drafted
  in advance is a prediction, and predictions in this format are read as
  findings.

---

## 1. The five-minute version

One paragraph. Name the finding **and its control** together, so the claim
cannot be quoted without the thing that makes it a claim.

> Changing every conduit's roughness from 0.010 to 0.013 moved node depths by
> up to 14.5 % of their own peak, while the routing continuity error moved from
> −0.018 % to −0.019 %. The same model run twice produces a byte-identical
> `.out`, so the difference is the roughness change and not run-to-run
> variation.

Say which kind of claim this is, in the sentence:

- a **correctness** claim — settled by construction, no observations needed
  ("these two tables describe different pipes");
- a **predictive** claim — needs field data ("this model is more accurate").

Do not let the first silently do duty for the second.

## 2. The diagnostic that was blind, and the measurement that was not

State the quality number that did *not* see it, then the measurement that did.
This is the heart of the report; without the blind diagnostic beside it, the
measurement has no contrast and reads as a bare number.

| | before | after |
|---|---|---|
| routing continuity | | |
| worst element, fraction of its own peak | | |
| elements past 10 % of their own peak | | |

Report the distribution, not one number: fraction past 1 / 10 / 25 %, median,
p90, at **both** the worst instant and time-averaged. Report the change in the
peak **separately** from the change in shape and timing — a rescaling and a
reshaping are different findings and the same summary statistic hides both.

Tool: `scripts/out-diff.js A.out B.out`

## 3. Controls

Every row is filled or struck. A comparison with no "identical" row anywhere in
its history has not been controlled.

| control | how | result |
|---|---|---|
| same question | element sets, period counts, report step, flow units | |
| null effect | feature on, applied to nothing / same input twice | |
| magnitude floor | 1 L/s flow, 1 mm depth, in the file's units | |
| link types | conduits only, or say which others and why | |
| noise floor | interleaved A/B, per-pair ratio range | |

## 4. Census of what was tested

Counts, not adjectives. "Tested on N models" with no breakdown is not a census.

- models, and how they were selected
- shapes present, and shapes absent
- link types, routing options, surcharge state
- what the network **cannot** speak to

Stratify the claim by whatever it is about. A claim about a shape needs a count
by shape; a claim about a feature needs a count by feature.

## 5. Mechanism

Why the numbers came out this way. One paragraph, and it must be falsifiable —
if the mechanism is right, something else should also be true. Say what that is.

## 6. What it costs

Run time, memory, file size, build flags. Quote a ratio **only** with the noise
floor beside it and the per-pair range. If the range straddles 1.0, the ratio
is unresolved; say so and give the range instead. "Unresolved" is a finding.

Tool: `scripts/interleave-timing.js -n 7 --a "..." --b "..."`

## 7. Parity contract

- reference this is matched against, and its exact version
- how closely: byte-for-byte `.out`, three decimals, a continuity band
- on which models
- what breaks it — build flags, fast-math, contraction, substepping

Being outside a parity contract is not the same as the differences being
negligible. An explicit scheme compounds bit-level changes; say which case
applies.

## 8. What this does not show

Mandatory. A write-up with findings and no limits is incomplete regardless of
how good the findings are. Be specific — a generic disclaimer is not this
block.

- no field data / no observed flow anywhere in this
- one network, one event, one machine
- dry weather only, or wet only
- peak unchanged, or shape unchanged
- exact for which shapes, unknown for which
- correctness shown, predictive accuracy not shown

## 9. Defect register entries

Anything found along the way gets a number here and a home in the register, or
it will be rediscovered.

```
LD-n  <one-line title>
      Constants:      <the exact values that trigger it>
      Reproduction:   <smallest input + command>
      Observed:       <what happens>
      Expected:       <why that is wrong>
      Status:         open | fixed <where> | upstreamed <link>
```

## 10. Reproduction footer

One paragraph a reader can run. Name the files, the single option changed, the
script, the flags, and the engine build.

> `A.inp` and `B.inp` differ only in `[CONDUITS]` roughness (0.010 → 0.013).
> Both run through EPA SWMM 5.2.4 built from the v5.2.4 tag with
> `-U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=0`. Compared with
> `node scripts/out-diff.js A.out B.out --csv rows.csv`.

If the reproduction cannot be written in one paragraph, the experiment is not
yet a result.
