# SWMM5-UI

## Overview
Web-based interface for EPA SWMM5 (Storm Water Management Model). Full desktop-like engineering UI that reads SWMM5 INP files from desktop or GitHub, parses all INP sections, visualizes stormwater networks on a canvas map, runs real SWMM5 simulations via the local EPA SWMM 5.2.4 binary, performs CFL stability analysis with one-click conduit discretization, and supports GIS/CAD/CSV import+export. ~10,000 lines of frontend+backend TypeScript.

## Architecture
- **Frontend**: React 18 + TypeScript + Tailwind CSS + Vite. Light EPANET-style theme (dark navy title/menu, white canvas, light gray panels). All SWMM data lives client-side as parsed `SwmmProject` objects.
- **Backend**: Express.js — GitHub file proxy, local SWMM engine runner (`/api/swmm/run`), remote BatchSWMM proxy (`/api/swmm-proxy/*`), WebSocket proxy for progress.
- **No database** — all data is client-side INP file parsing. Session secret is used only for Express session middleware.
- **Local SWMM binary**: `/home/runner/workspace/swmm-engine/runswmm` (EPA SWMM 5.2.4)

## Key Files

### Frontend (~9,600 lines)
| File | Lines | Purpose |
|------|-------|---------|
| `client/src/pages/swmm-ui.tsx` | 2865 | Main page: menus, toolbar, status bar, file I/O, preferences, dialogs (github, export, import, profile plot, group edit, CFL, report), context menus, undo/redo, all callbacks |
| `client/src/components/swmm/NetworkMap.tsx` | 1157 | Canvas-based network map: pan/zoom, hit-testing (nodes/links/subcatchments), rubber-band drawing, group polygon, tooltip overlay, multi-select highlight, touch events |
| `client/src/components/swmm/ProjectExplorer.tsx` | 1206 | Project Explorer: tree navigation, search, context menus, data grid overlay with editable cells, property editor with inline editing |
| `client/src/components/swmm/Panels.tsx` | 900 | Legend panel, Object Locator, Map Query panel (with result-property support) |
| `client/src/components/swmm/SpeedBar.tsx` | 146 | Speed bar: interaction mode buttons (vertical desktop / horizontal mobile) |
| `client/src/lib/swmm-types.ts` | 453 | All TypeScript interfaces: SwmmProject (40+ fields), Junction, Conduit, Subcatchment, LidControl, Aquifer, Transect, SnowPack, Street, Inlet, SimulationResults, etc. |
| `client/src/lib/inp-parser.ts` | 1263 | Complete INP parser (`parseInpFile`) + serializer (`projectToInp`). Handles all 30+ sections with safe column padding (`padField`) |
| `client/src/lib/swmm-engine.ts` | 527 | Engine abstraction: `createLocalEngine()`, `createRemoteEngine()`, `createMockEngine()`. Local runs binary + parses .out; remote uses BatchSWMM proxy; mock generates synthetic results |
| `client/src/lib/swmm-out-parser.ts` | 209 | Binary .out parser: magic numbers (516114522), version, flow units, element name tables, per-timestep float32 arrays (8 subcatch + 6 node + 5 link vars). Cap 5000 steps |
| `client/src/lib/cfl-analysis.ts` | 361 | CFL analysis + conduit discretization engine (runs in browser) |
| `client/src/lib/import-export.ts` | 509 | CSV, DXF, GeoJSON import/export for nodes and links |

### Backend (~358 lines)
| File | Purpose |
|------|---------|
| `server/routes.ts` | GitHub proxy (`/api/fetch-github`, SSRF-secured), repo browser (`/api/github-browse`), local SWMM runner (`/api/swmm/run` — writes INP to tmp, executes `runswmm`, returns .rpt + base64 .out), remote proxy (`/api/swmm-proxy/*`), WebSocket proxy |
| `server/index.ts` | Express server setup on port 5000, session, Vite dev middleware |
| `server/vite.ts` | Vite dev server integration |

## Data Flow

### INP File → SwmmProject
```
User opens file → parseInpFile(text) → SwmmProject object → setProject(parsed)
  ↓ sections: JUNCTIONS, CONDUITS, XSECTIONS, COORDINATES, OPTIONS, etc.
  ↓ each section → typed array (Junction[], Conduit[]) or Record (xsections, losses)
  ↓ rawSections preserves unrecognized sections verbatim
```

### Simulation Flow
```
User clicks Run → projectToInp(project) → POST /api/swmm/run (INP text)
  ↓ server writes tmp .inp → exec runswmm → reads .rpt + .out
  ↓ response: { reportContent, outBase64 }
  ↓ client: parseSwmmOut(base64→ArrayBuffer) → SimulationResults
  ↓ fallback: parseRptToResults(reportContent) if .out fails
  ↓ results stored in state → drives map themes, time slider, profile plot, queries
```

