# Graph variables in the WASM engines

Everything this app can plot, where each number actually comes from, and how much
you should trust it.

The app runs SWMM through several engines. Only two of them are WASM builds that
run inside the browser tab:

| Engine (UI label) | Mode id | Build | Files it returns |
| --- | --- | --- | --- |
| WASM 5.2.4 | `wasm` | EPA SWMM 5.2.4 compiled to WebAssembly (`client/public/swmm_engine.js/.wasm`) | `.rpt`, binary `.out`, consolidated `.lid` |
| OpenSWMM 6 (alpha.3) | `wasm6` | OpenSWMM 6 release (`client/public/wasm6/openswmm6.js/.wasm`) | `.rpt`, binary `.out` |
| OpenSWMM 6 (develop) | `wasm6dev` | OpenSWMM 6 develop branch (`client/public/wasm6dev/`) | `.rpt`, binary `.out` |
| Local (server binary) | `local` | Stock SWMM 5.2.4 executable on the server | `.rpt`, binary `.out` |
| Cloud (BatchSWMM) | `remote` | Remote SWMM 5.2.4 service | `.rpt` only |
| Mock | `mock` | Synthetic generator for interface testing | nothing real |

Three consequences follow from that table, and they explain almost every "why is
this graph empty" question:

1. **Time series only exist when a binary `.out` comes back.** The `.rpt` text
   report holds summary tables and continuity, not per-step series. A cloud run
   therefore fills summary tables and scatter plots but leaves the time-series
   graph empty — the app marks it `report-summary` fidelity and fabricates
   nothing.
2. **Detailed LID output is WASM 5.2.4 only.** The consolidated `.lid` file is
   produced by the vendored, patched 5.2.4 source. SWMM 6 has no `.lid` handling,
   and the stock server binary writes one file per LID unit rather than the
   consolidated report the viewer reads.
3. **SWMM 6 has no report-only fallback.** If its `.out` is unusable the run is
   reported as failed instead of degrading to summary-only results.

Every run that produces a parsed `.out` — WASM 5, SWMM 6, or local — is passed
through `computeExtendedVariables()` (`client/src/lib/swmm-engine.ts`), which is
where all the non-EPA variables in this document are manufactured in the browser.

---

## 1. What the engines actually write

### 1.1 Binary `.out` — the only genuine engine time series

`client/src/lib/swmm-out-parser.ts` reads the standard SWMM output layout. Both
WASM engines write the classic layout (SWMM 6 declares version 60000). The parser
maps result arrays **by position**:

| Scope | Count | Fields, in file order |
| --- | --- | --- |
| Subcatchment | 8 | `rainfall`, `snowDepth`, `evap`, `infiltration`, `runoff`, `gwOutflow`, `gwElev`, `moisture` |
| Node | 6 | `depth`, `head`, `volume`, `lateralInflow`, `totalInflow`, `flooding` |
| Link | 5 | `flow`, `depth`, `velocity`, `volume`, `capacity` |
| System | n | read for record sizing only — the system series shown in the app are re-aggregated in the browser, not taken from these slots |

Pollutant columns follow the fixed fields when the model defines pollutants. The
file's own declared variable counts are honoured when stepping through records,
so pollutant columns never shift the fixed fields out of alignment; the app just
does not surface pollutant series today.

Two structural details of the format matter and have bitten this parser before:
input-property sections are interleaved per object class (count, property codes,
then values), and a reporting-variables section sits between them and the results
block. Misreading either silently produces a `report-summary` fallback on small
models instead of an obvious error.

### 1.2 `.rpt` — summary tables

Parsed for continuity errors, summary tables, critical elements and run
diagnostics. It feeds the Summary Scatter plots and the mass-balance comparisons,
never the time-series graph.

### 1.3 `.lid` — consolidated detailed LID report (WASM 5.2.4 only)

See section 4.

---

## 2. Provenance: how much to trust a variable

Every variable in the catalogue carries a provenance tag, defined in
`client/src/lib/swmm-variables.ts` and shown in the UI next to the variable name.

| Tag | Meaning |
| --- | --- |
| **ENG** — Engine output | Read straight out of the binary `.out` (or, for map input themes, straight out of the `.inp`). Highest trust. |
| **DRV** — Directly derived | Computed exactly from engine outputs plus model geometry with standard hydraulic formulas. Trustworthy to the extent the geometry is. |
| **RCN** — Reconstructed | Internal solver state the engine never reports, recomputed post-hoc following the SWMM5 source formulas (`dynwave.c`, `infil.c`). Values follow the right equations but are evaluated at *reporting* intervals, not at the engine's internal iteration steps. Read them as patterns, not as the solver's actual numbers. |
| **EST** — Estimated | Approximated with simplifying assumptions or generic coefficients. Qualitative use only. |
| **N/A** — Unavailable | Registered for future use; not computed. |

A specific caveat: the water-quality variables (`pollutWashoff`, `pollutBuildup`,
`pollutConcRunoff`, `pollutConcGW`, `pollutLoad`) and four snowpack internals
(`snowATI`, `snowWATI`, `snowPackSWE`, `snowPackDepth`) plus three LID extras
(`lidSoilEvap`, `lidDrainCoeff`, `lidRetention`) are **fixed-coefficient
placeholders**. The engine adapters do not run SWMM quality routing. Do not use
them quantitatively.

The honest short version:

- 19 variables are true engine output (6 node + 5 link + 8 subcatchment).
- Everything else in the catalogue is computed in the browser after the run, and
  is therefore identical in principle across WASM 5, SWMM 6 and local — the
  differences you see between engines come from the 19 base series they feed it.

---

## 3. The variable catalogue

220 result variables across four scopes, grouped exactly as the UI groups them.
Break-points are the five map-legend bands.

<!-- SCOPE node (27 variables) -->

#### Standard (EPA) — `NODE_STD` (6) — Engine output

