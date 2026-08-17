# LID parity fixtures

These fixtures back the **LID Parity Gate** (`tests/lid-parity.test.ts`,
registered in `tests/run-all.sh`).

## Files

- `bc_s1.txt`, `pp_s2.txt`, `gr_s3.txt`, `rb_s4.txt` — **stock-engine** per-unit
  LID report files. Produced by the native EPA SWMM 5.2.4 binary
  (`swmm-engine/runswmm`) running `tests/fixtures/lid_test.inp`. These are the
  reference truth for LID math/layout. The stock engine writes one file per LID
  unit (names come from the `RptFile` column of the model's `[LID_USAGE]`).
- `stock.rpt` — the stock engine's `.rpt` for the same run (context).
- `consolidated.lid` — **the REAL consolidated `.lid` written by the patched
  SWMM5 WASM engine** (`client/public/swmm_engine.js` + `swmm_engine.wasm`,
  engine tag `5.2.4-lid1`) for the same model. The patched engine writes ONE
  consolidated file covering every LID unit; the stock engine does not. This is
  the artifact the parity gate compares against the stock per-unit goldens.

## Why this makes the gate real

The gate compares `consolidated.lid` (patched WASM output) against the per-unit
goldens (stock engine output), value-for-value, via
`checkLidParity` in `scripts/parity-lid.cjs`. Because the two sides come from
two DIFFERENT engines, the check genuinely catches the patched WASM build
changing LID math or output layout — which is the point of the gate. (The old
test reconstructed the `.lid` from the same goldens it compared against, so it
could never detect engine drift.)

## Regenerating

Regenerate the consolidated `.lid` whenever the patched SWMM5 WASM build
(`client/public/swmm_engine.*`) changes:

```bash
node scripts/gen-lid-fixture.cjs
```

That script loads the WASM in node, runs `tests/fixtures/lid_test.inp` in its
virtual filesystem, and writes `consolidated.lid` here. Then run the gate:

```bash
npx tsx tests/lid-parity.test.ts
```

If the parity check now FAILS, the WASM build changed LID results relative to
the stock engine — investigate before committing the regenerated fixture.

Note that the gate does not depend on this fixture being fresh: it runs the
current WASM artifact live on every run and compares that output to the stock
goldens. The committed file is provenance and a diagnostic baseline, and the
suite fails if it stops matching the live run — which is the signal to
regenerate it.

Regenerate the stock per-unit goldens (`bc_s1.txt`, …) whenever the model or the
stock engine changes, by running `swmm-engine/runswmm tests/fixtures/lid_test.inp`
in a temp dir and copying the produced `RptFile` outputs here.
