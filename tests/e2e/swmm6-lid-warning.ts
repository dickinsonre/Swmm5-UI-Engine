/**
 * Regression: the SWMM6 LID trust warning actually reaches users ON SCREEN.
 *
 * The SWMM6 WASM engine's LID module is an incomplete port whose LID numbers are
 * wrong by orders of magnitude. The warning predicate (client/src/lib/swmm6-lid-warning.ts)
 * is unit-tested, but the toast system allows only ONE visible toast, so the warning
 * had to be MERGED into the run-completion toast rather than emitted alongside it.
 * Anyone who later re-splits those toasts, adds a second post-run toast, or reorders
 * the completion path silently evicts the warning while every unit test still passes.
 *
 * This suite drives a real browser and asserts on VISIBLE text:
 *   1. LID model on SWMM6  -> warning is visible          (the thing under test)
 *   2. LID model on SWMM5  -> warning is quiet            (proves we match the warning, not stray text)
 *   3. non-LID on SWMM6    -> warning is quiet            (same)
 *   4. Batch SWMM6 over LID -> persistent notice visible
 *   5. Batch SWMM5 over LID -> no notice
 *
 * Comparison modes (5+6, 5+6dev, 6rel+6dev) are deliberately skipped: two full
 * engine runs each, too slow.
 *
 * Run: npx tsx tests/e2e/swmm6-lid-warning.ts
 */
import { chromium, type Page } from 'playwright-core';
import { execSync } from 'child_process';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5000';

// A resilient substring drawn from SWMM6_LID_WARNING_MESSAGE. It is present in
// BOTH the run-completion toast (swmm-ui.tsx) and the batch notice
// (BatchRunnerDialog.tsx), so one probe covers every warning site. Asserting on
// visible text rather than internal state is what makes this a user-facing test.
const WARNING_SUBSTR = 'wrong by orders of magnitude';

const LID_MODEL = 'tests/fixtures/lid_test.inp';
const NON_LID_MODEL = 'tests/fixtures/batch-simple.inp';

let failed = 0;
const check = (n: string, ok: boolean, d?: string) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) failed++;
};

/** All currently-rendered toasts, located by their Radix close button's ancestor. */
function toasts(page: Page) {
  // Every toast renders a <button toast-close="">; its closest <li> is the toast root.
  return page.locator('li:has([toast-close])');
}

/** Dismiss every visible toast and wait until none remain. Makes the next
 *  toast a FRESH, unambiguous per-run signal (TOAST_LIMIT is 1, but a stale
 *  toast from a previous run could otherwise be mistaken for this run's). */
