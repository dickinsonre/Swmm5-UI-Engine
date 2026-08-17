import type { SwmmProject } from './swmm-types';

/**
 * OpenSWMM 6's LID solver (src/engine/hydrology/LID.cpp) is an incomplete port
 * of SWMM5's lidproc.c: LID_CONTROLS/LID_USAGE values are consumed verbatim in
 * project units, several parameters are misread (void ratio as fraction, slope
 * percent as fraction, drain delay hours as seconds), the replicate count is
 * ignored, and the flux equations themselves are unit-inconsistent. LID numbers
 * from SWMM6 are wrong by orders of magnitude — a continuity error in the
 * hundreds of thousands of percent is the usual tell. SWMM5 LID output is fine.
 *
 * This is a temporary user-facing guard, not an engine change.
 *
 * TO REMOVE ONCE THE SOLVER IS FIXED: set this flag to false. Every warning
 * site goes quiet; nothing else needs touching.
 */
export const SWMM6_LID_UNRELIABLE = true;

export const SWMM6_LID_WARNING_TITLE = '\u26a0 SWMM6 LID Results Are Not Reliable';

export const SWMM6_LID_WARNING_MESSAGE =
  'This model uses LID controls, and the OpenSWMM 6 LID solver is an incomplete port — ' +
  'its LID depths, drain flows and continuity are wrong by orders of magnitude. ' +
  'Run LID models on a SWMM 5.2.4 engine instead.';

/** Engine identifiers whose LID results cannot be trusted. */
export function isSwmm6Engine(engine: string | undefined | null): boolean {
  return engine === 'wasm6' || engine === 'wasm6dev';
}

/**
 * True when any leg of the run uses a SWMM6 engine. Covers the plain SWMM6
 * modes and the comparison modes, which always run at least one SWMM6 pass.
 */
export function runUsesSwmm6(engineMode: string | undefined | null): boolean {
  return isSwmm6Engine(engineMode)
    || engineMode === 'both56'
    || engineMode === 'both56dev'
    || engineMode === 'both66';
}

/** True when the model actually defines or deploys any LID. */
export function projectHasLid(project: Pick<SwmmProject, 'lidControls' | 'lidUsage'> | null | undefined): boolean {
  if (!project) return false;
  return (project.lidControls?.length ?? 0) > 0 || (project.lidUsage?.length ?? 0) > 0;
}

/**
 * Should this run warn the user about untrustworthy LID results?
 * Non-blocking: callers warn, they never refuse to run.
 */
export function shouldWarnSwmm6Lid(
  engineMode: string | undefined | null,
  project: Pick<SwmmProject, 'lidControls' | 'lidUsage'> | null | undefined,
): boolean {
  return SWMM6_LID_UNRELIABLE && runUsesSwmm6(engineMode) && projectHasLid(project);
}
