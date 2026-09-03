# Modifications to the OpenSWMM 6 engine sources

This file is the notice required by **Apache License 2.0, section 4(b)** — "You
must cause any modified files to carry prominent notices stating that You
changed the files."

SWMM5-UI distributes the engine in **Object form** (the WebAssembly artifacts
below) and the modifications themselves in **Source form** (the patch in this
directory). The patch inserts a change notice at the top of every file it
touches, so the notice travels with the applied sources and not merely with the
patch; this file records the same information per file.

- **Upstream:** https://github.com/HydroCouple/openswmm.engine
- **Modified by:** Robert Dickinson
- **Patch:** `swmm-engine/patches/swmm6-lid-report.patch`

> **The branch determines the licence.** `swmm6_rel` is **Apache-2.0 with a
> NOTICE**; `develop` is **MIT, Copyright 2026 Caleb Buahin, with no NOTICE**;
> `main` is **MIT, Copyright (c) 2025 HydroCouple**. The two builds shipped here
> come from the first two, so they are under different licences. Check the
> branch before writing any notice.

> **Gap to close on the next engine rebuild:** the exact upstream commit SHA the
> current artifacts were built from was not recorded at build time. Record it
> here (and in `NOTICE`) the next time either engine is rebuilt — both are
> moving alpha lines, so "branch + version string" is weaker provenance than a
> SHA.

## Compiled artifacts these modifications produced

| Artifact | Built | Upstream branch | Licence |
|---|---|---|---|
| `client/public/wasm6/openswmm6.js` + `openswmm6.wasm` | 2026-08-09 | `swmm6_rel` (6.0.0-alpha.3) | Apache-2.0 |
| `client/public/wasm6dev/openswmm6dev.js` + `openswmm6dev.wasm` | 2026-08-11 | `develop` | MIT |

Each `.js` artifact carries its own licence and modification notice in a header
comment at the top of the file. The develop build's header must **not** be a
copy of the release build's — they are different licences.

The consolidated LID report (the new files below) is in the release build only.

> **The patch in this directory is the `swmm6_rel` patch.** It cannot rebuild
> the develop artifact: `develop` is a different branch under a different
> licence, and the LID-report files do not belong to it. The develop build
> carries only the three Emscripten build fixes (`IOThread.cpp`,
> `PluginFactory.cpp`, `swmm5.c`). If that artifact is ever rebuilt, cut and
> record a separate patch against a pinned `develop` commit rather than reusing
> this one.

## Modified files

### Emscripten build fixes — Robert Dickinson, 2026-08-09

| File | Change |
|---|---|
| `src/engine/plugins/PluginFactory.cpp` | Added `__EMSCRIPTEN__` to the platform `#if` so the factory compiles without native dynamic-library loading. |
| `src/engine/output/IOThread.cpp` | Under `__EMSCRIPTEN__`, output write tasks run inline instead of on a `std::thread` — the WASM build has no threads. |
| `src/legacy/engine/swmm5.c` | Removed the duplicate `omp_get_max_threads` fallback definition (the one in `project.c` is kept); both are linked in the single-object WASM build and collide. |

### Consolidated LID report — Robert Dickinson, 2026-08-13

Adds one `.lid` detailed-LID report covering every LID unit whose `[LID_USAGE]`
row carries a report-file token, matching the EPA SWMM 5 behaviour the UI's LID
viewer reads.

| File | Change |
|---|---|
| `src/engine/hydrology/LIDReport.cpp` | **New file**, authored for this project — it does not exist on any upstream branch. Writes the consolidated `.lid` report. Copyright 2026 Robert Dickinson, contributed under Apache-2.0 to match the tree it is added to. |
| `src/engine/hydrology/LIDReport.hpp` | **New file**, as above. Interface for it. |
| `src/engine/core/SWMMEngine.cpp` | Opens the LID report during `start()`; corrected LID runon area to spread over all replicates of a usage row (`area * number`, matching legacy `lid.c`). |
| `src/engine/core/SWMMEngine.hpp` | Holds the `LIDReport` member. |
| `src/engine/hydrology/LID.cpp` | Exposes the per-unit flux state the report needs. |
| `src/engine/hydrology/LID.hpp` | Declarations for the above. |

## If you ship the sources

Redistributing the *modified sources* (Source form) requires a prominent notice
**at the top of each file listed above**, for example:

```
// Modified 2026-08-13 by Robert Dickinson (SWMM5-UI): consolidated .lid
// detailed LID report. Original file from HydroCouple/openswmm.engine,
// branch swmm6_rel, licensed under the Apache License, Version 2.0.
```

Do not strip existing copyright, patent, trademark or EPA-provenance headers
while doing so — section 4(c) requires they stay put.
