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
- **WASM** (orange `#e88a1a`): EPA SWMM 5.1 (Build 5.1.015) in-browser engine compiled via Emscripten. Files in `client/public/`: `swmm_engine.js`, `js.wasm`, `js.data`. No server round-trip needed. Module loaded lazily on first run, cached for subsequent runs.
- **Remote** (blue `#2c6eb5`): BatchSWMM cloud API at `https://batch-swmm-runner-robertdickinson.replit.app`. Upload → WebSocket progress → results.
- **Mock** (gray): Synthetic results for testing, no engine needed.

Priority on startup: Local > WASM > Remote > Mock (first available wins).

## Key Files
- `client/src/pages/swmm-ui.tsx` — Main UI component (~4300 lines), all state, toolbars, dialogs, canvas
- `client/src/components/swmm/NetworkMap.tsx` — Canvas network map with pan/zoom, hit-testing, depth fill, overview minimap, backdrop image overlay, adjustable node size, flooding halos (pulsing red for flooding nodes), flow direction arrows (reverse on negative flow), link width scaling (sqrt-based with flow magnitude)
- `client/src/components/swmm/ProjectExplorer.tsx` — Tree navigation, property panel (inline edit), data grid (inline edit). Editable fields defined in `EDITABLE_FIELDS` (property panel) and `GRID_EDITABLE_COLS` (data grid) covering all 11 object types with full field coverage (conduit offsets/initFlow/maxFlow, subcatchment subarea params via `project.subareas` Record, pump startup/shutoff, weir ec/gated, orifice gated, outlet curveOrTable, storage fevap, raingage sourceType/sourceName, divider initDepth). Supports both array-based and Record-based collections for editing.
- `client/src/components/swmm/Panels.tsx` — Legend/Layers, Object Locator, Map Query panels
- `client/src/components/swmm/SpeedBar.tsx` — Vertical tool palette for drawing modes (junction, outfall, storage, divider, conduit, pump, orifice, weir, outlet, subcatchment polygon, raingage, label, group select, measure)
- `client/src/components/swmm/AnalysisOptionsDialog.tsx` — Full Analysis Options with General, Dates, Time Steps, Dynamic Wave, Interface Files tabs
- `client/src/components/swmm/DataEditors.tsx` — Tabbed data editors: Time Series (with chart), Curves (with chart), Patterns (with bar chart), Controls (with syntax highlighting), Pollutants, Land Uses, LID Controls (with editable layers), Evaporation, Aquifers
- `client/src/components/swmm/AboutDialog.tsx` — About/version dialog
- `client/src/components/swmm/ProjectDefaultsDialog.tsx` — Project defaults for new objects (ID prefixes, subcatchment/node/link/conduit defaults)
- `client/src/components/swmm/TableViewDialog.tsx` — Tabular result views: by Object (all timesteps) or by Variable (all objects at one timestep). Supports Node, Link, Subcatchment, and System categories. System category shows 27 system-wide variables (temperature, rainfall, runoff, flooding, storage, continuity error, iterations, etc.) across all timesteps.
- `client/src/lib/swmm-types.ts` — All TypeScript interfaces (SwmmProject, SimulationResults, etc.)
- `client/src/lib/inp-parser.ts` — INP file parser + writer (projectToInp), 30+ sections
- `client/src/lib/swmm-out-parser.ts` — Binary .out file parser
- `client/src/lib/swmm-engine.ts` — Engine adapters (local, wasm, remote, mock)
- `client/src/lib/cfl-analysis.ts` — CFL stability analysis + discretization
- `client/src/lib/import-export.ts` — CSV/DXF/GeoJSON import/export
- Calibration File Creator — integrated in calibration dialog (Create File tab), supports variable selection (node depth/head/flooding, link flow/velocity/depth, subcatchment runoff/rainfall), template generation from simulation timesteps, CSV import, .dat file export
- `server/routes.ts` — Express API routes (GitHub proxy, SWMM run, BatchSWMM proxy)
- `client/public/swmm_engine.js`, `client/public/js.wasm`, `client/public/js.data` — WASM engine files

## INP Parser (inp-parser.ts)
Parses 30+ SWMM5 INP sections. Key data structures:
- **Curves**: `Record<string, CurvePoint[]>` — first point stores `type` (STORAGE, PUMP1, etc.)
- **Timeseries**: `Record<string, TimeSeriesPoint[]>` with dateTime+value. Parser handles 4-token `Name Date Time Value` format (date contains `/`, time contains `:`), combining date+time into single dateTime field. FILE-backed timeseries (`Name FILE filename`) are skipped.
- **Outfalls**: FREE/NORMAL types have no stageData field; FIXED/TIDAL/TIMESERIES types do
- **Storage**: TABULAR shape takes 1 curveParam (name); FUNCTIONAL takes 3 (A, B, C)
- **XSection geom1**: `number | string` — string for IRREGULAR shape (transect name reference)
- **Comment filtering**: `extractSections()` filters ALL lines starting with `;` (single or double), preventing ghost entries from comment lines in PUMPS/CURVES/etc.
- **Patterns**: DAILY patterns use chunk size 7 (Sun-Sat), all other types use 6
- **rawSections**: Unrecognized sections preserved verbatim for fidelity
- `projectToInp()` outputs all structured sections: TITLE, OPTIONS, REPORT, RAINGAGES, SUBCATCHMENTS, SUBAREAS, INFILTRATION, JUNCTIONS, OUTFALLS, DIVIDERS, STORAGE, CONDUITS, PUMPS, WEIRS, ORIFICES, OUTLETS, XSECTIONS, LOSSES, COORDINATES, POLYGONS, SYMBOLS, VERTICES, LID_CONTROLS, LID_USAGE, AQUIFERS, GROUNDWATER, SNOWPACKS, TRANSECTS, STREETS, INLETS, INLET_USAGE, TIMESERIES, CURVES, PATTERNS, CONTROLS, POLLUTANTS, LANDUSES, DWF, LABELS, MAP
- **Node/link validation**: conduits, pumps, weirs, orifices, outlets filtered by valid node IDs; xsections filtered by valid link IDs; DWF filtered by valid nodes; COVERAGES/BUILDUP/WASHOFF in rawSections filtered by valid landuse names

