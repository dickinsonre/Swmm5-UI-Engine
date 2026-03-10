# SWMM5-UI — Project Handover Document

## What Is This?

This is a **web-based clone of EPA SWMM5** (Storm Water Management Model), the desktop application used by civil/environmental engineers to model urban stormwater drainage systems. Instead of a Windows desktop app, this runs entirely in the browser with a dark engineering theme.

Users can load SWMM5 `.inp` model files, visualize the stormwater network on an interactive canvas map, run simulations, and manipulate the network — all from a web browser.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend Framework | React 18 + TypeScript | UI components and state management |
| Styling | Tailwind CSS + inline styles | Dark engineering theme (`#1e1e2e` bg, `#4ea8de` accent) |
| Build Tool | Vite | Dev server with HMR, bundling |
| UI Primitives | Radix UI (via shadcn/ui) | Dialogs, switches, labels, scroll areas, progress bars |
| Icons | Lucide React | All toolbar/speed bar icons |
| Backend | Express.js (Node) | Minimal — only serves a GitHub proxy endpoint |
| Routing | wouter | Client-side routing (single page, `/` is the only route) |
| Data Fetching | TanStack Query | Configured but not heavily used (data is all client-side) |
| Database | Drizzle ORM + PostgreSQL | Schema exists but not used — all data lives in React state |
| Simulation | Mock engine (WASM-ready) | Generates fake results; real SWMM5 WASM integration point exists |

---

## File Structure & What Each File Does

### Frontend — Main Application (`client/src/`)

#### `pages/swmm-ui.tsx` (1,493 lines) — **The Brain**
This is the main page component. Everything flows through here.

**What it manages:**
- `project` state — the entire SWMM model (all nodes, links, subcatchments, coordinates, etc.)
- `selectedObj` — which node/link/subcatchment is currently selected
- `interactionMode` — what the user is doing (select, addJunction, addConduit, groupSelect, etc.)
- `results` / `simStatus` — simulation output and progress
- `preferences` — user settings stored in localStorage
- File I/O (open from disk, GitHub URL, save/download)
- Context menu state (right-click actions)
- Link drawing state (rubber-band line when creating conduits/pumps)
- Group selection state (polygon points, selected IDs, group edit dialog)

**Key callbacks defined here:**
- `handleCreateNode(wx, wy, mode)` — places a new junction/outfall/storage at world coordinates
- `handleStartLink(nodeId)` / `handleCompleteLink(toNodeId, vertices)` — link drawing workflow
- `handleMoveNode(nodeId, wx, wy)` — Ctrl+drag node repositioning
- `handleDelete()` / `deleteObject(obj)` — removes objects with full graph integrity (deleting a node also removes all connected links)
- `handleCopy()` / `handlePaste()` / `handleReverseLink()` — context menu actions
- `handleGroupSelectComplete()` / `handleGroupEdit()` / `handleGroupDelete()` — polygon group operations
- `handleRunSimulation()` — runs mock engine, stores results
- `handleSave()` / `handleFileOpen()` / `handleGithubLoad()` — file I/O

**UI sections rendered:**
1. Title bar (app name + filename)
2. Menu tabs (File, Edit, View, Map, Project, Help)
3. Context toolbar (changes based on active menu tab)
4. Simulation progress bar (when running)
5. Three-column layout: Left sidebar (Legend/Locator/Query) | Map + SpeedBar | Right sidebar (Project Explorer)
6. Status bar (flow units, routing model, node/link counts)
7. Dialogs (GitHub load, Preferences, Export, Group Edit)
8. Context menu (right-click popup)

**Exports:** `SwmmPreferences` interface (imported by NetworkMap)

---

#### `components/swmm/NetworkMap.tsx` (1,013 lines) — **The Canvas Renderer**
An HTML5 Canvas component that draws the entire stormwater network and handles all mouse interactions.

**Rendering pipeline (in the main `useEffect`):**
1. Clear canvas with background color (from preferences)
2. Draw grid lines
3. Draw subcatchment polygons (filled + labeled)
4. Draw rain gage symbols (triangles)
5. Draw links (conduits, pumps, weirs, orifices, outlets) with direction arrows
6. Draw nodes (junctions=circles, outfalls=triangles, storage=squares, dividers=diamonds)
7. Draw labels
8. Draw rubber-band line (when drawing a new link)
9. Draw group selection polygon (when in groupSelect mode)

