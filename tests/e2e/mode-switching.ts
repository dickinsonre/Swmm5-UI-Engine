/**
 * E2E regression: Standard/Expert mode switching keeps panels and results intact.
 *
 * The Standard/Expert toggle (data-testid="btn-ui-mode", localStorage key
 * "swmm5-ui-mode") hides many surfaces: the Phase / Calibrate / Scatter /
 * Transect / Compare toolbar buttons, the CFL button + CFL panel, the System
 * Variables panel (the "System" theme combo under the View menu), and the
 * advanced dialogs behind them. Every one of those is gated on `expertMode &&`
 * in client/src/pages/swmm-ui.tsx, so dropping to Standard hides them without
 * touching their underlying state. Toggling modes must never lose the loaded
 * model, the simulation results, or the current selection.
 *
 * Verified app behaviours this suite pins down (not assumed):
 *  - CFL panel (data-testid="cfl-panel") opens from the Project-menu "CFL"
 *    button; System panel (data-testid="system-panel") opens by picking a
 *    variable in the View-menu "System" combo (data-testid="combo-system").
 *  - Both panels' visibility flags (showCflPanel / showSystemPanel) are plain
 *    React state that the mode gate only *hides*; so dropping to Standard hides
 *    them and returning to Expert *re-shows* them.
 *  - The advanced dialogs (dialog-phase-space, calibration-dialog) are driven
 *    by a single `openDialog` state, so only one can be open at a time. When
 *    one is open and you toggle to Standard WITHOUT closing it, the mode gate
 *    hides it (open=false) but leaves openDialog set — so returning to Expert
 *    *reopens* it. Each dialog is exercised through its own drop/restore cycle.
 *  - A full page reload persists ONLY the mode (localStorage). The model,
 *    results and selection are plain React state and are intentionally NOT
 *    persisted, so after a reload we assert the mode is restored but the run
 *    state is gone. Asserting otherwise would invent a requirement.
 *
 * Run: npx tsx tests/e2e/mode-switching.ts
 */
import { chromium, type Page } from 'playwright-core';
import { execSync } from 'child_process';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5000';
// Extran1: small, fast DYNWAVE model that has BOTH [CONDUITS] (so the CFL panel
// has data to show) AND [COORDINATES] (so Find can select a node). Extran9 has
// neither conduits, so its CFL panel can never render.
const MODEL = 'client/public/samples/Extran1.inp';
const FIND_NODE = '80408'; // a junction with coordinates in Extran1
const MODE_KEY = 'swmm5-ui-mode';

let failed = 0;
const check = (n: string, ok: boolean, d?: string) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) failed++;
};

const modeLabel = (p: Page) => p.locator('[data-testid="btn-ui-mode"]').innerText();
const count = (p: Page, sel: string) => p.locator(sel).count();
const clearOverlays = async (p: Page) => {
  for (let i = 0; i < 6; i++) {
    if ((await p.locator('[data-component-name="DialogOverlay"]').count()) === 0) return;
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
  }
};
// Normal toggle: only usable when no dialog overlay is intercepting clicks.
async function setModeTo(p: Page, want: 'Standard' | 'Expert') {
  for (let i = 0; i < 3; i++) {
    if ((await modeLabel(p)).includes(want)) return;
    await clearOverlays(p);
    await p.click('[data-testid="btn-ui-mode"]');
    await p.waitForTimeout(400);
  }
}
// Toggle even while an advanced dialog is open: a Radix DialogOverlay intercepts
// real clicks on the menu bar, so dispatch the click straight at the button.
// This deliberately does NOT close the dialog first — that is the behaviour
// under test (the mode gate, not a manual close, must hide the dialog).
async function toggleModeThroughOverlay(p: Page) {
  await p.dispatchEvent('[data-testid="btn-ui-mode"]', 'click');
  await p.waitForTimeout(600);
}