### State Management
- `project: SwmmProject` — the full model (source of truth)
- `results: SimulationResults | null` — parsed simulation output
- `selectedObj: SelectedObject | null` — currently selected map element
- `multiSelectIds: Set<string> | null` — Shift+click multi-selection
- `timeStep: number` — current animation frame index into results.timeSteps[]
- Undo/redo: `undoStackRef` / `redoStackRef` (cap 50), pushed on every project change

## Features

### Core
- Parse 30+ SWMM5 INP sections including LID_CONTROLS, GROUNDWATER, AQUIFERS, TRANSECTS, SNOWPACKS, STREETS, INLETS
- Canvas network map with pan/zoom, element selection, layer visibility toggles
- Three simulation engine modes: Local (green, EPA binary), Remote (blue, BatchSWMM cloud), Mock (gray, synthetic)
- Time slider + animation for stepping through simulation results
- File open from desktop (drag & drop / picker) and GitHub URL/repo browser
- Save/export INP file with safe column padding

### Interactive Editing
- **Node Creation**: Click map to place junctions/outfalls/storage with auto-generated IDs
- **Link Drawing**: Click-to-click with rubber-band preview and intermediate vertices
- **Node Moving**: Ctrl+drag on selected node
- **Context Menu**: Right-click for Copy/Paste/Reverse/Delete
- **Inline Property Editing**: Click-to-edit in Project Explorer property panel
- **Data Grid Editing**: Click editable cells in tabular data grid (with double-commit guard)
- **Undo/Redo**: Ctrl+Z/Y with 50-snapshot cap
- **Group Selection**: Draw polygon → batch edit properties or delete
- **Multi-Select**: Shift+click to toggle items (blue highlight), cleared on regular click or project load

### Analysis & Visualization
- **Time Series Graph**: Interactive hydrograph/time series charts for any node, link, or subcatchment. Select element + variables (depth, flow, velocity, flooding, etc.), view line charts over full simulation duration. Compare mode overlays up to 6 elements. Peak detection with time annotation. Uses recharts LineChart.
- **CFL Analysis**: Computes Courant stability for every conduit; one-click discretization
- **Profile Plot**: Longitudinal section via recharts AreaChart — select conduits with autocomplete, auto-trace downstream, shows invert/crown/ground/HGL
- **Node Depth Visualization**: Post-simulation nodes show water level fill proportional to depth/maxDepth. Color coding: blue (low), amber (>75%), red (>95%). Flooding halo for surcharging nodes.
- **Map Query**: Filter by static properties or simulation results (depth, flow, velocity, etc.), highlight matches in red
- **Report Viewer**: View .rpt report, copy/download
- **Flyover Tooltips**: Hover to see ID + current theme value
- **Object Locator**: Search by type + ID, center map

### Import/Export
- **Import**: CSV nodes/links (Add/Modify modes), CAD DXF (with layer selection), GeoJSON (with field mapping)
- **Export**: CSV nodes/links, DXF network, PNG map image

### Mobile
- Responsive layout: side panels hidden ≤768px, toggle via title bar buttons
- SpeedBar horizontal scrollable bottom bar
- Touch: single-finger pan, pinch-to-zoom, tap-to-select/place
- Compact sizing on welcome screen, status bar, progress dialog, CFL panel

## UI Layout
```
┌─────────────────────────────────────────────────────┐
│ Title Bar (SWMM5) │ Menu (File|Edit|View|Map|Project|Help) │
├─────────────────────────────────────────────────────┤
│ Context Toolbar (changes per active menu)           │
├──────┬──────────────────────────────────┬────────────┤
│Legend│                                  │ Project    │
│Locator│    Network Map (Canvas)        │ Explorer   │
│Query │           + SpeedBar            │ + Properties│
├──────┴──────────────────────────────────┴────────────┤
│ Status Bar (engine mode, coordinates, object count) │
└─────────────────────────────────────────────────────┘
```

## Design Theme
- Title bar: `#2c3e6b`, Menu bar: `#3a5070`, Toolbar/status: `#f0f0f4`, Panels: `#f8f8fa`
- Borders: `#d0d0d8`, Primary text: `#2a2a3e`, Secondary: `#6b6b7b`, Accent blue: `#2c6eb5`
- Map canvas: `#ffffff`, Grid: `rgba(0,0,0,0.06)`, Labels: `rgba(0,0,0,0.65)`
- Multi-select highlight: `#338aff`, Group select: `#ffaa33`, Query match: `#ff4444`, CFL flagged: `#ff5555`
- Engine mode colors: local=`#2a8a4a`, remote=`#2c6eb5`, mock=gray
- Y-axis inverted in worldToScreen: `[wx * zoom + panX, -wy * zoom + panY]`

## Mouse Interaction
- **Select mode**: Click to select, drag to pan, Ctrl+drag to move node, Shift+click to multi-select
- **Add node modes**: Click to place new node at world coordinate
- **Add link modes**: Click node to start, click map for vertices, click another node to complete
- **Group select mode**: Click to add polygon vertices, double-click/right-click to close
- **Right-click**: Context menu (select mode) or exit creation mode
- **Escape**: Cancel current mode, return to select
- **Scroll**: zoom, **Double-click**: fit to extent

