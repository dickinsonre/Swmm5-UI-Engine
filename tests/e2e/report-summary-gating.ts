/**
 * E2E test: report-summary (rpt-only) results must not expose time-series tools.
 *
 * Stubs the local engine endpoints so the run returns ONLY a .rpt report
 * (no binary .out) → results carry fidelity 'report-summary' with zero
 * time steps. Verifies:
 *   - the amber "REPORT SUMMARY ONLY" banner is shown
 *   - the animation slider / Animate button are replaced by a "no time series" note
 *   - Graph, Table, Profile, Stats toolbar buttons do NOT open their dialogs
 *     (a toast explains why instead)
 *
 * Run: npx tsx tests/e2e/report-summary-gating.ts
 * Requires the app running on http://127.0.0.1:5000 (npm run dev).
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

const RPT = `
  EPA STORM WATER MANAGEMENT MODEL - VERSION 5.2 (Build 5.2.4)
  --------------------------------------------------------------

  *********************
  Analysis Options
  *********************
  Flow Units ............... LPS
  Report Time Step ......... 00:15:00

  **************************        Volume        Depth
  Runoff Quantity Continuity     hectare-m           mm
  **************************     ---------      -------
  Continuity Error (%) .....        -0.123

  **************************        Volume       Volume
  Flow Routing Continuity        hectare-m     10^6 ltr
  **************************     ---------    ---------
  Continuity Error (%) .....         0.456

  Analysis begun on:  Sun Aug  9 12:00:00 2026
`;

async function main() {
  const browser = await chromium.launch({
    executablePath: findChromium(),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.setDefaultTimeout(20000);

    // Stub the local engine: available, but run returns rpt-only (no .out).
    await page.route('**/api/swmm/status', r => r.fulfill({ json: { found: true } }));
    await page.route('**/api/swmm/run-or-proxy', r => r.fulfill({ json: { status: 'success', reportContent: RPT } }));

    console.log('1. Load app');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="btn-run"]');

    console.log('2. Wait for Local engine');
    const engineBtn = page.locator('[data-testid="btn-engine-toggle"]');
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="btn-engine-toggle"]')?.textContent?.includes('Local'));
    check('engine is Local', (await engineBtn.innerText()).includes('Local'));

    console.log('3. Run simulation (rpt-only result)');
    await page.click('[data-testid="btn-run"]');
    await page.waitForSelector('[data-testid="banner-report-summary"]');
    check('report-summary banner shown', true);
    const bannerText = await page.locator('[data-testid="banner-report-summary"]').innerText();
    check('banner has required message', bannerText.includes('Summary values from SWMM report; binary time-series results were unavailable.'));

    // A run auto-opens the SWMM Report dialog — close it first.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[data-component-name="DialogOverlay"]'));

    console.log('4. Animation controls gated (View menu row)');
    await page.click('[data-testid="menu-view"]');
    check('no time slider', (await page.locator('[data-testid="time-slider"]').count()) === 0);
    check('no Animate button', (await page.locator('[data-testid="btn-animate"]').count()) === 0);
    check('"no time series" note shown', (await page.locator('[data-testid="text-no-timeseries"]').count()) === 1);
    await page.click('[data-testid="menu-project"]');

    console.log('5. Time-series tools blocked');
    const blocked: Array<[string, string]> = [
      ['btn-graph', 'time-series-dialog'],
      ['btn-table-view', 'table-view-dialog'],
      ['btn-statistics', 'statistics-report-dialog'],
    ];
    for (const [btn, dialog] of blocked) {
      await page.click(`[data-testid="${btn}"]`);
      await page.waitForTimeout(600);
      check(`${btn} does not open ${dialog}`, (await page.locator(`[data-testid="${dialog}"]`).count()) === 0);
      await page.keyboard.press('Escape');
    }
    // Profile dialog has no stable testid; assert its title never appears.
    await page.click('[data-testid="btn-profile-plot"]');
    await page.waitForTimeout(600);
    check('btn-profile-plot does not open Profile Plot', (await page.getByText('Select conduits to define a longitudinal path').count()) === 0);

    console.log('6. Diagram Gallery Group B gated');
    await page.click('[data-testid="btn-diagram-gallery"]');
    await page.waitForSelector('[data-testid="dialog-diagram-gallery"]');
    const notices = await page.locator('[data-testid="gallery-report-summary-notice"]').count();
    check('gallery time-series cards show unavailable notice (6 cards)', notices === 6, `got ${notices}`);
    // No hydrograph polyline should render inside the System Hydrograph card
    check('D9 hydrograph not rendered', (await page.locator('[data-testid="card-d9"] svg').count()) === 0);
    await page.click('[data-testid="btn-close-diagram-gallery"]');

    console.log('7. Explanatory toast appears');
    check('unavailable toast shown', (await page.getByText('Unavailable').count()) > 0);

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exitCode = failed > 0 ? 1 : 0;
  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
