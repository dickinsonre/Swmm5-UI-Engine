import { useState, useMemo, useCallback } from "react";

// ═══════════════════════════════════════════════════════════
// SWMM5 INNER WORKINGS — Complete Variable Reference
// Based on actual Innovyze RED enums.h + EPA SWMM5 engine
// ═══════════════════════════════════════════════════════════

const CATS = {
  NODE_STD: { label: "Node · Standard (EPA)", icon: "●", color: "#58a6ff" },
  NODE_SOLVER: { label: "Node · Solver Internals", icon: "⚡", color: "#f0883e" },
  NODE_RDII: { label: "Node · RDII / DWF", icon: "💧", color: "#39d3d8" },

  LINK_STD: { label: "Link · Standard (EPA)", icon: "━", color: "#3fb950" },
  LINK_MOMENTUM: { label: "Link · Momentum Eq Terms", icon: "∂Q", color: "#f85149" },
  LINK_GEOMETRY: { label: "Link · Geometry (US/DS)", icon: "⬡", color: "#d29922" },
  LINK_ENERGY: { label: "Link · Energy / Bernoulli", icon: "⚖️", color: "#bc8cff" },
  LINK_COMPAT: { label: "Link · SWMM 3/4/5 Compat", icon: "🔄", color: "#8b949e" },
  LINK_PROPS: { label: "Link · Properties / RTC", icon: "⚙️", color: "#6e7681" },

  SUB_STD: { label: "Subcatch · Standard (EPA)", icon: "🌧", color: "#58a6ff" },
  SUB_RUNOFF: { label: "Subcatch · Runoff Detail", icon: "🏘", color: "#3fb950" },
  SUB_LID: { label: "Subcatch · LID Internals", icon: "🌿", color: "#39d3d8" },
  SUB_GW: { label: "Subcatch · Groundwater", icon: "🌊", color: "#d29922" },
  SUB_SNOW: { label: "Subcatch · Snow Internals", icon: "❄️", color: "#f0883e" },
  SUB_INFIL: { label: "Subcatch · Infiltration", icon: "⬇️", color: "#bc8cff" },

  SYS: { label: "System · Flow Quantities", icon: "🔄", color: "#58a6ff" },
  SYS_QA: { label: "System · QA Diagnostics", icon: "🔍", color: "#f85149" },
  FLOW_CLASS: { label: "Link · Flow Classification", icon: "🏷", color: "#d29922" },
  XSECT: { label: "Cross-Section Shapes", icon: "○", color: "#3fb950" },
  ENUMS: { label: "Engine Enumerations", icon: "📋", color: "#8b949e" },
};