| Key | Name | Units | Provenance | Legend break-points |
| --- | --- | --- | --- | --- |
| `depth` | Depth | ft/m | ENG | < 1.5 · 1.5-3.0 · 3.0-4.0 · 4.0-5.0 · > 5.0 |
| `head` | Head (HGL) | ft/m | ENG | < 92 · 92-95 · 95-97 · 97-100 · > 100 |
| `volume` | Volume | ft³/m³ | ENG | < 100 · 100-300 · 300-500 · 500-800 · > 800 |
| `lateralInflow` | Lateral Inflow | CFS/CMS | ENG | < 1 · 1-3 · 3-5 · 5-8 · > 8 |
| `totalInflow` | Total Inflow | CFS/CMS | ENG | < 1 · 1-4 · 4-8 · 8-12 · > 12 |
| `flooding` | Overflow / Flooding | CFS/CMS | ENG | 0 · < 1 · 1-2 · 2-4 · > 4 |

#### Estimated Solver Diagnostics — `NODE_SOLVER` (15) — Reconstructed

| Key | Name | Units | Provenance | Legend break-points |
| --- | --- | --- | --- | --- |
| `surfaceArea` | Surface Area | ft²/m² | RCN | < 10 · 10-25 · 25-50 · 50-75 · > 75 |
| `nodeTimestep` | Timestep | sec | RCN | < 5 · 5-15 · 15-30 · 30-45 · > 45 |
| `nodeCE` | Continuity Error | — | RCN | < 0.01 · 0.01-0.02 · 0.02-0.03 · 0.03-0.04 · > 0.04 |
| `dqdh` | dQ/dH (Jacobian) | CFS·ft⁻¹ | RCN | < 5 · 5-15 · 15-25 · 25-40 · > 40 |
| `nrDenom` | NR Denominator | — | RCN | < 10 · 10-30 · 30-50 · 50-80 · > 80 |
| `fResidual` | F(H) Residual | CFS/CMS | RCN | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `crownElev` | Crown Elevation | ft/m | RCN | Low · High |
| `prevArea` | Previous Area | ft²/m² | RCN | < 10 · 10-25 · 25-50 · 50-75 · > 75 |
| `headCorrection` | Head Correction | ft/m | RCN | < 0.1 · 0.1-0.3 · 0.3-0.5 · 0.5-0.8 · > 0.8 |
| `nodeIterations` | Iteration Count | count | RCN | 1-2 · 3-4 · 5-6 · 7-8 · > 8 |
| `nodeConvergence` | Convergence Flag | 0/1 | RCN | Failed · OK |
| `nodeInfil` | Node Infiltration | CFS/CMS | RCN | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `nodeEvap` | Node Evaporation | CFS/CMS | RCN | < 0.1 · 0.1-0.3 · 0.3-0.5 · 0.5-0.8 · > 0.8 |
| `nodeDegree` | Node Degree | count | RCN | 1 · 2 · 3 · 4-5 · > 5 |
| `oldAreaByDt` | OldArea / dt | ft²/s | RCN | < 1 · 1-3 · 3-5 · 5-8 · > 8 |

#### RDII / DWF — `NODE_RDII` (6) — Estimated

| Key | Name | Units | Provenance | Legend break-points |
| --- | --- | --- | --- | --- |
| `rdiiTotal` | RDII Total Flow | CFS/CMS | EST | < 1 · 1-3 · 3-5 · 5-8 · > 8 |
| `rdiiUH1` | RDII from UH1 | CFS/CMS | EST | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `rdiiUH2` | RDII from UH2 | CFS/CMS | EST | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `rdiiUH3` | RDII from UH3 | CFS/CMS | EST | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `dwfInflow` | DWF Inflow | CFS/CMS | EST | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `totalOutflow` | Total Outflow | CFS/CMS | EST | < 1 · 1-4 · 4-8 · 8-12 · > 12 |

<!-- SCOPE link (66 variables) -->

#### Standard (EPA) — `LINK_STD` (5) — Engine output

| Key | Name | Units | Provenance | Legend break-points |
| --- | --- | --- | --- | --- |
| `flow` | Flow (Q) | CFS/CMS | ENG | < 1.0 · 1.0-2.5 · 2.5-4.0 · 4.0-6.0 · > 6.0 |
| `depth` | Depth (midpoint) | ft/m | ENG | < 0.5 · 0.5-1.0 · 1.0-1.5 · 1.5-2.0 · > 2.0 |
| `velocity` | Velocity | ft/s | ENG | < 1.0 · 1.0-2.0 · 2.0-3.0 · 3.0-5.0 · > 5.0 |
| `volume` | Volume | ft³/m³ | ENG | < 50 · 50-150 · 150-300 · 300-400 · > 400 |
| `capacity` | Capacity (d/D) | ratio | ENG | < 0.2 · 0.2-0.4 · 0.4-0.6 · 0.6-0.8 · > 0.8 |

#### Momentum Eq Terms — `LINK_MOMENTUM` (18) — Reconstructed