**Coordinate system:**
- World coordinates: standard math (Y up)
- Screen coordinates: canvas pixels (Y down)
- Conversion: `worldToScreen(wx, wy) → [wx * zoom + panX, -wy * zoom + panY]` (Y is inverted)
- Reverse: `screenToWorld(sx, sy) → [(sx - panX) / zoom, -(sy - panY) / zoom]`

**Mouse handling:**
- `handleMouseDown` — starts pan/drag, detects Ctrl+drag for node moving
- `handleMouseMove` — pans map, updates rubber-band position, shows flyover tooltips
- `handleMouseUp` — handles clicks based on `interactionMode`:
  - `select`: hit-test nodes → links → subcatchments
  - `addJunction`/`addOutfall`/`addStorage`: calls `onCreateNode` with world coords
  - `addConduit`/`addPump`: start link on node, add vertices on empty space, complete on second node
  - `groupSelect`: adds polygon points
- `handleRightClick` — context menu (select mode) or close polygon (groupSelect) or exit mode
- `handleDoubleClick` — close polygon (groupSelect) or fit-to-extent (select)
- `handleWheel` — zoom in/out centered on cursor position

**Hit testing (extracted to reusable functions):**
- `hitTestNode(sx, sy)` — checks distance to all visible nodes (12px radius)
- `hitTestLink(sx, sy)` — checks distance to all visible link line segments (8px)
- `pointInPolygon()` — ray-casting for subcatchment/group polygon containment

**Props it receives from swmm-ui.tsx:**
- Project data, selection state, theme settings, layer visibility
- Interaction mode, preferences, query highlight data
- Callbacks: onCreateNode, onStartLink, onCompleteLink, onAddLinkVertex, onMoveNode, onContextMenu, onGroupSelectPoint, onGroupSelectComplete, onEscapeMode
- Drawing state: linkDrawState, groupSelectPoints, groupSelectedIds

**Exports:** `NetworkMapHandle` interface (`getCanvas`, `fitExtent`, `centerOnWorld`) via `forwardRef`/`useImperativeHandle`

---

#### `components/swmm/Panels.tsx` (852 lines) — **Side Panels**
Contains four panel components:

1. **`LegendPanel`** — Color scales for subcatchment/node/link themes + layer visibility toggles (checkboxes for junctions, storage, outfalls, conduits, pumps, weirs, subcatchments, labels, raingages)

2. **`ProjectExplorer`** — Tree view of all project objects organized by category. Click an item to select it. When an object is selected, shows a property table below the tree. If simulation results exist, also shows result values for the current time step.

3. **`ObjectLocatorPanel`** — Dropdown to pick object type + text input for ID. "Find" button locates and centers the map on the object. "List" button shows all objects of that type in a scrollable list.

4. **`MapQueryPanel`** — Select object type (Node/Link/Subcatchment), property, comparison operator (>, <, =, >=, <=), and numeric value. "Run Query" highlights matching objects in red on the map, non-matching in gray.

**Exports:** `evaluateQuery()` function, `MapQuery` type

---

#### `components/swmm/SpeedBar.tsx` (110 lines) — **Vertical Toolbar**
A floating vertical toolbar positioned on the right side of the map. Contains icon buttons for:
- **Tools:** Select, Add Junction, Add Outfall, Add Storage, Add Conduit, Add Pump, Add Label, Group Select
- **Actions:** Delete, Run Simulation, Full Extent

Active tool gets a blue border/background highlight. Each button has a tooltip.

**Exports:** `InteractionMode` type

---

#### `lib/swmm-types.ts` (348 lines) — **Data Model**
TypeScript interfaces for the entire SWMM5 data model:
- **Nodes:** `Junction`, `Outfall`, `Divider`, `StorageUnit`
- **Links:** `Conduit`, `Pump`, `Orifice`, `Weir`, `Outlet`
- **Subcatchments:** `Subcatchment`, `SubareaData`, `InfiltrationData`
- **Supporting:** `RainGage`, `XSection`, `LossData`, `CurvePoint`, `TimeSeriesPoint`, `PatternData`, `MapLabel`, `MapExtent`, `Pollutant`, `LandUse`, `DWFEntry`
- **Results:** `NodeResult`, `LinkResult`, `SubcatchResult`, `TimeStepResults`, `SimulationResults`
- **Container:** `SwmmProject` (holds everything)
- **Selection:** `SelectedObject` (union type with objType discriminator)

Also exports `createEmptyProject()` factory function.

---

#### `lib/inp-parser.ts` (976 lines) — **INP File Parser**
Parses EPA SWMM5 `.inp` text files into `SwmmProject` objects. Handles all major sections:

