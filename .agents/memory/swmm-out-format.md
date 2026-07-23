---
name: SWMM .out binary header layout
description: Correct header layout for parsing EPA SWMM5 binary .out files — sections are interleaved, not grouped.
---

# SWMM .out binary header layout

The rule: in a SWMM5 `.out` file, the input-property section is **interleaved per object class** — for subcatchments, then nodes, then links, each writes `count (INT4) → property codes (INT4×count) → values (REAL4×count×nObjects)` before the next class begins. After that comes a **reporting-variables section** (count + codes for subcatch, node, link, and system vars) that must be consumed before the report start date (REAL8) and report step (INT4).

**Why:** An earlier parser read all three counts/codes first and then all values, and skipped the reporting-variables section entirely. This misaligned the offset — a float's bit pattern was read as a count (e.g. area 15.0 → ~1.1 billion) causing RangeError on any model with subcatchments. Small models silently fell back to .rpt parsing, hiding the bug until a large model (Greenville) failed visibly.

**How to apply:** When touching `swmm-out-parser.ts`, keep the interleaved order and use the variable counts read *from the file* (they include pollutants), not computed `8+nPollutants` guesses. The closing records (last 6 INT4s: 3 byte positions, nPeriods, error code, magic) provide the authoritative results-start byte position at `byteLength - 16` — prefer it over the running offset. Validate against a real engine run: `/home/runner/workspace/swmm-engine/runswmm model.inp model.rpt model.out`.
