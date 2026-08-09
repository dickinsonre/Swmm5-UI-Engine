---
name: SWMM6 WASM engine
description: How the OpenSWMM 6 in-browser engine was built and the rules for driving it
---

Artifacts: `client/public/wasm6/openswmm6.js` + `.wasm` (MODULARIZE factory `createOswmm6Module`), built from HydroCouple/openswmm.engine `swmm6_rel` branch (6.0.0-alpha.3).

Build rules (full recipe in user's uploaded skill, `attached_assets/0_swmm-wasm-build_*.skill`):
- `export EM_CACHE=/tmp/emcache` first (Nix emscripten cache is read-only); emscripten + cmake via Nix system deps.
- Three source patches required: PluginFactory.cpp platform `#if` gets `__EMSCRIPTEN__`; IOThread.cpp runs write tasks inline (no std::thread) under `__EMSCRIPTEN__`; duplicate `omp_get_max_threads` fallback removed from legacy swmm5.c (project.c keeps it).
- `-fexceptions` on compile AND link or the run aborts right after parsing.
- CMake target is `openswmm_engine` (not `openswmm.engine`); lib lands at `build-wasm/src/engine/libopenswmm.engine.a`; link `src/cli/main.cpp` with `-I include -I include/openswmm/engine -I build-wasm/include`.
- GEOPACKAGE/2D/GPU CMake options OFF → zero external deps.

Run rules (client, `createWasm6Engine` in swmm-engine.ts):
- FRESH module instance per run (handle API + MEMFS contamination); wasm binary fetch is cached, factory call is not.
- `noInitialRun: true` — the glue has `main()` and auto-runs with no argv otherwise ("not enough arguments" stderr).
- Call `swmm_engine_run(inp, rpt, out, NULL)` via ccall with 4 args; Emscripten `ExitStatus` with status 0 must be treated as success.
- **Never trust exit code**: SWMM6 exits 0 on fatal parses — verify the .rpt has no `ERROR nnn` lines and results exist.
- `.out` is classic SWMM5 binary layout (same magic, version 60000) — the existing `parseSwmmOut` reads it unchanged.
- Confirm which engine ran from the `.rpt` header ("OPENSWMM ENGINE - VERSION 6.0.0-alpha.3"), never from assumptions.