| Key | Name | Units | Provenance | Legend break-points |
| --- | --- | --- | --- | --- |
| `froude` | Froude Number | — | RCN | < 0.3 · 0.3-0.6 · 0.6-1.0 · 1.0-1.5 · > 1.5 |
| `f1Area` | F1 (US Area) | ft²/m² | RCN | < 2 · 2-5 · 5-10 · 10-15 · > 15 |
| `f2Area` | F2 (DS Area) | ft²/m² | RCN | < 2 · 2-5 · 5-10 · 10-15 · > 15 |
| `v1` | V1 (US Velocity) | ft/s | RCN | < 1 · 1-2 · 2-4 · 4-6 · > 6 |
| `v2` | V2 (DS Velocity) | ft/s | RCN | < 1 · 1-2 · 2-4 · 4-6 · > 6 |
| `dq1Inertia` | DQ1: Inertia | CFS/CMS | RCN | < 1 · 1-3 · 3-5 · 5-8 · > 8 |
| `dq2Pressure` | DQ2: Gravity/Pressure | CFS/CMS | RCN | < 1 · 1-3 · 3-5 · 5-8 · > 8 |
| `dq3Friction` | DQ3: Friction | CFS/CMS | RCN | < 1 · 1-3 · 3-5 · 5-8 · > 8 |
| `dq4Losses` | DQ4: Entry/Exit Loss | CFS/CMS | RCN | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `dq5Lateral` | DQ5: Lateral Inflow | CFS/CMS | RCN | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `dq6Convect` | DQ6: Convective Accel | CFS/CMS | RCN | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `upHLoss` | US Head Loss | ft/m | RCN | < 0.2 · 0.2-0.5 · 0.5-1.0 · 1.0-1.5 · > 1.5 |
| `dnHLoss` | DS Head Loss | ft/m | RCN | < 0.2 · 0.2-0.5 · 0.5-1.0 · 1.0-1.5 · > 1.5 |
| `frictionHLoss` | Friction Head Loss | ft/m | RCN | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `hwFrictionSlope` | H-W Friction Slope | ft/ft | RCN | < 0.005 · 0.005-0.01 · 0.01-0.02 · 0.02-0.04 · > 0.04 |
| `qNormal` | Q_normal | CFS/CMS | RCN | < 2 · 2-5 · 5-10 · 10-15 · > 15 |
| `stVenantBalance` | St. Venant Balance | — | RCN | < 0.1 · 0.1-0.3 · 0.3-0.5 · 0.5-0.8 · > 0.8 |
| `linkDqdh` | Link dQ/dH | CFS/ft | RCN | < 5 · 5-15 · 15-25 · 25-40 · > 40 |

#### Geometry (US/DS) — `LINK_GEOMETRY` (12) — Directly derived

| Key | Name | Units | Provenance | Legend break-points |
| --- | --- | --- | --- | --- |
| `aMid` | A_mid (Midpoint Area) | ft²/m² | DRV | < 2 · 2-5 · 5-10 · 10-15 · > 15 |
| `aWeighted` | A_weighted | ft²/m² | DRV | < 2 · 2-5 · 5-10 · 10-15 · > 15 |
| `a1` | A1 (US Area) | ft²/m² | DRV | < 2 · 2-5 · 5-10 · 10-15 · > 15 |
| `a2` | A2 (DS Area) | ft²/m² | DRV | < 2 · 2-5 · 5-10 · 10-15 · > 15 |
| `rMid` | R_mid (Hyd Radius) | ft/m | DRV | < 0.3 · 0.3-0.8 · 0.8-1.5 · 1.5-2.5 · > 2.5 |
| `rWeighted` | R_weighted | ft/m | DRV | < 0.3 · 0.3-0.8 · 0.8-1.5 · 1.5-2.5 · > 2.5 |
| `r1` | R1 (US Hyd Radius) | ft/m | DRV | < 0.3 · 0.3-0.8 · 0.8-1.5 · 1.5-2.5 · > 2.5 |
| `r2` | R2 (DS Hyd Radius) | ft/m | DRV | < 0.3 · 0.3-0.8 · 0.8-1.5 · 1.5-2.5 · > 2.5 |
| `w1` | W1 (US Top Width) | ft/m | DRV | < 1 · 1-3 · 3-5 · 5-8 · > 8 |
| `w2` | W2 (DS Top Width) | ft/m | DRV | < 1 · 1-3 · 3-5 · 5-8 · > 8 |
| `y1` | Y1 (US Depth) | ft/m | DRV | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `y2` | Y2 (DS Depth) | ft/m | DRV | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |

#### Energy / Bernoulli — `LINK_ENERGY` (11) — Directly derived

| Key | Name | Units | Provenance | Legend break-points |
| --- | --- | --- | --- | --- |
| `hgl` | HGL (midpoint) | ft/m | DRV | Low · High |
| `h1Head` | H1 (US Head) | ft/m | DRV | Low · High |
| `h2Head` | H2 (DS Head) | ft/m | DRV | Low · High |
| `vhUp` | VH_up (US Vel Head) | ft/m | DRV | < 0.2 · 0.2-0.5 · 0.5-1.0 · 1.0-1.5 · > 1.5 |
| `vhMid` | VH_mid (Vel Head) | ft/m | DRV | < 0.2 · 0.2-0.5 · 0.5-1.0 · 1.0-1.5 · > 1.5 |
| `vhDn` | VH_dn (DS Vel Head) | ft/m | DRV | < 0.2 · 0.2-0.5 · 0.5-1.0 · 1.0-1.5 · > 1.5 |
| `frictionLossHf` | Friction Loss (hf) | ft/m | DRV | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `bernoulliLHS` | Bernoulli LHS | ft/m | DRV | Low · High |
| `bernoulliRHS` | Bernoulli RHS | ft/m | DRV | Low · High |
| `rho` | ρ (Density Factor) | — | DRV | < 0.5 · 0.5-0.8 · 0.8-1.0 · 1.0-1.5 · > 1.5 |
| `sigma` | σ (Inertial Damping) | 0–1 | DRV | < 0.2 · 0.2-0.4 · 0.4-0.6 · 0.6-0.8 · > 0.8 |

#### SWMM 3/4/5 Compat — `LINK_COMPAT` (3) — Directly derived

| Key | Name | Units | Provenance | Legend break-points |
| --- | --- | --- | --- | --- |
| `areaSWMM3` | Area (SWMM3 weight) | ft²/m² | DRV | < 2 · 2-5 · 5-10 · 10-15 · > 15 |
| `areaSWMM4` | Area (SWMM4 weight) | ft²/m² | DRV | < 2 · 2-5 · 5-10 · 10-15 · > 15 |
| `areaSWMM5` | Area (SWMM5 weight) | ft²/m² | DRV | < 2 · 2-5 · 5-10 · 10-15 · > 15 |

#### Properties / RTC — `LINK_PROPS` (16) — Directly derived

