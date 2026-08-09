import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseInpFile } from '../../client/src/lib/inp-parser';
import { runRoundTripAudit, evaluateSaveGate, type RoundTripAuditReport } from '../../client/src/lib/roundtrip-audit';
import type { SwmmProject } from '../../client/src/lib/swmm-types';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Simulates the save gate in client/src/pages/swmm-ui.tsx (`withAuditCheck`)
 * using the same production `evaluateSaveGate` helper: run the round-trip
 * audit; if the gate is clean, proceed immediately; otherwise populate the
 * warning state with counts and defer `proceed` behind onConfirm.
 */
interface SaveAuditWarning {
  diffCount: number;
  omittedCount: number;
  onConfirm: () => void;
}

interface GateResult {
  proceeded: boolean;
  warning: SaveAuditWarning | null;
  report: RoundTripAuditReport;
}

function simulateSaveGate(project: SwmmProject, proceed: () => void): GateResult {
  const report = runRoundTripAudit(project);
  const gate = evaluateSaveGate(report);
  if (gate.clean) {
    proceed();
    return { proceeded: true, warning: null, report };
  }
  return {
    proceeded: false,
    warning: { diffCount: gate.diffCount, omittedCount: gate.omittedCount, onConfirm: proceed },
    report,
  };
}

export function runSaveAuditTests(): number {
  console.log('\n=== Save-time audit gate tests ===');
  let failures = 0;
  const check = (desc: string, ok: boolean, detail?: string) => {
    if (ok) {
      console.log(`  ✓ ${desc}`);
    } else {
      failures++;
      console.log(`  ✗ ${desc}${detail ? ` — ${detail}` : ''}`);
    }
  };

  const cleanInp = readFileSync(join(__dirname, 'fixtures', 'comprehensive.inp'), 'utf8');

  // --- 1. Clean model: save proceeds immediately, no warning state ---
  {
    const project = parseInpFile(cleanInp);
    let saved = false;
    const res = simulateSaveGate(project, () => { saved = true; });
    check('clean model: proceed called immediately', saved);
    check('clean model: no warning state set', res.warning === null,
      res.warning ? `warning set with diffCount=${res.warning.diffCount}` : undefined);
    check('clean model: audit reports zero risk diffs',
      res.report.diffs.filter(d => d.kind === 'omitted' || d.kind === 'altered').length === 0,
      `diffs: ${JSON.stringify(res.report.diffs.slice(0, 5))}`);
  }

  // --- 2. Model with a field the writer omits: warning fires with correct counts ---
  {
    const project = parseInpFile(cleanInp);
    // A property the INP writer does not emit is lost on re-parse → one 'omitted' diff.
    (project.junctions[0] as any).bogusUnsupportedField = 'will-be-lost';
    let saved = false;
    const res = simulateSaveGate(project, () => { saved = true; });
    check('omitted model: proceed NOT called before confirm', !saved);
    check('omitted model: warning state populated', res.warning !== null);
    check('omitted model: diffCount is exactly 1', res.warning?.diffCount === 1,
      `got diffCount=${res.warning?.diffCount}`);
    check('omitted model: omittedCount is exactly 1', res.warning?.omittedCount === 1,
      `got omittedCount=${res.warning?.omittedCount}`);
    check('omitted model: diff path points at the injected field',
      res.report.diffs.some(d => d.kind === 'omitted' && d.path.includes('bogusUnsupportedField')),
      `diffs: ${JSON.stringify(res.report.diffs.slice(0, 5))}`);
    // Confirming the dialog runs the deferred save.
    res.warning?.onConfirm();
    check('omitted model: onConfirm runs the deferred save', saved);
  }

  // --- 3. Model with an altered field: warning fires, counted as diff but not omitted ---
  {
    const project = parseInpFile(cleanInp);
    // The last column of the junction line: the extra token is dropped on
    // re-parse, so the value comes back changed → one 'altered' diff.
    (project.junctions[0] as any).aponded = '100 999';
    let saved = false;
    const res = simulateSaveGate(project, () => { saved = true; });
    check('altered model: proceed NOT called before confirm', !saved);
    check('altered model: warning state populated', res.warning !== null);
    check('altered model: diffCount is exactly 1', res.warning?.diffCount === 1,
      `got diffCount=${res.warning?.diffCount}`);
    check('altered model: omittedCount is 0', res.warning?.omittedCount === 0,
      `got omittedCount=${res.warning?.omittedCount}`);
    check('altered model: diff is kind altered at the mutated field',
      res.report.diffs.length === 1 && res.report.diffs[0].kind === 'altered' &&
        res.report.diffs[0].path.includes('aponded'),
      `diffs: ${JSON.stringify(res.report.diffs.slice(0, 5))}`);
    res.warning?.onConfirm();
    check('altered model: onConfirm runs the deferred save', saved);
  }

  // --- 4. Mixed omitted + altered fields: counts aggregate correctly ---
  {
    const project = parseInpFile(cleanInp);
    (project.junctions[0] as any).lostA = 'x';           // omitted
    (project.junctions[0] as any).aponded = '100 999';   // altered
    let saved = false;
    const res = simulateSaveGate(project, () => { saved = true; });
    check('mixed model: proceed not called', !saved);
    check('mixed model: diffCount is 2', res.warning?.diffCount === 2,
      `got diffCount=${res.warning?.diffCount}`);
    check('mixed model: omittedCount is 1', res.warning?.omittedCount === 1,
      `got omittedCount=${res.warning?.omittedCount}`);
  }

  console.log(failures ? `Save-audit gate: ${failures} FAILED` : 'Save-audit gate: all passed');
  return failures;
}
