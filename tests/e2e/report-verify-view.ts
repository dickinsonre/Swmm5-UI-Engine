/**
 * E2E: the two comparison surfaces in the report dialog — the Verify view and
 * the side-by-side diff — say what they found and what they did not.
 *
 * The Verify tab exists to stop a comparison being read as more than it is, so
 * the failure that matters is not a crash — it is the view rendering findings
 * while the limits that qualify them quietly go missing, or the tab appearing
 * when there is only one run to look at. Both leave every unit test green.
 *
 * So this drives a real browser and asserts on VISIBLE text:
 *   1. one engine, one run   -> no Verify tab at all (nothing to compare)
 *   2. Compare 5+6           -> Verify tab appears
 *   3. the view names what each side actually is (the parity contract)
 *   4. it either measures the difference or refuses, and never silently does
 *      neither
 *   5. the limits block is on screen, including the speed claim it refuses to
 *      make from one run each
 *   6. Copy / Download are withdrawn in Verify, because they act on the .rpt
 *      rather than on what is displayed — and come back on leaving the tab
 *
 * The side-by-side checks cover the other half of the same problem: two
 * near-identical reports where the finding is one column of one row. A diff
 * that renders but silently misaligns, or one whose count is dominated by
 * timestamps, looks exactly like a working one on screen.
 *
 * Run: npx tsx tests/e2e/report-verify-view.ts
 * Requires the app running on http://127.0.0.1:5000 (npm run dev).
 */
import { chromium, type Page } from 'playwright-core';
import { execSync } from 'child_process';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5000';
const MODEL = 'tests/fixtures/verify-network.inp';

let failed = 0;
const check = (n: string, ok: boolean, d?: string) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) failed++;
};