| Key | Name | Units | Provenance | Legend break-points |
| --- | --- | --- | --- | --- |
| `usNormalArea` | US Normal Area | ft²/m² | DRV | < 2 · 2-5 · 5-10 · 10-15 · > 15 |
| `dsNormalArea` | DS Normal Area | ft²/m² | DRV | < 2 · 2-5 · 5-10 · 10-15 · > 15 |
| `linkTimestep` | Timestep | sec | DRV | < 5 · 5-15 · 15-30 · 30-45 · > 45 |
| `linkIterations` | Iterations | count | DRV | 1-2 · 3-4 · 5-6 · 7-8 · > 8 |
| `akon` | AKON Factor | — | DRV | < 10 · 10-30 · 30-50 · 50-80 · > 80 |
| `fasnh` | FASNH Factor | — | DRV | < 10 · 10-30 · 30-50 · 50-80 · > 80 |
| `actualLength` | Length (actual) | ft/m | DRV | Short · Long |
| `modLength` | Modified Length | ft/m | DRV | Short · Long |
| `actualRoughness` | Roughness (n) | — | DRV | < 0.010 · 0.010-0.015 · 0.015-0.025 · 0.025-0.035 · > 0.035 |
| `roughFactor` | Roughness Factor | — | DRV | < 0.5 · 0.5-0.8 · 0.8-1.0 · 1.0-1.5 · > 1.5 |
| `bedSlope` | Bed Slope | ft/ft | DRV | < 0.005 · 0.005-0.01 · 0.01-0.02 · 0.02-0.04 · > 0.04 |
| `qMax` | Q_max (Full Cap) | CFS/CMS | DRV | < 5 · 5-15 · 15-25 · 25-40 · > 40 |
| `beta` | β (Momentum Coeff) | — | DRV | < 0.8 · 0.8-0.9 · 0.9-1.0 · 1.0-1.1 · > 1.1 |
| `setting` | Setting | 0–1 | DRV | Off · Full |
| `targetSetting` | Target Setting | 0–1 | DRV | Off · Full |
| `timeOpen` | Time Open | sec | DRV | < 300 · 300-900 · 900-1800 · 1800-3000 · > 3000 |

#### Flow Classification — `FLOW_CLASS` (1) — Directly derived

| Key | Name | Units | Provenance | Legend break-points |
| --- | --- | --- | --- | --- |
| `flowClass` | Flow Classification | flag | DRV | Dry · SubCrit · SupCrit · Critical · Full |

<!-- SCOPE subcatch (100 variables) -->

#### Standard (EPA) — `SUB_STD` (8) — Engine output

| Key | Name | Units | Provenance | Legend break-points |
| --- | --- | --- | --- | --- |
| `rainfall` | Rainfall | in/hr | ENG | < 0.5 · 0.5-1.0 · 1.0-2.0 · 2.0-3.0 · > 3.0 |
| `snowDepth` | Snow Depth | in/mm | ENG | < 0.5 · 0.5-1.0 · 1.0-2.0 · 2.0-4.0 · > 4.0 |
| `evap` | Evaporation | in/hr | ENG | < 0.05 · 0.05-0.1 · 0.1-0.2 · 0.2-0.4 · > 0.4 |
| `infiltration` | Infiltration | in/hr | ENG | < 0.2 · 0.2-0.5 · 0.5-1.0 · 1.0-2.0 · > 2.0 |
| `runoff` | Total Runoff | CFS/CMS | ENG | < 2 · 2-5 · 5-10 · 10-15 · > 15 |
| `gwOutflow` | GW Flow to Node | CFS/CMS | ENG | < 0.5 · 0.5-1.0 · 1.0-2.0 · 2.0-4.0 · > 4.0 |
| `gwElev` | GW Table Elev | ft/m | ENG | Low · High |
| `moisture` | Soil Moisture | fraction | ENG | < 0.1 · 0.1-0.2 · 0.2-0.3 · 0.3-0.4 · > 0.4 |

#### Runoff Detail — `SUB_RUNOFF` (13) — Estimated

| Key | Name | Units | Provenance | Legend break-points |
| --- | --- | --- | --- | --- |
| `runoffImperv0` | Runoff: Imperv (no DS) | CFS/CMS | EST | < 1 · 1-3 · 3-5 · 5-8 · > 8 |
| `runoffImperv1` | Runoff: Imperv (DS) | CFS/CMS | EST | < 1 · 1-3 · 3-5 · 5-8 · > 8 |
| `runoffPerv` | Runoff: Pervious | CFS/CMS | EST | < 1 · 1-3 · 3-5 · 5-8 · > 8 |
| `depthImperv0` | Depth: Imperv (no DS) | ft/m | EST | < 0.05 · 0.05-0.1 · 0.1-0.2 · 0.2-0.3 · > 0.3 |
| `depthImperv1` | Depth: Imperv (DS) | ft/m | EST | < 0.05 · 0.05-0.1 · 0.1-0.2 · 0.2-0.3 · > 0.3 |
| `depthPerv` | Depth: Pervious | ft/m | EST | < 0.05 · 0.05-0.1 · 0.1-0.2 · 0.2-0.3 · > 0.3 |
| `avgSurfDepth` | Avg Surface Depth | ft/m | EST | < 0.05 · 0.05-0.1 · 0.1-0.2 · 0.2-0.3 · > 0.3 |
| `runon` | Runon (from outfall) | CFS/CMS | EST | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `subArea` | Total Area | ac/ha | EST | Small · Large |
| `impAreaDS` | Imperv Area (DS) | ac/ha | EST | Small · Large |
| `impAreaNoDS` | Imperv Area (no DS) | ac/ha | EST | Small · Large |
| `pervArea` | Pervious Area | ac/ha | EST | Small · Large |
| `nonLidArea` | Non-LID Area | ac/ha | EST | Small · Large |

#### LID Internals — `SUB_LID` (20) — Estimated

