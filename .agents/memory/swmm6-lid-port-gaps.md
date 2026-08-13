---
name: SWMM6 LID module is an incomplete port
description: Why SWMM6 (OpenSWMM 6.0.0-alpha.3) LID results are unusable, and what it would actually take to fix — read before promising any LID feature on the SWMM6 engine.
---

# SWMM6's LID solver is not a working port of lidproc.c

The refactored C++ engine (`src/engine/hydrology/LID.cpp`, the one that
actually runs models — NOT `src/legacy/engine/lidproc.c`) computes LID fluxes
with mixed units and missing state gating. Its LID numbers are wrong by orders
of magnitude, and the `.rpt` continuity error on any LID model is the tell
(seen: -1,701,906%).

**Why:** the port carried over the parameter *layout* but not the unit
conversions or the flux logic. Confirmed defects, in the order they surface:

1. `[LID_CONTROLS]` / `[LID_USAGE]` values are stored verbatim in project
   units — the .inp handler uses a bare `to_double`, deliberately, so
   InpWriter can echo the section back unchanged. The solver then uses them
   as internal ft / ft-per-second against inflow that *is* internal
   (`gages.rainfall` is divided by UCF at read). Legacy converts on read.
2. Void RATIO is used as void FRACTION; surface slope percent as fraction;
   drain delay hours as seconds; usage area/width in m²/m as ft²/ft.
3. Replicate count (`[LID_USAGE]` Number) is ignored — runon is spread over
   one unit's area instead of `area * number`.
4. **The flux equations themselves are unit-inconsistent.** Drain flow
   `coeff * head^expon` yields a project-unit rate in legacy and is divided by
   UCF(RAINFALL) there; SWMM6 treats it as ft/sec. Storage exfiltration
   returns Ksat unconditionally — no gating on stored depth — so a bone-dry
   unit reports steady exfiltration. Surface infiltration is likewise
   ungated.

Fixing 1–3 is mechanical (an init-time conversion pass) and moves continuity
from -1,701,906% to ≈ -490,000% — i.e. it proves the remaining error lives in
4, which is a genuine port of lidproc.c's physics, not a patch.

**How to apply:** before agreeing to any SWMM6 LID feature — detailed report,
LID viewer support, LID parity — say up front that SWMM6 LID results are not
trustworthy today, and that reaching SWMM5 parity means porting lidproc.c's
flux routines. A report writer on top of the current solver faithfully reports
garbage. SWMM5 (wasm5) LID output is fine and is what the LID viewer should
keep using.

The consolidated `.lid` writer built for SWMM6 (a `LIDReport` class plus
per-unit capture arrays in the LID SoA, matching the SWMM5 consolidated
format) is preserved as a patch under `swmm-engine/patches/`. It works — it is
the physics underneath it that does not.