`[TITLE]`, `[OPTIONS]`, `[REPORT]`, `[RAINGAGES]`, `[SUBCATCHMENTS]`, `[SUBAREAS]`, `[INFILTRATION]`, `[JUNCTIONS]`, `[OUTFALLS]`, `[DIVIDERS]`, `[STORAGE]`, `[CONDUITS]`, `[PUMPS]`, `[ORIFICES]`, `[WEIRS]`, `[OUTLETS]`, `[XSECTIONS]`, `[LOSSES]`, `[CURVES]`, `[TIMESERIES]`, `[PATTERNS]`, `[CONTROLS]`, `[DWF]`, `[POLLUTANTS]`, `[LANDUSES]`, `[COORDINATES]`, `[VERTICES]`, `[POLYGONS]`, `[SYMBOLS]`, `[LABELS]`, `[MAP]`

Also exports:
- `projectToInp(project)` — serializes back to INP text format
- `SAMPLE_INP` — a built-in example network (embedded as a string constant)

---

#### `lib/swmm-engine.ts` (160 lines) — **Simulation Engine**

Two engine implementations:
1. **`createMockEngine()`** — Currently used. Generates 96 time steps (15-min intervals over 24 hours) with a Gaussian storm peak at t=24. Produces plausible depth/flow/velocity values for all nodes, links, and subcatchments.
2. **`createWasmEngine()`** — Stub for real SWMM5 WASM binary. Not currently used. Would load a `.wasm` file, write the INP to a virtual filesystem, call the SWMM5 solver, and read results.

---

### Backend (`server/`)

#### `server/routes.ts` (49 lines)
Single API endpoint:
- `GET /api/fetch-github?url=<github-url>` — SSRF-secured proxy that fetches raw file content from GitHub. Only allows HTTPS URLs to `raw.githubusercontent.com` and `gist.githubusercontent.com`. Follows no redirects.

#### `server/index.ts` (103 lines)
Standard Express setup. In development, attaches Vite middleware for HMR. In production, serves static files from `dist/public`. Listens on port 5000.

#### `server/storage.ts` (38 lines)
Memory-based storage interface. Currently minimal — the app doesn't persist data server-side.

#### `shared/schema.ts` (18 lines)
Drizzle ORM schema with a `users` table. Not actively used by the SWMM5 UI — leftover from the template.

---

## How Data Flows

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  .inp File      │────▶│  inp-parser   │────▶│  SwmmProject    │
│  (text)         │     │  parseInpFile │     │  (React state)  │
└─────────────────┘     └──────────────┘     └────────┬────────┘
                                                       │
                              ┌─────────────────────────┤
                              │                         │
                              ▼                         ▼
                   ┌──────────────────┐     ┌──────────────────┐
                   │   NetworkMap     │     │  ProjectExplorer  │
                   │   (Canvas)       │     │  (Tree + Props)   │
                   └──────────────────┘     └──────────────────┘
                              │
                              │ user clicks "Run"
                              ▼
                   ┌──────────────────┐
                   │  swmm-engine     │
                   │  (mock results)  │
                   └────────┬─────────┘
                            │
                            ▼
                   ┌──────────────────┐
                   │ SimulationResults│──▶ colors nodes/links by theme
                   │ (96 time steps)  │──▶ time slider + animation
                   └──────────────────┘
```

---

## Interaction Modes — How User Actions Work

| Mode | Trigger | What Happens on Map Click |
|------|---------|--------------------------|
| `select` | Default / Speed Bar "Select" | Hit-test nodes → links → subcatchments, select object |
| `addJunction` | Speed Bar "Junction" | Creates new junction at click position (auto-ID: J1, J2...) |
| `addOutfall` | Speed Bar "Outfall" | Creates new outfall (auto-ID: OF1, OF2...) |
| `addStorage` | Speed Bar "Storage" | Creates new storage unit (auto-ID: SU1, SU2...) |
| `addConduit` | Speed Bar "Conduit" | 1st click on node: start. Clicks on empty: add vertices. Click on 2nd node: complete. (auto-ID: C1, C2...) |
| `addPump` | Speed Bar "Pump" | Same as conduit but creates a pump (auto-ID: P1, P2...) |
| `groupSelect` | Speed Bar "Group" | Each click adds a polygon vertex. Double-click or right-click closes polygon. All enclosed objects get selected. Group Edit dialog opens. |

**Escape key** or **right-click** exits any mode back to `select`.

---

## Context Menu (Right-Click)

When right-clicking on an object in select mode:
- **Copy** — stores the object's properties in memory
- **Paste** — applies copied properties to another object of the same type (preserves ID and connectivity)
- **Reverse** — (links only) swaps fromNode/toNode and reverses vertex order
- **Delete** — removes the object. If it's a node, also removes all connected links and their associated data (vertices, cross-sections, losses)

Right-clicking empty space shows "No object selected".

---

## Preferences (Stored in localStorage)

| Setting | Default | Effect |
|---------|---------|--------|
| Flyover Map Hints | ON | Show tooltips when hovering objects |
| Confirm Deletions | ON | (Wired but not enforced yet) |
| Numerical Precision | 2 | Decimal places in displays |
| Blinking Map Marker | ON | (Visual preference, not yet implemented) |
| Show Node IDs | ON | Render node ID text on canvas |
| Show Link IDs | ON | Render link ID text on canvas |
| Background Color | `#141a26` | Canvas background color picker |

