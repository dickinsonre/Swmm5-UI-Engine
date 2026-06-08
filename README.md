# 🌊 SWMM5 UI Engine

![SWMM5](https://img.shields.io/badge/SWMM5-Engine-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-Client-3178C6)
![C](https://img.shields.io/badge/C-Engine-555555)
![Vite](https://img.shields.io/badge/Build-Vite-646CFF)
![License](https://img.shields.io/badge/License-MIT-green)

A browser-based **UI engine for the EPA Storm Water Management Model (SWMM5)** — load, process, run, and manage SWMM projects through a modern web interface backed by a native SWMM computational engine.

---

## About

SWMM5 UI Engine pairs a TypeScript/Vite front end with a C-based SWMM engine and a server layer that handles SWMM input-file parsing, simulation, and results management. It is designed to make working with `.inp` models possible directly in the browser, without a traditional desktop install, while still relying on the real SWMM5 computational core.

The project supports extended modeling features including **snow, pollutant, and LID (Low Impact Development) simulations**, and the engine has been updated to parse newer SWMM file versions.

This project is part of Robert Dickinson's broader SWMM5 tooling ecosystem.

## What's Inside

| Folder | Purpose |
|---|---|
| `client/` | Front-end application (TypeScript, Vite, Tailwind CSS) |
| `server/` | Back-end logic for SWMM file processing and simulation orchestration |
| `swmm-engine/` | Core native SWMM5 engine implementation (C) |
| `shared/` | Shared types and code used by both client and server |
| `script/` | Build and configuration scripts |
| `attached_assets/` | Project roadmap and supporting assets |
| `.agents/` | Project documentation and handover notes |

## Tech Stack

- **Frontend:** TypeScript, Vite, Tailwind CSS
- **Backend:** Node/server layer with Drizzle ORM
- **Engine:** SWMM5 core in C (with C++/CMake build support)
- **Languages:** HTML, C, TypeScript, JavaScript, CSS

## Features

- Upload and parse SWMM5 `.inp` input files
- Run SWMM simulations via the bundled native engine
- Browser-based interface for loading and managing projects
- Extended variable support for **snow**, **pollutant**, and **LID** simulations
- Updated parsing for newer SWMM file versions

## Getting Started

```bash
# Clone the repository
git clone https://github.com/dickinsonre/Swmm5-UI-Engine.git
cd Swmm5-UI-Engine

# Install dependencies
npm install

# Start the development server
npm run dev
```

> Check `package.json` for the exact available scripts (dev, build, preview).

## Roadmap

See `attached_assets/` and `.agents/` for the current project roadmap and handover notes covering planned improvements and engine enhancements.

## License

Released under the **MIT License**.
