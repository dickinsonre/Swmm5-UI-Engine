---
name: Consolidated .lid report + LID viewer
description: SWMM5 WASM engine writes one .lid file for all LID units; app has an animated LID Viewer. Build/verify recipe.
---

The vendored SWMM 5.2.4 source (`swmm-engine/Stormwater-Management-Model-5.2.4`) is modified (grep `LIDCONSOLIDATE` in `src/solver/lid.c|lid.h|lidproc.c`): all detailed LID unit reports go to ONE file — path = rpt path with `.lid` extension — with `[META]`/`[CONTROLS]`/`[RESULTS]` sections and a `subcatch\tlid\tunitNo` key prefixed to each row. The `[LID_USAGE]` RptFile token still selects which units report; its filename is ignored (`*` = none). `wasDry` dry-period compression is unchanged, so rows have time gaps — any integration over rows must skip intervals ≫ report step or it invents flow.

**Why:** one file survives the WASM MEMFS round-trip cheaply and feeds the LID Viewer dialog; per-unit files couldn't be discovered generically.

**How to apply / verify after any engine rebuild:**
- Rebuild `client/public/swmm_engine.js|.wasm` with emcc classic (NOT MODULARIZE) preserving the existing `_swmm_*` export list (pre-mod backup in `swmm-engine/backup/`).
- Gates: `node scripts/parity-lid.cjs <model.lid> tests/fixtures/golden-lid` (golden = stock per-unit files for `tests/fixtures/lid_test.inp`, produced by native runswmm) must PASS, and non-LID samples must produce byte-identical `.out` vs previous build.
- Client: `.lid` text flows as `SimulationResults.lidReportText` (direct + worker SWMM5 paths); viewer = `client/src/components/swmm/LidViewerDialog.tsx` (toolbar `btn-lid-viewer`, only when lidReportText present). Viewer has size budgets (60MB text / 20k rows/unit) — keep them.
- Native `runswmm` binary is stock — server/local engine runs still write per-unit files and get no viewer.