| Key | Name | Units | Provenance | Legend break-points |
| --- | --- | --- | --- | --- |
| `lidArea` | LID Total Area | ft²/m² | EST | < 500 · 500-1500 · 1500-3000 · 3000-4500 · > 4500 |
| `lidCaptureArea` | LID Capture Area | ft²/m² | EST | < 500 · 500-1500 · 1500-3000 · 3000-4500 · > 4500 |
| `impToLidFlow` | Imp to LID Flow | CFS/CMS | EST | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `lidCount` | LID Unit Count | count | EST | 0 · 1-2 · 3-4 · 5-7 · > 7 |
| `lidSurfInflow` | LID: Surface Inflow | in/hr | EST | < 0.3 · 0.3-0.8 · 0.8-1.5 · 1.5-2.5 · > 2.5 |
| `lidEvap` | LID: Evaporation | in/hr | EST | < 0.05 · 0.05-0.1 · 0.1-0.2 · 0.2-0.4 · > 0.4 |
| `lidSurfInfil` | LID: Surface Infil | in/hr | EST | < 0.3 · 0.3-0.8 · 0.8-1.5 · 1.5-2.5 · > 2.5 |
| `lidPavePerc` | LID: Pavement Perc | in/hr | EST | < 0.3 · 0.3-0.8 · 0.8-1.5 · 1.5-2.5 · > 2.5 |
| `lidSoilPerc` | LID: Soil Perc | in/hr | EST | < 0.3 · 0.3-0.8 · 0.8-1.5 · 1.5-2.5 · > 2.5 |
| `lidStorExfil` | LID: Storage Exfil | in/hr | EST | < 0.3 · 0.3-0.8 · 0.8-1.5 · 1.5-2.5 · > 2.5 |
| `lidSurfOverflow` | LID: Surface Overflow | in/hr | EST | < 0.3 · 0.3-0.8 · 0.8-1.5 · 1.5-2.5 · > 2.5 |
| `lidStorDrain` | LID: Underdrain Flow | in/hr | EST | < 0.3 · 0.3-0.8 · 0.8-1.5 · 1.5-2.5 · > 2.5 |
| `lidSurfDepth` | LID: Surface Depth | in/mm | EST | < 0.3 · 0.3-0.8 · 0.8-1.5 · 1.5-2.5 · > 2.5 |
| `lidPaveDepth` | LID: Pavement Depth | in/mm | EST | < 0.3 · 0.3-0.8 · 0.8-1.5 · 1.5-2.5 · > 2.5 |
| `lidSoilMoist` | LID: Soil Moisture | fraction | EST | < 0.2 · 0.2-0.4 · 0.4-0.6 · 0.6-0.8 · > 0.8 |
| `lidStorDepth` | LID: Storage Depth | in/mm | EST | < 1 · 1-3 · 3-5 · 5-8 · > 8 |
| `lidTotalInflow` | LID: Total Inflow | CFS/CMS | EST | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `lidSoilEvap` | LID: Soil Evap | in/hr | EST | < 0.02 · 0.02-0.05 · 0.05-0.1 · 0.1-0.15 · > 0.15 |
| `lidDrainCoeff` | LID: Drain Coeff | in/hr | EST | < 0.2 · 0.2-0.5 · 0.5-1.0 · 1.0-1.5 · > 1.5 |
| `lidRetention` | LID: Water Retention | in/mm | EST | < 0.3 · 0.3-0.8 · 0.8-1.5 · 1.5-2.5 · > 2.5 |

#### Groundwater — `SUB_GW` (16) — Estimated

| Key | Name | Units | Provenance | Legend break-points |
| --- | --- | --- | --- | --- |
| `gwFlowA1` | GW: A1 Term (lateral) | CFS/CMS | EST | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `gwFlowA2` | GW: A2 Term (deep) | CFS/CMS | EST | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `gwFlowA3` | GW: A3 Term (interact) | CFS/CMS | EST | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `gwPercolation` | GW: Percolation | in/hr | EST | < 0.1 · 0.1-0.3 · 0.3-0.5 · 0.5-0.8 · > 0.8 |
| `gwEvapLoss` | GW: ET Loss | in/hr | EST | < 0.05 · 0.05-0.1 · 0.1-0.2 · 0.2-0.4 · > 0.4 |
| `gwHstar` | GW: H* (threshold) | ft/m | EST | Low · High |
| `gwHsw` | GW: H_sw (surface) | ft/m | EST | Low · High |
| `gwLowerDepth` | GW: Lower Zone Depth | ft/m | EST | < 1 · 1-3 · 3-5 · 5-8 · > 8 |
| `gwTotalDepth` | GW: Total GW Depth | ft/m | EST | < 2 · 2-5 · 5-10 · 10-15 · > 15 |
| `aqBottomElev` | Aquifer Bottom Elev | ft/m | EST | Low · High |
| `aqPorosity` | Aquifer Porosity | fraction | EST | < 0.1 · 0.1-0.2 · 0.2-0.3 · 0.3-0.4 · > 0.4 |
| `gwMaxFlow` | GW: Max Lateral Flow | CFS/CMS | EST | < 1 · 1-3 · 3-5 · 5-8 · > 8 |
| `gwMaxNegFlow` | GW: Max Neg Flow | CFS/CMS | EST | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `waterTableLevel` | Water Table Level | ft/m | EST | Low · High |
| `gwNodeFlow` | GW: Flow at Node | CFS/CMS | EST | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `gwOldFlow` | GW: Previous Flow | CFS/CMS | EST | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |

#### Snow Internals — `SUB_SNOW` (10) — Estimated

| Key | Name | Units | Provenance | Legend break-points |
| --- | --- | --- | --- | --- |
| `snowmelt` | Snowmelt Rate | in/hr | EST | < 0.1 · 0.1-0.3 · 0.3-0.5 · 0.5-0.8 · > 0.8 |
| `immediateMelt` | Immediate Melt | in/hr | EST | < 0.1 · 0.1-0.3 · 0.3-0.5 · 0.5-0.8 · > 0.8 |
| `rainOnSnowMelt` | Rain-on-Snow Melt | in/hr | EST | < 0.1 · 0.1-0.3 · 0.3-0.5 · 0.5-0.8 · > 0.8 |
| `snowFreeWater` | Snow: Free Water | in/mm | EST | < 0.2 · 0.2-0.5 · 0.5-1.0 · 1.0-1.5 · > 1.5 |
| `snowColdContent` | Snow: Cold Content | in/mm | EST | < 0.2 · 0.2-0.5 · 0.5-1.0 · 1.0-1.5 · > 1.5 |
| `snowCoverage` | Snow: Coverage | fraction | EST | < 0.2 · 0.2-0.4 · 0.4-0.6 · 0.6-0.8 · > 0.8 |
| `snowATI` | Snow: ATI (temp index) | °F | EST | < 10 · 10-20 · 20-30 · 30-40 · > 40 |
| `snowWATI` | Snow: WATI (wind ATI) | °F | EST | < 10 · 10-20 · 20-30 · 30-40 · > 40 |
| `snowPackSWE` | Snow: Pack SWE | in/mm | EST | < 1 · 1-3 · 3-5 · 5-8 · > 8 |
| `snowPackDepth` | Snow: Pack Depth | in/mm | EST | < 2 · 2-6 · 6-10 · 10-15 · > 15 |

