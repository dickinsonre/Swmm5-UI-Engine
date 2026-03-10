# SWMM5-UI

## Overview
Web-based interface for EPA SWMM5 (Storm Water Management Model). Reads SWMM5 INP files from desktop or GitHub, visualizes stormwater networks on a canvas map, and runs the SWMM5 engine (mock/WASM).

## Architecture
- **Frontend**: React + TypeScript + Tailwind CSS with dark engineering theme
- **Backend**: Express.js (minimal - just GitHub proxy endpoint)
- **No database required** - all data is client-side INP file parsing

## Key Files
### Frontend
- `client/src/pages/swmm-ui.tsx` - Main page layout (menus, toolbar, status bar, file handling)
- `client/src/components/swmm/NetworkMap.tsx` - Canvas-based network visualization with pan/zoom
- `client/src/components/swmm/Panels.tsx` - Legend panel + Project Explorer with property editor
- `client/src/lib/swmm-types.ts` - TypeScript interfaces for all SWMM5 model objects
- `client/src/lib/inp-parser.ts` - Complete SWMM5 INP file parser (all major sections)
- `client/src/lib/swmm-engine.ts` - WASM engine wrapper with mock fallback

### Backend
- `server/routes.ts` - GitHub file proxy endpoint (`/api/fetch-github`, SSRF-secured with allowlist)

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

## UI Layout
```
Title Bar | Menu Bar (File|Edit|View|Map|Project|Help)
Context Toolbar (changes per menu)
Legend | Network Map (Canvas) | Project Explorer + Properties
Status Bar
```

## Design Theme
- Background: `#1e1e2e`, Surface: `#2a2a3e`, Accent: `#4ea8de`
- Font: JetBrains Mono for labels
- Y-axis inverted in worldToScreen: `[wx * zoom + panX, -wy * zoom + panY]`

## Mouse Interaction
- Click: select nodes/links/subcatchments (mouseDownPos + hasDragged pattern)
- Drag: pan the map
- Scroll: zoom
- Double-click: fit to extent

## WASM Engine
Currently uses a mock engine that generates plausible time-varying results. The `swmm-engine.ts` file has the integration point for a real SWMM5 WASM binary (`createWasmEngine()`).