const V = [
  // ═══════════════════════════════════════════════
  // NODE STANDARD (EPA)
  // ═══════════════════════════════════════════════
  { e: "NODE_DEPTH", idx: 0, cat: "NODE_STD", name: "Depth", units: "ft/m", desc: "Water depth above the node invert. Primary hydraulic state variable. Updated from continuity equation at each routing iteration: ΔV/Δt = ΣQ_in - ΣQ_out. Depth = Volume / SurfaceArea.", impl: "node.c → node_setDepth(). Surface area from MIN_SURFAREA for junctions, area-depth curve for storage nodes." },
  { e: "NODE_HEAD", idx: 1, cat: "NODE_STD", name: "Head (HGL)", units: "ft/m", desc: "Hydraulic grade line elevation = InvertElev + Depth. This is what the Newton-Raphson solver iterates to convergence. The pressure gradient ∂H/∂x between upstream and downstream heads drives the momentum equation.", impl: "node.c. H = Node[j].invertElev + Node[j].newDepth. Convergence test: max|ΔH| across all nodes < HEAD_TOLERANCE." },
  { e: "NODE_VOLUME", idx: 2, cat: "NODE_STD", name: "Volume", units: "ft³/m³", desc: "Water volume stored at the node. For junctions: V = depth × MIN_SURFAREA (simplified). For storage nodes: V = ∫A(d)·dd integrated from storage curve. Volume change per step drives continuity.", impl: "node.c → node_setVolume(). Storage volume from node_getVolume() using trapezoidal integration of the area-depth relationship." },
  { e: "NODE_LATFLOW", idx: 3, cat: "NODE_STD", name: "Lateral Inflow", units: "CFS/CMS", desc: "Total external inflow at this node from ALL sources: subcatchment runoff, DWF, RDII, groundwater, and user-defined external inflows. Does NOT include flow from upstream links.", impl: "node.c. Accumulated from routing.c: Node[j].newLatFlow = runoff + DWF + RDII + GW + external." },
  { e: "NODE_INFLOW", idx: 4, cat: "NODE_STD", name: "Total Inflow", units: "CFS/CMS", desc: "Total inflow = lateral inflow + sum of all upstream link outflows. This is the full right-hand side of the node continuity equation: dV/dt = TotalInflow - TotalOutflow.", impl: "node.c. Sum of lateral inflow + all incoming link flows." },
  { e: "NODE_OVERFLOW", idx: 5, cat: "NODE_STD", name: "Overflow / Flooding", units: "CFS/CMS", desc: "Flow rate leaving the system as flooding when depth exceeds MaxDepth. Lost from simulation unless ALLOW_PONDING is YES. This volume contributes to the routing continuity error if not tracked.", impl: "node.c → node_getFlood(). Flooding = max(0, (Volume_new - Volume_max) / Δt)." },

  // ═══════════════════════════════════════════════
  // NODE SOLVER INTERNALS (RED Extensions)
  // ═══════════════════════════════════════════════
  { e: "NODE_AREA", idx: 6, cat: "NODE_SOLVER", name: "Surface Area", units: "ft²/m²", desc: "Current water surface area at this node. For junctions: MIN_SURFAREA (constant). For storage: A = f(depth) from curve/functional. This is the denominator in dH/dt = ΔQ / A — a small area means depth changes rapidly.", impl: "node.c → node_getSurfArea(). Interpolated from storage curve at current depth. Critical for stability — very small areas amplify depth oscillations." },
  { e: "NODE_TS", idx: 7, cat: "NODE_SOLVER", name: "Timestep (actual)", units: "sec", desc: "Actual routing timestep used at this reporting interval. With VARIABLE_STEP > 0, this may be smaller than ROUTING_STEP due to Courant condition enforcement.", impl: "routing.c. Δt = VARIABLE_STEP × min(Δx/(|V|+c)) across all links, capped at ROUTING_STEP." },
  { e: "NODE_CE", idx: 14, cat: "NODE_SOLVER", name: "Continuity Error", units: "—", desc: "Per-node continuity error at each timestep. Measures the imbalance between inflow, outflow, and storage change at this specific node. Non-zero values indicate the solver didn't fully converge here.", impl: "dynwave.c. CE = (ΣQ_in - ΣQ_out - dV/dt) / max(ΣQ_in, ΣQ_out). Computed after final iteration." },
  { e: "NODE_DQDH", idx: 15, cat: "NODE_SOLVER", name: "dQ/dH (Jacobian)", units: "CFS·ft⁻¹", desc: "Derivative of total link flow with respect to head at this node. This is the KEY Jacobian term in the Newton-Raphson iteration. Larger dQ/dH → faster convergence. Near-zero → stiff system, poor convergence.", impl: "dynwave.c → evalNodeEquation(). dQ/dH = Σ(∂Q_link/∂H_node) for all connected links. Used to compute ΔH = F / dQ/dH." },
  { e: "NODE_DENOM", idx: 16, cat: "NODE_SOLVER", name: "NR Denominator", units: "—", desc: "The full denominator in the Newton-Raphson head update: denom = dQ/dH + A/Δt. The A/Δt term stabilizes convergence — larger surface area and smaller timestep both help.", impl: "dynwave.c. denom = dqdh + surfArea / dt. ΔH = F(H) / denom. If denom → 0, solver fails." },
  { e: "NODE_F", idx: 17, cat: "NODE_SOLVER", name: "F(H) Residual", units: "CFS/CMS", desc: "The function value (residual) in Newton-Raphson: F(H) = ΣQ_in - ΣQ_out - (V_new - V_old)/Δt. When F(H) = 0, continuity is satisfied. The solver iterates to make F(H) → 0.", impl: "dynwave.c → evalNodeEquation(). F = latInflow + sum(linkFlows) - (newVolume - oldVolume)/dt." },
  { e: "NODE_YCROWN", idx: 18, cat: "NODE_SOLVER", name: "Crown Elevation (Y)", units: "ft/m", desc: "Highest connecting pipe crown elevation at this node. When head exceeds this, the node is surcharged. Used by inertial damping to determine σ factor.", impl: "node.c. YCrown = max(invert + offset + pipe_height) across all connected links." },
  { e: "NODE_OLDAREA", idx: 19, cat: "NODE_SOLVER", name: "Previous Area", units: "ft²/m²", desc: "Surface area from the previous timestep. Used for the trapezoidal integration of volume: V_new = V_old + (A_old + A_new)/2 × ΔH.", impl: "node.c. Stored at end of each step for use in next step's volume computation." },
  { e: "NODE_CORRECTION", idx: 20, cat: "NODE_SOLVER", name: "Head Correction (ΔH)", units: "ft/m", desc: "The Newton-Raphson correction applied to head: ΔH = -F(H) / denom. This is the actual head change at each iteration. Convergence check: max|ΔH| < HEAD_TOLERANCE.", impl: "dynwave.c. correction = -f / denom. newHead = oldHead + correction. Track max correction across all nodes." },
  { e: "NODE_ITERATIONS", idx: 21, cat: "NODE_SOLVER", name: "Iteration Count", units: "count", desc: "Number of Newton-Raphson iterations completed at this timestep. If = MAX_TRIALS, the solver did NOT converge. Typical: 2-4 for well-behaved systems, 8+ for difficult.", impl: "dynwave.c. Incremented per iteration in the NR loop. Stored for QA output." },
  { e: "NODE_TIMESTEP", idx: 22, cat: "NODE_SOLVER", name: "Timestep Used", units: "sec", desc: "Actual computational timestep at this node (same as NODE_TS but stored per-node for debugging).", impl: "routing.c. Same for all nodes within a routing step." },
  { e: "NODE_CONVERGENCE", idx: 23, cat: "NODE_SOLVER", name: "Convergence Flag", units: "0/1", desc: "Whether the node converged (1) or not (0) at this timestep. 0 means the solver exhausted MAX_TRIALS without satisfying |ΔH| < HEAD_TOLERANCE.", impl: "dynwave.c. Set to 1 if all iterations yielded |correction| < HEAD_TOLERANCE." },
  { e: "NODE_Infil", idx: 24, cat: "NODE_SOLVER", name: "Node Infiltration", units: "CFS/CMS", desc: "Seepage/exfiltration loss from a storage node through its bottom. Computed using Green-Ampt parameters (Psi, Ksat, IMD) defined in the storage node.", impl: "node.c → node_getInfil(). Only applies to storage nodes with Ksat > 0." },
  { e: "NODE_Evap", idx: 25, cat: "NODE_SOLVER", name: "Node Evaporation", units: "CFS/CMS", desc: "Evaporation loss from storage node water surface. Rate = Fevap × PET × SurfaceArea.", impl: "node.c → node_getEvap(). Fevap set in [STORAGE] section." },
  { e: "NODE_DEGREE", idx: 26, cat: "NODE_SOLVER", name: "Node Degree", units: "count", desc: "Number of links connected to this node (graph degree). High-degree nodes are where the Jacobian matrix is densest and convergence may be slowest.", impl: "node.c. Count of links where fromNode or toNode = this node." },
  { e: "NODE_OLDAREABYDT", idx: 27, cat: "NODE_SOLVER", name: "OldArea / Δt", units: "ft²/s", desc: "Previous timestep surface area divided by timestep. This precomputed term appears in the NR denominator and volume update. Measures how responsive the node is to head changes.", impl: "dynwave.c. oldArea / dt. Large values = node resists depth change = more stable." },

  // NODE RDII / DWF
  { e: "NODE_IIFLOW", idx: 8, cat: "NODE_RDII", name: "RDII Total Flow", units: "CFS/CMS", desc: "Total RDII (Rainfall-Derived Infiltration/Inflow) entering this node = sum of all three RTK unit hydrograph triangles convolved with rainfall.", impl: "rdii.c → rdii_getInflow(). Sum of UH1 + UH2 + UH3 contributions." },
  { e: "NODE_UH1", idx: 9, cat: "NODE_RDII", name: "RDII from UH1 (Short)", units: "CFS/CMS", desc: "RDII flow from Triangle 1 — the FAST response representing direct inflow through defects (cracked pipes, bad joints). Parameters: R1, T1 (1-6 hrs), K1. This is the \"first flush\" of I/I.", impl: "rdii.c. Convolution of R1 × rainfall with triangular UH(T1, K1). Peak = 2R1·V/(T1·(1+K1))." },
  { e: "NODE_UH2", idx: 10, cat: "NODE_RDII", name: "RDII from UH2 (Medium)", units: "CFS/CMS", desc: "RDII flow from Triangle 2 — the MEDIUM response representing shallow soil infiltration through service laterals. Parameters: R2, T2 (4-24 hrs), K2.", impl: "rdii.c. Same convolution with T2 parameters. Peaks later than UH1." },
  { e: "NODE_UH3", idx: 11, cat: "NODE_RDII", name: "RDII from UH3 (Long)", units: "CFS/CMS", desc: "RDII flow from Triangle 3 — the SLOW response representing deep groundwater infiltration through foundation drains and deep cracks. Parameters: R3, T3 (24-200 hrs), K3.", impl: "rdii.c. Long tail. T3 can be days. This is why RDII continues long after rain stops." },
  { e: "NODE_DWFFLOW", idx: 12, cat: "NODE_RDII", name: "DWF Inflow", units: "CFS/CMS", desc: "Dry Weather Flow contribution at this node = AvgValue × pattern1 × pattern2 × pattern3 × pattern4. The base sanitary flow that exists even without rainfall.", impl: "inflow.c → inflow_getDWF(). Patterns multiply: monthly × daily × hourly × weekend." },
  { e: "NODE_OUTFLOW", idx: 13, cat: "NODE_RDII", name: "Total Outflow", units: "CFS/CMS", desc: "Total flow leaving this node through all downstream links. At outfalls, this equals the discharge to the receiving water.", impl: "node.c. Sum of all outgoing link flows + flooding losses." },


  // ═══════════════════════════════════════════════
  // LINK STANDARD (EPA)
  // ═══════════════════════════════════════════════
  { e: "LINK_FLOW", idx: 0, cat: "LINK_STD", name: "Flow (Q)", units: "CFS/CMS", desc: "Flow rate in the conduit. Positive = FromNode→ToNode. The primary solution variable from the St. Venant momentum equation. Computed at each NR iteration from the finite-difference momentum equation.", impl: "link.c / dynwave.c → dwflow_findConduitFlow(). Q_new = (Q_old + DQ terms) / (1 + DQ denominator)." },
  { e: "LINK_DEPTH", idx: 1, cat: "LINK_STD", name: "Depth (midpoint)", units: "ft/m", desc: "Water depth at the conduit midpoint = average of upstream and downstream depths. Used to compute midpoint area, wetted perimeter, and hydraulic radius for the momentum equation.", impl: "link.c. yMid = (y1 + y2) / 2. Capped at full depth for closed conduits." },
  { e: "LINK_VELOCITY", idx: 2, cat: "LINK_STD", name: "Velocity", units: "ft·s⁻¹ / m·s⁻¹", desc: "Average cross-sectional velocity = Q / A_mid. Controls Courant number (Cr = V·Δt/Δx). High V → small timestep needed. Also drives scour (V > 15 ft/s) and deposition (V < 2 ft/s) assessments.", impl: "link.c. velocity = flow / area. If area ≈ 0, velocity set to 0." },
  { e: "LINK_VOLUME", idx: 3, cat: "LINK_STD", name: "Volume", units: "ft³/m³", desc: "Water volume stored in the conduit = A_mid × Length. Part of the routing mass balance — total system storage = ΣNode_volumes + ΣLink_volumes.", impl: "link.c. volume = aMid * length. Updated after flow computation." },
  { e: "LINK_CAPACITY", idx: 4, cat: "LINK_STD", name: "Capacity (d/D)", units: "ratio", desc: "Ratio of current flow area to full-pipe area = A_mid / A_full. Equivalent to depth/diameter for circular pipes. Values > 1.0 indicate surcharging with Preissmann slot active.", impl: "link.c. capacity = aMid / aFull. Design target < 0.80." },

  // ═══════════════════════════════════════════════
  // LINK MOMENTUM EQUATION TERMS (THE INNER WORKINGS)
  // ═══════════════════════════════════════════════
  { e: "LINK_FROUDE", idx: 5, cat: "LINK_MOMENTUM", name: "Froude Number", units: "—", desc: "Fr = V / √(g·A/T) where T = top width. Fr < 1 = subcritical (downstream-controlled), Fr > 1 = supercritical (upstream-controlled). At Fr = 1, critical flow — the transition point where NORMAL_FLOW_LIMITED kicks in.", impl: "dynwave.c. Fr = |velocity| / sqrt(GRAVITY * aMid / wMid). Used for flow limiting and classification." },
  { e: "LINK_F1", idx: 6, cat: "LINK_MOMENTUM", name: "F1 (US Area Function)", units: "ft²/m²", desc: "Upstream cross-section area function used in the finite-difference momentum equation. F1 = A(y1) where y1 = depth at upstream node. Weighted by the COMPATIBILITY setting (SWMM3/4/5 weighting).", impl: "dynwave.c. F1 from xsect_getAofY(y1). For SWMM5 compat: uses upstream depth at link end." },
  { e: "LINK_F2", idx: 7, cat: "LINK_MOMENTUM", name: "F2 (DS Area Function)", units: "ft²/m²", desc: "Downstream cross-section area function. F2 = A(y2) where y2 = depth at downstream node. The difference (F2-F1) contributes to the pressure gradient term.", impl: "dynwave.c. F2 from xsect_getAofY(y2). Downstream depth at link end." },
  { e: "LINK_V1", idx: 8, cat: "LINK_MOMENTUM", name: "V1 (US Velocity)", units: "ft·s⁻¹", desc: "Velocity at the upstream end = Q / A1. Used for velocity head calculation and the convective acceleration term ∂(βQ²/A)/∂x in the momentum equation.", impl: "dynwave.c. v1 = flow / a1 if a1 > 0." },
  { e: "LINK_V2", idx: 9, cat: "LINK_MOMENTUM", name: "V2 (DS Velocity)", units: "ft·s⁻¹", desc: "Velocity at the downstream end = Q / A2. The velocity difference V2-V1 drives convective acceleration. Large differences indicate rapidly varying flow (hydraulic jump zones).", impl: "dynwave.c. v2 = flow / a2 if a2 > 0." },
  { e: "LINK_DQ1", idx: 10, cat: "LINK_MOMENTUM", name: "DQ1: Inertia Term", units: "CFS/CMS", desc: "ΔQ₁ = σ·Q_old — the inertial (temporal acceleration) term. σ is the inertial damping factor: σ=1 for free surface, σ→0 during surcharge. When INERTIAL_DAMPING=FULL, σ=0 always (diffusion wave). This term represents the tendency of flow to maintain its current state.", impl: "dynwave.c. dq1 = sigma * qOld. sigma from getInertialDamping(). The EXTRAN heritage." },
  { e: "LINK_DQ2", idx: 11, cat: "LINK_MOMENTUM", name: "DQ2: Gravity/Pressure", units: "CFS/CMS", desc: "ΔQ₂ = σ·Δt·g·Ā·(H₁-H₂)/L — the PRESSURE GRADIENT term. This is the primary driving force: head difference between upstream (H1) and downstream (H2) nodes divided by pipe length. Multiplied by gravity, average area, and the inertial damping factor.", impl: "dynwave.c. dq2 = sigma * dt * GRAVITY * aMid * (h1 - h2) / length. The engine of flow." },
  { e: "LINK_DQ3", idx: 12, cat: "LINK_MOMENTUM", name: "DQ3: Friction Term", units: "CFS/CMS", desc: "ΔQ₃ = Δt·g·Ā·Sf — the FRICTION LOSS term from Manning's equation. Sf = (n·|Q|/(κ·A·R^⅔))² × sign(Q). Always opposes flow direction. This is where Manning's n roughness coefficient has its effect.", impl: "dynwave.c. dq3 = dt * GRAVITY * aMid * sf. sf from link_getFrictionSlope(). κ=1.49 US, 1.0 SI." },
  { e: "LINK_DQ4", idx: 13, cat: "LINK_MOMENTUM", name: "DQ4: Entry/Exit Loss", units: "CFS/CMS", desc: "ΔQ₄ = K·V²/(2g) contribution from entry (Kentry), exit (Kexit), and average (Kavg) loss coefficients defined in [LOSSES]. These are the minor losses at manholes, bends, and fittings.", impl: "dynwave.c. dq4 from entry/exit loss coefficients × velocity head. Only if [LOSSES] defined." },
  { e: "LINK_DQ5", idx: 14, cat: "LINK_MOMENTUM", name: "DQ5: Lateral Inflow", units: "CFS/CMS", desc: "ΔQ₅ = lateral inflow momentum contribution. When flow enters from the side (subcatchment runoff, DWF), it carries momentum that must be accounted for in the momentum equation.", impl: "dynwave.c. dq5 from lateral inflow momentum. Often small relative to DQ2 and DQ3." },
  { e: "LINK_DQ6", idx: 15, cat: "LINK_MOMENTUM", name: "DQ6: Convective Accel", units: "CFS/CMS", desc: "ΔQ₆ = σ·∂(βQ²/A)/∂x — the CONVECTIVE ACCELERATION term. Represents the spatial change in momentum flux. Important at transitions (expansions, contractions) and near hydraulic jumps. Can destabilize the solver.", impl: "dynwave.c. dq6 = sigma * (beta*Q²/A2 - beta*Q²/A1) / length. Set to 0 when INERTIAL_DAMPING = FULL." },

  // LINK MOMENTUM — Head Losses
  { e: "LINK_UPHLoss", idx: 16, cat: "LINK_MOMENTUM", name: "US Head Loss", units: "ft/m", desc: "Head loss at the upstream end from entry loss coefficient: hL = Kentry × V₁²/(2g). Reduces effective driving head.", impl: "dynwave.c. upHLoss = Kentry * v1² / (2*GRAVITY)." },
  { e: "LINK_DNHLoss", idx: 17, cat: "LINK_MOMENTUM", name: "DS Head Loss", units: "ft/m", desc: "Head loss at the downstream end from exit loss coefficient: hL = Kexit × V₂²/(2g). Typically Kexit = 1.0 (sudden expansion).", impl: "dynwave.c. dnHLoss = Kexit * v2² / (2*GRAVITY)." },
  { e: "LINK_MIDHLoss", idx: 18, cat: "LINK_MOMENTUM", name: "Friction Head Loss", units: "ft/m", desc: "Total friction head loss along the conduit: hf = Sf × Length. From Manning: Sf = (nQ/(κAR^⅔))². This is the dominant loss term in most pipes.", impl: "dynwave.c. midHLoss = frictionSlope * conduitLength." },
  { e: "LINK_DQ1HW", idx: 19, cat: "LINK_MOMENTUM", name: "H-W Friction Slope", units: "ft/ft", desc: "Hazen-Williams friction slope for force mains: Sf = (V/(1.318·C·R^0.63))^(1/0.54). Only active when conduit is surcharged AND FORCE_MAIN_EQUATION = H-W.", impl: "forcemain.c. Computed from Hazen-Williams equation when pipe is pressurized." },

  // ═══════════════════════════════════════════════
  // LINK GEOMETRY (Upstream / Downstream)
  // ═══════════════════════════════════════════════
  { e: "LINK_AMID", idx: 20, cat: "LINK_GEOMETRY", name: "A_mid (Midpoint Area)", units: "ft²/m²", desc: "Cross-sectional flow area at the pipe midpoint = (A1+A2)/2. This is the area used in Manning's equation, the friction slope, and most momentum terms. The weighted average depends on COMPATIBILITY setting.", impl: "dynwave.c. aMid from SWMM5 weighting: 0.5*(a1+a2). SWMM3 weighting differs." },
  { e: "LINK_AWTD", idx: 21, cat: "LINK_GEOMETRY", name: "A_weighted", units: "ft²/m²", desc: "Length-weighted average area used for specific internal calculations. Accounts for non-uniform depth variation along the conduit.", impl: "dynwave.c. Weighted area computation, depends on depth profile." },
  { e: "LINK_A1", idx: 22, cat: "LINK_GEOMETRY", name: "A₁ (US Area)", units: "ft²/m²", desc: "Flow area at upstream end = A(y1) from cross-section geometry. A1 = xsect_getAofY(y1, xsect). Depends on shape (circular, rectangular, irregular, etc.).", impl: "xsect.c → xsect_getAofY(). 23+ shape types supported." },
  { e: "LINK_A2", idx: 23, cat: "LINK_GEOMETRY", name: "A₂ (DS Area)", units: "ft²/m²", desc: "Flow area at downstream end = A(y2). The difference A2-A1 drives the convective acceleration term DQ6. Large differences indicate flow expansion or contraction.", impl: "xsect.c → xsect_getAofY(). For circular: A = D²/4 × (θ - sinθ)/2." },
  { e: "LINK_RMID", idx: 24, cat: "LINK_GEOMETRY", name: "R_mid (Hyd. Radius)", units: "ft/m", desc: "Hydraulic radius at midpoint = A_mid / P_mid where P = wetted perimeter. R appears in Manning's equation as R^(2/3). For full circular: R = D/4.", impl: "xsect.c → xsect_getRofY(). R = A/P. For irregular transects, computed from station-elevation data." },
  { e: "LINK_RWTD", idx: 25, cat: "LINK_GEOMETRY", name: "R_weighted", units: "ft/m", desc: "Weighted hydraulic radius for internal friction calculations.", impl: "dynwave.c. Weighted R computation." },
  { e: "LINK_R1", idx: 26, cat: "LINK_GEOMETRY", name: "R₁ (US Hyd. Radius)", units: "ft/m", desc: "Hydraulic radius at upstream end = A1/P1.", impl: "xsect.c → xsect_getRofA(A1)." },
  { e: "LINK_R2", idx: 27, cat: "LINK_GEOMETRY", name: "R₂ (DS Hyd. Radius)", units: "ft/m", desc: "Hydraulic radius at downstream end = A2/P2.", impl: "xsect.c → xsect_getRofA(A2)." },
  { e: "LINK_W1", idx: 28, cat: "LINK_GEOMETRY", name: "W₁ (US Top Width)", units: "ft/m", desc: "Top width of flow at upstream end. W = dA/dy. For circular: W = D·sin(θ/2). Top width is needed for Froude number and wave celerity c = √(gA/W).", impl: "xsect.c → xsect_getWofY(y1)." },
  { e: "LINK_W2", idx: 29, cat: "LINK_GEOMETRY", name: "W₂ (DS Top Width)", units: "ft/m", desc: "Top width at downstream end. Width approaching zero (near-empty pipe) can cause instability.", impl: "xsect.c → xsect_getWofY(y2)." },
  { e: "LINK_Y1", idx: 30, cat: "LINK_GEOMETRY", name: "Y₁ (US Depth)", units: "ft/m", desc: "Water depth at upstream end of conduit = Node[fromNode].head - link_invert_upstream. This is the driving depth that determines upstream area, velocity, and Froude number.", impl: "dynwave.c. y1 = h1 - (Node[n1].invertElev + Link[j].offset1)." },
  { e: "LINK_Y2", idx: 31, cat: "LINK_GEOMETRY", name: "Y₂ (DS Depth)", units: "ft/m", desc: "Water depth at downstream end = Node[toNode].head - link_invert_downstream. The Y1/Y2 profile determines whether flow is accelerating or decelerating.", impl: "dynwave.c. y2 = h2 - (Node[n2].invertElev + Link[j].offset2)." },

  // LINK MOMENTUM continued
  { e: "LINK_QNORM", idx: 32, cat: "LINK_MOMENTUM", name: "Q_normal", units: "CFS/CMS", desc: "Normal flow capacity from Manning: Qn = (κ/n)·A·R^(2/3)·S₀^(1/2) where S₀ = pipe bed slope. Flow is limited to this when NORMAL_FLOW_LIMITED triggers (steep pipe draining freely).", impl: "dynwave.c → link_getQnorm(). Computed from bed slope, full area, and Manning's n." },
  { e: "LINK_VENANT", idx: 33, cat: "LINK_MOMENTUM", name: "St. Venant Balance", units: "—", desc: "The overall St. Venant equation residual: how well the final Q satisfies the momentum equation. A dimensionless check on the quality of the solution at this link.", impl: "dynwave.c. Balance = (Q_new - Q_old)/Δt + g·A·(∂H/∂x + Sf). Should → 0." },
  { e: "LINK_DQDH", idx: 34, cat: "LINK_MOMENTUM", name: "Link dQ/dH", units: "CFS/ft", desc: "Derivative of link flow with respect to head — the link's contribution to the node Jacobian. Larger values mean flow is more sensitive to head changes. Feeds into NODE_DQDH.", impl: "dynwave.c. dqdh = ∂Q/∂H computed analytically from momentum equation linearization." },

  // ═══════════════════════════════════════════════
  // LINK ENERGY / BERNOULLI
  // ═══════════════════════════════════════════════
  { e: "LINK_HGL", idx: 40, cat: "LINK_ENERGY", name: "HGL (midpoint)", units: "ft/m", desc: "Hydraulic Grade Line at pipe midpoint = average of upstream and downstream heads. HGL = (H1+H2)/2. The HGL profile shows pressure head along the pipe.", impl: "link.c. hgl = (h1 + h2) / 2." },
  { e: "LINK_H1", idx: 43, cat: "LINK_ENERGY", name: "H₁ (US Head)", units: "ft/m", desc: "Upstream node hydraulic head = upstream invert + depth at upstream end. The driving head in the pressure gradient term DQ2.", impl: "dynwave.c. h1 = Node[n1].newHead." },
  { e: "LINK_H2", idx: 44, cat: "LINK_ENERGY", name: "H₂ (DS Head)", units: "ft/m", desc: "Downstream node hydraulic head. H1-H2 > 0 = flow in positive direction. H1-H2 < 0 = reverse flow (backwater).", impl: "dynwave.c. h2 = Node[n2].newHead." },
  { e: "LINK_VHUP", idx: 57, cat: "LINK_ENERGY", name: "VH_up (US Vel. Head)", units: "ft/m", desc: "Velocity head at upstream end = V₁²/(2g). Part of the Energy Grade Line: EGL = HGL + V²/(2g). Large velocity heads indicate high-energy flow.", impl: "Custom RED. vhUp = v1*v1 / (2.0 * GRAVITY)." },
  { e: "LINK_VHMID", idx: 58, cat: "LINK_ENERGY", name: "VH_mid (Vel. Head)", units: "ft/m", desc: "Velocity head at midpoint = V_mid²/(2g). The kinetic energy component at the representative section.", impl: "Custom RED. vhMid = vMid*vMid / (2.0 * GRAVITY)." },
  { e: "LINK_VHDN", idx: 59, cat: "LINK_ENERGY", name: "VH_dn (DS Vel. Head)", units: "ft/m", desc: "Velocity head at downstream end = V₂²/(2g).", impl: "Custom RED. vhDn = v2*v2 / (2.0 * GRAVITY)." },
  { e: "LINK_VHHF", idx: 60, cat: "LINK_ENERGY", name: "Friction Loss (hf)", units: "ft/m", desc: "Total friction head loss = Sf × Length. The energy dissipated by pipe wall friction. hf = (nQ/(κAR^⅔))² × L. For the Bernoulli equation check: H1 + V1²/2g = H2 + V2²/2g + hf + hL.", impl: "Custom RED. vhHf = frictionSlope * length." },
  { e: "LINK_BE_LHS", idx: 61, cat: "LINK_ENERGY", name: "Bernoulli LHS", units: "ft/m", desc: "Left-hand side of Bernoulli equation at upstream node: LHS = H₁ + V₁²/(2g) + Kentry·V₁²/(2g). Total energy head at the upstream end including velocity head and entry loss.", impl: "Custom RED. BE_LHS = h1 + vhUp + upHLoss. The total energy available." },
  { e: "LINK_BE_RHS", idx: 62, cat: "LINK_ENERGY", name: "Bernoulli RHS", units: "ft/m", desc: "Right-hand side of Bernoulli equation at downstream node: RHS = H₂ + V₂²/(2g) + Kexit·V₂²/(2g) + hf. Should equal LHS if energy is conserved. Difference = energy balance error.", impl: "Custom RED. BE_RHS = h2 + vhDn + dnHLoss + vhHf. LHS - RHS ≈ 0 if balanced." },
  { e: "LINK_RHO", idx: 63, cat: "LINK_ENERGY", name: "ρ (Density Factor)", units: "—", desc: "Density-related factor used in momentum calculations for variable-density flow or submerged discharge calculations.", impl: "Custom RED. Context-dependent weighting factor." },
  { e: "LINK_SIGMA", idx: 64, cat: "LINK_ENERGY", name: "σ (Inertial Damping)", units: "0–1", desc: "The inertial damping factor applied to this link. σ = 1 for free-surface flow (full inertia). σ → 0 as depth exceeds crown (inertia removed). This is how SWMM transitions from open channel to pressure flow.", impl: "dynwave.c → getInertialDamping(). σ = 1 when d < crown, decreases linearly to 0 as d exceeds crown." },

  // LINK PROPERTIES
  { e: "LINK_UP_N_AREA", idx: 35, cat: "LINK_PROPS", name: "US Normal Area", units: "ft²/m²", desc: "Normal flow area at upstream end — the area corresponding to normal depth at the bed slope.", impl: "dynwave.c. From normal depth calculation." },
  { e: "LINK_DN_N_AREA", idx: 36, cat: "LINK_PROPS", name: "DS Normal Area", units: "ft²/m²", desc: "Normal flow area at downstream end.", impl: "dynwave.c." },
  { e: "LINK_TS", idx: 37, cat: "LINK_PROPS", name: "Timestep", units: "sec", desc: "Actual routing timestep used for this link computation.", impl: "routing.c." },
  { e: "LINK_ITERATIONS", idx: 38, cat: "LINK_PROPS", name: "Iterations", units: "count", desc: "Number of solver iterations at this timestep (same as system-wide, stored per-link for debugging).", impl: "dynwave.c." },
  { e: "LINK_TIMESTEP", idx: 39, cat: "LINK_PROPS", name: "Timestep (link)", units: "sec", desc: "Link-level timestep storage.", impl: "routing.c." },
  { e: "LINK_AKON", idx: 41, cat: "LINK_PROPS", name: "AKON Factor", units: "—", desc: "Konduktivität (conductance) factor = (κ/n)·A·R^(2/3). The Manning conveyance. Larger AKON = pipe can carry more flow per unit slope.", impl: "dynwave.c. akon = PHI / roughness * aMid * pow(rMid, 2.0/3.0). PHI = 1.49 or 1.0." },
  { e: "LINK_FASNH", idx: 42, cat: "LINK_PROPS", name: "FASNH Factor", units: "—", desc: "Flow-area-slope-n-hydraulic radius compound factor used in internal friction calculations.", impl: "dynwave.c. Compound Manning conveyance factor." },
  { e: "LINK_length", idx: 45, cat: "LINK_PROPS", name: "Length (actual)", units: "ft/m", desc: "Original conduit length from [CONDUITS] before any lengthening.", impl: "link.c. Link[j].newLength if lengthened, else Link[j].length." },
  { e: "LINK_modLength", idx: 46, cat: "LINK_PROPS", name: "Modified Length", units: "ft/m", desc: "Effective length after LENGTHENING_STEP adjustment. L_eff = max(L, Δt × V_max). Short pipes are stretched to satisfy Courant.", impl: "link.c. modLength from conduit_lengthening(). Roughness adjusted: n_eff = n × √(L_eff/L)." },
  { e: "LINK_roughness", idx: 47, cat: "LINK_PROPS", name: "Roughness (n)", units: "—", desc: "Manning's n roughness coefficient (or H-W C / D-W ε for force mains). The actual value used in friction calculations.", impl: "link.c. Link[j].roughness from [CONDUITS]." },
  { e: "LINK_roughFactor", idx: 48, cat: "LINK_PROPS", name: "Roughness Factor", units: "—", desc: "Adjustment factor applied to roughness if conduit was lengthened: factor = √(L_modified / L_original). Preserves friction loss when length is artificially increased.", impl: "link.c. roughFactor = sqrt(modLength / length). n_effective = n * roughFactor." },
  { e: "LINK_slope", idx: 49, cat: "LINK_PROPS", name: "Bed Slope", units: "ft/ft", desc: "Pipe bed slope = (US_invert - DS_invert) / Length. Positive = downhill. Negative = adverse. Used for normal flow and Froude calculations.", impl: "link.c. slope = (invertUp - invertDn) / conduitLength." },
  { e: "LINK_qMax", idx: 50, cat: "LINK_PROPS", name: "Q_max (Full Capacity)", units: "CFS/CMS", desc: "Full-pipe Manning flow capacity: Qmax = (κ/n) × A_full × R_full^(2/3) × S₀^(1/2). The theoretical maximum gravity flow.", impl: "link.c → conduit_getFullFlow(). Computed once at initialization." },
  { e: "LINK_beta", idx: 51, cat: "LINK_PROPS", name: "β (Momentum Coeff)", units: "—", desc: "Momentum correction factor (Boussinesq coefficient). Usually ≈ 1.0 for turbulent flow. Accounts for non-uniform velocity distribution across the cross-section.", impl: "dynwave.c. beta typically = 1.0." },
  { e: "LINK_SETTING", idx: 52, cat: "LINK_PROPS", name: "Setting", units: "0–1", desc: "Current operational setting from control rules. Pumps: 0=OFF/1=ON (or speed). Orifices: 0=closed/1=open. Weirs: 0=closed/1=open. Conduits: always 1.", impl: "controls.c → link_setSetting(). Updated by RULE evaluation at RULE_STEP." },
  { e: "LINK_TARGET", idx: 53, cat: "LINK_PROPS", name: "Target Setting", units: "0–1", desc: "Target setting from control rules (may differ from current if CloseTime > 0). Setting moves toward target at rate determined by CloseTime.", impl: "controls.c. Target from rule evaluation. Rate = 1/CloseTime." },
  { e: "LINK_TIMEOPEN", idx: 54, cat: "LINK_PROPS", name: "Time Open", units: "sec", desc: "Duration the link has been in its current open/on state. Used for pump cycling tracking.", impl: "link.c. Accumulated when setting > 0." },
  { e: "LINK_CURRENTDATE", idx: 55, cat: "LINK_PROPS", name: "Current Date", units: "Julian", desc: "Current simulation date/time as a Julian date number. Stored per-link for time-dependent QA output.", impl: "datetime.c. Current simulation clock." },

  // LINK SWMM3/4/5 COMPATIBILITY
  { e: "LINK_SWMM3", idx: 56, cat: "LINK_COMPAT", name: "Area (SWMM3 weight)", units: "ft²/m²", desc: "Cross-sectional area using SWMM3 weighting: area based on average of upstream and downstream depths with SWMM3's specific averaging convention (upstream-biased).", impl: "dynwave.c. SWMM3 compatibility mode. Historic area weighting from EXTRAN block." },
  { e: "LINK_SWMM4", idx: 56, cat: "LINK_COMPAT", name: "Area (SWMM4 weight)", units: "ft²/m²", desc: "Area using SWMM4 weighting convention. Intermediate between SWMM3 and SWMM5 approaches.", impl: "dynwave.c. SWMM4 compatibility." },
  { e: "LINK_SWMM5", idx: 56, cat: "LINK_COMPAT", name: "Area (SWMM5 weight)", units: "ft²/m²", desc: "Area using SWMM5 default weighting = simple average of upstream and downstream areas. Most physically correct.", impl: "dynwave.c. Default: aMid = (a1+a2)/2." },


  // ═══════════════════════════════════════════════
  // SUBCATCHMENT STANDARD
  // ═══════════════════════════════════════════════
  { e: "SUBCATCH_RAINFALL", idx: 0, cat: "SUB_STD", name: "Rainfall Intensity", units: "in·hr⁻¹/mm·hr⁻¹", desc: "Current rainfall intensity on this subcatchment from its assigned rain gage.", impl: "subcatch.c. From rainTable interpolation at current time." },
  { e: "SUBCATCH_SNOWDEPTH", idx: 1, cat: "SUB_STD", name: "Snow Depth", units: "in/mm", desc: "Current snowpack depth. Zero if [SNOWPACKS] not defined or IGNORE_SNOWMELT = YES.", impl: "snow.c → snow_getSnowDepth()." },
  { e: "SUBCATCH_EVAP", idx: 2, cat: "SUB_STD", name: "Evaporation Loss", units: "in·hr⁻¹/mm·hr⁻¹", desc: "Current evaporation rate from subcatchment surface. Zero during rainfall if DRY_ONLY = YES.", impl: "subcatch.c → subcatch_getEvap()." },
  { e: "SUBCATCH_INFIL", idx: 3, cat: "SUB_STD", name: "Infiltration Loss", units: "in·hr⁻¹/mm·hr⁻¹", desc: "Current infiltration rate on pervious area. Model-dependent: Horton f(t), Green-Ampt f(F), or Curve Number.", impl: "infil.c → infil_getInfil(). Reduced by available rainfall and surface storage." },
  { e: "SUBCATCH_RUNOFF", idx: 4, cat: "SUB_STD", name: "Total Runoff", units: "CFS/CMS", desc: "Total runoff = impervious runoff + pervious runoff. From nonlinear reservoir: q = (1/n)·W·(d-dp)^(5/3)·S^(1/2).", impl: "subcatch.c → subcatch_getRunoff(). Sum of IMPERV0 + IMPERV1 + PERV contributions." },
  { e: "SUBCATCH_GW_FLOW", idx: 5, cat: "SUB_STD", name: "GW Flow to Node", units: "CFS/CMS", desc: "Lateral groundwater flow entering the conveyance node.", impl: "gwater.c → gw_getFlow()." },
  { e: "SUBCATCH_GW_ELEV", idx: 6, cat: "SUB_STD", name: "GW Table Elevation", units: "ft/m", desc: "Current elevation of the saturated groundwater table.", impl: "gwater.c." },
  { e: "SUBCATCH_SOIL_MOIST", idx: 7, cat: "SUB_STD", name: "Soil Moisture", units: "fraction", desc: "Upper zone moisture content as fraction of porosity. Drives infiltration capacity.", impl: "gwater.c. Range: wilting point to porosity." },

  // SUBCATCHMENT RUNOFF DETAIL
  { e: "SUBCATCH_RUNOFF_IMPERV0", idx: 8, cat: "SUB_RUNOFF", name: "Runoff: Imperv (no DS)", units: "CFS/CMS", desc: "Runoff from impervious area WITH ZERO depression storage (IMPERV0). This is the directly-connected impervious — instant runoff from roads/parking that have no surface storage.", impl: "subcatch.c. IMPERV0 flow. PctZero controls the fraction of impervious area with DS=0." },
  { e: "SUBCATCH_RUNOFF_IMPERV1", idx: 9, cat: "SUB_RUNOFF", name: "Runoff: Imperv (with DS)", units: "CFS/CMS", desc: "Runoff from impervious area WITH depression storage (IMPERV1). Must fill S-Imperv depth before runoff begins.", impl: "subcatch.c. IMPERV1 flow. Delayed by depression storage filling." },
  { e: "SUBCATCH_RUNOFF_PERV", idx: 10, cat: "SUB_RUNOFF", name: "Runoff: Pervious", units: "CFS/CMS", desc: "Runoff from pervious area only. Much smaller than impervious runoff in most urban catchments. Only occurs when rainfall > infiltration + depression storage.", impl: "subcatch.c. PERV flow. Depends heavily on infiltration model." },
  { e: "SUBCATCH_DEPTH_IMPERV0", idx: 11, cat: "SUB_RUNOFF", name: "Depth: Imperv (no DS)", units: "ft/m", desc: "Surface water depth on IMPERV0 sub-area. This area has zero depression storage so any depth immediately generates runoff.", impl: "subcatch.c. d_imperv0." },
  { e: "SUBCATCH_DEPTH_IMPERV1", idx: 12, cat: "SUB_RUNOFF", name: "Depth: Imperv (with DS)", units: "ft/m", desc: "Surface depth on IMPERV1. Runoff begins when depth > S-Imperv.", impl: "subcatch.c. d_imperv1." },
  { e: "SUBCATCH_DEPTH_PERV", idx: 13, cat: "SUB_RUNOFF", name: "Depth: Pervious", units: "ft/m", desc: "Surface depth on pervious sub-area. Runoff begins when depth > S-Perv.", impl: "subcatch.c. d_perv." },
  { e: "SUBCATCH_DEPTH", idx: 14, cat: "SUB_RUNOFF", name: "Avg Surface Depth", units: "ft/m", desc: "Area-weighted average surface water depth across all sub-areas.", impl: "subcatch.c. Weighted: (%Imperv × d_imp + %Perv × d_perv) / 100." },
  { e: "SUBCATCH_RUNON", idx: 15, cat: "SUB_RUNOFF", name: "Runon (from outfall)", units: "CFS/CMS", desc: "Runon flow received from outfall RouteTo setting — water re-entering this subcatchment from downstream.", impl: "subcatch.c. From outfall cascade routing." },
  { e: "SUBCATCH_AREA", idx: 16, cat: "SUB_RUNOFF", name: "Total Area", units: "acres/ha", desc: "Total subcatchment area.", impl: "subcatch.c. Subcatch[j].area." },
  { e: "SUBCATCH_IMP_AREA_DS", idx: 17, cat: "SUB_RUNOFF", name: "Imperv Area (with DS)", units: "acres/ha", desc: "Impervious area that has depression storage (IMPERV1 fraction).", impl: "subcatch.c." },
  { e: "SUBCATCH_IMP_AREA_NoDS", idx: 18, cat: "SUB_RUNOFF", name: "Imperv Area (no DS)", units: "acres/ha", desc: "Impervious area with zero depression storage (IMPERV0 fraction = PctZero).", impl: "subcatch.c." },
  { e: "SUBCATCH_PERV_AREA", idx: 19, cat: "SUB_RUNOFF", name: "Pervious Area", units: "acres/ha", desc: "Pervious portion of subcatchment area = Area × (1 - %Imperv/100).", impl: "subcatch.c." },
  { e: "SUBCATCH_nonLidArea", idx: 20, cat: "SUB_RUNOFF", name: "Non-LID Area", units: "acres/ha", desc: "Area NOT covered by LID controls. Runoff from this area goes directly to outlet node.", impl: "subcatch.c. Total area minus LID footprint." },

  // SUBCATCHMENT LID
  { e: "SUBCATCH_LID_AREA", idx: 21, cat: "SUB_LID", name: "LID Total Area", units: "ft²/m²", desc: "Total footprint area of all LID units on this subcatchment.", impl: "lid.c. Sum of all LID_USAGE areas." },
  { e: "SUBCATCH_LID_FROMIMP_AREA", idx: 22, cat: "SUB_LID", name: "LID Capture Area", units: "ft²/m²", desc: "Impervious area draining TO LID controls (FromImperv setting).", impl: "lid.c. FromImperv % × impervious area." },
  { e: "SUBCATCH_IMPtoLID", idx: 23, cat: "SUB_LID", name: "Imp → LID Flow", units: "CFS/CMS", desc: "Flow routed from impervious area to LID controls.", impl: "lid.c." },
  { e: "SUBCATCH_LIDCount", idx: 24, cat: "SUB_LID", name: "LID Unit Count", units: "count", desc: "Number of individual LID units on this subcatchment.", impl: "lid.c." },
  { e: "LID_SURF_INFLOW", idx: 25, cat: "SUB_LID", name: "LID: Surface Inflow", units: "in·hr⁻¹", desc: "Total inflow rate to the LID surface layer: direct rainfall + runon from impervious area.", impl: "lid.c → lidproc_getOutflow(). Surface layer water balance input." },
  { e: "LID_TOTAL_EVAP", idx: 26, cat: "SUB_LID", name: "LID: Evaporation", units: "in·hr⁻¹", desc: "Total evaporation from all LID layers (surface + soil + storage).", impl: "lid.c. ET from each layer summed." },
  { e: "LID_SURF_INFIL", idx: 27, cat: "SUB_LID", name: "LID: Surface Infiltration", units: "in·hr⁻¹", desc: "Infiltration from LID surface into soil/pavement layer below.", impl: "lid.c. Controlled by soil hydraulic conductivity." },
  { e: "LID_PAVE_PERC", idx: 28, cat: "SUB_LID", name: "LID: Pavement Perc", units: "in·hr⁻¹", desc: "Percolation through the pavement layer (permeable pavement LIDs only).", impl: "lid.c. Through pavement void ratio." },
  { e: "LID_SOIL_PERC", idx: 29, cat: "SUB_LID", name: "LID: Soil Percolation", units: "in·hr⁻¹", desc: "Percolation from soil layer to storage layer below.", impl: "lid.c. Green-Ampt through the soil column." },
  { e: "LID_STOR_EXFIL", idx: 30, cat: "SUB_LID", name: "LID: Storage Exfiltration", units: "in·hr⁻¹", desc: "Exfiltration from the LID storage layer into native soil. The ultimate infiltration to ground.", impl: "lid.c. Based on native soil conductivity below LID." },
  { e: "LID_SURF_OUTFLOW", idx: 31, cat: "SUB_LID", name: "LID: Surface Overflow", units: "in·hr⁻¹", desc: "Overflow from LID surface layer when depth exceeds berm height. This becomes runoff.", impl: "lid.c. Overflow = Manning equation when surface depth > berm height." },
  { e: "LID_STOR_DRAIN", idx: 32, cat: "SUB_LID", name: "LID: Underdrain Flow", units: "in·hr⁻¹", desc: "Flow through the LID underdrain pipe. Drain flow = Cd × (depth - offset)^n. Controlled by drain coefficient and exponent.", impl: "lid.c. Underdrain orifice equation." },
  { e: "LID_SURF_DEPTH", idx: 33, cat: "SUB_LID", name: "LID: Surface Depth", units: "in/mm", desc: "Current water depth on the LID surface layer.", impl: "lid.c. Surface layer state variable." },
  { e: "LID_PAVE_DEPTH", idx: 34, cat: "SUB_LID", name: "LID: Pavement Depth", units: "in/mm", desc: "Water depth stored in pavement void space.", impl: "lid.c." },
  { e: "LID_SOIL_MOIST", idx: 35, cat: "SUB_LID", name: "LID: Soil Moisture", units: "fraction", desc: "Moisture content in the LID soil layer (fraction of void space filled).", impl: "lid.c." },
  { e: "LID_STOR_DEPTH", idx: 36, cat: "SUB_LID", name: "LID: Storage Depth", units: "in/mm", desc: "Water depth in the LID gravel/storage layer.", impl: "lid.c." },

  // SUBCATCHMENT GROUNDWATER
  { e: "SUBCATCH_GW_Flow_A1", idx: 37, cat: "SUB_GW", name: "GW: A1 Term (lateral)", units: "CFS/CMS", desc: "First lateral GW flow term: A1 × (Hgw - Hcb)^B1. Hgw = GW table, Hcb = channel bottom. A1 and B1 from [GROUNDWATER].", impl: "gwater.c. Lateral flow component 1." },
  { e: "SUBCATCH_GW_Flow_A2", idx: 38, cat: "SUB_GW", name: "GW: A2 Term (deep)", units: "CFS/CMS", desc: "Deep GW loss term: A2 × (Hgw - Hbot)^B2. Hbot = aquifer bottom. Represents water lost to deep aquifer.", impl: "gwater.c. Deep percolation component." },
  { e: "SUBCATCH_GW_Flow_A3", idx: 39, cat: "SUB_GW", name: "GW: A3 Term (interaction)", units: "CFS/CMS", desc: "Surface water interaction term: A3 × Hgw × Hsw. Cross-product representing bidirectional exchange between groundwater and surface water.", impl: "gwater.c. Stream-aquifer interaction." },
  { e: "SUBCATCH_GW_Percolation", idx: 40, cat: "SUB_GW", name: "GW: Percolation Rate", units: "in·hr⁻¹", desc: "Rate of water percolating from upper unsaturated zone to lower saturated zone.", impl: "gwater.c." },
  { e: "SUBCATCH_GW_EVAPLOSS", idx: 41, cat: "SUB_GW", name: "GW: ET Loss", units: "in·hr⁻¹", desc: "Evapotranspiration loss from the groundwater zone.", impl: "gwater.c. Upper and lower ET fractions." },
  { e: "SUBCATCH_GW_HSTAR", idx: 42, cat: "SUB_GW", name: "GW: H* (threshold)", units: "ft/m", desc: "Threshold groundwater elevation. Lateral flow = 0 when GW table ≤ H*.", impl: "gwater.c." },
  { e: "SUBCATCH_GW_HSW", idx: 43, cat: "SUB_GW", name: "GW: H_sw (surface)", units: "ft/m", desc: "Surface water elevation at the receiving node. Determines direction of GW-surface exchange.", impl: "gwater.c. From Node[j].newHead." },
  { e: "SUBCATCH_GW_LOWERDEPTH", idx: 44, cat: "SUB_GW", name: "GW: Lower Zone Depth", units: "ft/m", desc: "Depth of water in the lower (saturated) groundwater zone.", impl: "gwater.c." },
  { e: "SUBCATCH_GW_TOTALDEPTH", idx: 45, cat: "SUB_GW", name: "GW: Total GW Depth", units: "ft/m", desc: "Total depth of groundwater = upper + lower zone.", impl: "gwater.c." },
  { e: "SUBCATCH_AQ_BOTTOMELEV", idx: 46, cat: "SUB_GW", name: "Aquifer Bottom Elev", units: "ft/m", desc: "Bottom elevation of the aquifer. Fixed from [AQUIFERS].", impl: "gwater.c." },
  { e: "SUBCATCH_AQ_POROSITY", idx: 47, cat: "SUB_GW", name: "Aquifer Porosity", units: "fraction", desc: "Soil porosity from [AQUIFERS]. Determines maximum moisture capacity.", impl: "gwater.c." },
  { e: "SUBCATCH_GW_MAXGWQ", idx: 48, cat: "SUB_GW", name: "GW: Max Lateral Flow", units: "CFS/CMS", desc: "Maximum lateral groundwater flow computed during simulation.", impl: "gwater.c." },
  { e: "SUBCATCH_GW_NEGMAXGWQ", idx: 49, cat: "SUB_GW", name: "GW: Max Neg. Flow", units: "CFS/CMS", desc: "Maximum reverse (negative) GW flow — water flowing FROM node INTO ground. Indicates losing stream condition.", impl: "gwater.c." },
  { e: "SUBCATCH_AQ_WATERTABLELEV", idx: 50, cat: "SUB_GW", name: "Water Table Level", units: "ft/m", desc: "Absolute elevation of the groundwater table = aquifer bottom + GW depth.", impl: "gwater.c." },
  { e: "SUBCATCH_GW_NODEFLOW", idx: 51, cat: "SUB_GW", name: "GW: Flow at Node", units: "CFS/CMS", desc: "Actual groundwater flow entering the receiving node (after any adjustments).", impl: "gwater.c." },
  { e: "SUBCATCH_GW_OLDFLOW", idx: 52, cat: "SUB_GW", name: "GW: Previous Flow", units: "CFS/CMS", desc: "Groundwater flow from the previous timestep. Used for temporal smoothing.", impl: "gwater.c." },

  // SUBCATCHMENT SNOW
  { e: "SUBCATCH_SNOWMELT", idx: 53, cat: "SUB_SNOW", name: "Snowmelt Rate", units: "in·hr⁻¹", desc: "Current snowmelt rate from degree-day or heat budget method.", impl: "snow.c → snow_getMelt()." },
  { e: "SUBCATCH_IMELT", idx: 54, cat: "SUB_SNOW", name: "Immediate Melt", units: "in·hr⁻¹", desc: "Snowmelt that immediately becomes runoff (no routing through snowpack).", impl: "snow.c." },
  { e: "SUBCATCH_RAINMELT", idx: 55, cat: "SUB_SNOW", name: "Rain-on-Snow Melt", units: "in·hr⁻¹", desc: "Additional melt caused by rainfall heat transfer to snowpack.", impl: "snow.c." },
  { e: "SUBCATCH_FREEWATER", idx: 56, cat: "SUB_SNOW", name: "Snow: Free Water", units: "in/mm", desc: "Liquid water content held within the snowpack. Released when pack is ripe.", impl: "snow.c." },
  { e: "SUBCATCH_COLD", idx: 57, cat: "SUB_SNOW", name: "Snow: Cold Content", units: "in/mm", desc: "Cold content = energy deficit that must be overcome before melt begins.", impl: "snow.c." },
  { e: "SUBCATCH_SNOWAREA", idx: 58, cat: "SUB_SNOW", name: "Snow: Coverage", units: "fraction", desc: "Fraction of subcatchment covered by snow. Decreases as snow melts unevenly.", impl: "snow.c. From areal depletion curve." },

  // SUBCATCHMENT INFILTRATION INTERNALS
  { e: "SUBCATCH_UL", idx: 59, cat: "SUB_INFIL", name: "Upper Zone Thickness", units: "ft/m", desc: "Thickness of the upper (unsaturated) soil zone for Green-Ampt.", impl: "infil.c." },
  { e: "SUBCATCH_FTOT", idx: 60, cat: "SUB_INFIL", name: "F_total (cum. infil)", units: "in/mm", desc: "Cumulative infiltration depth during the current event. F = ∫f·dt. For Modified Horton, infiltration state is tied to F, not time.", impl: "infil.c. Running sum of infiltration." },
  { e: "SUBCATCH_FU", idx: 61, cat: "SUB_INFIL", name: "F_upper", units: "in/mm", desc: "Infiltration into upper soil zone.", impl: "infil.c." },
  { e: "SUBCATCH_FUMAX", idx: 62, cat: "SUB_INFIL", name: "F_upper_max", units: "in/mm", desc: "Maximum upper zone infiltration capacity.", impl: "infil.c." },
  { e: "SUBCATCH_MOISTURE", idx: 63, cat: "SUB_INFIL", name: "Current Moisture", units: "fraction", desc: "Current soil moisture content (less than porosity). Drives infiltration rate.", impl: "infil.c." },
  { e: "SUBCATCH_IMD", idx: 64, cat: "SUB_INFIL", name: "IMD (Moisture Deficit)", units: "fraction", desc: "Initial Moisture Deficit = Porosity - Moisture. Determines available soil storage. Higher IMD = more capacity.", impl: "infil.c. IMD = porosity - theta." },
  { e: "SUBCATCH_IMDbyEvent", idx: 65, cat: "SUB_INFIL", name: "IMD at Event Start", units: "fraction", desc: "IMD captured at the beginning of each rainfall event. Used for event-based infiltration recovery.", impl: "infil.c." },
  { e: "SUBCATCH_SAT", idx: 66, cat: "SUB_INFIL", name: "Saturation Flag", units: "0/1", desc: "1 = soil is saturated (IMD ≈ 0), 0 = unsaturated. When saturated, infiltration = Ksat.", impl: "infil.c." },
  { e: "SUBCATCH_INFIL_TIME", idx: 67, cat: "SUB_INFIL", name: "GA: Infil Time", units: "hours", desc: "Green-Ampt infiltration elapsed time. Used in Horton-based decay.", impl: "infil.c." },
  { e: "SUBCATCH_WLMAX", idx: 69, cat: "SUB_INFIL", name: "Current Infil Rate", units: "in·hr⁻¹", desc: "Current computed infiltration rate. For Horton: f = fc + (f0-fc)·e^(-kt). For GA: f = Ks·(1+ψ·Δθ/F).", impl: "infil.c." },
  { e: "HORTON_TP", idx: 70, cat: "SUB_INFIL", name: "Horton: Tp", units: "hours", desc: "Horton ponding time — time at which surface ponding begins (rainfall exceeds infiltration capacity).", impl: "infil.c. Tp where f(Tp) = rainfall intensity." },
  { e: "HORTON_Fe", idx: 71, cat: "SUB_INFIL", name: "Horton: Fe (cum F)", units: "in/mm", desc: "Horton cumulative infiltration Fe = fc·t + (f0-fc)/k·(1-e^(-kt)). Integrated infiltration volume.", impl: "infil.c." },
  { e: "GA_IMD", idx: 72, cat: "SUB_INFIL", name: "GA: IMD", units: "fraction", desc: "Green-Ampt initial moisture deficit currently being used.", impl: "infil.c." },
  { e: "GA_F", idx: 73, cat: "SUB_INFIL", name: "GA: F (cum infil)", units: "in/mm", desc: "Green-Ampt cumulative infiltration depth F. The infiltration rate f = Ks·(1+ψ·Δθ/F) decreases as F increases.", impl: "infil.c. F approaches ∞, f approaches Ks." },
  { e: "GA_FU", idx: 74, cat: "SUB_INFIL", name: "GA: F_upper", units: "in/mm", desc: "Green-Ampt upper zone infiltration.", impl: "infil.c." },
  { e: "GA_Lu", idx: 75, cat: "SUB_INFIL", name: "GA: Lu (depth)", units: "in/mm", desc: "Green-Ampt wetting front depth Lu = F / Δθ. Depth the wetting front has penetrated.", impl: "infil.c." },
  { e: "GA_T", idx: 76, cat: "SUB_INFIL", name: "GA: Time", units: "hours", desc: "Green-Ampt elapsed time since infiltration began.", impl: "infil.c." },
  { e: "GA_Sat", idx: 77, cat: "SUB_INFIL", name: "GA: Saturation", units: "0/1", desc: "Green-Ampt saturation flag.", impl: "infil.c." },
  { e: "CN_S", idx: 78, cat: "SUB_INFIL", name: "CN: S (retention)", units: "in/mm", desc: "Curve Number maximum retention S = (1000/CN) - 10 (US). Total soil storage capacity.", impl: "infil.c. S controls volume of runoff." },
  { e: "CN_F", idx: 79, cat: "SUB_INFIL", name: "CN: F (cum infil)", units: "in/mm", desc: "Curve Number cumulative infiltration.", impl: "infil.c." },
  { e: "CN_P", idx: 80, cat: "SUB_INFIL", name: "CN: P (cum precip)", units: "in/mm", desc: "Cumulative precipitation for CN method.", impl: "infil.c." },
  { e: "CN_T", idx: 81, cat: "SUB_INFIL", name: "CN: Time", units: "hours", desc: "CN elapsed time.", impl: "infil.c." },
  { e: "CN_Se", idx: 82, cat: "SUB_INFIL", name: "CN: Se (effective S)", units: "in/mm", desc: "Effective retention adjusted for antecedent conditions.", impl: "infil.c." },
  { e: "CN_f", idx: 83, cat: "SUB_INFIL", name: "CN: f (current rate)", units: "in·hr⁻¹", desc: "Current CN infiltration rate.", impl: "infil.c." },
  { e: "CN_Smax", idx: 84, cat: "SUB_INFIL", name: "CN: S_max", units: "in/mm", desc: "Maximum possible S value (fully dry soil).", impl: "infil.c." },
  { e: "CN_F1", idx: 85, cat: "SUB_INFIL", name: "CN: F1 (prev F)", units: "in/mm", desc: "Previous timestep cumulative infiltration.", impl: "infil.c." },
  { e: "CN_Regen", idx: 86, cat: "SUB_INFIL", name: "CN: Regeneration", units: "in/mm", desc: "CN retention capacity recovered during dry period.", impl: "infil.c." },
  { e: "CN_CN", idx: 87, cat: "SUB_INFIL", name: "CN: Current CN", units: "—", desc: "Current effective Curve Number (may change if soil moisture regenerates).", impl: "infil.c." },
  { e: "LIDTotalInflow", idx: 88, cat: "SUB_LID", name: "LID: Total Inflow", units: "CFS/CMS", desc: "Total inflow to all LID controls on this subcatchment.", impl: "lid.c." },


  // ═══════════════════════════════════════════════
  // SYSTEM FLOW QUANTITIES
  // ═══════════════════════════════════════════════
  { e: "SYS_TEMPERATURE", idx: 0, cat: "SYS", name: "Air Temperature", units: "°F/°C", desc: "Current air temperature from [TEMPERATURE] data.", impl: "climate.c." },
  { e: "SYS_RAINFALL", idx: 1, cat: "SYS", name: "System Rainfall", units: "in·hr⁻¹", desc: "Area-weighted average rainfall across all subcatchments.", impl: "massbal.c." },
  { e: "SYS_SNOWDEPTH", idx: 2, cat: "SYS", name: "System Snow Depth", units: "in/mm", desc: "Area-weighted average snow depth.", impl: "snow.c." },
  { e: "SYS_INFIL", idx: 3, cat: "SYS", name: "System Infiltration", units: "CFS/CMS", desc: "Total infiltration rate across all subcatchments.", impl: "massbal.c." },
  { e: "SYS_RUNOFF", idx: 4, cat: "SYS", name: "System Runoff", units: "CFS/CMS", desc: "Total runoff entering the conveyance system from all subcatchments.", impl: "massbal.c." },
  { e: "SYS_DWFLOW", idx: 5, cat: "SYS", name: "System DWF", units: "CFS/CMS", desc: "Total dry weather flow across all nodes.", impl: "massbal.c." },
  { e: "SYS_GWFLOW", idx: 6, cat: "SYS", name: "System GW Flow", units: "CFS/CMS", desc: "Total groundwater inflow to all nodes.", impl: "massbal.c." },
  { e: "SYS_IIFLOW", idx: 7, cat: "SYS", name: "System RDII", units: "CFS/CMS", desc: "Total RDII inflow across all nodes.", impl: "massbal.c." },
  { e: "SYS_EXFLOW", idx: 8, cat: "SYS", name: "System External Flow", units: "CFS/CMS", desc: "Total external inflows from [INFLOWS].", impl: "massbal.c." },
  { e: "SYS_INFLOW", idx: 9, cat: "SYS", name: "Total Lateral Inflow", units: "CFS/CMS", desc: "Sum of ALL lateral inflows: runoff + DWF + GW + RDII + external.", impl: "massbal.c." },
  { e: "SYS_FLOODING", idx: 10, cat: "SYS", name: "System Flooding", units: "CFS/CMS", desc: "Total flooding rate across all nodes.", impl: "massbal.c." },
  { e: "SYS_OUTFLOW", idx: 11, cat: "SYS", name: "System Outflow", units: "CFS/CMS", desc: "Total outfall discharge.", impl: "massbal.c." },
  { e: "SYS_STORAGE", idx: 12, cat: "SYS", name: "System Storage", units: "ft³/m³", desc: "Total volume stored in all nodes and links.", impl: "massbal.c." },
  { e: "SYS_EVAP", idx: 13, cat: "SYS", name: "System Evaporation", units: "CFS/CMS", desc: "Total evaporation from storage nodes and subcatchments.", impl: "massbal.c." },
  { e: "SYS_PET", idx: 14, cat: "SYS", name: "Potential ET", units: "in/day", desc: "Potential evapotranspiration rate from climate data. PET × area = max possible ET.", impl: "climate.c → climate_getPET()." },

  // SYSTEM QA
  { e: "SYS_StepFlowError", idx: 15, cat: "SYS_QA", name: "Step Flow Error", units: "%", desc: "Routing continuity error at this timestep: (ΣQ_in - ΣQ_out - dV/dt) / max_flow × 100. Unlike the .rpt final CE, this shows ERROR AT EACH STEP.", impl: "massbal.c. Per-step mass balance check. Spikes indicate instability." },
  { e: "SYS_WINDSPEED", idx: 16, cat: "SYS", name: "Wind Speed", units: "mph / km·hr⁻¹", desc: "Current wind speed affecting snowmelt and evaporation calculations.", impl: "climate.c." },
  { e: "SYS_SNOWFALL", idx: 17, cat: "SYS", name: "System Snowfall", units: "in·hr⁻¹", desc: "Current snowfall rate across all subcatchments.", impl: "snow.c." },
  { e: "SYS_CE", idx: 18, cat: "SYS_QA", name: "Continuity Error", units: "%", desc: "Cumulative routing continuity error up to current time. THE single most important QA metric. < 1% = excellent, > 10% = problem.", impl: "massbal.c. Running: (totalInflow - totalOutflow - ΔStorage) / totalInflow × 100." },
  { e: "SYS_ITERATIONS", idx: 19, cat: "SYS_QA", name: "Avg Iterations", units: "count", desc: "Average Newton-Raphson iterations across all nodes at this timestep. Low (2-3) = easy convergence. High (MAX_TRIALS) = trouble.", impl: "dynwave.c. Mean of iterations across all nodes." },
  { e: "SYS_TS", idx: 20, cat: "SYS_QA", name: "Timestep Used", units: "sec", desc: "Actual routing timestep used at this reporting interval. With VARIABLE_STEP, may be << ROUTING_STEP.", impl: "routing.c." },
  { e: "SYS_SNOWAREA", idx: 21, cat: "SYS", name: "Snow Coverage", units: "fraction", desc: "Fraction of total watershed covered by snow.", impl: "snow.c." },
  { e: "SYS_FREEWATER", idx: 22, cat: "SYS", name: "Snow Free Water", units: "in/mm", desc: "System-wide average snow free water content.", impl: "snow.c." },
  { e: "SYS_COLD", idx: 23, cat: "SYS", name: "Snow Cold Content", units: "in/mm", desc: "System-wide average cold content of snowpack.", impl: "snow.c." },
  { e: "SYS_SNOWMELT", idx: 24, cat: "SYS", name: "System Snowmelt", units: "in·hr⁻¹", desc: "Total snowmelt rate.", impl: "snow.c." },
  { e: "SYS_IMELT", idx: 25, cat: "SYS", name: "Immediate Melt", units: "in·hr⁻¹", desc: "Immediate snowmelt component.", impl: "snow.c." },
  { e: "SYS_RAINMELT", idx: 26, cat: "SYS", name: "Rain-on-Snow Melt", units: "in·hr⁻¹", desc: "Rain-on-snow melt component.", impl: "snow.c." },

  // ═══════════════════════════════════════════════
  // FLOW CLASSIFICATION
  // ═══════════════════════════════════════════════
  { e: "DRY", idx: 0, cat: "FLOW_CLASS", name: "DRY", units: "flag", desc: "Conduit is completely dry — no water. Link is inactive.", impl: "dynwave.c. No flow computation needed." },
  { e: "UP_DRY", idx: 1, cat: "FLOW_CLASS", name: "UP_DRY", units: "flag", desc: "Upstream end dry, downstream end wet. Backwater filling from downstream.", impl: "dynwave.c." },
  { e: "DN_DRY", idx: 2, cat: "FLOW_CLASS", name: "DN_DRY", units: "flag", desc: "Downstream end dry, upstream end wet. Free-draining pipe.", impl: "dynwave.c." },
  { e: "SUBCRITICAL", idx: 3, cat: "FLOW_CLASS", name: "SUBCRITICAL", units: "flag", desc: "Subcritical flow (Fr < 1). Downstream-controlled. Most common in sanitary sewers and flat storm drains.", impl: "dynwave.c. Flow classification from Froude number." },
  { e: "SUPCRITICAL", idx: 4, cat: "FLOW_CLASS", name: "SUPERCRITICAL", units: "flag", desc: "Supercritical flow (Fr > 1). Upstream-controlled. Steep pipes, mountain streams.", impl: "dynwave.c." },
  { e: "UP_CRITICAL", idx: 5, cat: "FLOW_CLASS", name: "UP_CRITICAL", units: "flag", desc: "Critical depth at upstream end — free-fall entrance condition.", impl: "dynwave.c." },
  { e: "DN_CRITICAL", idx: 6, cat: "FLOW_CLASS", name: "DN_CRITICAL", units: "flag", desc: "Critical depth at downstream end — free outfall condition.", impl: "dynwave.c." },
  { e: "UP_FULL", idx: 8, cat: "FLOW_CLASS", name: "UP_FULL", units: "flag", desc: "Upstream end is full (d ≥ D). Transition to pressure flow beginning.", impl: "dynwave.c. Build 5.1.008+." },
  { e: "DN_FULL", idx: 9, cat: "FLOW_CLASS", name: "DN_FULL", units: "flag", desc: "Downstream end is full.", impl: "dynwave.c." },
  { e: "ALL_FULL", idx: 10, cat: "FLOW_CLASS", name: "ALL_FULL", units: "flag", desc: "Completely full — both ends surcharged. Full pressurized flow with Preissmann slot or EXTRAN method.", impl: "dynwave.c." },
];