#### Infiltration — `SUB_INFIL` (28) — Reconstructed

| Key | Name | Units | Provenance | Legend break-points |
| --- | --- | --- | --- | --- |
| `ulThickness` | Upper Zone Thickness | ft/m | RCN | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `fTotal` | F_total (cum infil) | in/mm | RCN | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `fUpper` | F_upper | in/mm | RCN | < 0.3 · 0.3-0.8 · 0.8-1.5 · 1.5-2.5 · > 2.5 |
| `fUpperMax` | F_upper_max | in/mm | RCN | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `currentMoisture` | Current Moisture | fraction | RCN | < 0.1 · 0.1-0.2 · 0.2-0.3 · 0.3-0.4 · > 0.4 |
| `imd` | IMD (Moisture Deficit) | fraction | RCN | < 0.1 · 0.1-0.2 · 0.2-0.3 · 0.3-0.4 · > 0.4 |
| `imdByEvent` | IMD at Event Start | fraction | RCN | < 0.1 · 0.1-0.2 · 0.2-0.3 · 0.3-0.4 · > 0.4 |
| `satFlag` | Saturation Flag | 0/1 | RCN | Unsat · Sat |
| `infilTime` | GA: Infil Time | hours | RCN | < 2 · 2-6 · 6-12 · 12-18 · > 18 |
| `currentInfilRate` | Current Infil Rate | in/hr | RCN | < 0.3 · 0.3-0.8 · 0.8-1.5 · 1.5-2.5 · > 2.5 |
| `hortonTp` | Horton: Tp | hours | RCN | < 1 · 1-3 · 3-5 · 5-8 · > 8 |
| `hortonFe` | Horton: Fe (cum F) | in/mm | RCN | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `gaIMD` | GA: IMD | fraction | RCN | < 0.1 · 0.1-0.2 · 0.2-0.3 · 0.3-0.4 · > 0.4 |
| `gaF` | GA: F (cum infil) | in/mm | RCN | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `gaFu` | GA: F_upper | in/mm | RCN | < 0.3 · 0.3-0.8 · 0.8-1.5 · 1.5-2.5 · > 2.5 |
| `gaLu` | GA: Lu (depth) | in/mm | RCN | < 1 · 1-3 · 3-5 · 5-8 · > 8 |
| `gaT` | GA: Time | hours | RCN | < 2 · 2-6 · 6-12 · 12-18 · > 18 |
| `gaSat` | GA: Saturation | 0/1 | RCN | Unsat · Sat |
| `cnS` | CN: S (retention) | in/mm | RCN | < 1 · 1-3 · 3-5 · 5-8 · > 8 |
| `cnF` | CN: F (cum infil) | in/mm | RCN | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `cnP` | CN: P (cum precip) | in/mm | RCN | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `cnT` | CN: Time | hours | RCN | < 2 · 2-6 · 6-12 · 12-18 · > 18 |
| `cnSe` | CN: Se (effective S) | in/mm | RCN | < 1 · 1-3 · 3-5 · 5-8 · > 8 |
| `cnRate` | CN: f (current rate) | in/hr | RCN | < 0.3 · 0.3-0.8 · 0.8-1.5 · 1.5-2.5 · > 2.5 |
| `cnSmax` | CN: S_max | in/mm | RCN | < 2 · 2-5 · 5-8 · 8-12 · > 12 |
| `cnF1` | CN: F1 (prev F) | in/mm | RCN | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `cnRegen` | CN: Regeneration | in/mm | RCN | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `cnCN` | CN: Current CN | — | RCN | < 40 · 40-60 · 60-75 · 75-90 · > 90 |

#### Pollutant WQ — `SUB_POLLUT` (5) — Estimated

| Key | Name | Units | Provenance | Legend break-points |
| --- | --- | --- | --- | --- |
| `pollutWashoff` | Pollutant: Washoff | mg/L | EST | < 10 · 10-30 · 30-50 · 50-80 · > 80 |
| `pollutBuildup` | Pollutant: Buildup | lbs/kg | EST | < 5 · 5-15 · 15-25 · 25-40 · > 40 |
| `pollutConcRunoff` | Pollutant: Conc in Runoff | mg/L | EST | < 20 · 20-50 · 50-100 · 100-150 · > 150 |
| `pollutConcGW` | Pollutant: Conc in GW | mg/L | EST | < 10 · 10-30 · 30-50 · 50-80 · > 80 |
| `pollutLoad` | Pollutant: Total Load | lbs/kg | EST | < 10 · 10-30 · 30-50 · 50-80 · > 80 |

<!-- SCOPE system (27 variables) -->

#### System Flow — `SYS` (23) — Directly derived

