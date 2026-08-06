# SWMM5-UI

## Overview
Web-based interface for the EPA Storm Water Management Model (SWMM5). Desktop-like engineering UI for stormwater network visualization, simulation, and analysis: INP file parsing/writing, canvas network map, 4 simulation engines, CFL stability analysis, calibration tools, diagnostics, and GIS/CAD/CSV import/export.

## User Preferences
(none recorded yet)

## Architecture
- **Frontend**: React 18, TypeScript, Tailwind, Vite. All SWMM data lives client-side as parsed `SwmmProject` objects.
- **Backend**: Express (`server/routes.ts`) — GitHub file proxy, local SWMM engine runner, BatchSWMM remote proxy with WebSocket.
- **No database** — everything is client-side INP parsing.
- Main UI: `client/src/pages/swmm-ui.tsx` (very large, ~7k lines: all state, toolbars, dialogs).

## Simulation Engines (priority: Local > WASM > Remote > Mock)
- **Local** (green `#2a8a4a`): SWMM 5.2.4 binary at `swmm-engine/runswmm`, via `/api/swmm/run-or-proxy`; falls back to Remote in production.
- **WASM** (orange `#e88a1a`): SWMM 5.2.4 compiled with Emscripten; `client/public/swmm_engine.{js,wasm}`, lazily loaded.
- **Remote** (blue `#2c6eb5`): BatchSWMM cloud API `https://batch-swmm-runner-robertdickinson.replit.app` (upload → WebSocket progress → results).
- **Mock** (gray): synthetic results.
- Engine adapters in `client/src/lib/swmm-engine.ts`; all 4 call `computeExtendedVariables()` after simulation.

## Design Theme (EPANET-style)
Title `#2c3e6b`, menu `#3a5070`, toolbar/status `#f0f0f4`, panels `#f8f8fa`, borders `#d0d0d8`, text `#2a2a3e`/`#6b6b7b`, accent blue `#2c6eb5`.

## Core Libraries (`client/src/lib/`)
- `swmm-types.ts` — all interfaces (SwmmProject, SimulationResults, …)
- `inp-parser.ts` — parser + writer (`projectToInp`), 30+ sections. Gotchas:
  - Curves: `Record<string, CurvePoint[]>`, first point stores `type`. Timeseries: `Record<string, TimeSeriesPoint[]>`; 4-token `Name Date Time Value` combined into dateTime; FILE-backed timeseries skipped.
  - Outfalls FREE/NORMAL have no stageData; Storage TABULAR takes 1 curveParam, FUNCTIONAL takes 3; XSection geom1 is `number | string` (string = transect ref for IRREGULAR).
  - All `;` comment lines filtered in `extractSections()`; DAILY patterns chunk 7, others 6; unknown sections preserved verbatim in `rawSections`.
  - Node/link validation on parse: links filtered by valid node IDs, xsections/DWF by valid links/nodes, COVERAGES/BUILDUP/WASHOFF rawSections by valid landuses.
- `swmm-out-parser.ts` — binary .out parser
- `cfl-analysis.ts` — CFL stability analysis + discretization
- `phase-space.ts` — instability metrics, trajectory extraction, Manning Q(y) curves, model-wide attention sweep
- `import-export.ts` — CSV/DXF/GeoJSON
- `autosave.ts` — localStorage snapshots (max 5, quota-safe); wired via isModified tracking + 3s debounce; `IntegrityStatus.tsx` shows title-bar chip + recovery dialog
- `roundtrip-audit.ts` — in-app export→re-parse→diff audit (Project toolbar "Audit")
- `swmm-variables.ts` — 200+ extended variable catalog (NODE_SOLVER, LINK_MOMENTUM, SUB_RUNOFF, SYS, … categories); access via `result.extended?.[key]`. `computeExtendedVariables()` (swmm-engine.ts) does 3-level hydraulic diagnostics: cross-section geometry, Froude/friction/Bernoulli energy balance, DQ1–DQ6 momentum terms, node solver state, infiltration state; SI/US unit-aware from FLOW_UNITS; multi-barrel conduit support.

