# SWMM5-UI Project Handover Document

**Date:** March 2026
**Project:** Web-based EPA SWMM5 User Interface
**Stack:** React 18 + TypeScript + Tailwind CSS + Express.js + EPA SWMM 5.2.4 Engine

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [File Structure](#3-file-structure)
4. [Data Model & Types](#4-data-model--types)
5. [INP Parser & Serializer](#5-inp-parser--serializer)
6. [Network Map (Canvas Renderer)](#6-network-map-canvas-renderer)
7. [Project Explorer](#7-project-explorer)
8. [Simulation Engine](#8-simulation-engine)
9. [CFL Analysis & Discretization](#9-cfl-analysis--discretization)
10. [Import/Export System](#10-importexport-system)
11. [UI Layout & Menus](#11-ui-layout--menus)
12. [Panels & Dialogs](#12-panels--dialogs)
13. [Mobile Responsiveness](#13-mobile-responsiveness)
14. [Server Routes (API)](#14-server-routes-api)
15. [Sample Projects](#15-sample-projects)
16. [Design Theme & Colors](#16-design-theme--colors)
17. [State Management](#17-state-management)
18. [Known Gaps & Future Work](#18-known-gaps--future-work)
19. [Running & Deploying](#19-running--deploying)

---

## 1. Project Overview

This is a fully web-based recreation of the EPA SWMM5 desktop application. It provides:

- **INP file parsing**: Reads any EPA SWMM5 `.inp` file (all sections) from local disk, drag-and-drop, or GitHub repositories
- **Interactive network visualization**: HTML5 Canvas map with pan, zoom, node/link creation, selection, and thematic rendering
- **Real simulation execution**: Runs the actual EPA SWMM 5.2.4 engine (compiled C binary) server-side, with real-time progress via WebSocket
- **CFL stability analysis**: Computes Courant numbers for all conduits with one-click auto-discretization to fix violations
- **Full Project Explorer**: Desktop-like tree navigation of all SWMM sections with data grids, search, and context menus
- **GIS/CAD/CSV import+export**: Import nodes/links from CSV, DXF (CAD), and GeoJSON; export to CSV and DXF
- **Mobile-responsive layout**: Touch-optimized with collapsible panels, pinch-to-zoom, and horizontal speed bar

---

## 2. Architecture

```
Browser (React SPA)                 Server (Express.js)
+---------------------------+       +---------------------------+
| swmm-ui.tsx (main page)   |       | routes.ts                 |
| NetworkMap.tsx (canvas)    | <---> | - /api/fetch-github       |
| ProjectExplorer.tsx (tree) |  HTTP | - /api/github-browse      |
| Panels.tsx (legend/query)  |       | - /api/swmm/run (local)   |
| SpeedBar.tsx (tools)       |  WS   | - /api/swmm-proxy/* (rem) |
+---------------------------+       +---------------------------+
                                           |
                                    swmm-engine/runswmm
                                    (EPA SWMM 5.2.4 binary)
```

**Key design decisions:**
- All model data lives client-side (no database). The `SwmmProject` object is the single source of truth.
- The server is minimal: GitHub proxy (SSRF-secured), local SWMM engine runner, and remote engine proxy.
- The INP parser round-trips perfectly: parse INP -> edit in UI -> serialize back to INP -> run engine.
- Unknown INP sections are preserved in `rawSections` for lossless round-tripping.

---

## 3. File Structure

### Client Source (`client/src/`)

| File | Lines | Purpose |
|------|-------|---------|
| `pages/swmm-ui.tsx` | 2,587 | Main page: menus, toolbars, dialogs, state management, all UI orchestration |
| `components/swmm/ProjectExplorer.tsx` | 959 | Tree navigation, search, data grid overlay, property editor |
| `components/swmm/NetworkMap.tsx` | 1,138 | Canvas-based map: rendering, hit-testing, interaction modes, touch |
| `components/swmm/Panels.tsx` | 852 | Legend, Object Locator, Map Query panels |
| `components/swmm/SpeedBar.tsx` | ~80 | Floating toolbar for interaction modes |
| `lib/swmm-types.ts` | 349 | TypeScript interfaces for all SWMM model objects |
| `lib/inp-parser.ts` | 989 | INP file parser and serializer |
| `lib/swmm-engine.ts` | 511 | Engine abstraction (local/remote/mock modes) |
| `lib/cfl-analysis.ts` | 361 | CFL computation and conduit discretization |
| `lib/import-export.ts` | 509 | CSV, DXF, GeoJSON import/export utilities |
| `lib/queryClient.ts` | ~30 | TanStack Query setup |
| `lib/utils.ts` | ~10 | Tailwind `cn()` helper |
| `index.css` | ~200 | Global styles, CSS variables, mobile classes |

### Server Source (`server/`)

| File | Purpose |
|------|---------|
| `routes.ts` (351 lines) | All API routes: GitHub proxy, SWMM engine, WebSocket proxy |
| `index.ts` | Express server bootstrap |
| `vite.ts` | Vite dev server integration |
| `storage.ts` | Storage interface (minimal, no DB needed) |
| `static.ts` | Static file serving |

### Engine (`swmm-engine/`)

| File | Purpose |
|------|---------|
| `runswmm` | Compiled EPA SWMM 5.2.4 binary (Linux x86_64) |
| `Stormwater-Management-Model-5.2.4/` | Full SWMM C source code |
| `swmm524.tar.gz` | Source archive |

### Samples (`client/public/samples/`)

Seven `.inp` files: `Greenville_US.inp`, `Greenville_SI.inp`, `User1.inp` through `User5.inp`

---

## 4. Data Model & Types

All model types are defined in `client/src/lib/swmm-types.ts`. The central interface is `SwmmProject`:

### Node Types
- **`Junction`**: `id, elevation, maxDepth, initDepth, surDepth, aponded`
- **`Outfall`**: `id, elevation, type, stageData, gated, routeTo`
- **`Divider`**: `id, elevation, divertedLink, type, cutoff, maxDepth, initDepth, surDepth, aponded`
- **`StorageUnit`**: `id, elevation, maxDepth, initDepth, shape, curve, params, fEvap, surDepth, aponded`

### Link Types
- **`Conduit`**: `id, fromNode, toNode, length, roughness, inOffset, outOffset, initFlow, maxFlow`
- **`Pump`**: `id, fromNode, toNode, curve, status, startup, shutoff`
- **`Orifice`**: `id, fromNode, toNode, type, offset, cd, gated, closeTime`
- **`Weir`**: `id, fromNode, toNode, type, crestHt, cd, gated, ec, cd2, surcharge, roadWidth, roadSurf, coeff2`
- **`Outlet`**: `id, fromNode, toNode, offset, type, curveOrCoeff, exponent, gated`

### Hydrology Types
- **`RainGage`**: `id, format, interval, scf, sourceType, sourceName, stationId, units`
- **`Subcatchment`**: `id, rainGage, outlet, area, pctImperv, width, slope, curbLen, snowPack`
- **`SubareaData`**: `nImperv, nPerv, sImperv, sPerv, pctZero, routeTo, pctRouted`
- **`InfiltrationData`**: `method, values[]`

### Cross-Section & Hydraulic Properties
- **`XSection`**: `shape, geom1-4, barrels, culvert`
- **`Losses`**: `entry, exit, avg, flapGate, seepRate`

### Temporal Data
- **`Curve`**: `id, type, points[]` (pump curves, storage curves, tidal, etc.)
- **`TimeSeries`**: `id, entries[]` (rainfall, inflow time series)
- **`Pattern`**: `id, type, multipliers[]` (DWF patterns: MONTHLY, DAILY, HOURLY, WEEKEND)

### Spatial Data (in SwmmProject)
- `coordinates`: `Record<string, [number, number]>` (node ID -> [X, Y])
- `vertices`: `Record<string, [number, number][]>` (link ID -> intermediate vertex array)
- `polygons`: `Record<string, [number, number][]>` (subcatchment ID -> polygon vertices)
- `symbols`: `Record<string, [number, number]>` (rain gage ID -> [X, Y])
- `labels`: `{ x, y, text, anchor }[]`

### Simulation Results
```typescript
interface SimulationResults {
  timeSteps: string[];           // e.g. ["0:00:00", "0:05:00", ...]
  nodeResults: Record<string, {  // keyed by node ID
    depth: number[];
    head: number[];
    inflow: number[];
    flooding: number[];
  }>;
  linkResults: Record<string, {  // keyed by link ID
    flow: number[];
    velocity: number[];
    depth: number[];
    capacity: number[];
  }>;
  subcatchResults: Record<string, {
    runoff: number[];
    infiltration: number[];
  }>;
  nodeSummary: Record<string, { avgDepth, maxDepth, maxHGL, ... }>;
  linkSummary: Record<string, { maxFlow, maxVelocity, maxDepth, ... }>;
  subcatchSummary: Record<string, { totalRunoff, totalInfiltration, ... }>;
}
```

---

## 5. INP Parser & Serializer

**File:** `client/src/lib/inp-parser.ts` (989 lines)

### Parsing (`parseInpFile(text: string): SwmmProject`)

1. **`extractSections(text)`**: First-pass regex splits the raw file into a dictionary of `{sectionName: rawLines[]}` by detecting `[SECTION_NAME]` headers.

2. **Section routing**: Each known section is dispatched to a specialized parser function:
   - `parseJunctions(lines)` -> `Junction[]`
   - `parseConduits(lines)` -> `Conduit[]`
   - `parseXsections(lines)` -> `Record<string, XSection>`
   - etc.

3. **Field tokenization**: `splitFields(line)` splits lines by whitespace. Each parser knows its column order based on the SWMM specification.

4. **Unknown sections**: Any section not in the `knownSections` set is stored verbatim in `project.rawSections[sectionName]` for round-trip preservation.

### Serialization (`projectToInp(project: SwmmProject): string`)

Reconstructs a valid `.inp` file string:
- Writes each section in SWMM-standard order with `[SECTION]` headers
- Uses `padField(value, width)` for column alignment (guarantees 1+ space between fields even when values exceed column width)
- Appends `rawSections` at the end for lossless round-tripping
- Properly handles non-conduit XSECTIONS (orifices, weirs, outlets) to prevent SWMM ERROR 143

### Parsed Sections

| Category | Sections |
|----------|----------|
| Metadata | TITLE, OPTIONS, REPORT |
| Hydrology | RAINGAGES, SUBCATCHMENTS, SUBAREAS, INFILTRATION, LANDUSES, POLLUTANTS, DWF |
| Nodes | JUNCTIONS, OUTFALLS, DIVIDERS, STORAGE |
| Links | CONDUITS, PUMPS, ORIFICES, WEIRS, OUTLETS |
| Properties | XSECTIONS, LOSSES, CONTROLS |
| Temporal | CURVES, TIMESERIES, PATTERNS |
| Spatial | COORDINATES, VERTICES, POLYGONS, SYMBOLS, LABELS, MAP |

---

## 6. Network Map (Canvas Renderer)

**File:** `client/src/components/swmm/NetworkMap.tsx` (1,138 lines)

### Drawing Layers (render order)

1. **Background + Grid**: White fill with 50px-spaced light gray grid
2. **Subcatchments**: Filled polygons colored by `subcatchTheme` (Runoff, Rainfall, Infiltration, Imperviousness), with centered ID text
3. **Rain Gage Symbols**: Blue triangular icons at symbol coordinates
4. **Links**: Conduits, pumps, orifices, weirs, outlets
   - Line width/color varies by `linkTheme` (Flow, Velocity, Depth)
   - Pumps: circle with "P"; Weirs: rectangle with "W"; Orifices: open circle
   - Flow direction arrows at segment midpoints
   - Intermediate vertices from `project.vertices`
5. **Nodes**: Junctions (circles), Outfalls (triangles), Storage (squares), Dividers (diamonds)
   - Colored by `nodeTheme` (Depth, Head) or default type colors
6. **Labels**: Arbitrary text from `project.labels`
7. **Interaction overlays**: Rubber-band lines, link-drawing preview, group selection polygon

### Coordinate System

- **World coordinates**: SWMM X/Y from the INP file
- **Screen coordinates**: Canvas pixel positions
- **Transform**: `worldToScreen: [wx * zoom + panX, -wy * zoom + panY]` (Y-axis inverted)
- **Inverse**: `screenToWorld: [(sx - panX) / zoom, -(sy - panY) / zoom]`
- **Initial fit**: `fitExtent()` computes bounding box of all geometry and sets pan/zoom for 15% margin

### Interaction Modes

| Mode | Behavior |
|------|----------|
| `select` | Click selects objects; Ctrl+drag moves selected node |
| `addJunction` / `addOutfall` / `addStorage` | Click canvas creates node via `onCreateNode` |
| `addConduit` / `addPump` | Click node to start, click canvas for vertices, click node to complete |
| `addLabel` | Click canvas to place text label |
| `groupSelect` | Click to define polygon vertices; right-click/double-click to close |
| `query` | Click to query objects under cursor |

### Hit Testing

- **Nodes**: Euclidean distance with 12px threshold
- **Links**: Point-to-segment distance with 8px threshold (checks all segments including vertices)
- **Subcatchments**: Ray-casting `pointInPolygon` algorithm

### Touch Support

- Single-finger drag: pan
- Pinch-to-zoom: two-finger distance tracking
- Quick tap: select or create (same as click)
- Uses `touchRef` for frame-by-frame distance/center tracking to avoid React state lag

### Tooltip

Floating `<div>` overlay shows object ID and current theme value on hover (e.g., "J1 - Depth: 2.34 ft")

---

## 7. Project Explorer

**File:** `client/src/components/swmm/ProjectExplorer.tsx` (959 lines)

### Tree Structure (`SWMM_TREE`)

14 top-level groups, each containing leaf nodes mapped to SWMM INP sections:

```
Title / Notes
Analysis Options
  ├── General, Hydrology, Hydraulics, Routing, Quality, Dates, Time Steps, Reporting
Climatology
  ├── Rain Gages, Evaporation, Temperature, Adjustments, Snow Packs
Subcatchments
  ├── Subcatchments, Subareas, Infiltration, LID Controls, LID Usage,
  │   Aquifers, Groundwater, GWF Equations, Coverages, Initial Loadings
Network Nodes
  ├── Junctions, Outfalls, Dividers, Storage Units
Network Links
  ├── Conduits, Pumps, Orifices, Weirs, Outlets, Cross-Sections,
  │   Transects, Streets, Inlets, Inlet Usage, Losses
Dry Weather
  ├── Dry Weather Flow, RDII, Hydrographs, Patterns
External Inflows
  ├── Direct Inflows, Time Series, Curves
Water Quality
  ├── Pollutants, Land Uses, Buildup, Washoff, Treatment
Controls
  ├── Control Rules
Map / GIS
  ├── Coordinates, Vertices, Polygons, Symbols, Labels, Backdrop
Tags / Profiles
  ├── Tags, Profiles
```

### Features

- **Item counts**: Each leaf shows object count in parentheses (e.g., "Junctions (172)")
- **Status indicators**: Blue dot (&#9679;) for sections with data, gray circle (&#9675;) for empty
- **Search bar**: Filters tree labels and auto-expands ancestor groups on match
- **Object ID search**: Typing 2+ characters searches all object IDs across categories; results appear below the tree
- **Expandable object lists**: Clicking a leaf with data expands inline list of individual object IDs
- **Data grid overlay**: Full-screen modal table showing all objects in a section with type-specific columns
  - Includes simulation result columns (marked with asterisk) when results are loaded
  - Rows are clickable to select on map
- **Context menus**: Right-click leaf items for "View Table" and "Export to CSV"; right-click groups for "Expand/Collapse All Children"
- **Property editor**: Bottom panel showing key-value properties of the selected object, plus simulation results with time-step data
- **Post-simulation results tree**: "Simulation Results" section with Node Results (Depth, Head, Inflow, Flooding), Link Results (Flow, Velocity, Depth, Capacity), Subcatchment Results (Runoff, Infiltration)

### Count Mapping

The tree maps leaf IDs to project data via a `countMap`:

```typescript
countMap = {
  junctions: project.junctions.length,
  outfalls: project.outfalls.length,
  conduits: project.conduits.length,
  xsections: Object.keys(project.xsections).length,
  coordinates: Object.keys(project.coordinates).length,
  // ... etc for all sections
}
```

Leaf node `countKey` attributes map to camelCase keys (e.g., `lidControls` -> `LID_CONTROLS`).

---

## 8. Simulation Engine

**File:** `client/src/lib/swmm-engine.ts` (511 lines)

### Three Execution Modes

| Mode | Indicator Color | Mechanism | Binary |
|------|----------------|-----------|--------|
| **Local** | Green (#2a8a4a) | `POST /api/swmm/run` on same Express server | `swmm-engine/runswmm` |
| **Remote** | Blue (#2c6eb5) | Proxied to `batch-swmm-runner-robertdickinson.replit.app` | Remote server |
| **Mock** | Gray (#6b6b7b) | Client-side synthetic results using math functions | None |

### Local Engine Flow

1. Client calls `projectToInp(project)` to serialize the model to INP text
2. `POST /api/swmm/run` with INP content as request body
3. Server writes INP to temp directory `/tmp/swmm-{jobId}/model.inp`
4. Server spawns: `swmm-engine/runswmm model.inp model.rpt model.out`
5. Server reads `model.rpt`, cleans up temp files, returns report text
6. Client parses report with `parseRptToResults()` to extract summary statistics
7. Time-series data is synthetically generated from summaries for visualization

### Remote Engine Flow

1. `POST /api/swmm-proxy/upload` -> uploads INP file, receives `jobId`
2. `POST /api/swmm-proxy/batch/{jobId}/start` -> starts the simulation
3. `WS /api/swmm-proxy/ws?jobId={jobId}` -> real-time progress via WebSocket proxy
4. `GET /api/swmm-proxy/batch/{jobId}/results` -> fetch completed results

### Mock Engine

Generates synthetic results entirely client-side using sine/cosine functions for each node/link, useful for UI development and testing without requiring the SWMM binary.

### Report Parser (`parseRptToResults`)

Parses the `.rpt` text file to extract:
- Node depth/head/inflow/flooding summaries from the "Node Depth Summary" table
- Link flow/velocity/depth/capacity summaries from the "Link Flow Summary" table
- Subcatchment runoff summaries from the "Subcatchment Runoff Summary" table
- Generates synthetic time-series arrays from peak values for animation

---

## 9. CFL Analysis & Discretization

**File:** `client/src/lib/cfl-analysis.ts` (361 lines)

### CFL Analysis (`computeCflAnalysis`)

Evaluates the Courant-Friedrichs-Lewy condition for every conduit:

```
Courant Number = (celerity * routingStep) / conduitLength
celerity = sqrt(g * diameter)
g = 32.174 ft/s^2 (US) or 9.81 m/s^2 (SI)
```

A conduit is **flagged** when Courant > 1.0 (wave travels further than conduit length in one time step).

Returns: array of `{ conduitId, length, diameter, celerity, cflTimeStep, courant, flagged }` for all conduits.

### Discretization Algorithm (`discretizeProject`)

Splits flagged conduits into shorter segments to satisfy CFL condition:

1. **Lengthening (optional)**: Pre-pass extends very short conduits to minimum CFL-stable length: `L_min = sqrt(g * diameter) * lengtheningStep`

2. **Target length calculation** (per method):
   - **Fixed Interval**: Clamp between `fixedMinLength` and `fixedMaxLength`
   - **dx/D Ratio**: `targetLength = diameter * dxDRatio`

3. **Segment count**: `n = ceil(originalLength / targetLength)`

4. **Skip rules**: Conduits with DUMMY or IRREGULAR cross-sections are preserved as-is

5. **Splitting**: For each conduit with n > 1:
   - Creates n-1 new intermediate **Junctions** (`{conduitId}_N1`, `_N2`, ...)
     - Elevation: linearly interpolated between upstream/downstream nodes
     - Max depth: inherited from upstream node
     - Aponded: set from `mnsa` setting
   - Creates n new **Conduits** (`{conduitId}_1`, `_2`, ...)
     - Same roughness, cross-section shape
     - Length = originalLength / n
     - Entry loss on first segment, exit loss on last, average loss distributed
   - Creates **Coordinates** for new junctions (linearly interpolated X/Y)
   - Creates **XSections** for each new conduit (copied from original)

### Settings (`DiscretizationSettings`)

```typescript
interface DiscretizationSettings {
  method: 'fixed_interval' | 'dx_d_ratio';
  fixedMinLength: number;     // meters/feet
  fixedMaxLength: number;
  dxDRatio: number;           // dimensionless
  lengtheningEnabled: boolean;
  lengtheningStep: number;    // seconds
  mnsa: number;               // minimum nodal surface area (sq ft/m)
}
```

### UI Integration

- **Auto-analysis**: Re-runs `computeCflAnalysis` whenever `project` changes
- **CFL Panel**: Side panel with summary stats, flagged conduit list with "Locate" buttons, discretization settings
- **Map highlighting**: Flagged conduits optionally highlighted on the network map via `cflFlaggedIds`
- **Status bar**: Shows "CFL: OK" or "CFL: X violations"

---

## 10. Import/Export System

**File:** `client/src/lib/import-export.ts` (509 lines)

### CSV Import

| Function | Parameters | Behavior |
|----------|-----------|----------|
| `importCsvNodes(project, csvText, mode)` | mode: `'add'` or `'modify'` | Parses CSV for ID, X, Y, Elevation, MaxDepth, Type columns. Add mode creates new junctions/outfalls/storage; Modify mode updates existing. |
| `importCsvLinks(project, csvText, mode)` | mode: `'add'` or `'modify'` | Parses for ID, FromNode, ToNode, Length, Roughness, Diameter. Validates node existence. Creates conduits + xsections. |

### DXF Import/Export

| Function | Parameters | Output |
|----------|-----------|--------|
| `parseDxfFile(dxfText)` | Raw DXF string | `{ layers: string[], entities: DxfEntity[] }` |
| `importDxfEntities(project, entities, selectedLayers)` | Entities + layer filter | Creates junctions at vertices, conduits between them; deduplicates by coordinate key |
| `exportDxf(project)` | SwmmProject | DXF string with conduits as LINE/LWPOLYLINE entities on "CONDUITS" layer |

### GeoJSON Import

| Function | Parameters | Output |
|----------|-----------|--------|
| `parseGeoJsonToNetwork(geojsonText, featureType)` | `'nodes'` or `'links'` | `{ features, fields }` for field mapping |
| `importGeoJsonNodes(project, features, idField, elevField)` | Point features + field mapping | Creates junctions with mapped ID/elevation |
| `importGeoJsonLinks(project, features, idField)` | LineString features | Creates conduits with auto-generated endpoint junctions |

### CSV Export

| Function | Output |
|----------|--------|
| `exportNodesCsv(project)` | CSV with all nodes (junctions + outfalls + storage), columns: ID, Type, X, Y, Elevation, MaxDepth |
| `exportLinksCsv(project)` | CSV with all conduits, columns: ID, FromNode, ToNode, Length, Roughness, Diameter |

### Utility Functions

- `generateNodeId(project, prefix)`: Generates unique node ID (e.g., J1, J2, ...)
- `generateLinkId(project, prefix)`: Generates unique link ID (e.g., C1, C2, ...)

---

## 11. UI Layout & Menus

**File:** `client/src/pages/swmm-ui.tsx` (2,587 lines)

### Layout Structure

```
+--------------------------------------------------------------+
| Title Bar (#2c3e6b) - "SWMM5-UI" + filename                 |  28px
+--------------------------------------------------------------+
| Menu Bar (#3a5070) - File|Edit|View|Map|Project|Help + icons |  32px
+--------------------------------------------------------------+
| Context Toolbar (#f0f0f4) - changes per active menu          |  52px
+--------------------------------------------------------------+
|           |                              |                    |
| Left      |   Network Map (Canvas)       |  Right Panel       |
| Panel     |   + SpeedBar (floating)      |  (ProjectExplorer) |
| 170px     |   (flex-1)                   |  variable width    |
|           |                              |                    |
+--------------------------------------------------------------+
| Status Bar - sim status, engine mode, CFL, coordinates       |  ~25px
+--------------------------------------------------------------+
```

### Menu Toolbars (change with `activeMenu`)

**File Menu:**
- New, Open (local file), GitHub (browse repos), Save (.inp), Export (Data), Import (Data), Prefs
- Samples dropdown: Greenville US, Greenville SI, User1-5

**Edit Menu:**
- Copy, Paste (properties), Reverse (link direction), Group Edit, Delete

**View Menu:**
- Subcatchment theme selector (None, Runoff, Rainfall, Infiltration, Imperviousness)
- Node theme selector (None, Depth, Head)
- Link theme selector (None, Flow, Velocity, Depth)
- Time Slider + Animate toggle (when results loaded)

**Map Menu:**
- Zoom In/Out, Full Extent, Map Options, Query, Export (PNG image)

**Project Menu:**
- Setup, Locate, Summary, Details
- Run (simulation), Report (view .rpt)
- CFL Analysis
- Engine mode toggle: Local / Remote / Mock

**Help Menu:**
- Topics, Tutorial, Errors, About

---

## 12. Panels & Dialogs

### Left Panel Components (`Panels.tsx`)

**Legend Panel:**
- Layer visibility toggles (junctions, outfalls, storage, conduits, pumps, subcatchments, labels, rain gages)
- Color scale display for active themes
- Click on theme values for details

**Object Locator Panel:**
- Dropdown to select object type (Junction, Conduit, etc.)
- Text input for object ID
- "Find" button centers map on the object

**Map Query Panel:**
- Select element type, property, operator, value
- "Run" evaluates query using `evaluateQuery()` function
- Matching objects highlighted in red on map

### Dialogs (modal overlays)

| Dialog Key | Purpose |
|-----------|---------|
| `preferences` | Flyover hints, confirm deletions, precision, show IDs, background color |
| `github` | Browse GitHub repositories, navigate folders, load `.inp` files |
| `importData` | Tabbed interface: CSV Nodes, CSV Links, DXF, GeoJSON with preview and settings |
| `exportData` | Export to CSV (nodes/links), DXF, or PNG |
| `groupEdit` | Batch-edit properties of selected objects |
| `reportDialog` | View full .rpt file with copy/download; auto-opens on simulation failure |
| `about` | Version info and credits |

---

## 13. Mobile Responsiveness

**Breakpoint:** `window.innerWidth <= 768` -> `isMobile = true`

### Layout Changes
- Left panel (170px) and right panel hidden by default
- Toggle buttons in title bar to show/hide each panel
- Panels open as fixed overlays (`position: fixed, z-index: 50`) with dark backdrop
- Close via X button or backdrop click

### SpeedBar
- Desktop: Vertical floating toolbar on left edge of map
- Mobile: Horizontal scrollable bar at bottom of screen (`isMobile` prop)

### Touch Events
- Single-finger drag: pan the map
- Pinch-to-zoom: two-finger gesture
- Tap: select object or create node (matches click behavior)
- Uses `touchRef` for high-frequency move tracking

### CSS Classes
- `.mobile-hidden`: Hidden at width <= 768px
- `.desktop-hidden`: Hidden at width > 768px

### Dialog Sizing
- Progress monitor: `max-width: min(90vw, 360px)`
- CFL panel: `width: calc(100% - 16px)` on mobile vs `320px` on desktop

---

## 14. Server Routes (API)

**File:** `server/routes.ts` (351 lines)

### GitHub Integration

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/fetch-github?url={url}` | Fetches raw content from GitHub URL (converts blob URLs to raw); validates against allowed hosts |
| `GET` | `/api/github-browse?owner={}&repo={}&path={}` | Lists repo directory contents via GitHub API; returns sorted files/directories |

### Local SWMM Engine

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/swmm/status` | Checks if `runswmm` binary exists at expected path |
| `POST` | `/api/swmm/run` | Runs simulation: writes INP to temp dir, spawns `runswmm`, returns .rpt content |

### Remote Engine Proxy

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/swmm-proxy/status` | Checks local engine first; falls back to remote status |
| `POST` | `/api/swmm-proxy/upload` | Proxies INP file upload to remote batch runner |
| `POST` | `/api/swmm-proxy/batch/:jobId/start` | Starts remote batch job |
| `GET` | `/api/swmm-proxy/batch/:jobId/status` | Polls remote job status |
| `GET` | `/api/swmm-proxy/batch/:jobId/results` | Fetches remote job results |
| `WS` | `/api/swmm-proxy/ws?jobId={id}` | WebSocket proxy for real-time progress from remote runner |

---

## 15. Sample Projects

| File | Description | Units | Key Features |
|------|-------------|-------|-------------|
| `Greenville_US.inp` | Greenville stormwater network | CFS (US) | ~172 junctions, ~14,000 lines, LID, aquifers, groundwater, transects |
| `Greenville_SI.inp` | Same network in metric | CMS (SI) | Same features, SI units |
| `User1.inp` | Mountain Drainage | CMS | 58 subcatchments, Horton infiltration, DynWave routing |
| `User2.inp` | Urban Collection System | CFS | 17 subcatchments, storage nodes, DynWave |
| `User3.inp` | Large Metro Network | CMS | 100+ subcatchments, dual drainage, DynWave |
| `User4.inp` | Regional Stormwater | CFS | 98 subcatchments, large network, DynWave |
| `User5.inp` | Complex Watershed | CFS | 96 subcatchments, Froude-limited, DynWave |

All samples are loaded on-demand via `fetch()` (not bundled into JavaScript).

---

## 16. Design Theme & Colors

### Color Palette

| Element | Color | Hex |
|---------|-------|-----|
| Title bar | Dark navy | `#2c3e6b` |
| Menu bar | Blue-gray | `#3a5070` |
| Toolbar / Status bar | Light gray | `#f0f0f4` |
| Panels | Off-white | `#f8f8fa` |
| Borders | Medium gray | `#d0d0d8` |
| Primary text | Dark navy | `#2a2a3e` |
| Secondary text | Muted | `#6b6b7b` |
| Accent blue | Engineering blue | `#2c6eb5` |
| Map canvas | White | `#ffffff` |
| Grid lines | Light | `rgba(0,0,0,0.06)` |
| Local engine indicator | Green | `#2a8a4a` |
| Remote engine indicator | Blue | `#2c6eb5` |
| Mock engine indicator | Gray | `#6b6b7b` |

### Design Philosophy
Mimics the look and feel of EPA SWMM5 desktop application and similar engineering CAD/GIS tools: professional, information-dense, minimal decorative elements, high contrast for readability.

---

## 17. State Management

All state lives in `swmm-ui.tsx` using React `useState` hooks. No external state library.

### Core State Variables

| Variable | Type | Purpose |
|----------|------|---------|
| `project` | `SwmmProject \| null` | The entire model data |
| `activeMenu` | `string` | Current toolbar tab (File, Edit, View, Map, Project, Help) |
| `selectedObj` | `SelectedObject \| null` | Currently selected map object `{ id, objType }` |
| `interactionMode` | `InteractionMode` | Current map interaction (select, addJunction, addConduit, etc.) |
| `simStatus` | `string` | Simulation state: `none`, `running`, `current`, `outdated` |
| `results` | `SimulationResults \| null` | Parsed simulation output |
| `timeStep` | `number` | Current time index for result visualization |
| `animating` | `boolean` | Whether time-step animation is playing |
| `openDialog` | `string \| null` | Which modal dialog is open |
| `engineMode` | `string` | `local`, `remote`, or `mock` |
| `reportContent` | `string \| null` | Raw .rpt text for report viewer |
| `cflResults` | `CflResult[] \| null` | CFL analysis output per conduit |
| `showCflPanel` | `boolean` | CFL panel visibility |
| `nodeTheme` / `linkTheme` / `subcatchTheme` | `string` | Active thematic map coloring |
| `layerVisibility` | `Record<string, boolean>` | Per-layer toggle for map rendering |
| `preferences` | `SwmmPreferences` | User settings (precision, hints, colors) |

### Data Flow

```
User Action -> swmm-ui.tsx handler -> update project/state
                                   -> NetworkMap re-renders (useEffect)
                                   -> ProjectExplorer re-renders (props)
                                   -> Panels update (props)
```

### Exported Types (cross-component)
- `SwmmPreferences` from `swmm-ui.tsx`
- `InteractionMode` from `SpeedBar.tsx`
- `MapQuery` and `evaluateQuery()` from `Panels.tsx`
- `NetworkMapHandle` (imperative: `getCanvas`, `fitExtent`, `centerOnWorld`) from `NetworkMap.tsx`

---

## 18. Known Gaps & Future Work

### Partially Implemented
- **Title editor**: Display-only; in-place editing not wired up
- **Property editor**: Read-only display; no inline editing of property values
- **Search ancestor expansion**: Works, but clearing search doesn't collapse back to original state
- **Object ID search**: Requires 2+ characters; no fuzzy matching

### Not Yet Implemented
- **Undo/Redo**: No history stack for model changes
- **Inline property editing**: Cannot edit junction elevation, conduit roughness, etc. directly in the property editor
- **Table cell editing**: Data grid is read-only; cannot edit values in the table view
- **Drag-and-drop node moving**: Only Ctrl+drag on selected node works
- **Multi-select on map**: Only group polygon select; no Shift+click
- **Subcatchment creation**: No drawing tool for new subcatchments (only import)
- **Pump curve editor**: No visual editor for pump/storage/tidal curves
- **Time series editor**: No graphical editor for rainfall/inflow time series
- **Cross-section viewer**: No graphical visualization of pipe cross-sections
- **Profile plot**: No longitudinal profile view along a path of conduits
- **Calibration**: No observed data import or calibration comparison tools
- **Print/PDF export**: No print layout or PDF generation
- **User authentication**: No login; all data is session-local
- **Cloud storage**: No save-to-cloud; only local file download

### Engine Limitations
- **Local binary**: Linux x86_64 only; won't work on ARM or other architectures
- **Remote engine**: Depends on external service availability (`batch-swmm-runner-robertdickinson.replit.app`)
- **Binary output**: `.out` file from SWMM not parsed; only `.rpt` text report is used
- **Time-series generation**: Actual time-varying results from `.out` are approximated with synthetic curves from summary statistics

---

## 19. Running & Deploying

### Development

```bash
npm run dev
```

Starts both Express server and Vite dev server on the same port. Hot module replacement is active for all client files.

### Build

```bash
npm run build
```

Uses `tsx script/build.ts` to compile TypeScript and bundle with Vite.

### Production

```bash
npm run start
```

Runs the compiled output from `dist/index.cjs` with `NODE_ENV=production`.

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `SESSION_SECRET` | Express session signing key |

### SWMM Engine Binary

The SWMM engine binary is at `swmm-engine/runswmm`. It was compiled from `swmm-engine/Stormwater-Management-Model-5.2.4/` (EPA SWMM 5.2.4 C source). To recompile:

```bash
cd swmm-engine/Stormwater-Management-Model-5.2.4
cmake -B build -S .
cmake --build build
cp build/bin/runswmm ../../runswmm
```

### Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `react` | 18.3.1 | UI framework |
| `wouter` | 3.3.5 | Client-side routing |
| `@tanstack/react-query` | 5.60.5 | Data fetching |
| `express` | 5.0.1 | HTTP server |
| `ws` | 8.18.0 | WebSocket proxy |
| `lucide-react` | 0.453.0 | Icons |
| `tailwindcss` | (via config) | Styling |
| `@radix-ui/*` | Various | UI primitives (dialog, dropdown, tabs, etc.) |
| `framer-motion` | 11.13.1 | Animations |
| `recharts` | 2.15.2 | Charts (not heavily used yet) |
| `zod` | 3.24.2 | Schema validation |
| `drizzle-orm` | 0.39.3 | ORM (minimal use, no DB required for SWMM) |

---

*This document provides a complete snapshot of the SWMM5-UI project for handover purposes. All file paths, line counts, and architecture descriptions are current as of March 2026.*