## Exported Types
- `SwmmPreferences` interface from `swmm-ui.tsx` → `NetworkMap.tsx`
- `InteractionMode` type from `SpeedBar.tsx`
- `MapQuery` type + `evaluateQuery(query, project, results?, timeStep?)` from `Panels.tsx`
- `NetworkMapHandle` interface (getCanvas, fitExtent, centerOnWorld) from `NetworkMap.tsx`
- `SwmmProject`, `SelectedObject`, `SimulationResults` from `swmm-types.ts`
- `parseInpFile`, `projectToInp`, `SAMPLE_INP` from `inp-parser.ts`
- `parseSwmmOut` from `swmm-out-parser.ts`
- `createLocalEngine`, `createRemoteEngine`, `createMockEngine`, `checkLocalEngine`, `checkRemoteEngine` from `swmm-engine.ts`

## Sample Projects
Seven sample models via File > Samples or empty state screen:
- `Greenville_US.inp` / `Greenville_SI.inp` — 172 nodes, US/SI units
- `User1.inp` — Mountain Drainage (58 subcatchments, CMS, Horton, DynWave)
- `User2.inp` — Urban Collection (17 subcatchments, CFS, storage, DynWave)
- `User3.inp` — Large Metro (100+ subcatchments, CMS, dual drainage)
- `User4.inp` — Regional Stormwater (98 subcatchments, CFS, large network)
- `User5.inp` — Complex Watershed (96 subcatchments, CFS, Froude-limited)
- All loaded on-demand via fetch from `client/public/samples/`

## API Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/fetch-github?url=` | Proxy GitHub raw file (SSRF-secured) |
| GET | `/api/github-browse?url=` | Browse GitHub repo directories |
| GET | `/api/swmm/status` | Check local SWMM binary availability |
| POST | `/api/swmm/run` | Run local SWMM: receives INP text, writes tmp file, exec `runswmm`, returns `{reportContent, outBase64}` |
| GET | `/api/swmm-proxy/status` | Check remote BatchSWMM + local availability |
| POST | `/api/swmm-proxy/upload` | Upload INP to remote engine |
| POST | `/api/swmm-proxy/batch/:jobId/start` | Start remote simulation |
| GET | `/api/swmm-proxy/batch/:jobId/status` | Poll remote job status |
| GET | `/api/swmm-proxy/batch/:jobId/results` | Get remote simulation results |

## Key Technical Details

### Binary .out Parser (`swmm-out-parser.ts`)
- Magic: first int32 = 516114522, second int32 = 0
- Header: version, flow units, subcatch/node/link/pollutant counts
- Element names: length-prefixed strings (int32 length + ASCII chars)
- Property counts per type: subcatch, node, link properties
- Time steps: float64 timestamp + float32 arrays for each element
- Subcatch vars (8): rainfall, snow depth, evap, infiltration, runoff, GW outflow, GW elevation, soil moisture
- Node vars (6): depth, head, volume, lateral inflow, total inflow, flooding
- Link vars (5): flow, depth, velocity, volume, capacity
- Capped at 5000 time steps for memory safety

### CFL Analysis (`cfl-analysis.ts`)
- CFL time step = Length / sqrt(g × diameter)
- g = 32.174 ft/s² (US) or 9.81 m/s² (SI)
- Discretization: splits long conduits into N segments with interpolated intermediate junctions
- Methods: Fixed Interval (min/max length) or dx/D Ratio (diameter × ratio)
- Preserves losses distribution, offsets, cross-sections

### INP Parser Patterns
- Sections detected by `[SECTION_NAME]` headers
- Whitespace-delimited columns parsed by `split(/\s+/)`
- Serializer uses `padField(value, width)` — guarantees ≥1 space between fields
- `rawSections` preserves unrecognized sections verbatim for round-trip fidelity
- Non-conduit XSECTIONS (orifices, weirs, outlets) preserved separately to avoid SWMM ERROR 143

### ProjectExplorer Editing
- `EDITABLE_FIELDS` map: `objType → propLabel → { field, collection }` drives inline property editing
- `GRID_EDITABLE_COLS` map: `category → colKey → { field, collection }` drives data grid cell editing
- Both use `onUpdateProject(updater)` pattern: `(prev: SwmmProject) => SwmmProject`
- Double-commit guard via `committedRef` in DataGridRow prevents blur+Enter from firing twice

### Multi-Select
- `multiSelectIds: Set<string>` tracks Shift+clicked elements
- `handleShiftClick(id, objType)` toggles membership
- `handleSelectObj(obj)` clears multi-select on regular click
- Reset on all project load paths (file open, GitHub, sample, new project)
- Blue highlight (#338aff) in both `getNodeColor` and `getLinkColor`

### Profile Plot
- `ProfilePlotContent` component in swmm-ui.tsx
- Conduit selection via autocomplete input + auto-trace downstream
- Computes station, invert, crown, ground, HGL at each node along the path
- Node lookup: junctions + outfalls + storage + dividers
- Uses recharts `AreaChart` with `Area` layers for each elevation type
