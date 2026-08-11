---
name: SWMM5 vs SWMM6 ID case sensitivity
description: SWMM5 matches object IDs case-insensitively; OpenSWMM 6 is case-sensitive (ERROR 209)
---

EPA SWMM 5.x upper-cases object IDs in its hash table, so a reference like `BOUNDARY@1020` finds a time series named `Boundary@1020`. OpenSWMM 6 matches IDs case-sensitively and fails with `ERROR 209: undefined object` on the same file. Users blame unrelated things (e.g. the `@` in the name) — check case first.

**How to apply:** the client parser normalizes case-insensitive timeseries/curve/pattern references to the defining object's exact name at parse time (`normalizeCaseInsensitiveRefs` in inp-parser.ts). Rules: only rewrite when the exact name is absent but a case-insensitive match exists; skip folded-name collisions (`Foo` + `FOO` are distinct under SWMM6); raw-preserved [INFLOWS] lines get in-place token substitution to keep spacing/inline comments. Raw sections like CONTROLS/EVAPORATION/TEMPERATURE/ADJUSTMENTS/AQUIFERS/LID_CONTROLS still carry unnormalized references (follow-up).
