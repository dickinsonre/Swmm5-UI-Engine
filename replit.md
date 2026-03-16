# SWMM5-UI

## Overview
Web-based interface for EPA SWMM5 (Storm Water Management Model). Reads SWMM5 INP files from desktop or GitHub, visualizes stormwater networks on a canvas map, and runs the SWMM5 engine (mock/WASM). Full desktop-like engineering UI with object creation, manipulation, and group editing.

## Architecture
- **Frontend**: React + TypeScript + Tailwind CSS with light EPANET-style theme (dark navy menu bar, white map canvas, light gray panels)
- **Backend**: Express.js (minimal - just GitHub proxy endpoint)
- **No database required** - all data is client-side INP file parsing

## Key Files
### Frontend
- `client/src/pages/swmm-ui.tsx` - Main page layout (menus, toolbar, status bar, file handling, preferences, context menus, group editing, object creation/manipulation callbacks)
- `client/src/components/swmm/NetworkMap.tsx` - Canvas-based network visualization with pan/zoom, hit-testing, rubber-band drawing, group polygon rendering, tooltip overlay
- `client/src/components/swmm/Panels.tsx` - Legend panel, Object Locator, Map Query panel
- `client/src/components/swmm/ProjectExplorer.tsx` - Full HTML Project Explorer with tree navigation, search, context menus, data grid overlay, property editor
- `client/src/components/swmm/SpeedBar.tsx` - Speed bar with interaction mode buttons (vertical on desktop, horizontal scrollable bottom bar on mobile)
- `client/src/lib/swmm-types.ts` - TypeScript interfaces for all SWMM5 model objects
- `client/src/lib/inp-parser.ts` - Complete SWMM5 INP file parser and INP file rebuild with safe column padding (`padField`)
- `client/src/lib/swmm-engine.ts` - Remote/mock/local engine wrapper with WebSocket progress
- `client/src/lib/swmm-out-parser.ts` - SWMM binary .out file parser (header, element names, per-timestep float32 arrays)
- `client/src/lib/cfl-analysis.ts` - ReSWMM CFL analysis and conduit discretization engine
- `client/src/lib/import-export.ts` - CSV, DXF, and GeoJSON import/export utilities for nodes and links

### Backend
- `server/routes.ts` - GitHub file proxy (`/api/fetch-github`, SSRF-secured), GitHub repo browser (`/api/github-browse`), SWMM engine proxy (`/api/swmm-proxy/*`), WebSocket proxy for BatchSWMM progress

## Features
- Parse all SWMM5 INP sections: TITLE, OPTIONS, RAINGAGES, SUBCATCHMENTS, SUBAREAS, INFILTRATION, JUNCTIONS, OUTFALLS, DIVIDERS, STORAGE, CONDUITS, PUMPS, ORIFICES, WEIRS, OUTLETS, XSECTIONS, LOSSES, CURVES, TIMESERIES, PATTERNS, CONTROLS, DWF, POLLUTANTS, LANDUSES, COORDINATES, VERTICES, POLYGONS, SYMBOLS, LABELS, MAP
- Canvas network map with pan (drag), zoom (scroll), and element selection (nodes, links, subcatchments)
- Layer visibility toggles for junctions, outfalls, storage, conduits, pumps, subcatchments, labels, raingages
- Link hit-testing with point-to-segment distance calculation
- Project Explorer tree with expandable categories and element counts
- Property editor showing selected element details + simulation results
- Map legend with subcatchment/node/link theme selection
- Time slider and animation for simulation results
- File open from desktop (drag & drop or file picker) and GitHub URL
- Save/export INP file
- Mock simulation engine (ready for WASM integration)

