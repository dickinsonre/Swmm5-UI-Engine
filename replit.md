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
- `client/src/components/swmm/Panels.tsx` - Legend panel, Project Explorer, Object Locator, Map Query panel
- `client/src/components/swmm/SpeedBar.tsx` - Vertical speed bar with interaction mode buttons
- `client/src/lib/swmm-types.ts` - TypeScript interfaces for all SWMM5 model objects
- `client/src/lib/inp-parser.ts` - Complete SWMM5 INP file parser (all major sections)
- `client/src/lib/swmm-engine.ts` - WASM engine wrapper with mock fallback

### Backend
- `server/routes.ts` - GitHub file proxy (`/api/fetch-github`, SSRF-secured), GitHub repo browser (`/api/github-browse`), SWMM engine proxy

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

## UI Layout
```
Title Bar | Menu Bar (File|Edit|View|Map|Project|Help)
Context Toolbar (changes per menu)
Legend/Locator/Query | Network Map (Canvas) + SpeedBar | Project Explorer + Properties
Status Bar
```

## Design Theme
- Background: `#1e1e2e`, Surface: `#2a2a3e`, Accent: `#4ea8de`
- Font: JetBrains Mono for labels
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
- Two Greenville, NC models available via File > Samples dropdown or empty state screen
- `client/public/samples/Greenville_US.inp` — US Customary units (CFS), ~14,000 lines, 172 nodes
- `client/public/samples/Greenville_SI.inp` — SI/Metric units (CMS), same network
- Both demonstrate all SWMM5 features (LID, aquifers, groundwater, transects, etc.)
- Loaded on-demand via fetch (not bundled into JS)
- Parser silently skips unrecognized sections

## CFL Analysis & Discretization (ReSWMM)
- Automatic CFL stability analysis runs on every model load
- Flags conduits violating Courant-Friedrichs-Lewy criterion (Courant number > 1)
- Formula: celerity = sqrt(g × D), Courant = (celerity × routingStep) / length
- Gravity: 32.174 ft/s² (US), 9.81 m/s² (SI) based on FLOW_UNITS
- Flagged conduits highlighted red on map (toggleable)
- CFL panel accessible via Project > CFL button
- One-click discretization splits flagged conduits with interpolated intermediate junctions
- Two methods: Fixed Interval (min/max lengths) and Δx/D Ratio
- Optional conduit lengthening (short pipe stabilization)
- New junctions rendered as small green diamonds on map
- `client/src/lib/cfl-analysis.ts` — CFL engine and discretization logic

## Simulation Engine
- Two modes: **Remote** (EPA SWMM 5.2.4) and **Mock** (simulated results)
- Remote engine connects to BatchSWMM app at `https://batch-swmm-runner-robertdickinson.replit.app`
- Server proxies API calls through `/api/swmm-proxy/*` endpoints
- WebSocket connects directly to BatchSWMM for real-time progress during simulation
- Upload flow: POST INP to `/api/swmm-proxy/upload` → start batch → WS for progress/results → parse RPT report
- Engine mode toggle in Project toolbar; auto-detects remote availability on load
- Status bar shows current engine mode
- `swmm-engine.ts` exports: `createMockEngine()`, `createRemoteEngine()`, `checkRemoteEngine()`