async function main() {
  const browser = await chromium.launch({
    executablePath: execSync('which chromium').toString().trim(),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="btn-ui-mode"]');

    console.log('1. baseline: Standard mode, load model, run a simulation');
    // Normalise to a known start via the real UI toggle (not by writing
    // localStorage directly — we assert on that persistence later).
    await setModeTo(page, 'Standard');
    check('starts in Standard', (await modeLabel(page)).includes('Standard'));

    await page.setInputFiles('[data-testid="file-input"]', MODEL);
    await page.waitForTimeout(1500);

    // Pick a fast local WASM engine.
    for (let i = 0; i < 9; i++) {
      const label = await page.locator('[data-testid="btn-engine-toggle"]').innerText();
      if (label.includes('WASM 5.2.4')) break;
      await page.click('[data-testid="btn-engine-toggle"]');
      await page.waitForTimeout(300);
    }
    console.log('   engine:', (await page.locator('[data-testid="btn-engine-toggle"]').innerText()).trim());

    // Expert-only surfaces must be absent in Standard.
    await clearOverlays(page);
    await page.click('[data-testid="menu-project"]');
    await page.waitForSelector('[data-testid="btn-run"]');
    check('btn-phase-space absent in Standard', (await count(page, '[data-testid="btn-phase-space"]')) === 0);
    check('btn-calibration absent in Standard', (await count(page, '[data-testid="btn-calibration"]')) === 0);
    check('btn-cfl absent in Standard', (await count(page, '[data-testid="btn-cfl"]')) === 0);
    // The System-variables combo lives under the View menu; it is Expert-only.
    await page.click('[data-testid="menu-view"]');
    await page.waitForTimeout(300);
    check('combo-system (System panel opener) absent in Standard',
      (await count(page, '[data-testid="combo-system"]')) === 0);

    await clearOverlays(page);
    await page.click('[data-testid="menu-project"]');
    await page.waitForSelector('[data-testid="btn-run"]');
    await page.click('[data-testid="btn-run"]');
    await page.waitForSelector('[data-testid="engine-health-strip"]', { timeout: 120000 });
    await page.waitForTimeout(2000);
    await clearOverlays(page);
    const haveResults = async () => (await count(page, '[data-testid="engine-health-strip"]')) === 1;
    check('run produced results (engine-health-strip)', await haveResults());
    await page.screenshot({ path: '/tmp/mode-1-standard-results.png' });

    console.log('2. establish a selection via Find (property-editor-panel appears)');
    await clearOverlays(page);
    await page.click('[data-testid="menu-project"]');
    await page.waitForSelector('[data-testid="btn-run"]'); // Project toolbar rendered
    // There are two btn-find (a no-op top-bar icon + the Project-menu one that
    // opens the dialog); the menu one carries the visible "Find" label.
    await page.getByTestId('btn-find').filter({ hasText: 'Find' }).click();
    await page.waitForSelector('[data-testid="find-object-input"]');
    await page.fill('[data-testid="find-object-input"]', FIND_NODE);
    await page.waitForSelector(`[data-testid="find-result-${FIND_NODE}"]`);
    await page.click(`[data-testid="find-result-${FIND_NODE}"]`);
    await page.waitForTimeout(600);
    await clearOverlays(page);
    const haveSelection = async () => (await count(page, '[data-testid="property-editor-panel"]')) === 1;
    check('selection made (property-editor-panel present)', await haveSelection());

    console.log('3. toggle to Expert — surfaces appear, results & selection intact');
    await setModeTo(page, 'Expert');
    check('now in Expert', (await modeLabel(page)).includes('Expert'));
    check('results survive toggle to Expert', await haveResults());
    check('selection survives toggle to Expert', await haveSelection());
    await page.click('[data-testid="menu-project"]');
    await page.waitForSelector('[data-testid="btn-phase-space"]');
    check('btn-phase-space now visible in Expert', (await count(page, '[data-testid="btn-phase-space"]')) === 1);
    check('btn-calibration now visible in Expert', (await count(page, '[data-testid="btn-calibration"]')) === 1);

    console.log('4. CFL panel: open in Expert, hide on drop to Standard, re-show on return');
    await page.click('[data-testid="menu-project"]');
    await page.waitForSelector('[data-testid="btn-cfl"]');
    await page.click('[data-testid="btn-cfl"]');
    await page.waitForSelector('[data-testid="cfl-panel"]');
    check('CFL panel open in Expert', (await count(page, '[data-testid="cfl-panel"]')) === 1);
    await page.screenshot({ path: '/tmp/mode-2-cfl-panel.png' });
    await setModeTo(page, 'Standard');
    check('CFL panel hidden in Standard', (await count(page, '[data-testid="cfl-panel"]')) === 0);
    await setModeTo(page, 'Expert');
    await page.waitForTimeout(400);
    check('CFL panel re-shown on return to Expert', (await count(page, '[data-testid="cfl-panel"]')) === 1);

    console.log('5. System Variables panel: open in Expert, hide on drop, re-show on return');
    await page.click('[data-testid="menu-view"]');
    await page.waitForSelector('[data-testid="combo-system"]');
    const sysOpts = await page.$$eval('[data-testid="combo-system"] option',
      (els) => els.map((e) => (e as HTMLOptionElement).value).filter(Boolean));
    check('System combo has variables to pick', sysOpts.length > 0, `${sysOpts.length} options`);
    await page.selectOption('[data-testid="combo-system"]', sysOpts[0]);
    await page.waitForSelector('[data-testid="system-panel"]');
    check('System panel open in Expert', (await count(page, '[data-testid="system-panel"]')) === 1);
    await page.screenshot({ path: '/tmp/mode-3-system-panel.png' });
    await setModeTo(page, 'Standard');
    check('System panel hidden in Standard', (await count(page, '[data-testid="system-panel"]')) === 0);
    // Both panels are hidden together in Standard; confirm CFL still hidden too.
    check('CFL panel also hidden in Standard', (await count(page, '[data-testid="cfl-panel"]')) === 0);
    await setModeTo(page, 'Expert');
    await page.waitForTimeout(400);
    check('System panel re-shown on return to Expert', (await count(page, '[data-testid="system-panel"]')) === 1);
    check('CFL panel re-shown on return to Expert (both restore)',
      (await count(page, '[data-testid="cfl-panel"]')) === 1);

    // Close the panels so their overlays/positioning don't interfere below.
    await page.click('[data-testid="btn-cfl-close"]');
    await page.click('[data-testid="btn-sys-close"]');
    await page.waitForTimeout(300);
    check('panels closed cleanly', (await count(page, '[data-testid="cfl-panel"]')) === 0 &&
      (await count(page, '[data-testid="system-panel"]')) === 0);

    console.log('6. Calibrate dialog: open in Expert, drop to Standard WITH it open');
    await page.click('[data-testid="menu-project"]');
    await page.waitForSelector('[data-testid="btn-calibration"]');
    await page.click('[data-testid="btn-calibration"]');
    await page.waitForSelector('[data-testid="calibration-dialog"]');
    check('Calibrate dialog open in Expert', (await count(page, '[data-testid="calibration-dialog"]')) === 1);
    // Drop to Standard WITHOUT closing the dialog: the mode gate must hide it.
    await toggleModeThroughOverlay(page);
    check('dropped to Standard with Calibrate open', (await modeLabel(page)).includes('Standard'));
    check('Calibrate dialog hidden by mode gate (not manual close)',
      (await count(page, '[data-testid="calibration-dialog"]')) === 0);
    check('results still intact in Standard', await haveResults());
    check('selection still intact in Standard', await haveSelection());
    // Return to Expert: openDialog state persisted, so it reopens. Verify.
    await toggleModeThroughOverlay(page);
    check('back in Expert', (await modeLabel(page)).includes('Expert'));
    check('Calibrate dialog reopens on return to Expert (openDialog persisted)',
      (await count(page, '[data-testid="calibration-dialog"]')) === 1);
    await page.screenshot({ path: '/tmp/mode-4-calib-reopened.png' });
    // Clean close so openDialog is cleared before the next dialog.
    await clearOverlays(page);
    check('Calibrate closes on Escape', (await count(page, '[data-testid="calibration-dialog"]')) === 0);

    console.log('7. Phase dialog: same drop/restore cycle (proven independently of Calibrate)');
    await page.click('[data-testid="menu-project"]');
    await page.waitForSelector('[data-testid="btn-phase-space"]');
    await page.click('[data-testid="btn-phase-space"]');
    await page.waitForSelector('[data-testid="dialog-phase-space"]');
    check('Phase dialog open in Expert', (await count(page, '[data-testid="dialog-phase-space"]')) === 1);
    await toggleModeThroughOverlay(page);
    check('dropped to Standard with Phase open', (await modeLabel(page)).includes('Standard'));
    check('Phase dialog hidden by mode gate (not manual close)',
      (await count(page, '[data-testid="dialog-phase-space"]')) === 0);
    check('results still intact in Standard (phase cycle)', await haveResults());
    check('selection still intact in Standard (phase cycle)', await haveSelection());
    await toggleModeThroughOverlay(page);
    check('back in Expert (phase cycle)', (await modeLabel(page)).includes('Expert'));
    check('Phase dialog reopens on return to Expert (openDialog persisted)',
      (await count(page, '[data-testid="dialog-phase-space"]')) === 1);
    await page.screenshot({ path: '/tmp/mode-5-phase-reopened.png' });
    await clearOverlays(page);
    check('Phase closes on Escape', (await count(page, '[data-testid="dialog-phase-space"]')) === 0);

    console.log('8. Expert-only toolbar buttons restored, results & selection intact');
    await page.click('[data-testid="menu-project"]');
    await page.waitForSelector('[data-testid="btn-phase-space"]');
    check('Expert-only buttons restored (btn-phase-space)',
      (await count(page, '[data-testid="btn-phase-space"]')) === 1);
    check('results intact after all cycles', await haveResults());
    check('selection intact after all cycles', await haveSelection());

    console.log('9. mode persists across a full page reload (localStorage), run state does NOT');
    await clearOverlays(page);
    const stored = await page.evaluate(`localStorage.getItem('${MODE_KEY}')`);
    check('localStorage mode == expert before reload', stored === 'expert', String(stored));

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="btn-ui-mode"]');
    await page.waitForTimeout(800);
    check('mode toggle survives reload (still Expert)', (await modeLabel(page)).includes('Expert'));
    // Honest assertion: model/results/selection are plain React state, not
    // persisted, so they are gone after a reload. Do not pretend otherwise.
    check('results gone after reload (not persisted)',
      (await count(page, '[data-testid="engine-health-strip"]')) === 0);
    check('selection gone after reload (not persisted)',
      (await count(page, '[data-testid="property-editor-panel"]')) === 0);
    // But because the mode is Expert, the Expert-only toolbar buttons are back.
    await page.click('[data-testid="menu-project"]');
    await page.waitForSelector('[data-testid="btn-phase-space"]');
    check('Expert-only buttons present after reload (mode restored)',
      (await count(page, '[data-testid="btn-phase-space"]')) === 1);
    await page.screenshot({ path: '/tmp/mode-6-after-reload.png' });

    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exitCode = failed ? 1 : 0;
  } finally {
    await browser.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
