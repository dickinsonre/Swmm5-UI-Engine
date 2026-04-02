# SWMM5-UI

## Overview
SWMM5-UI is a web-based interface for the EPA Storm Water Management Model (SWMM5). It provides a desktop-like engineering UI for stormwater network visualization, simulation, and analysis. Key capabilities include parsing SWMM5 INP files, visualizing networks on a canvas map, running SWMM5 simulations, performing CFL stability analysis, and supporting GIS/CAD/CSV import/export functionalities.

## System Architecture
Client-server architecture with client-side SWMM data management.

**Frontend**: React 18, TypeScript, Tailwind CSS, Vite. EPANET-style theme with dark navy title/menu, white canvas, light gray panels. All SWMM data as parsed `SwmmProject` objects resides client-side.

**Backend**: Express.js. GitHub file proxy, local SWMM engine runner, remote BatchSWMM proxy with WebSocket support.

**No database** — all data processing is client-side based on INP file parsing.

## Simulation Engines (4 modes)
- **Local** (green `#2a8a4a`): EPA SWMM 5.2.4 binary at `/home/runner/workspace/swmm-engine/runswmm`. Uses `/api/swmm/run-or-proxy` endpoint. Auto-falls back to Remote if binary missing (production).
- **WASM** (orange `#e88a1a`): In-browser SWMM engine compiled via Emscripten. Files in `client/public/`: `swmm_engine.js`, `js.wasm`, `js.data`. No server round-trip needed. Module loaded lazily on first run, cached for subsequent runs.
- **Remote** (blue `#2c6eb5`): BatchSWMM cloud API at `https://batch-swmm-runner-robertdickinson.replit.app`. Upload → WebSocket progress → results.
- **Mock** (gray): Synthetic results for testing, no engine needed.

Priority on startup: Local > WASM > Remote > Mock (first available wins).

## Key Files
- `client/src/pages/swmm-ui.tsx` — Main UI component (~3100 lines), all state, toolbars, dialogs, canvas
- `client/src/components/swmm/NetworkMap.tsx` — Canvas network map with pan/zoom, hit-testing, depth fill
- `client/src/components/swmm/ProjectExplorer.tsx` — Tree navigation, property panel, data grid
- `client/src/components/swmm/Panels.tsx` — Legend/Layers, Object Locator, Map Query panels
- `client/src/components/swmm/SpeedBar.tsx` — Vertical tool palette for drawing modes
- `client/src/lib/swmm-types.ts` — All TypeScript interfaces (SwmmProject, SimulationResults, etc.)
- `client/src/lib/inp-parser.ts` — INP file parser + writer (projectToInp), 30+ sections
- `client/src/lib/swmm-out-parser.ts` — Binary .out file parser
- `client/src/lib/swmm-engine.ts` — Engine adapters (local, wasm, remote, mock)
- `client/src/lib/cfl-analysis.ts` — CFL stability analysis + discretization
- `client/src/lib/import-export.ts` — CSV/DXF/GeoJSON import/export
- `server/routes.ts` — Express API routes (GitHub proxy, SWMM run, BatchSWMM proxy)
- `client/public/swmm_engine.js`, `client/public/js.wasm`, `client/public/js.data` — WASM engine files

## INP Parser (inp-parser.ts)
Parses 30+ SWMM5 INP sections. Key data structures:
- **Curves**: `Record<string, CurvePoint[]>` — first point stores `type` (STORAGE, PUMP1, etc.)
- **Timeseries**: `Record<string, TimeSeriesPoint[]>` with dateTime+value
- **Outfalls**: FREE/NORMAL types have no stageData field; FIXED/TIDAL/TIMESERIES types do
- **Storage**: TABULAR shape takes 1 curveParam (name); FUNCTIONAL takes 3 (A, B, C)
- **rawSections**: Unrecognized sections preserved verbatim for fidelity
- `projectToInp()` outputs all sections including TIMESERIES, CURVES, PATTERNS, CONTROLS, DWF

## Design Theme
- Title bar: `#2c3e6b`, Menu bar: `#3a5070`, Toolbar/status: `#f0f0f4`, Panels: `#f8f8fa`
- Borders: `#d0d0d8`, Primary text: `#2a2a3e`, Secondary: `#6b6b7b`, Accent blue: `#2c6eb5`
- Engine modes: local=`#2a8a4a`, wasm=`#e88a1a`, remote=`#2c6eb5`, mock=gray

## External Dependencies
- EPA SWMM 5.2.4 Binary (local dev only)
- SWMM WASM Engine (bundled in client/public/, from epanet-swmm-5-generate.replit.app)
- BatchSWMM cloud API (remote fallback)
- GitHub API (file fetching via proxy)
- Recharts (time series graphs, profile plots)
