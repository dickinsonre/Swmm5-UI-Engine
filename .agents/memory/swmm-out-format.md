---
name: SWMM .out binary header layout
description: Correct header layout for parsing EPA SWMM5 binary .out files — sections are interleaved, not grouped.
---

# SWMM .out binary header layout

The rule: in a SWMM5 `.out` file, the input-property section is **interleaved per object class** — for subcatchments, then nodes, then links, each writes `count (INT4) → property codes (INT4×count) → values (REAL4×count×nObjects)` before the next class begins. After that comes a **reporting-variables section** (count + codes for subcatch, node, link, and system vars) that must be consumed before the report start date (REAL8) and report step (INT4).

**Why:** An earlier parser read all three counts/codes first and then all values, and skipped the reporting-variables section entirely. This misaligned the offset — a float's bit pattern was read as a count (e.g. area 15.0 → ~1.1 billion) causing RangeError on any model with subcatchments. Small models silently fell back to .rpt parsing, hiding the bug until a large model (Greenville) failed visibly.

## The property records mix INT4 and REAL4

The rule: inside a property-value record, where the **first property code is the type code**, the engine writes that first slot as an **INT4** and every remaining slot as REAL4. This applies to the node record and the link record. Read the type slot with an integer read, never a float read.

**Why:** the record length is identical either way, so reading the type as a float keeps every later offset correct and the parse "succeeds". But a small integer's bit pattern read as float32 is a denormal that rounds to zero, so every link reads back as type 0 — CONDUIT. Any logic that filters by type then silently includes exactly what it meant to exclude: a weir (type 3) gets counted as a conduit, and a "conduits only" comparison quietly compares the control structures too. Nothing errors and no offset drifts, so the only symptom is a wrong answer that looks well-formed.

**How to apply:** this only bites code that reads the property *values*. The app's own `swmm-out-parser.ts` skips these sections by byte count and never reads them, so it is unaffected — but anything new that wants link/node types (comparison, filtering, census) must do the integer read. Confirm against a model with a non-conduit link: a census that reports every link as a conduit is the tell, not an exception.

**How to apply (layout):** When touching `swmm-out-parser.ts`, keep the interleaved order and use the variable counts read *from the file* (they include pollutants), not computed `8+nPollutants` guesses. The closing records (last 6 INT4s: 3 byte positions, nPeriods, error code, magic) provide the authoritative results-start byte position at `byteLength - 16` — prefer it over the running offset. Validate against a real engine run: `/home/runner/workspace/swmm-engine/runswmm model.inp model.rpt model.out`.
