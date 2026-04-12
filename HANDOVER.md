# EPA SWMM5-UI — Comprehensive Handover Document

**Project**: Web-based EPA SWMM5 User Interface  
**Date**: April 12, 2026  
**Codebase Size**: ~20,721 lines across 20 core files  
**Stack**: React 18 + TypeScript + Express.js + Vite + Tailwind CSS  
**Database**: None — all data is client-side from INP file parsing

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [File Inventory & Line Counts](#3-file-inventory--line-counts)
4. [Data Model & Type System](#4-data-model--type-system)
5. [INP File Parser & Writer](#5-inp-file-parser--writer)
6. [Binary Output Parser](#6-binary-output-parser)
7. [Simulation Engines (4 Modes)](#7-simulation-engines-4-modes)
8. [Extended Variables System (200+)](#8-extended-variables-system-200)
9. [computeExtendedVariables — Three-Level Architecture](#9-computeextendedvariables--three-level-architecture)
10. [Network Map Canvas](#10-network-map-canvas)
11. [Main UI Page (swmm-ui.tsx)](#11-main-ui-page-swmm-uitsx)
12. [Component Inventory](#12-component-inventory)
13. [Server / API Routes](#13-server--api-routes)
14. [CFL Stability Analysis](#14-cfl-stability-analysis)
15. [Import / Export](#15-import--export)
16. [Design Theme & Styling](#16-design-theme--styling)
17. [WASM Engine Compilation](#17-wasm-engine-compilation)
18. [New Features (Session 2)](#18-new-features-session-2)
19. [Known Bugs Fixed & Technical Debt](#19-known-bugs-fixed--technical-debt)
20. [Critical Implementation Details](#20-critical-implementation-details)
21. [Deployment & Runtime](#21-deployment--runtime)

---

## 1. Project Overview

SWMM5-UI is a full-featured web-based replacement for the EPA SWMM 5.2 desktop application. It provides desktop-grade feature parity including:

- **INP file round-trip**: Parse any SWMM5 `.inp` file, edit in-browser, save back to valid `.inp`
- **Canvas visualization**: Pan/zoom network map with depth fills, flooding halos, flow arrows, subcatchment polygons, backdrop images
- **4 simulation engines**: Local binary, in-browser WASM, remote cloud API, and mock/testing
- **200+ extended variables**: Three-level diagnostic system computing hydraulic internals beyond standard EPA output
- **Full editing suite**: Property editor, project explorer, data editors (curves, time series, patterns, controls), analysis options
- **AI-assisted diagnostics**: 25+ error rules, parameter reference tables, auto-fix capabilities
- **GIS/CAD interop**: CSV, DXF, GeoJSON import/export
- **CFL stability analysis**: Courant number computation and automatic conduit discretization

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    BROWSER (Client)                      │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐ │
│  │ INP      │  │ SWMM     │  │  React UI              │ │
│  │ Parser   │→ │ Project  │→ │  swmm-ui.tsx (6074 ln)  │ │
│  │ (1515 ln)│  │ (in-mem) │  │  NetworkMap (1549 ln)   │ │
│  └──────────┘  └──────────┘  │  ProjectExplorer        │ │
│                               │  PropertyEditor         │ │
│  ┌──────────┐  ┌──────────┐  │  SubDialogs             │ │
│  │ .out     │  │ Sim      │  │  DataEditors            │ │
│  │ Parser   │→ │ Results  │→ │  TableViewDialog        │ │
│  │ (201 ln) │  │ (in-mem) │  │  AIAssistPanel          │ │
│  └──────────┘  └──────────┘  └────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │            Simulation Engines                       │  │
│  │  ┌──────┐ ┌──────┐ ┌────────┐ ┌──────┐           │  │
│  │  │WASM  │ │Local │ │Remote  │ │Mock  │           │  │
│  │  │(browser)│(API) │ │(cloud) │ │(test)│           │  │
│  │  └──────┘ └──────┘ └────────┘ └──────┘           │  │
│  │           ↓                                        │  │
│  │  computeExtendedVariables() → 200+ vars            │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬───────────────────────┘
                                   │ HTTP / WebSocket
┌──────────────────────────────────┴───────────────────────┐
│                    SERVER (Express.js)                    │
│                                                          │
│  /api/swmm/run-or-proxy  → Local binary execution        │
│  /api/swmm-proxy/*       → Remote BatchSWMM proxy        │
│  /api/fetch-github       → GitHub raw file proxy          │
│  /api/github-browse      → GitHub API directory listing   │
└──────────────────────────────────────────────────────────┘
```

**Key Principle**: The client does ALL data management. The server is a thin proxy layer for engine execution, GitHub fetching, and remote API forwarding.

---

## 3. File Inventory & Line Counts

### Core Application Files (20,721 lines total)

| File | Lines | Purpose |
|------|------:|---------|
| `client/src/pages/swmm-ui.tsx` | 6,074 | Main UI — all state, toolbars, menus, dialogs, layout |
| `client/src/components/swmm/NetworkMap.tsx` | 1,549 | Canvas network visualization |
| `client/src/components/swmm/DataEditors.tsx` | 1,456 | Time series, curves, patterns, controls, pollutants, land uses, LID, evap, aquifers |
| `client/src/lib/inp-parser.ts` | 1,515 | INP file parser + writer (`projectToInp`) |
| `client/src/components/swmm/ProjectExplorer.tsx` | 1,412 | Tree navigation + property panel + data grid |
| `client/src/lib/swmm-engine.ts` | 1,284 | 4 engine adapters + `computeExtendedVariables` |
| `client/src/components/swmm/SubDialogs.tsx` | 1,107 | 8 modal sub-dialog editors |
| `client/src/components/swmm/Panels.tsx` | 1,030 | Legend, Object Locator, Map Query panels |
| `client/src/components/swmm/PropertyEditor.tsx` | 783 | Docked property grid with schemas for all 12 object types |
| `client/src/components/swmm/HelpDialogs.tsx` | 616 | Help topics, tutorial, error guide |
| `client/src/components/swmm/AIAssistPanel.tsx` | 585 | AI assist: Errors, Parameters, Insights, Auto-Fix |
| `client/src/components/swmm/TableViewDialog.tsx` | 550 | Tabular result views (by object or by variable) |
| `client/src/lib/import-export.ts` | 509 | CSV/DXF/GeoJSON import + CSV/DXF export |
| `client/src/lib/swmm-types.ts` | 462 | All TypeScript interfaces |
| `server/routes.ts` | 408 | Express API routes |
| `client/src/lib/swmm-variables.ts` | 394 | 200+ variable catalog |
| `client/src/lib/cfl-analysis.ts` | 361 | CFL stability + discretization |
| `client/src/components/swmm/AnalysisOptionsDialog.tsx` | 259 | Analysis options (5 tabs) |
| `client/src/lib/swmm-out-parser.ts` | 201 | Binary .out file parser |
| `client/src/components/swmm/SpeedBar.tsx` | 166 | Vertical drawing tool palette |

### Engine / WASM Files

| File | Size | Purpose |
|------|------|---------|
| `swmm-engine/runswmm` | 511 KB | Compiled EPA SWMM 5.2.4 Linux binary |
| `swmm-engine/Stormwater-Management-Model-5.2.4/` | — | Full SWMM source code |
| `client/public/swmm_engine.js` | 65 KB | Emscripten JS glue for WASM engine |
| `client/public/swmm_engine.wasm` | 455 KB | Compiled WASM SWMM engine |

---

## 4. Data Model & Type System

All types live in `client/src/lib/swmm-types.ts` (462 lines).

### SwmmProject — Central Data Structure

```typescript
interface SwmmProject {
  title: string[];
  options: Record<string, string>;
  reportOptions: Record<string, string>;

  raingages: RainGage[];
  subcatchments: Subcatchment[];
  subareas: Record<string, SubareaData>;
  infiltration: Record<string, InfiltrationData>;

  junctions: Junction[];
  outfalls: Outfall[];
  dividers: Divider[];
  storageUnits: StorageUnit[];

  conduits: Conduit[];
  pumps: Pump[];
  orifices: Orifice[];
  weirs: Weir[];
  outlets: Outlet[];

  xsections: Record<string, XSection>;
  losses: Record<string, LossData>;

  curves: Record<string, CurvePoint[]>;
  timeseries: Record<string, TimeSeriesPoint[]>;
  patterns: Record<string, PatternData>;
  controls: string[];
  dwf: DWFEntry[];

  pollutants: Pollutant[];
  landuses: LandUse[];

  lidControls: LidControl[];
  lidUsage: LidUsage[];

  groundwater: Groundwater[];
  aquifers: Aquifer[];

  transects: Transect[];
  snowpacks: SnowPack[];
  streets: Street[];
  inlets: Inlet[];
  inletUsage: InletUsage[];

  coordinates: Record<string, [number, number]>;
  vertices: Record<string, [number, number][]>;
  polygons: Record<string, [number, number][]>;
  symbols: Record<string, [number, number]>;
  labels: MapLabel[];
  mapExtent: MapExtent | null;

  rawSections: Record<string, string[]>;

  results: SimulationResults | null;
}
```

### Simulation Results

```typescript
interface SimulationResults {
  timeSteps: TimeStepResults[];
  summary: {
    totalDuration: number;
    reportingSteps: number;
    routingModel: string;
    continuityErrors: { runoff: number; flow: number; quality: number; };
  };
  reportContent?: string;
}

interface TimeStepResults {
  time: number;
  dateTime: string;
  nodes: Record<string, NodeResult>;
  links: Record<string, LinkResult>;
  subcatchments: Record<string, SubcatchResult>;
  system?: SystemResult;
}
```

### Result Objects

```typescript
interface NodeResult {
  depth: number;
  head: number;
  volume: number;
  lateralInflow: number;
  totalInflow: number;
  flooding: number;
  extended?: Record<string, number>;
}

interface LinkResult {
  flow: number;
  depth: number;
  velocity: number;
  volume: number;
  capacity: number;
  extended?: Record<string, number>;
}

interface SubcatchResult {
  rainfall: number;
  snowDepth: number;
  evap: number;
  infiltration: number;
  runoff: number;
  gwOutflow: number;
  gwElev: number;
  moisture: number;
  extended?: Record<string, number>;
}
```

### Physical Object Interfaces

**Nodes:**
| Type | Key Fields |
|------|-----------|
| `Junction` | id, elevation, maxDepth, initDepth, surDepth, aponded |
| `Outfall` | id, elevation, type (FREE/NORMAL/FIXED/TIDAL/TIMESERIES), stageData?, gated, routeTo? |
| `Divider` | id, elevation, divertedLink, type, cutoffFlow?, curve?, maxDepth, initDepth, surDepth, aponded |
| `StorageUnit` | id, elevation, maxDepth, initDepth, shape, curveParams, surDepth, fevap, psi?, ksat?, imd? |

**Links:**
| Type | Key Fields |
|------|-----------|
| `Conduit` | id, fromNode, toNode, length, roughness, inOffset, outOffset, initFlow, maxFlow |
| `Pump` | id, fromNode, toNode, pumpCurve, status, startupDepth?, shutoffDepth? |
| `Orifice` | id, fromNode, toNode, type, offset, cd, gated, closeTime |
| `Weir` | id, fromNode, toNode, type, crestHeight, cd, gated, ec, cd2, surcharge, width? |
| `Outlet` | id, fromNode, toNode, offset, type, curveOrTable |

**XSection** (keyed by link ID):
```typescript
interface XSection {
  shape: string;
  geom1: number | string;
  geom2: number;
  geom3: number;
  geom4: number;
  barrels?: number;
}
```

### XSection Shape Semantics (Critical Reference)

| Shape | geom1 | geom2 | geom3 | geom4 |
|-------|-------|-------|-------|-------|
| CIRCULAR | diameter | — | — | — |
| RECT_CLOSED | height | width | — | — |
| RECT_OPEN | height | width | — | — |
| TRAPEZOIDAL | height | bottom width | left side slope | right side slope |
| TRIANGULAR | height | side slope | — | — |
| HORIZ_ELLIPSE | height | width | — | — |
| VERT_ELLIPSE | height | width | — | — |
| ARCH | height | width | — | — |
| PARABOLIC | height | width | — | — |
| POWER | height | width | exponent | — |
| IRREGULAR | transect name | — | — | — |

---

## 5. INP File Parser & Writer

**File**: `client/src/lib/inp-parser.ts` (1,515 lines)

### Parsing (`parseInpFile`)

Parses EPA SWMM5 `.inp` text files into `SwmmProject` objects.

**Flow:**
1. `extractSections(text)` — Scans for `[SECTION_NAME]` headers, groups lines, filters ALL comment lines (starting with `;`)
2. Individual section parsers called: `parseRaingages()`, `parseJunctions()`, `parseConduits()`, etc.
3. Unknown sections stored in `rawSections` for lossless round-tripping

**Sections Parsed** (30+):
TITLE, OPTIONS, REPORT, RAINGAGES, SUBCATCHMENTS, SUBAREAS, INFILTRATION, JUNCTIONS, OUTFALLS, DIVIDERS, STORAGE, CONDUITS, PUMPS, ORIFICES, WEIRS, OUTLETS, XSECTIONS, LOSSES, COORDINATES, VERTICES, POLYGONS, SYMBOLS, LABELS, MAP, LID_CONTROLS, LID_USAGE, AQUIFERS, GROUNDWATER, SNOWPACKS, TRANSECTS, POLLUTANTS, LANDUSES, DWF, TIMESERIES, CURVES, PATTERNS, CONTROLS, STREETS, INLETS, INLET_USAGE

**Special Parsing Rules:**
- **Timeseries**: Handles 4-token format `Name Date Time Value` (date contains `/`, time contains `:`) by combining date+time into single dateTime field. FILE-backed timeseries skipped.
- **Curves**: First point of each curve stores `type` property (STORAGE, PUMP1, etc.)
- **Outfalls**: FREE/NORMAL types have no stageData; FIXED/TIDAL/TIMESERIES do
- **Storage**: TABULAR shape takes 1 curveParam; FUNCTIONAL takes 3 (A, B, C)
- **Patterns**: DAILY chunk size 7 (Sun-Sat), all others chunk size 6
- **XSection geom1**: `number | string` — string only for IRREGULAR shape (transect name)

### Writing (`projectToInp`)

Serializes `SwmmProject` back to valid `.inp` text.

**Key behaviors:**
- Maintains `Set<string>` of valid node and link IDs for cross-reference validation
- Conduits/pumps/weirs/orifices/outlets filtered by valid node references
- XSections filtered by valid link references
- DWF filtered by valid node references
- Columnar alignment via `.padEnd(16)` and `.toFixed(3)` formatting
- Raw sections appended at end for lossless fidelity
- **Includes `SAMPLE_INP` constant** (lines 1337-1515) used for default project initialization

---

## 6. Binary Output Parser

**File**: `client/src/lib/swmm-out-parser.ts` (201 lines)

### `parseSwmmOut(buffer: ArrayBuffer, project: SwmmProject): SimulationResults`

Parses the EPA SWMM 5 binary `.out` file format.

**Binary Format:**
- Byte order: Little-endian
- Magic number: `516114522`
- Version check: `52004` for SWMM 5.2.x
- Data types: Int32 (counts), Float32 (values), Float64 (dates)

**Header Layout:**
```
[Magic:Int32] [Version:Int32] [FlowUnits:Int32] [nSubcatch:Int32]
[nNodes:Int32] [nLinks:Int32] [nPollutants:Int32]
[...subcatchment names (length-prefixed strings)...]
[...node names...]
[...link names...]
[...pollutant names...]
[...static properties (skipped)...]
[ReportStartDate:Float64] [ReportStep:Int32]
```

**Per-Timestep Record:**
```
[DateTime:Float64]
[nSubcatch x (8 + nPollutants) x Float32]  — subcatchment results
[nNodes x (6 + nPollutants) x Float32]     — node results
[nLinks x (5 + nPollutants) x Float32]     — link results
[nSysVars x Float32]                        — system results (14 or 15 vars)
```

**Variable Counts per Object:**
| Object | Standard Vars | + Pollutants |
|--------|--------------|-------------|
| Subcatchment | 8 | + nPollutants |
| Node | 6 | + nPollutants |
| Link | 5 | + nPollutants |
| System | 14 (pre-5.2) or 15 (5.2+) | — |

**Performance Guard:** Capped at 5,000 time periods per parse.

**nPeriods Detection:** Reads from end-of-file footer or calculates from file size / bytesPerStep.

### `parseRptToResults` (Fallback — in swmm-engine.ts)

When binary `.out` is missing but text `.rpt` exists:
- Parses summary tables via regex ("Node Depth Summary", "Link Flow Summary")
- Generates synthetic 24-hour time series (96 steps) using decaying sine wave
- Distributes peak values from report across timesteps with node/link lags
- Ensures UI can still show maps and charts with approximate data

---

## 7. Simulation Engines (4 Modes)

**File**: `client/src/lib/swmm-engine.ts` (1,284 lines)

### Engine Priority: Local > WASM > Remote > Mock

Detection on startup via `checkLocalEngine()`, `checkWasmEngine()`, `checkRemoteEngine()`.

### Interface

```typescript
interface SwmmEngine {
  run(project: SwmmProject, onProgress?: (pct: number, msg: string) => void): Promise<SimulationResults>;
}
```

### Mode Details

#### Local Engine (green `#2a8a4a`)
- **Check**: `GET /api/swmm/status` returns `{ found: boolean }`
- **Run**: `POST /api/swmm/run-or-proxy` with raw `.inp` text body
- **Server flow**: Creates `/tmp/swmm-{jobId}/`, writes `model.inp`, spawns `runswmm model.inp model.rpt model.out`
- **Response**: `{ status, reportContent, outBase64, stdout, exitCode }`
- **Fallback**: If binary missing, returns 404 with `useRemote: true`
- **Parsing**: Base64 decode to ArrayBuffer then `parseSwmmOut()` then `computeExtendedVariables()`

#### WASM Engine (orange `#e88a1a`)
- **Check**: Fetches `swmm_engine.js` via HEAD request
- **Run**: Loads Emscripten module lazily (cached after first load)
- **Flow**: Uses `mod.FS` virtual filesystem to write `.inp`, calls C-wrapped `swmm_run()`, reads back `.out`/`.rpt`
- **Advantage**: Zero server round-trip, runs entirely in browser
- **Files**: `client/public/swmm_engine.js` (65 KB), `client/public/swmm_engine.wasm` (455 KB)

#### Remote Engine (blue `#2c6eb5`)
- **Endpoint**: `https://batch-swmm-runner-robertdickinson.replit.app`
- **Flow**: Upload `.inp` then receive jobId then WebSocket for progress then poll results
- **API calls**: `/api/swmm-proxy/upload`, `/api/swmm-proxy/batch/:jobId/start`, `/api/swmm-proxy/batch/:jobId/status`, `/api/swmm-proxy/batch/:jobId/results`
- **WebSocket**: `/api/swmm-proxy/ws?jobId=...` for real-time progress

#### Mock Engine (gray)
- **Function**: `generateMockResults(project)` creates synthetic data
- **Use case**: Testing, UI development without engine dependency
- **Output**: Plausible node depths, link flows, subcatchment runoff with mathematical curves

### Common Post-Processing

All 4 engines call `computeExtendedVariables(project, results)` after simulation to compute Level 2/3 diagnostics.

---

## 8. Extended Variables System (200+)

**File**: `client/src/lib/swmm-variables.ts` (394 lines)

### Organization: Scopes then Categories then Variables

#### Node Variables (33 total: 3 input + 30 result)
| Category | Count | Examples |
|----------|------:|---------|
| Standard (EPA) `NODE_STD` | 9 | depth, head, volume, lateralInflow, totalInflow, flooding |
| Solver Internals `NODE_SOLVER` | 18 | surfaceArea, dqdh, nodeIterations, nodeInfil, nrDenominator, fResidual, headCorrection |
| RDII / DWF `NODE_RDII` | 6 | rdiiTotal, dwfInflow, totalOutflow |

#### Link Variables (73 total: 5 input + 68 result)
| Category | Count | Examples |
|----------|------:|---------|
| Standard (EPA) `LINK_STD` | 10 | flow, depth, velocity, volume, capacity |
| Momentum Eq Terms `LINK_MOMENTUM` | 18 | froude, dq1Inertia, dq2Pressure, dq3Friction, dq4Minor, dq5Lateral, dq6Convect, stVenantBalance |
| Geometry `LINK_GEOMETRY` | 12 | aMid, rWeighted, w1, y2 |
| Energy / Bernoulli `LINK_ENERGY` | 11 | hgl, vhUp, frictionLossHf, bernoulliLHS, bernoulliRHS, sigma |
| SWMM 3/4/5 Compat `LINK_COMPAT` | 3 | areaSWMM3, areaSWMM4, areaSWMM5 |
| Properties / RTC `LINK_PROPS` | 18 | linkTimestep, akon, qMax, setting, timeOpen |
| Flow Classification `FLOW_CLASS` | 1 | flowClass |

#### Subcatchment Variables (103 total: 5 input + 98 result)
| Category | Count | Examples |
|----------|------:|---------|
| Standard (EPA) `SUB_STD` | 13 | rainfall, snowDepth, evap, infiltration, runoff |
| Runoff Detail `SUB_RUNOFF` | 13 | runoffImperv0, avgSurfDepth, impAreaDS |
| LID Internals `SUB_LID` | 17+3 | lidArea, lidSurfInfil, lidStorDrain, lidSoilEvap, lidDrainCoeff, lidRetention |
| Groundwater `SUB_GW` | 17 | gwFlowA1, gwPercolation, aqPorosity |
| Snow Internals `SUB_SNOW` | 6+4 | snowmelt, snowFreeWater, snowCoverage, snowATI, snowWATI, snowPackSWE, snowPackDepth |
| Infiltration `SUB_INFIL` | 28 | currentInfilRate, hortonTp, gaF, cnCN |
| Pollutant WQ `SUB_POLLUT` | 5 | pollutWashoff, pollutBuildup, pollutConcRunoff, pollutConcGW, pollutTotalLoad |

#### System Variables (29 total)
| Category | Count | Examples |
|----------|------:|---------|
| System Flow `SYS` | 23 | sysTemperature, sysRunoff, sysStorage, sysSnowmelt |
| QA Diagnostics `SYS_QA` | 6 | stepFlowError, sysCE, sysTimestep |

### Getter API

```typescript
getNodeVarByKey(key: string): VarDef | undefined
getLinkVarByKey(key: string): VarDef | undefined
getSubVarByKey(key: string): VarDef | undefined
getSystemVarByKey(key: string): VarDef | undefined

getNodeCategories(): CategoryGroup[]
getLinkCategories(): CategoryGroup[]
getSubCategories(): CategoryGroup[]
getSystemCategories(): CategoryGroup[]

isStdNodeVar(key): boolean
isExtendedNodeVar(key): boolean
isStdLinkVar(key): boolean
isExtendedLinkVar(key): boolean
isStdSubVar(key): boolean
isExtendedSubVar(key): boolean
```

### Access Pattern in Results

```typescript
nodeResult.extended?.['dqdh']
linkResult.extended?.['froude']
subcatchResult.extended?.['gaF']
timeStep.system?.extended?.['sysCE']
```

---

## 9. computeExtendedVariables — Three-Level Architecture

**Location**: `client/src/lib/swmm-engine.ts`, function `computeExtendedVariables(project, results)`

This is the heart of the extended diagnostics system. It runs as a post-processor after every simulation across all 4 engines.

### Unit Detection

```typescript
const flowUnits = project.options?.FLOW_UNITS || 'CFS';
const isSI = ['CMS', 'LPS', 'MLD'].includes(flowUnits);
const g = isSI ? 9.81 : 32.174;
const phi = isSI ? 1.0 : 1.4859;
```

### Level 1: Standard EPA Variables (from .out file)

These 34 variables come directly from parsing the binary output:
- 6 node vars: depth, head, volume, lateralInflow, totalInflow, flooding
- 5 link vars: flow, depth, velocity, volume, capacity
- 8 subcatchment vars: rainfall, snowDepth, evap, infiltration, runoff, gwOutflow, gwElev, moisture
- 15 system vars: from binary footer

### Level 2: Cross-Section Geometry & Hydraulics (~40 variables)

Computed from Level 1 values + project geometry metadata.

#### Cross-Section Geometry (7+ shapes)

For each link at each timestep, computes `aMid` (flow area), `rHyd` (hydraulic radius), `wTop` (top width):

**CIRCULAR** (geom1 = diameter D):
```
depthRatio = depth / D
theta = 2 * acos(1 - 2 * depthRatio)
aMid = D^2 / 8 * (theta - sin(theta))
wPerimeter = D / 2 * theta
rHyd = aMid / wPerimeter
aFull = pi * D^2 / 4
```

**RECT_CLOSED / RECT_OPEN** (geom1 = height, geom2 = width):
```
aMid = width * depth
wPerimeter = width + 2 * depth
rHyd = aMid / wPerimeter
aFull = width * height
```

**TRAPEZOIDAL** (geom1 = height, geom2 = bottom width, geom3 = left slope, geom4 = right slope):
```
avgSlope = (geom3 + geom4) / 2
wTop = geom2 + depth * (geom3 + geom4)
aMid = depth * (geom2 + avgSlope * depth)
wPerimeter = geom2 + depth * (sqrt(1 + geom3^2) + sqrt(1 + geom4^2))
rHyd = aMid / wPerimeter
aFull = geom1 * (geom2 + avgSlope * geom1)
```

**TRIANGULAR** (geom1 = height, geom2 = side slope):
```
aMid = depth^2 * geom2
wPerimeter = 2 * depth * sqrt(1 + geom2^2)
rHyd = aMid / wPerimeter
```

**HORIZ_ELLIPSE / VERT_ELLIPSE** (geom1 = height, geom2 = width):
```
aMid ~ pi * a * b * depthRatio  (approximation)
```

#### Froude Number (from wave celerity)
```
celerity = sqrt(g * aMid / wTop)
froude = velocity / celerity
```

#### Friction Slope (Manning inversion)
```
Sf = (flow / (phi * aMid * rHyd^(2/3)))^2 / roughness^2
```

#### Bernoulli Energy Balance
```
bernoulliLHS = headUp + velocity^2 / (2g)
bernoulliRHS = headDown + velocity^2 / (2g)
headLossEntry = entryLossCoeff * velocity^2 / (2g)
headLossExit = exitLossCoeff * velocity^2 / (2g)
frictionLossHf = Sf * length
energyBalance = bernoulliLHS - bernoulliRHS
```

#### Multi-Barrel Support
```
barrels = xsection.barrels || 1
flowPerBarrel = link.flow / barrels
velocity = flowPerBarrel / aMid
qFull = barrels * singleBarrelQFull
```

#### Node Crown Elevation
```
crownElev = node.elevation + maxDepth
surchargeFlag = (depth > maxDepth) ? 1 : 0
```

#### Continuity (dV/dt)
```
dvdt = (currentVolume - previousVolume) / dt
```

### Level 3: Solver Internals (~100+ variables estimated from L1 + L2)

#### Saint-Venant Momentum Terms (DQ1-DQ6)

For each link, reconstructs the 6 terms of the Saint-Venant momentum equation:

```
DQ1 (Inertia):           dQ/dt ~ (Q_current - Q_previous) / dt
DQ2 (Pressure Gradient): -g * aMid * (headDown - headUp) / length
DQ3 (Friction):          -g * aMid * Sf * dt
DQ4 (Minor Losses):      -avgLossCoeff * |Q| * Q / (2 * g * aMid) * dt
DQ5 (Lateral Flow):       lateralInflow * velocity * dt / length
DQ6 (Convective Accel):  (v^2 * A_down - v^2 * A_up) * dt / length
```

**Momentum Verification:**
```
qRecon = Q_previous + DQ1 + DQ2 + DQ3 + DQ4 + DQ5 + DQ6
stVenantBalance = qRecon - Q_current  (should be ~0)
```

#### Sigma Damping (SWMM-correct Froude-based)
```
if (froude <= 0.5)  sigma = 1.0
if (froude >= 1.0)  sigma = 0.0
else                sigma = 2 * (1 - froude)
```

#### Node Newton-Raphson Solver State
```
dqdh = SUM(g * A_mid * dt / length)  for all connected conduits
nrDenom = dqdh + surfArea / dt
fResidual = totalInflow - totalOutflow - (volume_curr - volume_prev) / dt
headCorrection = -fResidual / nrDenom  (signed)
```

#### Infiltration State (method-adaptive)

**Green-Ampt** (from `project.infiltration[scId]`):
```
Suction = values[0], Ksat = values[1], IMD = values[2]
gaF: cumulative infiltration (tracked via persistent Map)
gaSatFlag: saturation indicator (cumRate < Ksat)
gaFp: potential infiltration = Ksat * (1 + Suction * IMD / F)
```

**Horton**:
```
f0 = values[0], fInf = values[1], decay = values[2]
hortonTp: cumulative elapsed time (tracked via Map)
hortonFp: potential rate = fInf + (f0 - fInf) * e^(-decay * tp)
```

**Curve Number**:
```
CN = values[0]
S = 1000/CN - 10 (US) or 25400/CN - 254 (SI)
cnCN, cnS, cnIa (initial abstraction = 0.2 * S)
cnPe: cumulative excess = (P - Ia)^2 / (P - Ia + S)
```

---

## 10. Network Map Canvas

**File**: `client/src/components/swmm/NetworkMap.tsx` (1,549 lines)

### Component Architecture

React component with `forwardRef` exposing `NetworkMapHandle`:
```typescript
interface NetworkMapHandle {
  fitExtent(): void;
  centerOnWorld(x: number, y: number): void;
}
```

### State
- `mapState`: `{ panX, panY, zoom }` — viewport transformation
- `canvasSize`: Responsive canvas dimensions
- `tooltip`: Hover information
- `minimapPos`: Draggable minimap position

### Coordinate Transform
```typescript
worldToScreen(wx, wy) -> [sx, sy]
screenToWorld(sx, sy) -> [wx, wy]
```

### Rendering Layer Stack (bottom to top)
1. **Grid** — Major/minor coordinate grid lines
2. **Backdrop** — Optional image overlay (scaled/positioned)
3. **Subcatchments** — Filled polygons with centroid labels
4. **Links** — Multi-vertex polylines (conduits, pumps, weirs, etc.)
5. **Nodes** — Circles, squares, diamonds (junctions, outfalls, storage, dividers)
6. **Annotations** — Labels and raingage symbols
7. **Overlays** — Rubber-band drawing lines, group selection polygons, minimap

### Hit Testing
- **Nodes**: 12px radius around screen coordinates
- **Links**: 8px perpendicular distance to nearest segment (via `distToSegment`)
- **Subcatchments**: Ray-casting point-in-polygon algorithm

### Visual Features

**Depth Fill** (tank-style):
- `depthRatio = depth / maxDepth` fills node shape from bottom
- Color transition: blue (normal) then orange (high) then red (surcharged >95%)

**Flooding Halos**:
- When `flooding > 0`: Two concentric semi-transparent red circles + solid red stroke

**Flow Arrows**:
- Arrow at midpoint of central link segment
- Direction reverses on negative flow
- Width scales: `arrowW proportional to sqrt(|flow|)`

**Link Width Scaling**:
```
width = max(1.5, min(8, 1.5 + sqrt(|flow|) * 0.8))
```

**Theme Coloring**:
- `nodeTheme`, `linkTheme`, `subcatchTheme` props select which variable drives color scale
- Legend panel shows corresponding color scale

---

## 11. Main UI Page (swmm-ui.tsx)

**File**: `client/src/pages/swmm-ui.tsx` (6,074 lines)

### Layout Structure

```
+----------------------------------------------------+
| Title Bar (h-7)       — App name + filename         |
+----------------------------------------------------+
| Menu Bar (h-8)        — File|Edit|View|Map|Project|Help |
+----------------------------------------------------+
| Toolbar Ribbon (40-52px) — Context-sensitive buttons  |
+----------------------------------+-----------------+
|                                  | Project Explorer |
|        Network Map               | (tree + props)   |
|        (canvas, flex-1)          |                   |
|                                  | Property Editor   |
|  [floating: CFL, System,        | (docked grid)     |
|   Legend, Object Locator]        |                   |
+----------------------------------+-----------------+
| Status Bar (h-6)      — Units | Sim status | Counts |
+----------------------------------------------------+
```

### Key State Variables

| Variable | Type | Purpose |
|----------|------|---------|
| `project` | `SwmmProject` | Current model data |
| `results` | `SimulationResults | null` | Simulation output |
| `fileName` | `string` | Current .inp filename |
| `simStatus` | `'none'|'running'|'current'|'outdated'` | Simulation state |
| `simProgress` | `number` | 0-100 progress bar |
| `timeStep` | `number` | Current timestep index for animation |
| `engineMode` | `'local'|'wasm'|'remote'|'mock'` | Active engine |
| `selectedObj` | `SelectedObject | null` | Currently selected node/link/subcatchment |
| `interactionMode` | `string` | 'select', 'pan', 'addJunction', 'addConduit', etc. |
| `activeMenu` | `string` | Current toolbar tab (File/Edit/View/Map/Project/Help) |
| `openDialog` | `string | null` | Currently open modal dialog ID (includes `'scatterPlot'`, `'transectEditor'`, `'splitScreen'`) |
| `nodeTheme` / `linkTheme` / `subcatchTheme` | `string` | Variable keys for map coloring |
| `animSpeed` | `number` | Animation speed in ms (20-500, inverted slider) |
| `splitScreenProject` | `object | null` | Second project for split-screen comparison (`{ project, results, fileName }`) |

### Menu/Toolbar Tabs

| Tab | Actions |
|-----|---------|
| **File** | New, Open, Save, Import (CSV/DXF/GeoJSON), Export, GitHub Browse |
| **Edit** | Undo, Redo, Copy, Paste, Group Edit, Delete |
| **View** | Zoom In/Out, Full Extent, Toggle Labels, Map Options, System Panel |
| **Map** | Select, Pan, Add Junction/Outfall/Storage/Divider/Conduit/Pump/Orifice/Weir/Outlet/Subcatchment/Raingage/Label |
| **Project** | Run Simulation, Analysis Options, Project Defaults, Calibration, Statistics |
| **Help** | Help Topics, Tutorial, Error Guide, About |

### Keyboard Shortcuts
- `Ctrl+F`: Find Object dialog
- `Ctrl+Z / Ctrl+Y`: Undo/Redo
- `Delete`: Delete selected object
- `Escape`: Cancel drawing mode

---

## 12. Component Inventory

### Editing Components

| Component | File | Lines | Description |
|-----------|------|------:|-------------|
| **ProjectExplorer** | `ProjectExplorer.tsx` | 1,412 | Tree view of all model objects, inline property panel, inline data grid. Editable fields defined in `EDITABLE_FIELDS` and `GRID_EDITABLE_COLS` covering all 11 object types. |
| **PropertyEditor** | `PropertyEditor.tsx` | 783 | Docked property grid with schemas for all 12 SWMM object types. Features: collapsible sections, cross-section SVG preview, results panel, required field indicators, min/max validation, conditional visibility, subdialog buttons `[...]` for complex fields. |
| **SubDialogs** | `SubDialogs.tsx` | 1,107 | 8 modal editors: DirectInflowEditor, DWFEditor, TimeSeriesEditor (with chart), CurveEditor (with chart, 10 curve types), PatternEditor (with bar chart, 4 types), LIDUsageEditor, GroundwaterEditor, TreatmentEditor, ControlRulesEditor (with syntax highlighting). All read/write actual SwmmProject structures. |
| **DataEditors** | `DataEditors.tsx` | 1,456 | Tabbed editors for: Time Series (table + canvas graph + CSV import), Curves (X-Y + graph), Patterns (multiplier grid + bar chart), Controls (syntax-highlighted text), Pollutants, Land Uses, LID Controls (editable layers), Evaporation, Aquifers |

### Analysis Components

| Component | File | Lines | Description |
|-----------|------|------:|-------------|
| **AnalysisOptionsDialog** | `AnalysisOptionsDialog.tsx` | 259 | 5 tabs: General, Dates, Time Steps, Dynamic Wave, Interface Files |
| **TableViewDialog** | `TableViewDialog.tsx` | 550 | Tabular results: by Object (all timesteps) or by Variable (all objects at one timestep). Node/Link/Subcatchment/System categories. System shows 27 system-wide variables. |
| **AIAssistPanel** | `AIAssistPanel.tsx` | 585 | 4 tabs: Errors (25+ diagnostic rules), Parameters (soil/pipe/land use reference tables), Insights (simulation analysis), Auto-Fix (conduit length + subcatchment width estimation) |

### Visual Components

| Component | File | Lines | Description |
|-----------|------|------:|-------------|
| **NetworkMap** | `NetworkMap.tsx` | 1,549 | Canvas map with pan/zoom, hit-testing, depth fill, flooding halos, flow arrows, minimap |
| **Panels** | `Panels.tsx` | 1,030 | Legend/Layers panel, Object Locator, Map Query |
| **SpeedBar** | `SpeedBar.tsx` | 166 | Vertical tool palette for drawing modes |

### Utility Components

| Component | File | Lines | Description |
|-----------|------|------:|-------------|
| **HelpDialogs** | `HelpDialogs.tsx` | 616 | Help Topics, Tutorial, Error Guide |
| **AboutDialog** | `AboutDialog.tsx` | — | Version/credits dialog |
| **ProjectDefaultsDialog** | `ProjectDefaultsDialog.tsx` | — | ID prefixes, subcatchment/node/link defaults |

---

## 13. Server / API Routes

**File**: `server/routes.ts` (408 lines)

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/fetch-github` | Fetch raw file from GitHub. Query: `url` |
| `GET` | `/api/github-browse` | Browse GitHub repo contents. Query: `owner`, `repo`, `path` |
| `GET` | `/api/swmm/status` | Check local engine binary exists. Returns `{ found, path, mode }` |
| `POST` | `/api/swmm/run` | Run SWMM locally. Body: raw `.inp` text or multipart form |
| `POST` | `/api/swmm/run-or-proxy` | Run locally, fallback 404 `{ useRemote: true }` |
| `GET` | `/api/swmm-proxy/status` | Proxy status check to remote BatchSWMM |
| `POST` | `/api/swmm-proxy/upload` | Proxy file upload to remote runner |
| `POST` | `/api/swmm-proxy/batch/:jobId/start` | Proxy batch start to remote |
| `GET` | `/api/swmm-proxy/batch/:jobId/status` | Proxy job status check |
| `GET` | `/api/swmm-proxy/batch/:jobId/results` | Proxy result retrieval |
| `WS` | `/api/swmm-proxy/ws?jobId=...` | WebSocket proxy for real-time progress |

### Local Engine Execution Flow

```
1. Generate unique jobId
2. Create /tmp/swmm-{jobId}/
3. Write model.inp
4. spawn('runswmm', ['model.inp', 'model.rpt', 'model.out'])
5. Capture stdout/stderr
6. On close:
   - Read model.rpt as text (reportContent)
   - Read model.out as Base64 (outBase64)
   - Detect errors if "ERROR" in reportContent
7. Cleanup temp files
8. Return { status, reportContent, outBase64, stdout, exitCode }
```

---

## 14. CFL Stability Analysis

**File**: `client/src/lib/cfl-analysis.ts` (361 lines)

### `computeCflAnalysis(project: SwmmProject): CflAnalysisResult`

For each conduit:
```
celerity = sqrt(g * diameter)
stableTimestep = length / celerity
courantNumber = (celerity * routingStep) / length
segmentsNeeded = ceil(courantNumber)
```

Returns worst Courant number, flagged conduit count, per-conduit details.

### `discretizeProject(project, settings): DiscretizationResult`

Splits long/unstable conduits into smaller segments:
- **Methods**: `fixed_interval` (uniform length) or `dx_d_ratio` (length/diameter ratio)
- **Lengthening**: Optional — increase conduit length to meet minimum stability
- **Interpolation**: New junctions get linearly interpolated elevations and coordinates
- **Loss redistribution**: Entry/exit loss coefficients transferred to terminal segments

### `getDefaultSettings(): DiscretizationSettings`
```
{ method: 'fixed_interval', maxLength: 500, minLength: 50, lengthening: false }
```

---

## 15. Import / Export

**File**: `client/src/lib/import-export.ts` (509 lines)

### Import Formats

| Format | Functions | Description |
|--------|-----------|-------------|
| **CSV** | `importCsvNodes()`, `importCsvLinks()` | Add/modify nodes (junction/outfall/storage) and links (conduits) from CSV |
| **DXF** | `parseDxfFile()`, `importDxfEntities()` | Parse AutoCAD DXF and extract LINE, LWPOLYLINE, POLYLINE, ARC, CIRCLE entities and convert to SWMM nodes + conduits |
| **GeoJSON** | `parseGeoJsonToNetwork()`, `importGeoJsonNodes()`, `importGeoJsonLinks()` | Import Point features as nodes, LineString features as conduits with intermediate vertices |

### Export Formats

| Format | Functions | Description |
|--------|-----------|-------------|
| **CSV** | `exportNodesCsv()`, `exportLinksCsv()` | Export nodes (ID, Type, X, Y, Elevation, MaxDepth) and links (ID, From, To, Length, Roughness, Diameter, Shape) |
| **DXF** | `exportDxf()` | Export network geometry as LINE/LWPOLYLINE entities |

---

## 16. Design Theme & Styling

### Color Palette

| Element | Color | Hex |
|---------|-------|-----|
| Title Bar | Dark navy | `#2c3e6b` |
| Menu Bar | Medium navy | `#3a5070` |
| Toolbar/Status | Light gray | `#f0f0f4` |
| Panels | Off-white | `#f8f8fa` |
| Borders | Gray | `#d0d0d8` |
| Primary Text | Dark navy | `#2a2a3e` |
| Secondary Text | Medium gray | `#6b6b7b` |
| Accent Blue | — | `#2c6eb5` |

### Engine Mode Colors

| Engine | Color | Hex |
|--------|-------|-----|
| Local | Green | `#2a8a4a` |
| WASM | Orange | `#e88a1a` |
| Remote | Blue | `#2c6eb5` |
| Mock | Gray | — |

### Depth Fill Color Scale
- Normal depth: Blue
- High depth: Orange
- Surcharged (>95%): Red

---

## 17. WASM Engine Compilation

### Source
EPA SWMM 5.2.4 source code in `swmm-engine/Stormwater-Management-Model-5.2.4/`

### Compiled Artifacts
- `client/public/swmm_engine.js` (65 KB) — Emscripten JavaScript glue code
- `client/public/swmm_engine.wasm` (455 KB) — Compiled WebAssembly module

### Native Binary
- `swmm-engine/runswmm` (511 KB) — Linux x86_64 ELF binary for local execution

### Runtime Behavior
- Module loaded lazily on first WASM simulation run
- Cached in memory for subsequent runs
- Uses Emscripten virtual filesystem (`mod.FS`) for file I/O
- No server round-trip needed — runs entirely in browser tab

---

## 18. New Features (Session 2)

### Animation Speed Control
- **Location**: `swmm-ui.tsx` — `animSpeed` state variable, speed slider in toolbar
- **Implementation**: Slider range 20–500ms with inverted scale (`520 - sliderValue`) so dragging right = faster
- **Integration**: `requestAnimationFrame` loop in `animRef` uses `animSpeed` as the interval between timestep advances
- **UI**: Compact slider next to play/pause button in the simulation toolbar, labeled with turtle/rabbit icons

### Enhanced Report Viewer (.rpt)
- **Location**: `swmm-ui.tsx` — report dialog with search and section navigation
- **Search**: Text input filters report content with match count display
- **Highlighting**: Uses deterministic split-based approach (`text.split(regex)` then `parts.map((part, i) => i % 2 === 1 ? <mark>)`) — avoids stateful global regex `.test()` bug
- **Section Navigation**: 9 quick-jump buttons (Summary, Node Depth, Node Inflow, Node Flooding, Node Surcharge, Outfall Loading, Link Flow, Conduit Surcharge, Flow Classification)
- **Scroll**: Sets search term to section header text then uses `setTimeout(() => mark.scrollIntoView({ behavior: 'smooth' }), 50)`

### Scatter Plot Dialog
- **Location**: `swmm-ui.tsx` — `openDialog === 'scatterPlot'`
- **Controls**: Independent X/Y axis selectors, each with category (Node/Link/Subcatch), object dropdown, and variable dropdown
- **Statistics**: Pearson correlation coefficient (r) and R² computed from paired timestep data
- **Chart**: Recharts `ScatterChart` with responsive container, tooltips showing time + X/Y values
- **Data**: Extracts paired values from `results.timeSteps` matching selected objects/variables

### Frequency / Exceedance / Flow-Duration Curves (Statistics)
- **Location**: `swmm-ui.tsx` — appended to Statistics Report after the existing event bar chart
- **Exceedance Probability**: Weibull plotting position `P = rank / (n + 1)`, sorted descending
- **Cumulative Frequency**: Sorted ascending with `P = rank / (n + 1)`
- **Return Period**: Table showing 2, 5, 10, 25, 50, 100-year return periods with interpolated values
- **Charts**: Recharts `LineChart` with dot markers and tooltips

### Transect Editor
- **Location**: `swmm-ui.tsx` — `openDialog === 'transectEditor'`, `TransectEditorContent` component
- **Table**: Station-elevation pairs with add/remove row buttons
- **Manning's N**: Three input fields for left overbank, channel, and right overbank
- **Bank Stations**: Left and right bank station markers
- **Preview**: Live Recharts `AreaChart` showing cross-section profile
- **Bug Fix**: Null guard added — `if (t && t.stations)` before accessing fields; default `editName='New_Transect'` prevents undefined.toString() crash when no transects exist

### Split-Screen Comparison
- **Location**: `swmm-ui.tsx` — `openDialog === 'splitScreen'`, `splitScreenProject` state
- **Flow**: Load second INP file → parse → run mock engine for quick topology comparison
- **Display**: Side-by-side summary stats (nodes, links, subcatchments, total length, avg roughness)
- **Difference Table**: First 50 matching elements with values from both projects, absolute difference, and % change
- **Chart**: Recharts `BarChart` of differences for visual comparison
- **Loading State**: `loadingB` state prevents double-click during mock simulation

### URL-Based State
- **Location**: `swmm-ui.tsx` — `useEffect([initialLoadDone])` reads URL query parameters
- **Parameters**: `?inp=<raw_url>` and `?github=<github_blob_url>`
- **GitHub Conversion**: Detects `github.com/.../blob/...` URLs and converts to `raw.githubusercontent.com` format
- **Fallback**: On fetch error, falls back to default `Greenville_SI.inp` sample
- **Use Case**: Share direct links to SWMM models, e.g., `?github=https://github.com/user/repo/blob/main/model.inp`

### Extended Variable Stubs (Session 2 additions)
- **SUB_POLLUT category**: New `VarCategory` added to type union and `CATEGORY_INFO` array in `swmm-variables.ts`
  - 5 variables: `pollutWashoff`, `pollutBuildup`, `pollutConcRunoff`, `pollutConcGW`, `pollutTotalLoad`
- **Additional Snow variables**: `snowATI` (antecedent temperature index), `snowWATI` (weighted ATI), `snowPackSWE` (snow water equivalent), `snowPackDepth`
  - Computed in `swmm-engine.ts` after `snowCoverage` block using temperature-based ATI decay
- **Additional LID variables**: `lidSoilEvap`, `lidDrainCoeff`, `lidRetention`
  - Computed from project LID control parameters and current moisture state
- **Computation**: All stubs computed in `computeExtendedVariables()` in `swmm-engine.ts` after the existing snow/LID blocks

---

## 19. Known Bugs Fixed & Technical Debt

### Bugs Fixed During Development

1. **`dOverD` undefined** — Variable was referenced in flow classification but had been removed during sigma refactor. Replaced with local `depthRatio`.

2. **SI/US unit confusion** — All extended variable computations now detect units from `project.options.FLOW_UNITS`: CMS/LPS/MLD = SI (g=9.81, phi=1.0), else US (g=32.174, phi=1.4859).

3. **TRAPEZOIDAL geometry** — XSParams interface was misinterpreting geom2/geom3/geom4. Fixed: geom2 = bottom width, geom3 = left side slope, geom4 = right side slope.

4. **Sigma damping** — Was using simplified formula. Fixed to SWMM-correct Froude-based: sigma=1.0 at Fr<=0.5, sigma=0.0 at Fr>=1.0, linear transition between.

5. **Multi-barrel conduits** — Flow per barrel was not computed. Fixed: `flowPerBarrel = flow / barrels`, all per-barrel metrics (velocity, Froude, friction slope) use per-barrel flow, `qFull = barrels * singleBarrelQFull`.

6. **Head correction sign** — NR head correction was unsigned. Fixed to signed: `headCorrection = -fResidual / nrDenom`.

7. **Comment lines creating ghost entries** — INP parser `extractSections()` now filters ALL lines starting with `;`.

8. **TransectEditorContent crash** (Session 2) — `undefined.toString()` when no transects exist. Fixed with null guard: `if (t && t.stations)` before accessing transect fields; default `editName='New_Transect'`.

9. **Report search highlighting stateful regex** (Session 2) — Global regex `.test()` is stateful (alternates true/false). Fixed by switching to split-based approach: `text.split(regex)` then `parts.map((part, i) => i % 2 === 1 ? <mark>)` for deterministic highlighting.

### Technical Debt / Future Work

- `swmm-ui.tsx` at 6,074 lines should be decomposed into smaller state management modules
- Profile plot, statistics report, scatter plot, transect editor, and split-screen dialogs could be separate components
- WASM engine could support progress callbacks via Emscripten `ccall` wrappers
- Pollutant WQ extended variables are stub estimates (not connected to actual SWMM pollutant routing)
- LID performance diagnostics in extended variables are placeholder estimates
- Groundwater extended variables use simplified assumptions
- Snow melt extended variables (ATI, WATI, SWE, depth) are stub implementations using temperature-based decay
- Split-screen comparison uses mock engine only — could integrate real engine comparison
- No automated test suite for extended variable accuracy against reference SWMM output

---

## 20. Critical Implementation Details

### INP Round-Trip Fidelity
- `rawSections` stores unrecognized sections verbatim
- All recognized sections are parsed, modified, and re-serialized
- Cross-reference validation filters invalid node/link references
- COVERAGES/BUILDUP/WASHOFF in rawSections filtered by valid landuse names

### Simulation Result Storage
- Results stored on `project.results` after simulation
- Each timestep has full node/link/subcatchment result records
- Extended variables computed and stored in `result.extended` dictionaries
- Results cleared when project is modified (`simStatus` becomes `'outdated'`)

### Infiltration State Tracking
- `computeExtendedVariables` maintains persistent `Map` objects for cumulative infiltration tracking across timesteps
- Green-Ampt: tracks cumulative F per subcatchment
- Horton: tracks elapsed time tp per subcatchment
- Curve Number: tracks cumulative precipitation per subcatchment
- Maps are reset on each simulation run

### Context Menu System
- Right-click on object: Properties, Copy ID, Copy, Paste, Reverse (links), Find Connected, Delete
- Right-click on empty canvas: Find Object...
- Find Object dialog (Ctrl+F): Search by ID across all object types, click to pan/select

### Calibration File Creator
- Integrated in calibration dialog (Create File tab)
- Supports variable selection: node depth/head/flooding, link flow/velocity/depth, subcatchment runoff/rainfall
- Template generation from simulation timesteps
- CSV import for observed data
- `.dat` file export for SWMM calibration

---

## 21. Deployment & Runtime

### Development
```bash
npm run dev    # Starts Express + Vite dev server on port 5000
```

### Production Build
```bash
npm run build  # tsx script/build.ts -> dist/
npm start      # NODE_ENV=production node dist/index.cjs
```

### Environment
- **Runtime**: Node.js on NixOS (Replit)
- **No database**: All data is client-side
- **Session secret**: `SESSION_SECRET` environment variable (for Express sessions)
- **Ports**: Single port 5000 (Vite proxies to Express in dev)

### Engine Availability by Environment

| Environment | Local | WASM | Remote | Mock |
|-------------|:-----:|:----:|:------:|:----:|
| Replit Dev | Yes | Yes | Yes | Yes |
| Replit Prod | No (no binary) | Yes | Yes | Yes |
| Generic Host | No | Yes | Yes | Yes |

### Dependencies (key packages)

| Package | Version | Purpose |
|---------|---------|---------|
| React | 18.3.1 | UI framework |
| TypeScript | 5.6.3 | Type safety |
| Vite | 7.3.0 | Build tool / dev server |
| Express | 5.0.1 | API server |
| Tailwind CSS | 3.4.17 | Utility-first styling |
| Recharts | 2.15.2 | Charts (time series, profiles) |
| wouter | 3.3.5 | Client-side routing |
| @tanstack/react-query | 5.60.5 | Data fetching |
| framer-motion | 11.13.1 | Animations |
| lucide-react | 0.453.0 | Icons |
| react-resizable-panels | 2.1.7 | Split panel layout |
| ws | 8.18.0 | WebSocket (server-side) |
| zod | 3.24.2 | Schema validation |

---

*End of Handover Document*