| Key | Name | Units | Provenance | Legend break-points |
| --- | --- | --- | --- | --- |
| `sysTemperature` | Air Temperature | °F/°C | DRV | Cold · Hot |
| `sysRainfall` | System Rainfall | in/hr | DRV | < 0.5 · 0.5-1.0 · 1.0-2.0 · 2.0-3.0 · > 3.0 |
| `sysSnowDepth` | System Snow Depth | in/mm | DRV | < 0.5 · 0.5-1.0 · 1.0-2.0 · 2.0-4.0 · > 4.0 |
| `sysInfil` | System Infiltration | CFS/CMS | DRV | < 5 · 5-15 · 15-25 · 25-40 · > 40 |
| `sysRunoff` | System Runoff | CFS/CMS | DRV | < 10 · 10-30 · 30-50 · 50-80 · > 80 |
| `sysDWF` | System DWF | CFS/CMS | DRV | < 2 · 2-5 · 5-10 · 10-15 · > 15 |
| `sysGWFlow` | System GW Flow | CFS/CMS | DRV | < 2 · 2-5 · 5-10 · 10-15 · > 15 |
| `sysRDII` | System RDII | CFS/CMS | DRV | < 2 · 2-5 · 5-10 · 10-15 · > 15 |
| `sysExtFlow` | System External Flow | CFS/CMS | DRV | < 2 · 2-5 · 5-10 · 10-15 · > 15 |
| `sysTotalInflow` | Total Lateral Inflow | CFS/CMS | DRV | < 10 · 10-30 · 30-50 · 50-80 · > 80 |
| `sysFlooding` | System Flooding | CFS/CMS | DRV | < 2 · 2-5 · 5-10 · 10-15 · > 15 |
| `sysOutflow` | System Outflow | CFS/CMS | DRV | < 10 · 10-30 · 30-50 · 50-80 · > 80 |
| `sysStorage` | System Storage | ft³/m³ | DRV | < 1000 · 1k-3k · 3k-5k · 5k-8k · > 8k |
| `sysEvap` | System Evaporation | CFS/CMS | DRV | < 0.5 · 0.5-1.5 · 1.5-2.5 · 2.5-4 · > 4 |
| `sysPET` | Potential ET | in/day | DRV | < 0.05 · 0.05-0.1 · 0.1-0.15 · 0.15-0.25 · > 0.25 |
| `sysWindSpeed` | Wind Speed | mph | DRV | < 5 · 5-10 · 10-15 · 15-25 · > 25 |
| `sysSnowfall` | System Snowfall | in/hr | DRV | < 0.2 · 0.2-0.5 · 0.5-1.0 · 1.0-1.5 · > 1.5 |
| `sysSnowArea` | Snow Coverage | fraction | DRV | < 0.2 · 0.2-0.4 · 0.4-0.6 · 0.6-0.8 · > 0.8 |
| `sysFreeWater` | Snow Free Water | in/mm | DRV | < 0.2 · 0.2-0.5 · 0.5-1.0 · 1.0-1.5 · > 1.5 |
| `sysColdContent` | Snow Cold Content | in/mm | DRV | < 0.2 · 0.2-0.5 · 0.5-1.0 · 1.0-1.5 · > 1.5 |
| `sysSnowmelt` | System Snowmelt | in/hr | DRV | < 0.1 · 0.1-0.3 · 0.3-0.5 · 0.5-0.8 · > 0.8 |
| `sysImelt` | Immediate Melt | in/hr | DRV | < 0.1 · 0.1-0.3 · 0.3-0.5 · 0.5-0.8 · > 0.8 |
| `sysRainMelt` | Rain-on-Snow Melt | in/hr | DRV | < 0.1 · 0.1-0.3 · 0.3-0.5 · 0.5-0.8 · > 0.8 |

#### QA Diagnostics — `SYS_QA` (4) — Reconstructed

| Key | Name | Units | Provenance | Legend break-points |
| --- | --- | --- | --- | --- |
| `stepFlowError` | Step Flow Error | % | RCN | < 1 · 1-3 · 3-5 · 5-8 · > 8 |
| `sysCE` | Continuity Error | % | RCN | < 1 · 1-3 · 3-5 · 5-8 · > 8 |
| `sysIterations` | Avg Iterations | count | RCN | 1-2 · 3-4 · 5-6 · 7-8 · > 8 |
| `sysTimestep` | Timestep Used | sec | RCN | < 5 · 5-15 · 15-30 · 30-45 · > 45 |

<!-- INPUT (map-theme only) -->


##### Node input themes (3)

| Key | Name | Units | Provenance | Legend break-points |
| --- | --- | --- | --- | --- |
| `none` | None | — | ENG | — |
| `elevation` | Invert El. | ft/m | ENG | Low · High |
| `maxDepth` | Max Depth | ft | ENG | < 2 · 2-5 · 5-10 · 10-15 · > 15 |

##### Link input themes (5)

| Key | Name | Units | Provenance | Legend break-points |
| --- | --- | --- | --- | --- |
| `none` | None | — | ENG | — |
| `maxDepth` | Max Depth | ft | ENG | < 1 · 1-2.5 · 2.5-5 · 5-7.5 · > 7.5 |
| `roughness` | Manning's N | — | ENG | < 0.010 · 0.010-0.015 · 0.015-0.025 · 0.025-0.035 · > 0.035 |
| `length` | Length | ft | ENG | Short · Long |
| `slope` | Slope | ft/ft | ENG | < 0.005 · 0.005-0.01 · 0.01-0.02 · 0.02-0.04 · > 0.04 |

##### Subcatchment input themes (5)

| Key | Name | Units | Provenance | Legend break-points |
| --- | --- | --- | --- | --- |
| `none` | None | — | ENG | — |
| `imperv` | % Imperv | % | ENG | < 20% · 20-40% · 40-60% · 60-80% · > 80% |
| `area` | Area | ac/ha | ENG | Small · Large |
| `width` | Width | ft | ENG | Narrow · Wide |
| `slope` | Slope | % | ENG | Flat · Steep |

<!-- TOTALS node=27 link=66 sub=100 sys=27 total=220 -->

---

## 4. The consolidated LID report (`.lid`)

Written by the patched vendored engine
(`swmm-engine/Stormwater-Management-Model-5.2.4/src/solver/lid.c`, values produced
in `lidproc.c`). Stock SWMM 5.2.4 writes one file per LID unit; this build writes
a single `.lid` file containing every unit that asked for detailed reporting
(the report-file column in `[LID_USAGE]` — a `*` there means "no detail").

`[RESULTS]` column order, exactly as written:

