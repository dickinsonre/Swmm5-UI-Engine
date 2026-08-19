/**
 * E2E regression: the Batch Runner must NOT render cross-engine verdicts for a
 * cancelled batch whose second engine pass never finished. A "match"/"differs"
 * badge derived from a half-finished engine pass is a wrong answer, not a
 * cosmetic glitch — so this suite cancels a multi-engine batch mid-run and
 * asserts (a) the partial notice appears, (b) NO verdict summary or per-file
 * verdict badge renders, and (c) a positive control: a batch allowed to finish
 * DOES render verdicts.
 *
 * Run: npx tsx tests/e2e/batch-cancel-verdicts.ts
 *
 * Harness notes (hard-won, see .agents/memory/e2e-browser-testing.md):
 *  - playwright-core + the Nix system chromium (the downloaded shell lacks
 *    libglib-2.0.so.0 here).
 *  - btn-batch-runner lives under the Project menu tab (the default), but we
 *    click menu-project defensively before opening.
 *  - Two sibling browser suites may drive the same dev server concurrently, so
 *    timeouts are generous and we never assume the machine is idle.
 */
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5000';
let failed = 0;
const check = (n: string, ok: boolean, d?: string) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) failed++;
};

// A handful of models so engine pass #1 finishes while pass #2 is still in
// flight — that overlap is what makes the cancel point exist at all.
const SAMPLE_NAMES = ['Extran1.inp', 'Extran2.inp', 'Extran3.inp', 'Extran4.inp'];

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
    await page.waitForSelector('[data-testid="btn-batch-runner"]', { timeout: 30000 });

    console.log('1. open Batch Runner and load models + two WASM engines');
    // btn-batch-runner is menu-scoped under Project (the default tab); click
    // defensively so the locator can't time out with no clue why.
    await page.click('[data-testid="menu-project"]').catch(() => {});
    await page.click('[data-testid="btn-batch-runner"]');
    await page.waitForSelector('[data-testid="dialog-batch-runner"]');

    const buffers = SAMPLE_NAMES.map((name) => ({
      name,
      mimeType: 'text/plain',
      buffer: Buffer.from(readFileSync(`client/public/samples/${name}`, 'utf8')),
    }));
    await page.setInputFiles('input[type=file][accept=".inp"]', buffers);
    // Two engines so a cross-engine comparison is *possible* — the whole point
    // is that cancelling must suppress it.
    await page.waitForSelector('[data-testid="chk-batch-engine-wasm"]');
    await page.waitForSelector('[data-testid="chk-batch-engine-wasm6"]');
    await page.click('[data-testid="chk-batch-engine-wasm"]');
    await page.click('[data-testid="chk-batch-engine-wasm6"]');

    // ---------------------------------------------------------------------
    // POSITIVE CONTROL: a batch allowed to finish DOES render verdicts.
    // Without this, a test that simply never finds a badge would pass for the
    // wrong reason.
    // ---------------------------------------------------------------------
    console.log('2. positive control — run the whole batch to completion');
    await page.click('[data-testid="btn-batch-run"]');
    // Wait on an observable state TRANSITION, not on btn-batch-run (which was
    // already in the DOM at click time and could satisfy the wait immediately):
    // the run swaps Run→Cancel, so first confirm the run actually started, then
    // wait for the verdict summary to appear once every pass finishes.
    await page.waitForSelector('[data-testid="btn-batch-cancel"]', { timeout: 10000 });
    await page.waitForSelector('[data-testid="btn-batch-cancel"]', { state: 'detached', timeout: 120000 });
    await page.waitForSelector('[data-testid="text-batch-summary"]', { timeout: 15000 });
    await page.screenshot({ path: '/tmp/batch-cancel-completed.png' });

    const summaryVisible = await page.locator('[data-testid="text-batch-summary"]').count();
    const verdictBadges = await page.$$eval('[data-testid="dialog-batch-runner"] [class*="rounded"]', (els) =>
      els.filter((e) => /^(Match|Differs|Status mismatch|Inconclusive)$/.test((e.textContent || '').trim())).length,
    );
    const noPartial = await page.locator('[data-testid="text-batch-partial"]').count();
    check('completed batch shows verdict summary', summaryVisible === 1, `summary count=${summaryVisible}`);
    check('completed batch renders per-file verdict badges', verdictBadges >= 1, `${verdictBadges} badges`);
    check('completed batch shows no cancellation notice', noPartial === 0, `partial count=${noPartial}`);

    // ---------------------------------------------------------------------
    // NEGATIVE / REGRESSION CASE: cancel while engine pass #2 is in flight.
    // ---------------------------------------------------------------------
    console.log('3. run again and cancel while engine pass #2 is in flight');
    await page.click('[data-testid="btn-batch-run"]');
    await page.waitForSelector('[data-testid="btn-batch-cancel"]', { timeout: 10000 });

    // Deterministic cancel point. Status dots carry a title of "<label>:
    // <state>" (one dot per file per selected engine; unstarted files read
    // "pending"). We must cancel in the EXACT mid-flight window:
    //   - engine pass #1 (WASM 5.2.4): ALL files 'success' (pass fully done)
    //   - engine pass #2 (SWMM6 rel WASM): EXACTLY ONE file 'running', the
    //     remaining files still 'pending' (pass genuinely in progress).
    // A loose predicate (any success, or treating SWMM6 success/failed/cancelled
    // as "active") would let SWMM6 finish before the click under CI load — that
    // silently converts the scenario into a two-complete-pass run where verdicts
    // legitimately render, so the regression would stop being tested. Requiring
    // one running + the rest pending pins us to the intended window.
    // NB: keep this predicate free of nested named functions — tsx's transpile
    // injects a `__name` helper that does not exist in the browser context.
    const CANCEL_PREDICATE = `(() => {
        const dots = Array.from(document.querySelectorAll('[data-testid="dialog-batch-runner"] span[title]'));
        let wasm1Success = 0, wasm1Total = 0;
        let wasm6Running = 0, wasm6Pending = 0, wasm6Total = 0;
        for (const d of dots) {
          const t = d.getAttribute('title') || '';
          const m5 = t.match(/^WASM 5\\.2\\.4:\\s*(\\S+)/);
          if (m5) { wasm1Total++; if (m5[1] === 'success') wasm1Success++; }
          const m6 = t.match(/^SWMM6 rel WASM:\\s*(\\S+)/);
          if (m6) {
            wasm6Total++;
            if (m6[1] === 'running') wasm6Running++;
            else if (m6[1] === 'pending') wasm6Pending++;
          }
        }
        return wasm1Total === 4 && wasm1Success === 4 &&
               wasm6Total === 4 && wasm6Running === 1 && wasm6Pending === 3;
      })()`;
    await page.waitForFunction(CANCEL_PREDICATE, { timeout: 120000 });
    // Click Cancel FIRST — a screenshot before the click widens the window for
    // SWMM6 to finish. Capture evidence immediately after.
    await page.click('[data-testid="btn-batch-cancel"]');
    await page.screenshot({ path: '/tmp/batch-cancel-inflight.png' });

    console.log('4. wait for control to return and assert partial + suppressed verdicts');
    // Run→Cancel transition already happened; wait for it to swing back.
    await page.waitForSelector('[data-testid="btn-batch-cancel"]', { state: 'detached', timeout: 30000 });
    await page.waitForSelector('[data-testid="btn-batch-run"]', { timeout: 30000 });
    // A partial notice must exist — if it doesn't, the mid-flight window was
    // missed (both passes completed) and the regression was NOT exercised. Fail
    // loudly here rather than let later assertions pass vacuously.
    await page.waitForSelector('[data-testid="text-batch-partial"]', { timeout: 10000 }).catch(() => {});
    await page.screenshot({ path: '/tmp/batch-cancel-after.png' });

    const partialCount = await page.locator('[data-testid="text-batch-partial"]').count();
    if (partialCount === 0) {
      throw new Error(
        'PRECONDITION FAILED: no cancellation notice — the batch was not cancelled mid-flight, ' +
          'so the "verdicts suppressed for incomplete pass" regression was never tested. ' +
          'This is a harness/timing failure, NOT a pass.',
      );
    }
    const partialText = ((await page.locator('[data-testid="text-batch-partial"]').textContent()) || '').trim();
    console.log(`   partial notice: ${partialText}`);
    // Resilient match: don't demand the exact string, just its shape.
    check('partial notice mentions cancellation', /cancelled/i.test(partialText), partialText);
    check(
      'partial notice reports N of M engine passes',
      /showing\s+\d+\s+of\s+\d+\s+engine pass/i.test(partialText),
      partialText,
    );
    // HARD PRECONDITION of the regression case: the deterministic cancel window
    // (WASM done, SWMM6 one file running) must have yielded exactly one completed
    // engine pass out of two. If not, the scenario under test did not occur and
    // the whole suite fails loudly instead of asserting against the wrong state.
    const nOfM = partialText.match(/showing\s+(\d+)\s+of\s+(\d+)\s+engine pass/i);
    if (!nOfM || nOfM[1] !== '1' || nOfM[2] !== '2') {
      throw new Error(
        `PRECONDITION FAILED: expected exactly 1 of 2 engine passes complete at cancel time, got ` +
          `"${nOfM ? `${nOfM[1]} of ${nOfM[2]}` : partialText}". The mid-flight cancel window was not hit; ` +
          'the regression was not exercised.',
      );
    }
    check('exactly one of two engine passes completed (precondition)', true, `${nOfM[1]} of ${nOfM[2]}`);

    // The regression assertion: with only one completed engine pass there is
    // nothing to compare across engines, so NO verdict summary and NO per-file
    // verdict badge may render.
    const summaryAfter = await page.locator('[data-testid="text-batch-summary"]').count();
    const verdictBadgesAfter = await page.$$eval('[data-testid="dialog-batch-runner"] [class*="rounded"]', (els) =>
      els.filter((e) => /^(Match|Differs|Status mismatch|Inconclusive)$/.test((e.textContent || '').trim())).length,
    );
    check('cancelled batch hides the verdict summary', summaryAfter === 0, `summary count=${summaryAfter}`);
    check('cancelled batch renders no per-file verdict badge', verdictBadgesAfter === 0, `${verdictBadgesAfter} badges`);

    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exitCode = failed ? 1 : 0;
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