// ═══════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════
const C = {
  bg: "#0a0e14", s1: "#131820", s2: "#1a2030", b: "#242d3d", b2: "#2d3a50",
  t: "#e8edf5", t2: "#9aa5b4", t3: "#5c6773",
};

function VarRow({ v, isOpen, onToggle, catColor }) {
  return (
    <div
      onClick={onToggle}
      style={{
        background: isOpen ? C.s2 : C.s1, borderLeft: `3px solid ${catColor}`,
        borderBottom: `1px solid ${C.b}`, padding: "10px 14px", cursor: "pointer",
        transition: "background 0.1s",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <code style={{ color: catColor, fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
          {v.e}
        </code>
        <span style={{ color: C.t2, fontSize: 12 }}>→</span>
        <span style={{ color: C.t, fontSize: 13, fontWeight: 500 }}>{v.name}</span>
        <span style={{ color: C.t3, fontSize: 11, marginLeft: "auto", fontFamily: "monospace" }}>{v.units}</span>
      </div>
      {!isOpen && (
        <div style={{ fontSize: 11, color: C.t3, marginTop: 3, lineHeight: 1.4 }}>
          {v.desc.slice(0, 100)}…
        </div>
      )}
      {isOpen && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.65, marginBottom: 10 }}>
            {v.desc}
          </div>
          <div style={{
            fontSize: 11, color: catColor, background: catColor + "15", border: `1px solid ${catColor}33`,
            borderRadius: 5, padding: "7px 10px", lineHeight: 1.5, fontFamily: "'JetBrains Mono', monospace",
          }}>
            <span style={{ fontWeight: 700, marginRight: 6 }}>IMPL:</span>{v.impl}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SWMM5InnerWorkings() {
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("ALL");
  const [openIdx, setOpenIdx] = useState(null);

  const filtered = useMemo(() => {
    return V.filter(v => {
      if (activeCat !== "ALL" && v.cat !== activeCat) return false;
      if (search) {
        const s = search.toLowerCase();
        return v.e.toLowerCase().includes(s) || v.name.toLowerCase().includes(s) ||
               v.desc.toLowerCase().includes(s) || v.impl.toLowerCase().includes(s);
      }
      return true;
    });
  }, [search, activeCat]);

  const catCounts = useMemo(() => {
    const c = {};
    V.forEach(v => c[v.cat] = (c[v.cat] || 0) + 1);
    return c;
  }, []);

  const catGroups = [
    { title: "NODE", cats: ["NODE_STD", "NODE_SOLVER", "NODE_RDII"] },
    { title: "LINK", cats: ["LINK_STD", "LINK_MOMENTUM", "LINK_GEOMETRY", "LINK_ENERGY", "LINK_COMPAT", "LINK_PROPS"] },
    { title: "SUBCATCH", cats: ["SUB_STD", "SUB_RUNOFF", "SUB_LID", "SUB_GW", "SUB_SNOW", "SUB_INFIL"] },
    { title: "SYSTEM", cats: ["SYS", "SYS_QA", "FLOW_CLASS"] },
  ];

  const toggle = useCallback((i) => setOpenIdx(prev => prev === i ? null : i), []);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.t, fontFamily: "'Segoe UI', -apple-system, sans-serif" }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(180deg, #0f1520 0%, ${C.bg} 100%)`, padding: "20px 16px 14px", borderBottom: `1px solid ${C.b}` }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ fontSize: 10, color: "#f85149", textTransform: "uppercase", letterSpacing: 2, fontWeight: 700, marginBottom: 2 }}>
            EPA SWMM5 + Innovyze RED Extended Enums
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "4px 0", lineHeight: 1.2 }}>
            SWMM5 Inner Workings — Every Output Variable
          </h1>
          <div style={{ fontSize: 12, color: C.t2, marginTop: 4 }}>
            {V.length} variables · Node ({catCounts.NODE_STD||0}+{catCounts.NODE_SOLVER||0}+{catCounts.NODE_RDII||0}) ·
            Link ({catCounts.LINK_STD||0}+{catCounts.LINK_MOMENTUM||0}+{catCounts.LINK_GEOMETRY||0}+{catCounts.LINK_ENERGY||0}+{catCounts.LINK_COMPAT||0}+{catCounts.LINK_PROPS||0}) ·
            Subcatch ({catCounts.SUB_STD||0}+{catCounts.SUB_RUNOFF||0}+{catCounts.SUB_LID||0}+{catCounts.SUB_GW||0}+{catCounts.SUB_SNOW||0}+{catCounts.SUB_INFIL||0}) ·
            System ({catCounts.SYS||0}+{catCounts.SYS_QA||0}+{catCounts.FLOW_CLASS||0})
          </div>

          {/* Equation banner */}
          <div style={{
            marginTop: 10, padding: "8px 12px", background: "#f8514915", border: "1px solid #f8514933",
            borderRadius: 6, fontSize: 12, color: "#f0883e", fontFamily: "monospace", lineHeight: 1.6,
          }}>
            <strong>Momentum:</strong> Q_new = [<span style={{color:"#58a6ff"}}>DQ1</span>·σ·Q_old + <span style={{color:"#3fb950"}}>DQ2</span>·σ·Δt·gĀ·(H₁-H₂)/L] / [1 + <span style={{color:"#f85149"}}>DQ3</span>·Δt·g·Sf + <span style={{color:"#d29922"}}>DQ4</span>·losses + <span style={{color:"#bc8cff"}}>DQ6</span>·σ·convection]
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "12px 16px 40px" }}>
        {/* Search */}
        <input
          type="text" placeholder="Search enum names, descriptions, implementations..."
          value={search} onChange={e => { setSearch(e.target.value); setOpenIdx(null); }}
          style={{
            width: "100%", boxSizing: "border-box", padding: "10px 14px", background: C.s1,
            border: `1px solid ${C.b}`, borderRadius: 8, color: C.t, fontSize: 14, outline: "none", marginBottom: 10,
          }}
        />

        {/* Category buttons */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 12 }}>
          <button onClick={() => { setActiveCat("ALL"); setOpenIdx(null); }} style={{
            padding: "4px 10px", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer",
            border: `1px solid ${activeCat === "ALL" ? "#58a6ff" : C.b}`,
            background: activeCat === "ALL" ? "#58a6ff22" : "transparent",
            color: activeCat === "ALL" ? "#58a6ff" : C.t3,
          }}>ALL ({V.length})</button>

          {catGroups.map(g => (
            <span key={g.title} style={{ display: "inline-flex", flexWrap: "wrap", gap: 2 }}>
              <span style={{ color: C.t3, fontSize: 10, alignSelf: "center", margin: "0 3px" }}>│</span>
              {g.cats.map(cat => {
                const info = CATS[cat];
                return (
                  <button key={cat} onClick={() => { setActiveCat(cat); setOpenIdx(null); }} style={{
                    padding: "3px 7px", borderRadius: 4, fontSize: 10, cursor: "pointer",
                    border: `1px solid ${activeCat === cat ? info.color : C.b}`,
                    background: activeCat === cat ? info.color + "22" : "transparent",
                    color: activeCat === cat ? info.color : C.t3, whiteSpace: "nowrap",
                  }}>
                    {info.icon} {info.label.split(" · ")[1] || info.label} ({catCounts[cat]||0})
                  </button>
                );
              })}
            </span>
          ))}
        </div>

        <div style={{ fontSize: 11, color: C.t3, marginBottom: 8 }}>
          {filtered.length} variables{search && <> matching <strong style={{ color: "#58a6ff" }}>"{search}"</strong></>}
        </div>

        {/* Variable list */}
        <div style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${C.b}` }}>
          {filtered.map((v, i) => (
            <VarRow key={`${v.e}-${v.cat}-${i}`} v={v} isOpen={openIdx === i}
              onToggle={() => toggle(i)} catColor={CATS[v.cat]?.color || C.t3} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 30, color: C.t3 }}>No matches.</div>
        )}

        {/* Footer */}
        <div style={{
          marginTop: 24, padding: 16, background: C.s1, borderRadius: 8, border: `1px solid ${C.b}`,
          fontSize: 11, color: C.t3, lineHeight: 1.7,
        }}>
          <div style={{ fontWeight: 700, color: C.t2, fontSize: 12, marginBottom: 6 }}>Architecture Notes</div>
          <div><span style={{color:"#f85149"}}>MAX_NODE_RESULTS = MAX_LINK_RESULTS = MAX_SUBCATCH_RESULTS = 100</span> — the RED build expanded every result enum from the EPA 6/5/8 defaults to 100 slots, enabling per-timestep output of every solver internal.</div>
          <div style={{marginTop:6}}><span style={{color:"#f0883e"}}>DQ1–DQ6</span> map directly to terms in the finite-difference momentum equation in <code>dynwave.c</code>. DQ1 = inertia, DQ2 = pressure gradient, DQ3 = friction, DQ4 = minor losses, DQ5 = lateral momentum, DQ6 = convective acceleration.</div>
          <div style={{marginTop:6}}><span style={{color:"#bc8cff"}}>LINK_BE_LHS / BE_RHS</span> provide a per-link Bernoulli energy balance check: LHS = H₁ + V₁²/2g + K_entry·V₁²/2g versus RHS = H₂ + V₂²/2g + K_exit·V₂²/2g + h_f. The difference reveals energy conservation quality.</div>
          <div style={{marginTop:6}}><span style={{color:"#39d3d8"}}>Infiltration internals</span> expose the state of all three methods simultaneously: Horton (Tp, Fe), Green-Ampt (IMD, F, Lu, T, Sat), and Curve Number (S, F, P, T, Se, f, Smax, Regen, CN). Each can be tracked per subcatchment per timestep.</div>
          <div style={{marginTop:8, textAlign:"center", color: C.t3, fontSize: 10}}>
            Based on 50+ years continuous SWMM development · enums.h from Innovyze RED build · SWMM5.org
          </div>
        </div>
      </div>
    </div>
  );
}