## Design Theme
- Title bar: `#2c3e6b`, Menu bar: `#3a5070`, Toolbar/status: `#f0f0f4`, Panels: `#f8f8fa`
- Borders: `#d0d0d8`, Primary text: `#2a2a3e`, Secondary: `#6b6b7b`, Accent blue: `#2c6eb5`
- Engine modes: local=`#2a8a4a`, wasm=`#e88a1a`, remote=`#2c6eb5`, mock=gray

## Context Menu & Find
- Right-click context menu on map objects: Properties, Copy ID, Copy, Paste, Reverse (links), Find Connected, Delete
- Right-click on empty canvas area: Find Object...
- Find Object dialog (Ctrl+F or toolbar "Find" button): search by ID across all object types, click result to pan/select
- `client/src/components/swmm/PropertyEditor.tsx` — Enhanced docked property grid with schemas for all 12 SWMM object types, collapsible sections, inline editing, cross-section SVG preview for conduits, results panel. Features: required field indicators (*), min/max validation with clamping and error indicators, conditional field visibility (visibleWhen), subdialog buttons ([...]) for complex fields (inflows, treatment, groundwater, LID, curves, time series), conduit loss coefficients (entry/exit/avg, flap gate, seepage), subcatchment infiltration parameters (method-adaptive: Green-Ampt, Horton, Curve Number), subarea routing with pctRouted. Subdialog buttons for reference fields (curves, time series, patterns) pass the referenced name to the editor; non-reference fields pass the object ID.
- `client/src/components/swmm/SubDialogs.tsx` — 8 modal sub-dialog editors opened from PropertyEditor [...] buttons: DirectInflowEditor (inflow timeseries/baseline per constituent), DWFEditor (dry weather flow with 4 pattern slots), TimeSeriesEditor (tabular data with live canvas graph + CSV import), CurveEditor (X-Y data with live graph, 10 curve types), PatternEditor (multiplier grid with bar chart preview, 4 pattern types), LIDUsageEditor (LID practice assignments per subcatchment), GroundwaterEditor (aquifer/node/coefficient form), TreatmentEditor (pollutant removal expressions), ControlRulesEditor (text editor with syntax validation, line numbers, keyword chips). All editors read/write actual SwmmProject data structures. SubDialogRouter dispatches by type string.
- `client/src/components/swmm/AIAssistPanel.tsx` — AI Assist sidebar panel with 4 tabs: Errors (25+ diagnostic rules covering network, connectivity, geometry, cross-section, subcatchment, options, duplicates with severity icons and click-to-select), Parameters (reference lookup tables: 11 soil types with Green-Ampt params, 14 pipe materials with Manning's N, 8 land use types with %imperv/Manning values), Insights (simulation results analysis: flooding count/severity, high velocity links, surcharged capacity, model statistics), Auto-Fix (automatic parameter estimation: conduit lengths from coordinates, subcatchment widths from area)

## Extended Variables (200+)
- `client/src/lib/swmm-variables.ts` — Variable catalog with 200+ SWMM inner-workings variables across scopes: NODE_SOLVER, NODE_RDII, LINK_MOMENTUM, LINK_GEOMETRY, LINK_ENERGY, LINK_COMPAT, LINK_PROPS, SUB_RUNOFF, SUB_LID, SUB_GW, SUB_SNOW, SUB_INFIL, SYS, SYS_QA, FLOW_CLASS. Exports `getNodeVarByKey()`, `getLinkVarByKey()`, `getSubVarByKey()`, `getSystemVarByKey()`, `getNodeCategories()`, `getLinkCategories()`, `getSubCategories()`, `getSystemCategories()`.
- Extended var access: `nodeResult.extended?.[key]`, `linkResult.extended?.[key]`, `subcatchResult.extended?.[key]`, `timeStep.system?.extended?.[key]`
- `computeExtendedVariables()` in swmm-engine.ts derives Froude, momentum, geometry, energy, GW, snow, LID, infiltration, system vars — called in all 4 engines after simulation
- Floating System Variables panel in map UI shows all system vars grouped by category, clickable to set theme variable
- View toolbar has System dropdown for system variable theming

## External Dependencies
- EPA SWMM 5.2.4 Binary (local dev only)
- SWMM WASM Engine v5.1.015 (bundled in client/public/, from epanet-swmm-5-generate.replit.app)
- BatchSWMM cloud API (remote fallback)
- GitHub API (file fetching via proxy)
- Recharts (time series graphs, profile plots)