async function dismissToasts(page: Page) {
  for (let i = 0; i < 6; i++) {
    const closers = page.locator('[toast-close]');
    const n = await closers.count();
    if (n === 0) break;
    for (let j = 0; j < n; j++) {
      // Re-query each time; closing one re-renders the list.
      const c = page.locator('[toast-close]').first();
      if ((await c.count()) === 0) break;
      await c.click({ force: true }).catch(() => {});
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(200);
  }
  await page.waitForFunction(() => !document.querySelector('[toast-close]'), undefined, { timeout: 10000 })
    .catch(() => {}); // best-effort; a lingering toast is caught by the fresh-text wait below
}

/** Close any lingering Radix dialog/overlay so the menu bar is clickable again. */
async function clearOverlays(page: Page) {
  for (let i = 0; i < 6; i++) {
    if ((await page.locator('[data-component-name="DialogOverlay"]').count()) === 0) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
}

/** Cycle the engine toggle until its label contains `want`. Returns the final label. */
async function setEngine(page: Page, want: string): Promise<string> {
  let label = '';
  for (let i = 0; i < 9; i++) {
    label = (await page.locator('[data-testid="btn-engine-toggle"]').innerText()).trim();
    if (label.includes(want)) return label;
    await page.click('[data-testid="btn-engine-toggle"]');
    await page.waitForTimeout(350);
  }
  return (await page.locator('[data-testid="btn-engine-toggle"]').innerText()).trim();
}

/**
 * Load a model and run it on the currently-selected engine, then read the text
 * of THIS run's completion toast.
 *
 * Freshness is the whole point: engine-health-strip survives from the previous
 * run, so waiting on it returns instantly and a fixed sleep is all that guards
 * the assertion — the negatives could then pass vacuously (nothing emitted yet).
 * Instead we dismiss all toasts first, then wait for a NEW completion toast for
 * this run. The completion toast is exactly where the warning is merged, and
 * every success-path completion toast (warn or not, full or report-summary)
 * carries `expectLabel` (e.g. "WASM" / "OpenSWMM 6 release") in its description.
 * We return that toast's own text so the caller asserts on a toast that
 * PROVABLY appeared — not on an empty screen.
 */
async function runAndProbe(page: Page, modelPath: string, expectLabel: string, shot: string): Promise<string> {
  await clearOverlays(page);
  await page.setInputFiles('[data-testid="file-input"]', modelPath);
  await page.waitForTimeout(1200);
  await dismissToasts(page);

  await page.click('[data-testid="btn-run"]');
  // Wait for a fresh toast whose text contains this run's engine label. A real
  // simulation on a busy shared server can take a while.
  const done = toasts(page).filter({ hasText: expectLabel });
  await done.first().waitFor({ state: 'visible', timeout: 120000 });
  await page.waitForTimeout(500); // let title + description settle
  const text = (await done.first().innerText()).trim();
  await page.screenshot({ path: shot });
  return text;
}

async function main() {
  const browser = await chromium.launch({
    executablePath: execSync('which chromium').toString().trim(),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="btn-run"]');

    // The engine label baked into the completion toast description, per engine.
    const LABEL_SWMM6 = 'OpenSWMM 6 release';
    const LABEL_SWMM5 = 'WASM';

    // ----------------------------------------------------------------------
    console.log('1. LID model on SWMM6 — warning MUST be visible');
    check('engine set to WASM 6', (await setEngine(page, 'WASM 6')).includes('WASM 6'));
    const lidOn6 = await runAndProbe(page, LID_MODEL, LABEL_SWMM6, '/tmp/lid-swmm6.png');
    check('LID warning present in SWMM6 completion toast', lidOn6.includes(WARNING_SUBSTR),
      JSON.stringify(lidOn6.slice(0, 70)));

    // ----------------------------------------------------------------------
    console.log('2. LID model on SWMM5 — completion toast MUST appear but stay quiet');
    await clearOverlays(page);
    check('engine set to WASM 5.2.4', (await setEngine(page, 'WASM 5.2.4')).includes('WASM 5.2.4'));
    const lidOn5 = await runAndProbe(page, LID_MODEL, LABEL_SWMM5, '/tmp/lid-swmm5.png');
    // Sharp negative: the toast PROVABLY appeared (it contains the engine label)
    // and PROVABLY lacks the warning — not an empty screen.
    check('SWMM5 completion toast appeared', lidOn5.includes(LABEL_SWMM5), JSON.stringify(lidOn5.slice(0, 70)));
    check('no LID warning in SWMM5 completion toast', !lidOn5.includes(WARNING_SUBSTR),
      lidOn5.includes(WARNING_SUBSTR) ? 'warning leaked onto SWMM5!' : 'quiet');

    // ----------------------------------------------------------------------
    console.log('3. non-LID model on SWMM6 — completion toast MUST appear but stay quiet');
    await clearOverlays(page);
    check('engine set to WASM 6', (await setEngine(page, 'WASM 6')).includes('WASM 6'));
    const nonLidOn6 = await runAndProbe(page, NON_LID_MODEL, LABEL_SWMM6, '/tmp/nonlid-swmm6.png');
    check('non-LID SWMM6 completion toast appeared', nonLidOn6.includes(LABEL_SWMM6), JSON.stringify(nonLidOn6.slice(0, 70)));
    check('no LID warning for non-LID model on SWMM6', !nonLidOn6.includes(WARNING_SUBSTR),
      nonLidOn6.includes(WARNING_SUBSTR) ? 'warning matched stray text!' : 'quiet');

    // ----------------------------------------------------------------------
    console.log('4. Batch Runner: SWMM6 pass over a LID model — notice MUST show');
    await clearOverlays(page);
    await page.click('[data-testid="btn-batch-runner"]');
    await page.waitForSelector('[data-testid="dialog-batch-runner"]');
    await runBatch(page, LID_MODEL, ['wasm6']);
    await page.waitForSelector('[data-testid="text-batch-lid-warning"]', { timeout: 120000 });
    const batchNotice = await page.locator('[data-testid="text-batch-lid-warning"]').innerText();
    check('batch LID notice present & has warning text', batchNotice.includes(WARNING_SUBSTR),
      JSON.stringify(batchNotice.slice(0, 60)));
    check('batch LID notice is visible', await page.locator('[data-testid="text-batch-lid-warning"]').isVisible());
    await page.screenshot({ path: '/tmp/batch-swmm6-lid.png' });

    // ----------------------------------------------------------------------
    console.log('5. Batch Runner: SWMM5-only over a LID model — no notice');
    // runBatch clears the file list first (resetting progress AND the notice)
    // and selects wasm-only. Absence-of-notice is only meaningful once THIS
    // SWMM5 run has provably completed — wait for the per-file success dot (a
    // fresh signal that resets to pending on clear), not the Run button (which
    // was already present) or a fixed sleep.
    await runBatch(page, LID_MODEL, ['wasm']);
    await waitBatchComplete(page, 120000);
    // Guard against a vacuous pass: confirm the batch actually ran SWMM5-only.
    const wasmChecked = (await page.locator('[data-testid="chk-batch-engine-wasm"]').getAttribute('data-state')) === 'checked';
    const wasm6Checked = (await page.locator('[data-testid="chk-batch-engine-wasm6"]').getAttribute('data-state')) === 'checked';
    check('batch ran SWMM5-only (wasm on, wasm6 off)', wasmChecked && !wasm6Checked, `wasm=${wasmChecked} wasm6=${wasm6Checked}`);
    const noticeCount = await page.locator('[data-testid="text-batch-lid-warning"]').count();
    check('no batch LID notice for SWMM5-only pass', noticeCount === 0,
      noticeCount ? 'notice leaked onto a SWMM5-only batch!' : 'quiet');
    await page.screenshot({ path: '/tmp/batch-swmm5-lid.png' });

    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exitCode = failed ? 1 : 0;
  } finally {
    await browser.close();
  }
}

/**
 * Reset the batch dialog to exactly `engines` selected and `modelPath` as the
 * single model, then start the run. Clearing first makes each call independent.
 */
async function runBatch(page: Page, modelPath: string, engines: string[]) {
  // Clear any existing files.
  if ((await page.locator('[data-testid="btn-batch-clear"]').count()) > 0) {
    await page.click('[data-testid="btn-batch-clear"]');
    await page.waitForTimeout(300);
  }
  // The batch dialog's own hidden file input (accept=".inp", multiple).
  await page.setInputFiles('[data-testid="dialog-batch-runner"] input[type=file][accept=".inp"]', modelPath);
  await page.waitForTimeout(500);

  // Drive each checkbox to its desired state, verifying after each toggle.
  // Toggling a checkbox re-renders the dialog (invalidateResults), so a single
  // fire-and-forget click can race; retry until data-state actually matches.
  const wanted = new Set(engines);
  for (const id of ['local', 'wasm', 'wasm6', 'wasm6dev', 'remote']) {
    const box = page.locator(`[data-testid="chk-batch-engine-${id}"]`);
    if ((await box.count()) === 0) continue;
    const want = wanted.has(id);
    for (let attempt = 0; attempt < 4; attempt++) {
      const checked = (await box.getAttribute('data-state')) === 'checked';
      if (checked === want) break;
      await box.click();
      await page.waitForTimeout(250);
    }
    const finalChecked = (await box.getAttribute('data-state')) === 'checked';
    if (finalChecked !== want) throw new Error(`could not set batch engine ${id} to ${want ? 'checked' : 'unchecked'}`);
  }
  // Sanity: exactly the wanted engines are checked before running.
  for (const id of ['local', 'wasm', 'wasm6', 'wasm6dev', 'remote']) {
    const box = page.locator(`[data-testid="chk-batch-engine-${id}"]`);
    if ((await box.count()) === 0) continue;
    const checked = (await box.getAttribute('data-state')) === 'checked';
    if (checked !== wanted.has(id)) throw new Error(`batch engine ${id} in wrong state before run`);
  }
  await page.click('[data-testid="btn-batch-run"]');
}

/**
 * Wait until the current batch has provably COMPLETED: the Run button is back
 * (setRunning(false)) AND at least one per-file success dot is green. The green
 * dot is the fresh signal — runBatch clears the file list first, resetting every
 * dot to pending, so a green dot cannot be left over from a previous batch.
 */
async function waitBatchComplete(page: Page, timeout: number) {
  await page.waitForSelector('[data-testid="btn-batch-run"]', { timeout });
  await page.waitForSelector('[data-testid="dialog-batch-runner"] .bg-green-500', { timeout });
}

main().catch((e) => { console.error(e); process.exit(1); });
