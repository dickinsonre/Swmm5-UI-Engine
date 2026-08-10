---
name: SWMM6-only .inp options gating
description: Rules for writing SWMM6-only [OPTIONS] features without breaking SWMM5 compatibility
---

User's standing rule (from his verified swmm6-inp-conversion spec in attached_assets): SWMM6-only lines must NEVER be data lines in a SWMM5-target .inp — stock EPA 5.2.4 dies with ERROR 205 on each one; legacy 5.3 silently ignores some (different physics, exit 0). SURCHARGE_METHOD is valid SWMM5; only the value DYNAMIC_SLOT is SWMM6-only.

**How it's implemented here:** `SwmmProject.swmm6Options` (separate record), `projectToInp(project, target)` emits real lines only for `'swmm6'`; SWMM5 output carries them as `;;SWMM6 KEY value` comments purely for round-tripping. Those carrier comments must be excluded from preserved-comment metadata in the parser or every save/load cycle duplicates them (bug fixed 2026-08-10).

**Gotchas:** DYNAMIC_SLOT is silently ignored unless FLOW_ROUTING is DYNWAVE; ANDERSON_ACCEL changing nothing on a converging model is expected; content-scan generated output rather than trusting UI state when verifying. [VIRTUAL_JUNCTIONS] needs the four-rule eligibility test (609/611/613/617) and the section must precede [CONDUITS] — deferred to a follow-up task.
