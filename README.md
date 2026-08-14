# 🌊 SWMM5 UI Engine

![SWMM](https://img.shields.io/badge/EPA%20SWMM-5.2.4-blue)
![OpenSWMM](https://img.shields.io/badge/OpenSWMM-6-8a4ae2)
![WASM](https://img.shields.io/badge/Engines-WebAssembly-654FF0)
![TypeScript](https://img.shields.io/badge/TypeScript-Client-3178C6)
![Vite](https://img.shields.io/badge/Build-Vite-646CFF)
![License](https://img.shields.io/badge/License-MIT-green)

A browser-based modelling workbench for the **EPA Storm Water Management Model**. Open a `.inp` file, edit the model, run it on any of five engines — including **EPA SWMM 5.2.4 and OpenSWMM 6 compiled to WebAssembly, running entirely in the browser** — then interrogate the results with tools that go well past the standard report: phase-space diagnostics, a calculation-level engine inspector, LID unit animation, 3D network playback, and side-by-side engine comparison.

No desktop install, no upload step for the in-browser engines: the model never leaves the tab unless you ask it to.

---

## Engines

The engine is switchable at runtime from the toolbar chip (bottom status bar shows which one is live). Each produces the same `.rpt` / `.out` artifacts, so every downstream view works regardless of which engine ran.

| Mode | Engine | Runs where |
|---|---|---|
| **WASM 5.2.4** | EPA SWMM 5.2.4 compiled to WebAssembly | In the browser, in a web worker |
| **WASM 6 rel** | OpenSWMM 6 (`swmm6_rel`) compiled to WebAssembly | In the browser, in a web worker |
| **WASM 6 dev** | OpenSWMM 6 (develop branch) compiled to WebAssembly | In the browser, in a web worker |
| **Local 5.2.4** | Native `swmm-engine/runswmm` binary | On the machine serving the app |
| **Remote 5.2.4** | Cloud batch runner service | Off-box, for long or bulk runs |
| **Mock** | Synthetic results generator | In the browser (UI development only — results are clearly badged as synthetic) |

Three **comparison modes** run two engines on the same model in one pass and diff the outcome: SWMM 5 vs SWMM 6 release, SWMM 5 vs SWMM 6 develop, and SWMM 6 release vs develop. Differences surface as scatter plots (node depth, link flow, continuity) plus a verdict — match, differs, or inconclusive.

> **SWMM 6 LID caveat.** The OpenSWMM 6 port's LID module is incomplete: several control parameters are unconverted and its flux equations are unit-inconsistent. **Do not trust LID results from the SWMM 6 engines.** Use WASM 5.2.4 or the native engine for any LID work. See `.agents/memory/swmm6-lid-port-gaps.md`.

## Features

**Model editing**
- Full `.inp` parse and write, with a round-trip audit that reports anything the writer changes
- Property editor, section grid views, group edit, transect and curve/time-series editors
- Network map with theming, profile plots, find-object, split-screen compare
- Import from CSV (nodes/links), DXF and GeoJSON; export to CSV and DXF
- Autosave, undo/redo, and provenance badges tracking where each result came from
- 20 bundled sample models (EPA Extran 1–10, Greenville US/SI, User 1–5)
- Open models straight from a GitHub repository by browsing its folders

**Results and visualisation**
- Time-series and table views, frequency analysis, statistics reports, calibration overlays
- **Phase-space diagnostics** — flow–depth trajectories, derivative fields and instability indexes that expose oscillation, chatter and reversals that ordinary time-series plots hide, plus an attention sweep that ranks the worst-behaved links
- **3D viewer** — the network rendered in three dimensions with animated results playback and GIF export
- **LID viewer** — reads the consolidated `.lid` detailed-output report (one file covering every LID unit) and animates each unit's water balance layer by layer: surface, pavement, soil, storage, drain
- Diagram gallery and schematic image export

**Diagnostics**
- **Engine Health** dashboard — continuity errors, timestep explorer, and the assumptions the engine actually applied, parsed from the `.rpt`
- **Engine Inspector** — a calculation microscope that reproduces the engine's own arithmetic for a chosen element so you can see how a number was reached
- **Model Health** — pre-run checks for the classic SWMM modelling mistakes
- **CFL analysis** — Courant-based stable-timestep estimates per conduit, with discretisation suggestions
- **Round-trip audit** — reparses everything the app writes and reports any field it altered, omitted or invented
- **Diff tool** — compare two `.inp` files section by section
- **Batch runner** — queue many models across engines, with cancel, run in a worker so the UI stays responsive
- **AI Assist** panel — rule-based model review that runs locally; no external service, no data leaves the browser

## MCP endpoint

The server exposes a Model Context Protocol endpoint at **`POST /mcp`**, so an AI agent can run SWMM directly:

| Tool | Purpose |
|---|---|
| `run_swmm_simulation` | Run a full `.inp` on the native engine; returns status, error/warning lines and continuity errors, optionally the whole `.rpt` |
| `get_report_section` | Run a model and return only named report sections (e.g. "Node Depth Summary", "Flow Routing Continuity") |
| `engine_status` | Report whether the native engine is available on this server |

Set the `MCP_API_KEY` secret to require it as a bearer token. **If it is unset the endpoint accepts unauthenticated calls**, so set it before exposing a deployment publicly.

## HTTP API

| Route | Purpose |
|---|---|
| `GET /api/swmm/status` | Native engine availability and the path it was probed at |
| `POST /api/swmm/run` | Run a model on the native engine |
| `POST /api/swmm/run-or-proxy` | Run natively, or forward to the cloud runner if the native engine is absent |
| `GET /api/swmm/out/:id` | Fetch a parked large `.out` result as gzip |
| `/api/swmm-proxy/*` | Cloud batch runner: upload, start, status, results |
| `GET /api/github-browse`, `GET /api/fetch-github` | Browse and load `.inp` files from a GitHub repository |

## Repository layout

| Folder | Purpose |
|---|---|
| `client/` | React + Vite front end (`client/src/pages/swmm-ui.tsx` is the workbench shell) |
| `client/public/` | WASM engines (`swmm_engine.wasm`, `wasm6/`, `wasm6dev/`), the 3D viewer, sample models, help content |
| `server/` | Express server: engine orchestration, cloud proxy, GitHub browsing, MCP |
| `swmm-engine/` | Native SWMM sources and the `runswmm` binary, plus engine patches |
| `shared/` | Types shared by client and server |
| `script/`, `scripts/` | Build script; parity and post-merge helpers |
| `tests/` | Automated suites — see below |
| `docs/` | Reference notes (e.g. engine graph variables) |
| `.agents/memory/` | Engineering notes on engine quirks, file formats and build recipes |

## Getting started

```bash
git clone https://github.com/dickinsonre/Swmm5-UI-Engine.git
cd Swmm5-UI-Engine
npm install
npm run dev          # serves the app on http://localhost:5000
```

The in-browser WASM engines work immediately. The **Local** engine additionally needs `swmm-engine/runswmm` built for your platform; if it is missing, the app falls back to WASM and the engine tooltip tells you where it looked.

| Script | Does |
|---|---|
| `npm run dev` | Development server (client + API on port 5000) |
| `npm run check` | TypeScript typecheck |
| `npm test` | Six headless suites: round-trip audit, calibration, CFL, engine scatter, batch verdict, binary `.out` offsets |
| `npm run test:e2e` | Browser end-to-end suites — requires the app already running |
| `npm run build` | Typecheck, run tests, then bundle. A failing check or suite blocks the build |

## Tech stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Radix UI, wouter, TanStack Query, Recharts
- **Backend:** Node 20 + Express (TypeScript, run through `tsx`). Stateless — no database
- **Engines:** EPA SWMM 5.2.4 (C) and OpenSWMM 6 (C++), native and compiled to WebAssembly via Emscripten
- **3D:** three.js

## Known limitations

- Binary `.out` results are loaded up to **5,000 reporting steps**; longer runs are currently truncated
- Pollutant columns are read from the `.out` header but water-quality series are not yet surfaced in the UI
- LID results from the SWMM 6 engines are not trustworthy (see above)
- Large results are held per server instance, so a horizontally scaled deployment can lose track of one

## Credits

EPA SWMM is developed by the US Environmental Protection Agency; OpenSWMM 6 by the HydroCouple/OpenSWMM project. This project is part of Robert Dickinson's broader SWMM tooling ecosystem.

## License

Released under the **MIT License**.
