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
- **WASM** (orange `#e88a1a`): EPA SWMM 5.2.4 in-browser engine compiled via Emscripten from source. Files in `client/public/`: `swmm_engine.js`, `swmm_engine.wasm`. No server round-trip needed. Module loaded lazily on first run, cached for subsequent runs.
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
- `client/src/components/swmm/SchematicImages.tsx` — Inline-SVG schematic diagrams (SWMM5-desktop style): LidSchematic (type-specific cross-sections for all 8 LID types), GroundwaterSchematic, SnowPackSchematic. Shown in DataEditors' LID Controls (above layers table), Aquifers, Groundwater, and Snow Packs tabs (right-side panel with caption, hidden on narrow screens)
- `client/src/components/swmm/AboutDialog.tsx` — About/version dialog
- `client/src/components/swmm/ProjectDefaultsDialog.tsx` — Project defaults for new objects (ID prefixes, subcatchment/node/link/conduit defaults)
- `client/src/components/swmm/TableViewDialog.tsx` — Tabular result views: by Object (all timesteps) or by Variable (all objects at one timestep). Supports Node, Link, Subcatchment, and System categories. System category shows 27 system-wide variables (temperature, rainfall, runoff, flooding, storage, continuity error, iterations, etc.) across all timesteps.
- `client/src/lib/swmm-types.ts` — All TypeScript interfaces (SwmmProject, SimulationResults, etc.)
- `client/src/lib/inp-parser.ts` — INP file parser + writer (projectToInp), 30+ sections
- `client/src/lib/swmm-out-parser.ts` — Binary .out file parser
- `client/src/lib/swmm-engine.ts` — Engine adapters (local, wasm, remote, mock)
- `client/src/lib/cfl-analysis.ts` — CFL stability analysis + discretization
- `client/src/lib/phase-space.ts` — Phase-space instability metrics (depth reversal %, flow oscillation index, surcharge chatter, sign reversals, composite score), trajectory extraction with rising/falling branches, dQ/dt-dh/dt derivatives, Manning normal-flow curve Q(y) for conduits (circular/rect/trapezoidal/triangular/parabolic), model-wide attention sweep ranking
- `client/src/components/swmm/PhaseSpaceDialog.tsx` — Phase-Space Diagnostics dialog: metric chips, flow-vs-depth scatter (green rising / red falling, dashed Manning overlay), derivative scatter, ranked attention-sweep table (click row to open phase plot). Opened via Project toolbar "Phase" button or context menu "Phase-Space Diagnostics" on nodes/links
- `client/src/lib/import-export.ts` — CSV/DXF/GeoJSON import/export
- `client/src/lib/autosave.ts` — localStorage autosave snapshots (max 5, quota-safe with eviction/disable). `client/src/components/swmm/IntegrityStatus.tsx` — title-bar integrity chip (Complete/Modified/Warnings/Errors/Unsupported/Mock), integrity report dialog with snapshot list + clear, startup recovery dialog. Wired in swmm-ui.tsx via isModified tracking (justLoadedRef guard on load paths) and 3s-debounced autosave
- `tests/roundtrip/` — INP round-trip audit suite: run with `npx tsx tests/roundtrip/run.ts`. Parses each fixture, exports via projectToInp, re-parses, deep-compares (normalized) and runs targeted field assertions. Fixtures in `tests/roundtrip/fixtures/`.
- Calibration File Creator — integrated in calibration dialog (Create File tab), supports variable selection (node depth/head/flooding, link flow/velocity/depth, subcatchment runoff/rainfall), template generation from simulation timesteps, CSV import, .dat file export, "Fill Blanks from Results" (fills empty values from nearest-timestep simulated results)
- Calibration Load Folder tab — bulk-load a folder of .dat/.txt/.cal calibration files (webkitdirectory input); parseCalibrationFile supports SWMM block format (station ID on own line + date/time/value or elapsed-time rows), takes optional fileName for dataset name + variable/category inference (CALIB_FILENAME_VARS) when no header directive; dataset table with editable variable/category, View/Remove
- Observed-vs-simulated overlay — main TimeSeriesPlotContent takes optional calibrationData prop; calibration points matching category + active variable + selected element are mapped to nearest result timestep and drawn as dot-only series with legend on the same graph as simulated lines
- `server/routes.ts` — Express API routes (GitHub proxy, SWMM run, BatchSWMM proxy)
- `client/public/swmm_engine.js`, `client/public/swmm_engine.wasm` — WASM engine files (compiled from SWMM 5.2.4 source)

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
- `computeExtendedVariables()` in swmm-engine.ts implements proper three-level SWMM5 hydraulic diagnostics:
  - **Level 2**: Cross-section geometry (CIRCULAR, RECT_CLOSED/OPEN, TRAPEZOIDAL with geom2=bottom width/geom3+geom4=side slopes, TRIANGULAR, HORIZ/VERT_ELLIPSE), proper Froude from celerity, friction slope from Manning inversion, Bernoulli energy balance (LHS/RHS with entry/exit/friction losses), head losses, node crown elevation, surcharge detection, dV/dt continuity
  - **Level 3**: DQ1-DQ6 momentum terms (inertia, pressure gradient, friction, minor losses, lateral, convective acceleration), sigma damping from Froude (1.0 at Fr<=0.5, 0.0 at Fr>=1.0, linear transition), momentum equation reconstruction (qRecon), node solver state (dQ/dH Jacobian from connected link sensitivities, NR denominator, signed F(H) residual, signed head correction), Green-Ampt/Horton/Curve Number infiltration state, subcatchment runoff breakdown
  - SI/US unit detection from project FLOW_UNITS option (g=9.81/32.174, phi=1.0/1.4859)
  - Multi-barrel conduit support (per-barrel flow for velocity/Froude/friction, barrel-scaled qFull)
  - Called in all 4 engines after simulation