| # | Column | Meaning | US units | SI units |
| --- | --- | --- | --- | --- |
| 1 | `Subcatch` | Subcatchment id | — | — |
| 2 | `LID` | LID control id | — | — |
| 3 | `Unit` | Unit number (stable across duplicate units) | — | — |
| 4 | `Date Time` | Simulation timestamp | — | — |
| 5 | `ElapsedHours` | Elapsed simulation time | hours | hours |
| 6 | `TotalInflow` | Surface inflow rate (rain + run-on) | in/hr | mm/hr |
| 7 | `TotalEvap` | Evaporation summed over surface, pavement, soil, storage | in/hr | mm/hr |
| 8 | `SurfInfil` | Infiltration rate out of the surface layer | in/hr | mm/hr |
| 9 | `PavePerc` | Percolation rate through the pavement layer | in/hr | mm/hr |
| 10 | `SoilPerc` | Percolation rate through the soil layer | in/hr | mm/hr |
| 11 | `StorExfil` | Exfiltration from the bottom layer into native soil | in/hr | mm/hr |
| 12 | `SurfRunoff` | Surface overflow leaving the unit | in/hr | mm/hr |
| 13 | `DrainOutflow` | Underdrain flow from storage | in/hr | mm/hr |
| 14 | `SurfLevel` | Ponded depth on the surface | in | mm |
| 15 | `PaveLevel` | Water depth in the pavement layer | in | mm |
| 16 | `SoilMoisture` | Volumetric soil moisture θ | fraction | fraction |
| 17 | `StorLevel` | Water depth in the storage / drain-mat layer | in | mm |

These rate and depth units are fixed by the report writer's unit system (US or
SI); they do **not** follow the project's flow-unit word.

In `client/src/components/swmm/LidViewerDialog.tsx` the 12 numeric columns are
indexed by the `V` map (zero-based, after the five identity/time columns):

```
inflow 0 · evap 1 · surfInfil 2 · pavePerc 3 · soilPerc 4 · storExfil 5
runoff 6 · drain 7 · surfLevel 8 · paveLevel 9 · soilMoist 10 · storLevel 11
```

The viewer's strip chart offers nine series, colour-matched to the cross-section
arrows:

| Series | Column | Colour | Group |
| --- | --- | --- | --- |
| Inflow | `inflow` | `#2f6fb5` | rate |
| Runoff | `runoff` | `#c0392b` | rate |
| Drain | `drain` | `#8e44ad` | rate |
| Exfil | `storExfil` | `#16a085` | rate |
| Infil | `surfInfil` | `#3aa0c9` | rate |
| Evap | `evap` | `#e67e22` | rate |
| Surf lvl | `surfLevel` | `#4a9fd8` | depth |
| Stor lvl | `storLevel` | `#b8860b` | depth |
| Soil θ | `soilMoist` | `#a9805a` | fraction |

Inflow, Runoff, Drain, Exfil and Stor lvl are visible by default. The Norm scale
mode normalises each series to its own maximum; Abs and Log share one scale per
unit group (rates together, depths together) and print the group maximum, so
comparing two rate series is meaningful in those modes and misleading in Norm.

Two engine-side gotchas the viewer has to work around, both visible in
`[CONTROLS]`:

- **Green roofs list a drain mat and a storage layer.** SWMM copies the DRAINMAT
  thickness and void fraction into a synthesised STORAGE block during validation,
  and one `StorLevel` column drives both. The viewer prefers DRAINMAT and drops
  the duplicate.
- **The bottom layer is not always STORAGE.** A bio-cell can end at SOIL, in
  which case SWMM still reports the soil-to-native-soil flow in the `StorExfil`
  column.

Rows are only written while something is happening — long dry periods are omitted
from the file. Any integration over `.lid` data (the viewer's mass balance does
this) must be gap-aware or it will invent volume across the dry gaps.

---

## 5. Which graph uses which variable set

| Surface | Variables offered | Source of values |
| --- | --- | --- |
| Time Series Graph | 6 node (`depth`, `head`, `totalInflow`, `lateralInflow`, `flooding`, `volume`), 5 link (`flow`, `velocity`, `depth`, `capacity`, `volume`), 6 subcatchment (`rainfall`, `runoff`, `infiltration`, `evap`, `gwOutflow`, `moisture`), plus the full system list | `results.timeSteps[*]` — engine `.out` fields, so all ENG except the system group |
| Statistics Report | the **whole** catalogue below (node, link, subcatchment, system), grouped by category | same time steps, aggregated to daily / monthly / event statistics |
| Map thematic display | whole catalogue **plus** the input themes (invert elevation, max depth, roughness, %imperv, area, width, slope) | time step at the current animation position; inputs come from the `.inp` |
| Scatter Plot | any node / link / subcatchment field against any other, at each reporting step | time steps |
| Summary Scatter (engine comparison) | `.rpt` summary columns only: max \|flow\| per link, max HGL or max depth per node, peak runoff per subcatchment, conduit d/D | parsed `.rpt`, so it works even for cloud runs |
| Profile Plot | invert, crown, ground, HGL, EGL along a conduit path | node elevations + geometry + the selected time step |
| Phase Space | depth vs flow (`totalInflow` for nodes), dh/dt vs dQ/dt, Manning normal-flow reference curve | time steps + cross-section geometry |
| Engine Inspector | engine `Q`, `V`, `Y`, heads, d/D, alongside reconstructed area, wetted perimeter, hydraulic radius, top width, hydraulic depth, normal and full flow, Froude | time steps + `.inp` geometry; unsupported cross-section shapes are gated off rather than approximated |
| Engine Scatter Compare | worst-divergence node/link series between two engine runs | overlays built from two result sets |
| LID Viewer | the 12 `.lid` columns above | `.lid` text (WASM 5.2.4 runs only) |

---

## 6. Units

The catalogue writes dual units (`ft/m`, `CFS/CMS`, `in/mm`) because the active
unit system follows the project's `FLOW_UNITS`: CFS / GPM / MGD select US units
(ft, ft², ft³, in/hr, °F), and CMS / LPS / MLD select SI (m, m², m³, mm/hr, °C).
The engines write results already in the project's unit system — the app does not
convert them — with the single exception noted in section 4, where the `.lid`
report has its own fixed rate/depth units.
