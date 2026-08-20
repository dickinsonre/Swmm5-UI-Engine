/**
 * Regression: a rain gage that reads from an EXTERNAL data file actually gets
 * that file at run time.
 *
 * Desktop SWMM resolves `FILE rain.dat` relative to the folder holding the
 * .inp, so users think of the data file as part of the model. A browser never
 * sees that folder: for a long time only model.inp reached the engine, so a
 * FILE gage produced a silently DRY model — no error, just a run with no
 * rainfall, which is the worst possible failure mode for a hydrologist.
 *
 * Attachments are now placed beside the model for every engine. Unit tests
 * cover the resolver with a fake filesystem; only a real browser run proves
 * the bytes reach the real engine and change the answer.
 *
 *   1. model WITHOUT its data file  -> health warns, run produces zero runoff
 *   2. model WITH the data file     -> warning clears, run produces runoff
 *   3. opening another model        -> the attachment does not leak into it
 *
 * Case 1 is what makes case 2 meaningful: it proves the runoff in case 2 comes
 * from the attached file and not from anything else in the model.
 *
 * Run: npx tsx tests/e2e/external-data-files.ts
 */
import { chromium, type Page } from 'playwright-core';
import { execSync } from 'child_process';
import { resolve } from 'path';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5000';
const MODEL = resolve('tests/fixtures/filegage.inp');
const DATA = resolve('tests/fixtures/rain.dat');
const OTHER_MODEL = resolve('tests/fixtures/batch-simple.inp');

let failed = 0;
const check = (n: string, ok: boolean, d?: string) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) failed++;
};

function chromiumPath(): string {
  // The bundled headless shell is missing glibs in this image; the Nix
  // chromium is the one that actually launches.
  return execSync('which chromium || which chromium-browser', { encoding: 'utf-8' }).trim();
}

/**
 * Dismiss every open modal. A run opens its own report dialog, and the Radix
 * overlay keeps swallowing clicks for one close animation after its content
 * unmounts, so waiting on a single dialog is not enough.
 */
async function closeAnyDialog(page: Page): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const overlays = await page.locator('[data-component-name="DialogOverlay"]').count();
    if (overlays === 0) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
  throw new Error('a modal refused to close');
}

/** Open File > Data Files and wait for the dialog. */
async function openDataFiles(page: Page): Promise<void> {
  await closeAnyDialog(page);
  await page.click('[data-testid="menu-file"]');
  await page.click('[data-testid="btn-data-files"]');
  await page.waitForSelector('[data-testid="dialog-data-files"]', { timeout: 10_000 });
}

/** Load files through the hidden multi-file input the app already uses. */
async function openFiles(page: Page, files: string[]): Promise<void> {
  await closeAnyDialog(page);
  await page.setInputFiles('[data-testid="file-input"]', files);
  await page.waitForTimeout(1200);
}

/**
 * The report the user would open after a run. Read from the real report dialog,
 * not from app state: the whole point of the feature is that the ENGINE saw
 * the rainfall.
 */
async function reportText(page: Page): Promise<string> {
  // A failed run already opens the report; a successful one has to be asked for.
  if (await page.locator('[data-testid="report-content"]').count() === 0) {
    await closeAnyDialog(page);
    await page.click('[data-testid="btn-report"]');
    const appeared = await page
      .waitForSelector('[data-testid="report-content"]', { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!appeared) return '';
  }
  const text = await page.textContent('[data-testid="report-content"]') || '';
  await closeAnyDialog(page);
  return text;
}

/** Total precipitation in the run's depth units, or null if the run has none. */
function totalPrecip(report: string): number | null {
  // "Total Precipitation ......   0.937   2.250" — volume then depth.
  const m = report.match(/Total Precipitation\s*\.*\s*([\d.]+)\s+([\d.]+)/);
  return m ? parseFloat(m[2]) : null;
}

/**
 * Run the model and wait for the engine to finish.
 *
 * The server engine rate-limits repeated runs, so each run waits out the
 * cooldown first rather than silently measuring a rejected run.
 */
async function runModel(page: Page): Promise<void> {
  await closeAnyDialog(page);
  await page.waitForTimeout(12_000); // server-side per-IP run cooldown
  await page.click('[data-testid="menu-project"]').catch(() => {});
  const before = await page.locator('[data-testid="report-content"]').count();
  await page.click('[data-testid="btn-run"]');
  // Waiting only for the progress text to be ABSENT would pass instantly,
  // before the run even starts. Wait for it to appear first.
  await page.waitForFunction(
    (b) => /Sending model|Running SWMM|Writing model|Parsing simulation/i.test(document.body.innerText)
      || document.querySelectorAll('[data-testid="report-content"]').length !== b,
    before,
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    () => !/Sending model|Running SWMM|Writing model|Parsing simulation/i.test(document.body.innerText),
    { timeout: 120_000 },
  );
  await page.waitForTimeout(1500);
}

async function main() {
  const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('dialog', d => d.accept());

  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="swmm-ui-root"]', { timeout: 30_000 });
    await page.waitForTimeout(2500);

    console.log('\n1. Model without its data file');
    await openFiles(page, [MODEL]);

    // The Data Files dialog is the surface that tells the user what is missing.
    await openDataFiles(page);
    const missingShown = await page.isVisible('[data-testid="data-file-missing-RG1"]');
    check('data file is listed as not attached', missingShown);
    const rowText = await page.textContent('[data-testid="data-file-row-RG1"]');
    check('the row names the file the .inp asks for', !!rowText && rowText.includes('rain.dat'), rowText?.trim());
    await closeAnyDialog(page);

    await runModel(page);
    const dryReport = await reportText(page);
    // This is the user-visible symptom the feature exists to remove, and it is
    // what makes the success case below meaningful.
    check('the engine reports it cannot open the rainfall file',
      /cannot open rainfall data file/i.test(dryReport), dryReport.slice(0, 120));
    check('no precipitation is reported', totalPrecip(dryReport) === null, String(totalPrecip(dryReport)));

    console.log('\n2. Same model with the data file attached');
    await openFiles(page, [MODEL, DATA]);
    await openDataFiles(page);
    const attachedShown = await page.isVisible('[data-testid="data-file-attached-RG1"]');
    check('data file is listed as attached', attachedShown);
    await closeAnyDialog(page);

    await runModel(page);
    const wetReport = await reportText(page);
    check('the rainfall file opens now', !/cannot open rainfall data file/i.test(wetReport));
    const wetPrecip = totalPrecip(wetReport);
    check('the engine actually read the attached rainfall', wetPrecip !== null && wetPrecip > 0, String(wetPrecip));
    // rain.dat totals 0.50 + 1.00 + 0.75 in; anything else means the engine read
    // something other than the file we attached.
    check('the depth matches the attached file exactly', wetPrecip === 2.25, String(wetPrecip));

    console.log('\n3. Attachments do not leak into the next model');
    await openFiles(page, [OTHER_MODEL]);
    await openFiles(page, [MODEL]);
    await openDataFiles(page);
    const clearedAfterSwitch = await page.isVisible('[data-testid="data-file-missing-RG1"]');
    check('reopening the model does not silently reuse the old attachment', clearedAfterSwitch);
    await closeAnyDialog(page);
  } finally {
    await browser.close();
  }

  console.log(`\n${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