- Floating System Variables panel in map UI shows all system vars grouped by category, clickable to set theme variable
- View toolbar has System dropdown for system variable theming

## Review-Driven UX Improvements
- AI Assist toolbar button shows a red error-count badge (`badge` prop on ToolbarButton; `runDiagnostics` exported from AIAssistPanel.tsx, counted via useMemo in swmm-ui.tsx)
- ModelHealthDialog groups repeated findings by severity + normalized message pattern (quoted IDs → "…", numbers → #) into expandable groups with counts; singles render flat; click-to-locate preserved
- File-load toasts (local, GitHub URL, GitHub browser) include model summary via `describeProject()` (nodes/links/subcatchments)
- PropertyEditor header shows a units chip (SI/US · FLOW_UNITS) via `isSIProject()`

## Help Manuals (CHM)
- `client/public/help/{userguide,basic,inlets}/` — Static HTML extracted from 3 EPA SWMM CHM files (User Guide, Basic Tutorial, Inlets Tutorial). TOC files: epaswmm5.hhc, tutorial.hhc, InletTutorial.hhc (CHM sitemap format).
- `client/src/components/swmm/HelpManualsDialog.tsx` — Help > Manuals dialog: manual tab selector, parseHhc() token-based .hhc TOC parser (nested UL/OBJECT sitemap), collapsible tree, sandboxed iframe viewer (`sandbox=""` — scripts blocked, opaque origin), page path allowlist validation, "Open in new tab" link. Inlets home page is inlet_analysis_with_swmm.htm (no introduction.htm). Fourth tab "Manual Search" embeds external https://sjswmm5manualsearch.com (externalUrl manual: no TOC sidebar, iframe sandbox allow-scripts/forms/popups).

## 3D Network Viewer
- `client/public/3d-viewer.html` — Standalone three.js 3D SWMM viewer (from attached asset). postMessage API: accepts `{type:'load-inp', inp, name}`, posts `{type:'swmm3d-ready'}` on boot, replies `{type:'swmm3d-loaded', ok, error?}`. Graceful no-WebGL fallback (overlay message + ok:false ack). Also supports `?inp=`/`?model=` URL params.
- `client/src/components/swmm/Viewer3DDialog.tsx` — Fullscreen dialog with sandboxed iframe (`allow-scripts allow-same-origin allow-downloads`); sends current model on ready handshake (resends until acked, 2.5s fallback), header status (Loading/Sending/Model loaded/error), Reload model + New tab buttons. Opened via Project toolbar "3D" button (openDialog==='viewer3d').

## Companion Apps Launcher
- `client/src/components/swmm/AppsLauncherDialog.tsx` — Help > Apps dialog: user-editable list of external web app links (name + URL, add/edit/delete, persisted in localStorage key `swmm-ui-app-links`), sandboxed iframe viewer (`allow-scripts allow-forms allow-popups allow-downloads`, no allow-same-origin), "Open in new tab" fallback, hint shown when host blocks embedding. Defaults preloaded: swmm5-swmm6-phase-space.netlify.app, swmm5-3d-viewer.netlify.app.

## Diagram Gallery (D1–D16, from Kimi design spec)
- `client/src/components/swmm/DiagramGallery.tsx` — "Diagrams" button in Project toolbar (btn-diagram-gallery) opens a full gallery dialog of 16 diagram cards per the SWMM5 Graphics Diagram Suite spec (attached_assets docx). Shared design system: light theme (#fafaf8/#ffffff/#e4e1da), muted categorical palette (slate #46677f, teal #4d8577, amber #c07f2e, brick #b04a41 + 4 extended), blue→amber→red capacity ramp, framed axes, monospaced source tags, ID chips (blue = Group A inputs, teal = Group B outputs), note line per card.
- Group A (inputs, always available): D1 cross-section shape gallery (reuses CrossSectionSvg, per-shape conduit counts), D2 pump curves by family (PUMP1–5 axis semantics), D3 storage depth-area curves + functional V(d) integration, D4 design-storm hyetographs (shared scale, per-step Δt cumulative overlay, gage-binding badges), D5 rating curves + boundary timeseries, D6 LID layer-cakes (relative thickness), D7 subcatchment idealization schematic (imperv/perv split, width/flow-length annotations, sub picker), D8 pattern library (hourly/weekend overlays, monthly/daily bars, 1.0 reference).
- Group B (outputs, need results; NeedsRun placeholder otherwise): D9 system hydrograph (system extended vars, fallback to summed subcatchment runoff; peak annotation), D10 trunk-path HGL profile (memoized longest-cumulative-length DFS to outfall, Max HGL vs snapshot toggles), D11 flow-duration curve (top-40 link picker, log toggle, P50/P90), D12 depth-vs-flow scatter (capacity-ramp hue rescaled to observed max, colorbar), D13 continuity gauges (green <1 %/amber/red ≥5 %), D14 16-link capacity heatmap (time matrix, fixed 0→≥1 scale), D15 storage utilization (depth-basis % full bars + top-3 depth traces), D16 thematic mini-map (imperv green ramp polygons, top-20 MaxQ link classes, node glyphs, legend, degenerate-polygon skip count).

## Review-Suggested Visualizations (Session 3)
- **EGL overlay in Profile plot**: ProfilePlotContent computes EGL = HGL + v²/2g (unit-aware gravity from FLOW_UNITS) per point, dashed red line alongside HGL/ground/crown/invert
- **CFL heatmap link theme**: "CFL (Courant #)" option in Links theme combo; `cflValues` Map (conduitId→courantNumber) passed to NetworkMap; 5-step legend ramp scaled to Courant/2
- **Schematic vs GIS toggle**: btn-schematic-toggle in View toolbar; `schematicProject` memo builds layered auto-layout (layer = longest path to outfall, bounded relaxation), clears vertices/polygons/symbols/labels; editing callbacks disabled in schematic mode; auto fitExtent on toggle
- **Cross-section thumbnails**: conduit data grid in ProjectExplorer has "Section" column rendering CrossSectionSvg (22px) per row (ColumnDef.render)

## New Features (Session 2)
- **Animation Speed Control**: Speed slider (20-500ms range, inverted for intuition) next to play/pause button, adjusts requestAnimationFrame interval
- **Enhanced Report Viewer**: Searchable `.rpt` viewer with match count, search highlighting (deterministic split-based), section navigation buttons (scrolls to first match), 9 quick-jump sections
- **Scatter Plot Dialog**: X-Y scatter with independent category/object/variable selectors for each axis, Pearson correlation coefficient (r) and R², Recharts ScatterChart
- **Frequency/Exceedance Curves**: Added to Statistics Report after event bar chart — exceedance probability curve (Weibull plotting position), cumulative frequency distribution, return period analysis (2-100yr)
- **Transect Editor**: Station-elevation table editor with add/remove rows, Manning's N (left/right/channel), bank station markers, live AreaChart cross-section preview, save to project
- **Split-Screen Comparison**: Load second INP file, mock-engine simulation for quick topology comparison, side-by-side summary stats, difference table (first 50 elements), % change calculation, bar chart of differences
- **URL-Based State**: `?inp=URL` and `?github=URL` query parameters auto-load INP files from raw URLs or GitHub blob URLs (converts to raw), falls back to default sample on failure
- **Extended Variable Stubs**: Pollutant WQ (washoff, buildup, conc in runoff/GW, total load), Snow (ATI, WATI, pack SWE, pack depth), LID (soil evap, drain coeff, retention) — all registered in swmm-variables.ts with SUB_POLLUT category

## External Dependencies
- EPA SWMM 5.2.4 Binary (local dev only)
- SWMM WASM Engine v5.2.4 (compiled from source via Emscripten, bundled in client/public/)
- BatchSWMM cloud API (remote fallback)
- GitHub API (file fetching via proxy). GitHub browse dialog has a repository selector (`GH_REPOS` in swmm-ui.tsx): SWMMEnablement/1729-SWMM5-Models (main) and SWMMBobSWMM6/1729-SWMM5-Models-2030 (master branch)
- Recharts (time series graphs, profile plots)