## Components (`client/src/components/swmm/`)
- `NetworkMap.tsx` — canvas map: pan/zoom, hit-testing, depth fill, minimap, backdrop image, flooding halos, flow arrows, link width scaling, CFL link theme
- `ProjectExplorer.tsx` — tree + property panel + data grid, inline editing for all 11 object types (`EDITABLE_FIELDS`, `GRID_EDITABLE_COLS`); conduit rows show cross-section thumbnails
- `PropertyEditor.tsx` — docked property grid, schemas for 12 object types, validation/clamping, conditional visibility, [...] subdialog buttons, results panel
- `SubDialogs.tsx` — 8 modal editors (inflows, DWF, timeseries, curves, patterns, LID usage, groundwater, treatment, control rules); `SubDialogRouter` dispatches by type
- `Panels.tsx` — Legend/Layers, Object Locator, Map Query
- `SpeedBar.tsx` — drawing-mode tool palette
- `AnalysisOptionsDialog.tsx` — full Analysis Options tabs
- `DataEditors.tsx` — tabbed editors (timeseries/curves/patterns/controls/pollutants/landuses/LID/evaporation/aquifers) with charts; schematic SVGs from `SchematicImages.tsx` (LID, groundwater, snowpack)
- `TableViewDialog.tsx` — result tables by Object or by Variable; Node/Link/Subcatchment/System categories (27 system vars)
- `AIAssistPanel.tsx` — Errors (25+ diagnostic rules; exported `runDiagnostics` powers red toolbar badge), Parameters (soil/pipe/landuse lookup tables), Insights, Auto-Fix
- `PhaseSpaceDialog.tsx` — phase-space diagnostics (Project toolbar "Phase" or context menu)
- `DiagramGallery.tsx` — "Diagrams" toolbar button; 16 diagram cards (D1–D8 inputs always available; D9–D16 outputs need results): shape gallery, pump/storage/rating curves, hyetographs, LID layer-cakes, pattern library, system hydrograph, trunk-path HGL profile, flow-duration, depth-vs-flow scatter, continuity gauges, capacity heatmap, storage utilization, thematic mini-map
- `RptHtmlView.tsx` — HTML mode of the report viewer: `parseRptSections()` splits .rpt on star banners, parses fixed-width tables, renders collapsible sections with sortable tables + per-numeric-column bar charts (top 40)
- `HelpManualsDialog.tsx` — Help > Manuals: 3 extracted CHM manuals in `client/public/help/` (.hhc TOC parser, sandboxed iframe, path allowlist) + external Manual Search tab
- `Viewer3DDialog.tsx` + `client/public/3d-viewer.html` — three.js 3D viewer in sandboxed iframe, postMessage handshake (`load-inp` / `swmm3d-ready` / `swmm3d-loaded`), Project toolbar "3D"
- `AppsLauncherDialog.tsx` — Help > Apps: user-editable external app links (localStorage `swmm-ui-app-links`), sandboxed iframe
- Others: `AboutDialog`, `ProjectDefaultsDialog`, `ModelHealthDialog` (grouped findings), `RoundTripAuditDialog`, `EngineDiagnosticsDialog`, `IntegrityStatus`

## Notable UI Features (in swmm-ui.tsx unless noted)
- **Report viewer**: searchable .rpt with highlighting, 9 quick-jump sections, Text/HTML toggle (see RptHtmlView)
- **Calibration Analysis dialog** (Expert mode, btn-calibration):
  - Create File tab: variable + category (clickable Node/Link/Subcatchment radios switch to first variable of that category), template generator, CSV import, .dat export, "Fill Blanks from Results". All-parameters mode: checkbox + Select All/Clear expand to every (location × variable) pair (per-row `varKey`); one .dat per variable on download/load (per-file buttons when >1); table render capped at 300 rows; location cells are inputs backed by 3 shared datalists; interval respected for ≥60-min steps; confirm guard >20k projected rows
  - Load Folder tab: bulk-load .dat/.txt/.cal files; `parseCalibrationFile` handles SWMM block format + filename-based variable inference
  - Observed-vs-simulated overlay: calibration points drawn as dots on the main time-series plot
- **Context menu / Find**: right-click objects (Properties, Copy/Paste, Reverse, Find Connected, Delete); Ctrl+F Find Object dialog
- **Profile plot** with EGL overlay (HGL + v²/2g, unit-aware)
- **Schematic vs GIS toggle** (auto-layout by longest path to outfall; editing disabled in schematic mode)
- **Statistics Report** with event analysis + exceedance/frequency/return-period curves
- **Scatter Plot dialog** (any variable vs any variable, r and R²)
- **Transect Editor** with live cross-section preview
- **Split-Screen Comparison** (second INP, side-by-side stats + diff table)
- **URL params**: `?inp=URL`, `?github=URL` auto-load models
- Animation speed slider; floating System Variables panel; System theme dropdown; file-load toasts include model summary; PropertyEditor units chip (SI/US)

## Testing
- `tests/roundtrip/` — INP round-trip suite: `npx tsx tests/roundtrip/run.ts` (parse → export → re-parse → deep-compare + field assertions). Fixtures in `tests/roundtrip/fixtures/`.
- `tests/e2e/table-context-menu-kbd.ts` — Playwright e2e for Table View context-menu keyboard nav: `npx tsx tests/e2e/table-context-menu-kbd.ts` (app must be running on :5000; uses system chromium via playwright-core).

## External Dependencies
- EPA SWMM 5.2.4 binary (local dev only); WASM engine bundled in client/public/
- BatchSWMM cloud API (remote fallback)
- GitHub API via proxy; browse dialog repo selector `GH_REPOS` in swmm-ui.tsx: SWMMEnablement/1729-SWMM5-Models (main), SWMMBobSWMM6/1729-SWMM5-Models-2030 (master)
- Recharts (charts/plots)
