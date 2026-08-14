# 🌊 SWMM5 UI Engine

![SWMM5](https://img.shields.io/badge/SWMM5-Engine-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-Client-3178C6)
![C](https://img.shields.io/badge/C-Engine-555555)
![Vite](https://img.shields.io/badge/Build-Vite-646CFF)
![License](https://img.shields.io/badge/License-MIT-green)

A browser-based **UI engine for the EPA Storm Water Management Model (SWMM5)** — load, process, run, and manage SWMM projects through a modern web interface backed by a native SWMM computational engine (with WebAssembly support in progress).

## About

SWMM5 UI Engine pairs a TypeScript/Vite front end with a C-based SWMM5 engine and a server layer that handles `.inp` file parsing, simulation orchestration, and results management. It is designed to make working with SWMM `.inp` models possible directly in the browser — no traditional desktop install required — while still relying on the authentic SWMM5 computational core rather than a re-implementation.

The engine supports extended modeling features including **snow accumulation/melt, pollutant buildup and washoff, and LID (Low Impact Development) controls**, and has been updated to parse newer SWMM input file versions, including engine-side updates to the LID solver logic.

This project is part of Robert Dickinson's broader SWMM5 tooling ecosystem, which spans SWMM3 through SWMM6, XPSWMM, ICM SWMM, and InfoDrainage development.

## Architecture

The system is organized into three cooperating layers:

- **Client (`client/`)** — TypeScript + Vite + Tailwind CSS single-page app. Handles `.inp` upload, model editing (subcatchments, nodes, links, LID controls, options), map/table views, and results visualization (time series, profiles, summary tables).
- **Server (`server/`)** — Node-based orchestration layer using Drizzle ORM for data persistence. Parses uploaded `.inp` files, invokes the native engine, tracks simulation status (exit code, `.out`/`.rpt` validity), and serves results back to the client. Also exposes an MCP (Model Context Protocol) server for programmatic/AI-assisted interaction with models.
- **Engine (`swmm-engine/`)** — The native SWMM5 computational core written in C (with C++/CMake build support), compiled and invoked as a subprocess or bound module rather than reimplemented in JavaScript, preserving numerical fidelity with the reference EPA SWMM5 engine.

## What's Inside

| Folder | Purpose |
|---|---|
| `client/` | Front-end application (TypeScript, Vite, Tailwind CSS) — model editor, map/table views, results viewer |
| `server/` | Back-end logic for `.inp` parsing, simulation orchestration, MCP server, results management |
| `swmm-engine/` | Core native SWMM5 engine implementation (C/C++), including updated LID solver logic |
| `shared/` | Shared TypeScript types and utilities used by both client and server |
| `script/` & `scripts/` | Build, install, and simulation-support scripts |
| `docs/` | Documentation, including engine graph variable references |
| `tests/` | Automated tests, including end-to-end tests (e.g., Table View context-menu keyboard navigation) |
| `attached_assets/` | Project roadmap, screenshots, and supporting assets |
| `.agents/` | Handover notes and agent/automation documentation (e.g., git-subrepl remotes) |

## Tech Stack

- **Frontend:** TypeScript, Vite, Tailwind CSS
- **Backend:** Node.js server layer with Drizzle ORM; MCP server for tool/AI integration
- **Engine:** SWMM5 core in C, with C++/CMake build support
- **Languages:** HTML (65%), TypeScript (17%), C (16%), JavaScript, CSS, C++

## Features

- Upload and parse SWMM5 `.inp` input files, with support for newer file format versions
- Run full SWMM simulations via the bundled native C engine (not a JS reimplementation)
- Strict simulation success classification — checks exit code, `.out` file size, and result validity rather than assuming success
- Extended variable support for **snow**, **pollutant**, and **LID** simulations, including updated LID solver logic
- Browser-based model editor and table/map views for managing subcatchments, nodes, links, and controls
- MCP server integration for AI-assisted or scripted model interaction
- Bundled demo/sample projects for quick evaluation

## Getting Started

```
# Clone the repository
git clone https://github.com/dickinsonre/Swmm5-UI-Engine.git
cd Swmm5-UI-Engine

# Install dependencies
npm install

# Start the development server
npm run dev
```

> Check `package.json` for the exact available scripts (`dev`, `build`, `preview`). The native engine in `swmm-engine/` may require a C/C++ toolchain (CMake) for local builds.

## Testing

Automated tests live in `tests/`, covering both engine behavior and UI interactions (e.g., keyboard navigation in the Table View context menu). Run tests via the script defined in `package.json` (check for a `test` entry) before submitting changes.

## Roadmap

See `attached_assets/` and `.agents/` for the current roadmap and handover notes, which cover planned engine enhancements (e.g., WebAssembly builds), UI improvements, and MCP server capabilities.

## Contributing

This is currently a single-maintainer project with Replit Agent assistance for iterative development. Issues and pull requests are welcome; please review `HANDOVER.md` and `.agents/` documentation for context on in-progress work before contributing.

## License

Released under the **MIT License**.
