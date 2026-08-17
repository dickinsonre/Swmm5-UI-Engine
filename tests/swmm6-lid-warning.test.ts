/**
 * SWMM6 LID trust-warning guard.
 *
 * SWMM6's LID solver is an incomplete port of SWMM5's lidproc.c, so its LID
 * numbers are wrong by orders of magnitude. These tests pin the predicate that
 * decides when the UI warns: it must fire for every SWMM6 leg of a run on a
 * model that uses LID, and must stay silent otherwise (no false alarms on
 * SWMM5 engines or on models without LID).
 *
 * Run with: npx tsx tests/swmm6-lid-warning.test.ts
 */

import {
  shouldWarnSwmm6Lid, isSwmm6Engine, runUsesSwmm6, projectHasLid,
  SWMM6_LID_UNRELIABLE, SWMM6_LID_WARNING_MESSAGE,
} from '../client/src/lib/swmm6-lid-warning';
import { createEmptyProject } from '../client/src/lib/swmm-types';
import { parseInpFile } from '../client/src/lib/inp-parser';

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const noLid = createEmptyProject();

const withControls = createEmptyProject();
withControls.lidControls = [{ name: 'BioCell' } as any];

const withUsage = createEmptyProject();
withUsage.lidUsage = [{ subcatchment: 'S1', lidName: 'BioCell' } as any];

// ---------------------------------------------------------------------------
console.log('\nisSwmm6Engine — only the two SWMM6 WASM variants');
{
  check('wasm6 is SWMM6', isSwmm6Engine('wasm6'));
  check('wasm6dev is SWMM6', isSwmm6Engine('wasm6dev'));
  check('wasm (SWMM5) is not', !isSwmm6Engine('wasm'));
  check('local is not', !isSwmm6Engine('local'));
  check('remote is not', !isSwmm6Engine('remote'));
  check('mock is not', !isSwmm6Engine('mock'));
  check('undefined is not', !isSwmm6Engine(undefined));
}

// ---------------------------------------------------------------------------
console.log('\nrunUsesSwmm6 — comparison modes always run a SWMM6 leg');
{
  check('both56 runs SWMM6', runUsesSwmm6('both56'));
  check('both56dev runs SWMM6', runUsesSwmm6('both56dev'));
  check('both66 runs SWMM6', runUsesSwmm6('both66'));
  check('plain wasm6 counts', runUsesSwmm6('wasm6'));
  check('SWMM5-only wasm does not', !runUsesSwmm6('wasm'));
}

// ---------------------------------------------------------------------------
console.log('\nprojectHasLid — controls OR usage');
{
  check('empty project has no LID', !projectHasLid(noLid));
  check('LID_CONTROLS alone counts', projectHasLid(withControls));
  check('LID_USAGE alone counts', projectHasLid(withUsage));
  check('null project is safe', !projectHasLid(null));
}

// ---------------------------------------------------------------------------
console.log('\nshouldWarnSwmm6Lid — fires only on SWMM6 + LID');
{
  check('wasm6 + LID controls warns', shouldWarnSwmm6Lid('wasm6', withControls));
  check('wasm6dev + LID usage warns', shouldWarnSwmm6Lid('wasm6dev', withUsage));
  check('both56 + LID warns (SWMM6 leg)', shouldWarnSwmm6Lid('both56', withControls));
  check('both56dev + LID warns', shouldWarnSwmm6Lid('both56dev', withControls));
  check('both66 + LID warns', shouldWarnSwmm6Lid('both66', withControls));

  check('wasm6 without LID stays quiet', !shouldWarnSwmm6Lid('wasm6', noLid));
  check('both66 without LID stays quiet', !shouldWarnSwmm6Lid('both66', noLid));
  check('SWMM5 wasm with LID stays quiet', !shouldWarnSwmm6Lid('wasm', withControls));
  check('local with LID stays quiet', !shouldWarnSwmm6Lid('local', withControls));
  check('remote with LID stays quiet', !shouldWarnSwmm6Lid('remote', withControls));
  check('mock with LID stays quiet', !shouldWarnSwmm6Lid('mock', withControls));
  check('null project stays quiet', !shouldWarnSwmm6Lid('wasm6', null));
}

// ---------------------------------------------------------------------------
console.log('\nreal parsed INP with LID sections');
{
  const inp = [
    '[TITLE]',
    'LID warning fixture',
    '',
    '[SUBCATCHMENTS]',
    ';;Name  Rgage  Outlet  Area  %Imperv  Width  Slope  CurbLen',
    'S1      RG1    J1      2.0   50       400    0.5    0',
    '',
    '[LID_CONTROLS]',
    'BioCell  BC',
    'BioCell  SURFACE   6   0.0   0.0   1.0   5',
    'BioCell  SOIL      12  0.5   0.2   0.1   0.5  10.0  3.5',
    'BioCell  STORAGE   12  0.75  0.5   0',
    '',
    '[LID_USAGE]',
    ';;Subcatch  LID      Number  Area   Width  InitSat  FromImp  ToPerv',
    'S1          BioCell  4       1000   50     0        25       0',
    '',
  ].join('\n');
  const project = parseInpFile(inp);
  check('parser populated lidControls', project.lidControls.length > 0, project.lidControls.length);
  check('parser populated lidUsage', project.lidUsage.length > 0, project.lidUsage.length);
  check('parsed LID model warns on wasm6', shouldWarnSwmm6Lid('wasm6', project));
  check('parsed LID model quiet on wasm5', !shouldWarnSwmm6Lid('wasm', project));
}

// ---------------------------------------------------------------------------
console.log('\nkill switch + message');
{
  check('guard is currently armed', SWMM6_LID_UNRELIABLE === true);
  check('message names SWMM 5 as the fix', /SWMM 5/.test(SWMM6_LID_WARNING_MESSAGE));
  check('message mentions LID', /LID/.test(SWMM6_LID_WARNING_MESSAGE));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