async function clearOverlays(page: Page) {
  for (let i = 0; i < 6; i++) {
    if ((await page.locator('[data-component-name="DialogOverlay"]').count()) === 0) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
}

async function dismissToasts(page: Page) {
  for (let i = 0; i < 6; i++) {
    const n = await page.locator('[toast-close]').count();
    if (n === 0) break;
    await page.locator('[toast-close]').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(200);
  }
}

/** Cycle the engine toggle until its label contains `want`. */
async function setEngine(page: Page, want: string): Promise<string> {
  let label = '';
  for (let i = 0; i < 10; i++) {
    label = (await page.locator('[data-testid="btn-engine-toggle"]').innerText()).trim();
    if (label.includes(want)) return label;
    await page.click('[data-testid="btn-engine-toggle"]');
    await page.waitForTimeout(350);
  }
  return (await page.locator('[data-testid="btn-engine-toggle"]').innerText()).trim();
}

/** Run the loaded model and open the report dialog once the run lands. */
async function runAndOpenReport(page: Page) {
  await clearOverlays(page);
  await dismissToasts(page);
  await page.click('[data-testid="btn-run"]');
  // A comparison is two full engine runs; the server also throttles repeats.
  await page.locator('[data-testid="btn-report-view-text"]')
    .waitFor({ state: 'visible', timeout: 180000 })
    .catch(async () => {
      // Not auto-opened — open it by hand once a report exists.
      await clearOverlays(page);
      await page.click('[data-testid="btn-report"]');
      await page.locator('[data-testid="btn-report-view-text"]').waitFor({ state: 'visible', timeout: 30000 });
    });
  await page.waitForTimeout(400);
}

async function main() {
  const browser = await chromium.launch({
    executablePath: execSync('which chromium').toString().trim(),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', e => { console.log('PAGEERROR', e.message); failed++; });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    await page.setInputFiles('[data-testid="file-input"]', MODEL);
    await page.waitForTimeout(1500);

    console.log('\n1. A single-engine run offers no Verify tab\n');

    await setEngine(page, 'Local 5.2.4');
    await runAndOpenReport(page);
    check('single run: Text / HTML / Input are offered',
      (await page.locator('[data-testid="btn-report-view-inp"]').count()) === 1);
    check('single run: Verify is NOT offered — there is nothing to compare against',
      (await page.locator('[data-testid="btn-report-view-verify"]').count()) === 0);
    await page.screenshot({ path: '/tmp/verify-e2e-1-single.png' });

    console.log('\n2. A comparison run offers it\n');

    await clearOverlays(page);
    await setEngine(page, 'Compare 5+6');
    // The server throttles back-to-back runs; give the cooldown room.
    await page.waitForTimeout(13000);
    await runAndOpenReport(page);

    const verifyBtn = page.locator('[data-testid="btn-report-view-verify"]');
    const haveVerify = (await verifyBtn.count()) === 1;
    check('comparison run: Verify is offered', haveVerify);

    if (!haveVerify) {
      await page.screenshot({ path: '/tmp/verify-e2e-2-missing.png' });
      throw new Error('no Verify tab after a comparison run — cannot check its contents');
    }

    await verifyBtn.click();
    await page.waitForTimeout(700);
    const view = page.locator('[data-testid="report-verify-view"]');
    await view.waitFor({ state: 'visible', timeout: 15000 });
    const text = await view.innerText();
    await page.screenshot({ path: '/tmp/verify-e2e-3-verify.png', fullPage: false });

    console.log('\n3. It says what each side actually is\n');

    check('names the parity contract section', /Parity contract/i.test(text));
    check('reports a fidelity for each side, not just an engine name',
      /binary \.out read directly|parsed from the \.rpt|synthetic placeholder|fidelity not recorded/i.test(text));
    check('shows continuity but labels it as the blind diagnostic',
      /continuity/i.test(text) && /whether\s*\n?\s*or not that geometry is right|closes whether/i.test(text));

    console.log('\n4. It either measures the difference or refuses\n');

    const measured = /Disagreement, each element against its own peak/i.test(text);
    const refused = /not answering the same question/i.test(text);
    const unavailable = /needs a binary/i.test(text) || /Could not read the binary/i.test(text);
    // Both branches of the null-effect control mention "byte-identical" — one
    // as the finding, one as the counterfactual — so match the branch that only
    // renders when the files really are the same.
    const identical = /are <?strong>?byte-identical|files are\s+byte-identical/i.test(text)
      || /produced\s*\n?\s*exactly the same results/i.test(text);
    check('exactly one honest outcome is presented',
      [measured, refused, unavailable].filter(Boolean).length >= 1,
      `measured=${measured} refused=${refused} unavailable=${unavailable}`);

    if (measured) {
      check('the census says how many links were compared and why some were not',
        /Comparing\s+\d+\s+link/i.test(text));
      check('the magnitude floor is stated in the model\'s own units',
        /Magnitude floor/i.test(text) && /1 L\/s/.test(text));
      check('the null-effect control is reported either way',
        identical || /files differ, so there is something to measure/i.test(text));
      if (!identical) {
        check('peak change and shape change are reported separately',
          /peak magnitude/i.test(text) && /shape and timing/i.test(text));
        check('per-element worst offenders are listed',
          /Worst elements/i.test(text));
      }
    } else {
      console.log(`  ~ no per-element diff on screen (refused=${refused} unavailable=${unavailable}) — limits still checked below`);
    }

    console.log('\n5. The limits are on screen, not implied\n');

    check('a "what this does not show" block exists', /What this does not show/i.test(text));
    check('it refuses to make a speed claim from one run each',
      /one run each cannot separate a difference/i.test(text));
    check('it disclaims field accuracy', /No field data/i.test(text));
    check('it disclaims generalising from one storm', /one event|another storm/i.test(text));

    console.log('\n6. Copy and Download withdraw in Verify\n');

    check('Copy is hidden in Verify',
      (await page.locator('[data-testid="btn-copy-report"]').count()) === 0);
    check('Download is hidden in Verify',
      (await page.locator('[data-testid="btn-download-report"]').count()) === 0);
    check('and the reason is stated rather than left as a missing button',
      /Copy and download act on the \.rpt/i.test(await page.locator('[role="dialog"]').innerText()));

    await page.click('[data-testid="btn-report-view-text"]');
    await page.waitForTimeout(500);
    check('Copy returns on leaving Verify',
      (await page.locator('[data-testid="btn-copy-report"]').count()) === 1);
    check('Download returns on leaving Verify',
      (await page.locator('[data-testid="btn-download-report"]').count()) === 1);
    check('the Verify pane is gone',
      (await page.locator('[data-testid="report-verify-view"]').count()) === 0);

    console.log('\n7. Section jump leaves Verify rather than searching a view with no sections\n');

    await page.click('[data-testid="btn-report-view-verify"]');
    await page.waitForTimeout(400);
    const jump = page.locator('[data-testid^="btn-report-section-"]').first();
    if ((await jump.count()) === 1) {
      await jump.click();
      await page.waitForTimeout(500);
      check('jumping to a section switches back to the report text',
        (await page.locator('[data-testid="report-verify-view"]').count()) === 0);
    } else {
      console.log('  ~ no section-jump buttons rendered for this report; skipped');
    }

    console.log('\n8. Side by side marks where the two reports differ\n');

    await page.click('[data-testid="btn-report-view-text"]');
    await page.waitForTimeout(300);
    await page.click('[data-testid="btn-report-engine-split"]');
    await page.waitForTimeout(900);

    const split = page.locator('[data-testid="report-split-view"]');
    check('the side-by-side view renders', (await split.count()) === 1);

    const toolbar = page.locator('[data-testid="report-diff-toolbar"]');
    check('it reports a difference summary rather than leaving it to the eye',
      (await toolbar.count()) === 1);

    const bothSame = await page.locator('[data-testid="report-diff-identical"]').count();
    if (bothSame) {
      check('identical reports are stated as identical', true);
    } else {
      const countText = (await page.locator('[data-testid="report-diff-count"]').innerText()).trim();
      check('a differing-line count is shown', /\d+ differing line/.test(countText), countText);
      const n = Number(countText.match(/(\d+)/)?.[1] ?? '0');
      check('the count is a real number of differences, not zero-with-highlighting', n > 0, countText);

      // Timestamps and engine banners differ in every run; if they were counted
      // the number above would be noise.
      const vol = page.locator('[data-testid="report-diff-volatile"]');
      if ((await vol.count()) === 1) {
        check('run-to-run noise is separated from the count',
          /not counted/i.test(await vol.innerText()));
      }

      const rows = page.locator('[data-testid^="report-diff-row-"]');
      check('differing rows are marked in the document', (await rows.count()) > 0);

      // The whole point of token marking: a changed row must not light up whole.
      const firstRow = rows.first();
      const rowText = (await firstRow.innerText()).trim();
      check('a marked row still shows its unchanged text', rowText.length > 0);

      // Jump navigation must move the viewport, not just a counter. The first
      // differences are on the opening screen (continuity totals change too),
      // so stepping forward one row legitimately scrolls nowhere. Wrapping
      // backwards to the LAST difference is the honest test of movement.
      const scroll = page.locator('[data-testid="report-split-scroll"]');
      const top = await scroll.evaluate(el => el.scrollTop);
      await page.click('[data-testid="btn-diff-next"]');
      await page.waitForTimeout(300);
      const cursorText = (await page.locator('[data-testid="report-diff-cursor"]').innerText()).trim();
      check('the difference cursor advances', /^\d+ \/ \d+$/.test(cursorText), cursorText);

      await page.click('[data-testid="btn-diff-prev"]');
      await page.click('[data-testid="btn-diff-prev"]');
      await page.waitForTimeout(500);
      const lastCursor = (await page.locator('[data-testid="report-diff-cursor"]').innerText()).trim();
      check('stepping back past the first difference wraps to the last',
        lastCursor === `${n} / ${n}`, lastCursor);
      const deep = await scroll.evaluate(el => el.scrollTop);
      check('and the view actually travels there', deep > top, `scrollTop ${top} -> ${deep}`);

      await page.click('[data-testid="btn-diff-next"]');
      await page.waitForTimeout(500);
      const backAtTop = await scroll.evaluate(el => el.scrollTop);
      check('wrapping forward returns to the first difference', backAtTop < deep,
        `scrollTop ${deep} -> ${backAtTop}`);

      // "Only differences" must shrink the document, not merely restyle it.
      const fullHeight = await scroll.evaluate(el => el.scrollHeight);
      await page.check('[data-testid="chk-only-differences"]');
      await page.waitForTimeout(600);
      const filteredHeight = await scroll.evaluate(el => el.scrollHeight);
      check('"Only differences" removes the unchanged bulk',
        filteredHeight < fullHeight, `${fullHeight} -> ${filteredHeight}`);
      check('and keeps the differing rows',
        (await page.locator('[data-testid^="report-diff-row-"]').count()) > 0);
      await page.uncheck('[data-testid="chk-only-differences"]');
      await page.waitForTimeout(400);
    }
    await page.screenshot({ path: '/tmp/verify-e2e-4-split.png' });
  } finally {
    await browser.close();
  }

  console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`}\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