### Interactive Features (T001-T010)
- **Speed Bar**: Vertical icon toolbar for interaction mode selection (Select, Add Junction, Add Outfall, Add Storage, Add Conduit, Add Pump, Add Label, Group Select, Delete, Run, Full Extent)
- **Node Creation**: Click map in add-node mode to place junctions/outfalls/storage units with auto-generated IDs
- **Link Drawing**: Click start node → optional intermediate vertices → click end node to draw conduits/pumps with rubber-band preview
- **Node Moving**: Ctrl+drag on selected node to reposition it
- **Right-Click Context Menu**: Copy, Paste (properties), Reverse (links), Delete with graph-integrity cleanup
- **Flyover Tooltips**: Hover over objects to see ID + current theme value or property
- **Object Locator**: Search by type + ID, center map on found object
- **Map Query**: Filter objects by property criteria, highlight matches in red on map
- **Map Export**: Save canvas as PNG file or copy to clipboard, with optional legend
- **Group Selection**: Draw polygon on map, select all enclosed objects, batch edit properties or delete
- **Preferences**: Flyover hints, confirm deletions, numerical precision, show/hide IDs, background color (localStorage-persisted)
- **Report Viewer**: View full .rpt report file in a dialog after simulation (auto-opens on failure); Copy to clipboard or Download as .rpt file; accessible via Project > Report toolbar button
- **Import Data**: Import nodes/links from CSV (with Add New/Modify modes), CAD DXF files (with layer selection), and GeoJSON files (with field mapping); File > Import toolbar button
- **Export Data**: Export nodes CSV, links CSV, DXF network, and PNG map image; File > Export toolbar button
- **Undo/Redo**: History stack (cap 50 snapshots) with Ctrl+Z/Ctrl+Y keyboard shortcuts and Edit toolbar buttons
- **Inline Property Editing**: Click-to-edit cells in Project Explorer property editor for junction, conduit, outfall, storage, subcatchment, weir, orifice, divider properties
- **Data Grid Cell Editing**: Click editable cells in data grid overlay to modify numeric properties (elevation, length, roughness, area, etc.) with commit-on-blur/Enter
- **Multi-Select (Shift+Click)**: Shift+click on map nodes/links/subcatchments to toggle selection; multi-selected items highlighted in blue (#338aff); cleared on regular click
- **Profile Plot**: Longitudinal section dialog with recharts AreaChart; select conduits by ID with autocomplete, auto-trace downstream path; shows invert, crown, ground, and HGL (when simulation results available)
- **Map Query on Results**: Query panel supports simulation result properties (node depth/head/flooding, link flow/velocity/capacity, subcatchment runoff/rainfall/infiltration)
- **Binary .out Parser**: `swmm-out-parser.ts` parses SWMM binary output files for real time-series data (magic numbers, element names, per-timestep float32 arrays)
- **Missing INP Parsers**: LID_CONTROLS, LID_USAGE, GROUNDWATER, AQUIFERS, TRANSECTS, SNOWPACKS, STREETS, INLETS, INLET_USAGE sections fully parsed and serialized

### Mobile Optimization
- Responsive layout: side panels (170px left, 220px right) hidden on screens ≤768px, accessible via toggle buttons in the title bar
- Panels open as fixed overlays (z-50) with dark backdrop, close via X button or backdrop click
- SpeedBar becomes horizontal scrollable bottom bar on mobile (isMobile prop)
- Canvas supports touch events: single-finger pan, pinch-to-zoom, tap-to-select objects, tap-to-place nodes
- Welcome screen and sample buttons use compact sizing on mobile
- Status bar shows abbreviated info on mobile, full details on desktop
- Progress monitor dialog uses responsive max-width (90vw, max 360px)
- CFL panel uses full-width on mobile (calc(100%-16px)) vs fixed 320px on desktop
- CSS classes: `.mobile-hidden` (hides at ≤768px), `.desktop-hidden` (hides at >768px)

## UI Layout
```
Title Bar | Menu Bar (File|Edit|View|Map|Project|Help)
Context Toolbar (changes per menu)
Legend/Locator/Query | Network Map (Canvas) + SpeedBar | Project Explorer + Properties
Status Bar (with "Created by SWMMEnablement" credit link)
```

## Design Theme
- Title bar: `#2c3e6b`, Menu bar: `#3a5070`, Toolbar/status: `#f0f0f4`, Panels: `#f8f8fa`
- Borders: `#d0d0d8`, Primary text: `#2a2a3e`, Secondary: `#6b6b7b`, Accent blue: `#2c6eb5`
- Map canvas: `#ffffff`, Grid: `rgba(0,0,0,0.06)`, Labels: `rgba(0,0,0,0.65)`
- Y-axis inverted in worldToScreen: `[wx * zoom + panX, -wy * zoom + panY]`

## Mouse Interaction
- **Select mode**: Click to select nodes/links/subcatchments, drag to pan, Ctrl+drag to move selected node
- **Add node modes**: Click to place new node at world coordinate
- **Add link modes**: Click node to start, click map for vertices, click another node to complete
- **Group select mode**: Click to add polygon vertices, double-click/right-click to close polygon
- **Right-click**: Context menu (select mode) or exit creation mode
- **Escape**: Cancel current mode, return to select
- Scroll: zoom, Double-click: fit to extent

## Exported Types
- `SwmmPreferences` interface exported from `swmm-ui.tsx`, imported in `NetworkMap.tsx`
- `InteractionMode` type exported from `SpeedBar.tsx`
- `MapQuery` type and `evaluateQuery` function exported from `Panels.tsx`
- `NetworkMapHandle` interface (getCanvas, fitExtent, centerOnWorld) from `NetworkMap.tsx`

## Sample Projects
- Seven sample models available via File > Samples dropdown or empty state screen
- `client/public/samples/Greenville_US.inp` — US Customary units (CFS), ~14,000 lines, 172 nodes
- `client/public/samples/Greenville_SI.inp` — SI/Metric units (CMS), same network
- `client/public/samples/User1.inp` — Mountain Drainage (58 subcatchments, CMS, Horton, DynWave)
- `client/public/samples/User2.inp` — Urban Collection (17 subcatchments, CFS, storage nodes, DynWave)
- `client/public/samples/User3.inp` — Large Metro Network (100+ subcatchments, CMS, dual drainage, DynWave)
- `client/public/samples/User4.inp` — Regional Stormwater (98 subcatchments, CFS, large network, DynWave)
- `client/public/samples/User5.inp` — Complex Watershed (96 subcatchments, CFS, Froude-limited, DynWave)
- Both demonstrate all SWMM5 features (LID, aquifers, groundwater, transects, etc.)
- Loaded on-demand via fetch (not bundled into JS)
- Parser silently skips unrecognized sections

## ReSWMM Engine (`client/src/lib/cfl-analysis.ts`)

The ReSWMM engine runs entirely in the browser (client-side). It takes a parsed SWMM .inp file and splits long conduits into shorter segments to improve hydraulic model stability and CFL compliance.

### 1. Input Parsing (`client/src/lib/inp-parser.ts`)
The INP file is parsed into structured data. The parser reads the raw text file and extracts every section — [JUNCTIONS], [CONDUITS], [XSECTIONS], [COORDINATES], [LOSSES], [OPTIONS], etc. — by splitting on whitespace-delimited columns. Each section becomes a typed array (e.g., `Conduit[]`, `Junction[]`, `XSection`). The parser also reads [OPTIONS] to determine flow units (CFS vs LPS), which controls whether US or SI gravity constants are used.

### 2. CFL Analysis (`computeCflAnalysis`)
Before discretizing, the engine computes the Courant-Friedrichs-Lewy (CFL) time step for every conduit. The formula is:

```
CFL time step = Length / sqrt(g × diameter)
```

Where g is 32.174 ft/s² (US) or 9.81 m/s² (SI). This tells you the maximum stable time step for each conduit. Short, fat pipes have tiny CFL time steps and cause instability — those are the ones that benefit from discretization.

### 3. Conduit Lengthening (optional)
If enabled, the engine first applies "lengthening" — a pre-pass that extends any conduit whose length is below the minimum CFL-stable length for the configured time step. The minimum length is `sqrt(g × diameter) × lengtheningStep`. This adjusts short conduits without splitting them.

### 4. Discretization (`discretizeProject`)
This is the core algorithm. For each conduit:

- **Look up cross-section** from the xsection map to get the pipe diameter
- **Calculate target segment length** based on the chosen method:
  - Fixed Interval: Clamp between user-specified min/max lengths
  - dx/D Ratio: Target length = diameter × user ratio
- **Determine segment count**: `ceil(conduit.length / targetLength)`
- **Skip unsplittable shapes**: Conduits with DUMMY or IRREGULAR cross-sections are preserved as-is (SWMM doesn't allow intermediate nodes on these)
- **Skip if only 1 segment needed** (conduit already short enough)
- **Split the conduit** into N equal-length segments:
  - New conduits: Named `OriginalName_1`, `OriginalName_2`, etc. Each gets the same roughness and cross-section shape. Inlet/outlet offsets are only applied to the first/last segment.
  - New intermediate junctions: Named `OriginalName_N1`, `OriginalName_N2`, etc. Elevation is linearly interpolated between the upstream and downstream nodes. Max depth is inherited from the upstream node. The MNSA (minimum nodal surface area / ponded area) is set from the user config.
  - New coordinates: X/Y positions are linearly interpolated along the line between endpoint coordinates for visualization.
  - Losses: Entry loss goes on the first segment, exit loss on the last, average loss distributed across all.

### 5. INP File Rebuild (`projectToInp` in `inp-parser.ts`)
After discretization, the engine reconstructs a valid .inp file:

- Writes all sections — JUNCTIONS, CONDUITS, XSECTIONS, LOSSES, COORDINATES — with the new discretized data
- Preserves non-conduit XSECTIONS — Cross-sections for orifices, weirs, and outlets are identified (link names not matching any conduit) and included. Without this, SWMM throws ERROR 143.
- Preserves everything else verbatim via `rawSections` — subcatchments, raingages, timeseries, rules, controls, pollutants, LIDs, etc.
- Uses safe column padding (`padField`) — guarantees at least one space between fields even when values exceed the column width, preventing SWMM parse errors like ERROR 211

### 6. Running the Simulation
The rebuilt INP file is uploaded to the Express backend, which proxies to the BatchSWMM remote engine:

- **Upload**: `POST /api/swmm-proxy/upload` sends the INP file
- **Start**: `POST /api/swmm-proxy/batch/:jobId/start` triggers the SWMM 5.2.4 engine
- **Progress**: WebSocket proxy at `/api/swmm-proxy/ws` relays real-time progress messages from the remote BatchSWMM server (progress, file_progress, result, completed)
- **Results**: The `.rpt` report content is parsed by `parseRptToResults` in `swmm-engine.ts` to extract node depth summaries, link flow summaries, subcatchment runoff summaries into `SimulationResults`

Both the remote engine and mock engine send progress updates and final results back to the frontend for display in the progress monitor dialog.

The key engineering challenge was making the rebuilt INP file perfectly SWMM-compatible — column alignment, preserving non-conduit sections, handling edge cases like DUMMY shapes, and ensuring numeric fields never bleed into adjacent columns. Each bug fix came from running real models and tracing SWMM error codes back to the generated file.

## Simulation Engine
- Three modes: **Local** (EPA SWMM 5.2.4 binary at `/home/runner/workspace/swmm-engine/runswmm`), **Remote** (BatchSWMM cloud), and **Mock** (simulated results)
- Local engine: uploads INP to server, runs binary, returns .rpt + .out (binary parsed by `swmm-out-parser.ts`)
- Remote engine connects to BatchSWMM app at `https://batch-swmm-runner-robertdickinson.replit.app`
- Server proxies API calls through `/api/swmm-proxy/*` endpoints
- WebSocket proxy on server relays progress from remote BatchSWMM to browser client
- Upload flow: POST INP to `/api/swmm-proxy/upload` → start batch → WS proxy for progress/results → parse RPT report
- Engine mode toggle in Project toolbar; auto-detects local/remote availability on load
- Status bar shows current engine mode with color coding: local=#2a8a4a, remote=#2c6eb5, mock=gray
- `swmm-engine.ts` exports: `createMockEngine()`, `createRemoteEngine()`, `createLocalEngine()`, `checkRemoteEngine()`, `checkLocalEngine()`