Stored under `localStorage` key `'swmm5-preferences'`.

---

## Map Features

### Flyover Tooltips
Hovering over an object shows a small popup with the object ID and a value:
- **Nodes:** Current theme value (Depth/Head) if sim results exist, otherwise Elevation
- **Links:** Flow/Velocity/Depth if results, otherwise Length or type
- **Subcatchments:** Runoff/Rainfall/Infiltration/% Imperv

### Object Locator
Found under **Project > Locate**. Lets you search by type + ID, centers the map on the found object.

### Map Query
Found under **Map > Query**. Filter objects by property (e.g., "all nodes with elevation > 100"). Matching objects render in red, non-matching in gray.

### Map Export
Found under **Map > Export**. Download the canvas as a PNG file or copy to clipboard. Option to include a rendered legend strip.

### Group Edit
After closing a group selection polygon:
- Dialog shows count of selected objects
- Pick a property and new value to batch-apply
- Or "Delete All" to remove everything in the selection (with graph integrity — connected links are also removed)

---

## Key Technical Details

### Y-Axis Inversion
SWMM coordinates use standard math convention (Y increases upward). The canvas uses screen convention (Y increases downward). The `worldToScreen` function inverts Y:
```
screen_x = world_x * zoom + panX
screen_y = -world_y * zoom + panY   ← note the negative
```

### Auto-Fit on Load
When a project is loaded, the map automatically calculates the extent of all coordinates/polygons and sets zoom/pan to fit everything on screen with 15% padding.

### ID Generation
New objects get auto-generated IDs by prefix:
- Junctions: `J1`, `J2`, `J3`...
- Outfalls: `OF1`, `OF2`, `OF3`...
- Storage: `SU1`, `SU2`, `SU3`...
- Conduits: `C1`, `C2`, `C3`...
- Pumps: `P1`, `P2`, `P3`...

The generator scans existing IDs to avoid collisions.

### Graph Integrity
When deleting a node, the app also:
1. Removes all conduits/pumps/orifices/weirs/outlets connected to that node
2. Cleans up associated vertices, cross-sections, and loss data
3. Updates all relevant project arrays immutably

---

## What's Not Implemented Yet

1. **Real SWMM5 WASM engine** — the `createWasmEngine()` stub exists but the `.wasm` binary isn't included
2. **Subcatchment creation** — no tool to draw new subcatchment polygons
3. **Label placement** — addLabel mode exists in SpeedBar but click handler not connected
4. **Weir/Orifice/Outlet drawing** — only Conduit and Pump link creation modes work
5. **Confirm deletion prompt** — preference exists but not enforced in delete handlers
6. **Blinking map marker** — preference exists but visual effect not implemented
7. **Undo/Redo** — no history stack
8. **Property editing** — Project Explorer shows properties read-only; inline editing not implemented
9. **Report generation** — Report button exists but no actual report dialog
10. **Cross-section editor** — no visual editor for pipe shapes

---

## Running the Project

The app runs via `npm run dev` which starts:
1. Express backend on port 5000
2. Vite dev server (attached as middleware) for frontend HMR

In production, Vite builds static assets to `dist/public` and Express serves them.

---

## Sample Data

A built-in sample network (`SAMPLE_INP` in `inp-parser.ts`) is loaded by default when the app starts. This provides a working network to interact with immediately without uploading a file. It contains junctions, conduits, outfalls, subcatchments, rain gages, and all necessary coordinates/polygons.
