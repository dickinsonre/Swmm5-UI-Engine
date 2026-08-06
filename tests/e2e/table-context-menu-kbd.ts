/**
 * E2E test: Table View dialog right-click context menu keyboard navigation.
 *
 * Flow: load app (sample model auto-loads) → run Mock simulation → open
 * Table View → select first node → right-click the results table → verify:
 *   - menu has role="menu" (data-testid="table-context-menu")
 *   - first menu item is focused on open
 *   - ArrowDown / ArrowUp / Home / End move focus
 *   - Enter activates the focused item
 *   - Escape closes the menu
 *
 * Run: npx tsx tests/e2e/table-context-menu-kbd.ts
 * Requires the app running on http://127.0.0.1:5000 (npm run dev).
 * Uses system chromium (CHROMIUM_PATH or `which chromium`) via playwright-core.
 */
import { chromium } from 'playwright-core';
import { execSync } from 'child_process';

const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5000';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

function findChromium(): string {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  return execSync('which chromium').toString().trim();
}

async function main() {
  const browser = await chromium.launch({
    executablePath: findChromium(),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.setDefaultTimeout(20000);

    console.log('1. Load app (sample model auto-loads)');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="btn-run"]');

    console.log('2. Ensure Mock engine');
    const engineBtn = page.locator('[data-testid="btn-engine-toggle"]');
    for (let i = 0; i < 5 && !(await engineBtn.innerText()).includes('Mock'); i++) {
      await engineBtn.click();
    }
    check('engine set to Mock', (await engineBtn.innerText()).includes('Mock'));

    console.log('3. Run Mock simulation');
    await page.click('[data-testid="btn-run"]');
    await page.waitForSelector('[data-testid="btn-mock-confirm"]');
    await page.click('[data-testid="btn-mock-confirm"]');
    // Wait for results: Table View button becomes meaningful once results exist;
    // simplest robust signal is the simulation-complete state — poll by opening Table View.
    await page.waitForTimeout(1500);

    console.log('4. Open Table View dialog');
    await page.click('[data-testid="btn-table-view"]');
    await page.waitForSelector('[data-testid="table-view-dialog"]');
    // If the "no results" variant rendered, wait and retry once.
    if (!(await page.locator('[data-testid="select-table-category"]').count())) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(3000);
      await page.click('[data-testid="btn-table-view"]');
      await page.waitForSelector('[data-testid="select-table-category"]');
    }
    check('Table View dialog open with results', true);

    console.log('5. Select first object');
    await page.click('[data-testid="select-table-object"]');
    await page.click('[role="option"]');
    await page.waitForSelector('[data-testid="table-view-dialog"] table tbody tr');

    const activeTestId = () =>
      page.evaluate(() => document.activeElement?.getAttribute('data-testid') || null);

    // The app's animation timer re-renders table rows, so a positional
    // right-click can hit a detached node; dispatch contextmenu directly.
    const rightClickTable = () =>
      page.dispatchEvent('[data-testid="table-view-dialog"] table', 'contextmenu', undefined, { timeout: 20000 });

    console.log('6. Right-click table → menu opens, first item focused');
    await rightClickTable();
    const menu = page.locator('[data-testid="table-context-menu"]');
    await menu.waitFor();
    check('menu has role="menu"', (await menu.getAttribute('role')) === 'menu');
    check('first item focused on open', (await activeTestId()) === 'ctx-sort-ascending',
      `active=${await activeTestId()}`);

    console.log('7. Arrow / Home / End navigation');
    await page.keyboard.press('ArrowDown');
    check('ArrowDown → second item', (await activeTestId()) === 'ctx-sort-descending', `active=${await activeTestId()}`);
    await page.keyboard.press('ArrowUp');
    check('ArrowUp → back to first item', (await activeTestId()) === 'ctx-sort-ascending', `active=${await activeTestId()}`);
    await page.keyboard.press('ArrowUp');
    check('ArrowUp on first wraps to last (Refresh)', (await activeTestId()) === 'ctx-refresh', `active=${await activeTestId()}`);
    await page.keyboard.press('Home');
    check('Home → first item', (await activeTestId()) === 'ctx-sort-ascending', `active=${await activeTestId()}`);
    await page.keyboard.press('End');
    check('End → last item (Refresh)', (await activeTestId()) === 'ctx-refresh', `active=${await activeTestId()}`);

    console.log('8. Escape closes menu');
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'detached' });
    check('Escape closes menu', (await menu.count()) === 0);

    console.log('9. Enter activates focused item (Data Statistics overlay)');
    await rightClickTable();
    await menu.waitFor();
    // Navigate to "Data Statistics..." (second-to-last item): End then ArrowUp.
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowUp');
    check('focused on Data Statistics', (await activeTestId()) === 'ctx-data-statistics---', `active=${await activeTestId()}`);
    await page.keyboard.press('Enter');
    await menu.waitFor({ state: 'detached' });
    check('Enter closes menu', (await menu.count()) === 0);
    const statsVisible = await page
      .locator('[data-testid="table-view-dialog"]')
      .innerText()
      .then(t => /statistic/i.test(t) && /mean/i.test(t));
    check('Enter activated item (statistics overlay shown)', statsVisible);
  } finally {
    await browser.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error('E2E error:', e); process.exit(1); });
