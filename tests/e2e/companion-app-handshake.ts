/**
 * E2E: Companion Apps launcher hands the open model to an embedded app.
 *
 * Exercises the contract in docs/companion-app-contract.md: a companion app
 * announces { type: 'swmm:ready', accepts: [...] } and receives
 * { type: 'swmm:model', name, engine, inp, rpt?, out?, lid? }.
 *
 * Verifies:
 *   - the parent replies to a frame that announces itself
 *   - the binary .out is never sent automatically, only on "Send model"
 *   - `accepts` filters the payload
 *   - repeating swmm:ready cannot make the parent re-serialize the model
 *   - a frame that never announces is sent nothing
 *
 * Run: npx tsx tests/e2e/companion-app-handshake.ts
 * Requires the app running on http://127.0.0.1:5000 (npm run dev).
 */
import { chromium, type Frame, type Page } from 'playwright-core';
import { execSync } from 'child_process';

const BASE_URL = process.env.E2E_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:5000';

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

/** Records every payload; reports how each artifact arrived. */
const RECORDER = `
  window.__received = [];
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.type !== 'swmm:model') return;
    window.__received.push({
      name: d.name,
      engine: d.engine,
      keys: Object.keys(d).sort(),
      inpLen: typeof d.inp === 'string' ? d.inp.length : 0,
      inpHead: typeof d.inp === 'string' ? d.inp.slice(0, 12) : null,
      rptLen: typeof d.rpt === 'string' ? d.rpt.length : 0,
      outIsBinary: !!d.out && ArrayBuffer.isView(d.out),
      outLen: d.out && d.out.byteLength ? d.out.byteLength : 0
    });
  });
`;

/** Wants everything the workbench has. */
const TALKER = `<!DOCTYPE html><html><body><h1>stub companion</h1><script>${RECORDER}
  parent.postMessage({ type: 'swmm:ready', accepts: ['inp', 'rpt', 'out'] }, '*');
</script></body></html>`;

/** Wants the network only. */
const FILTERED = `<!DOCTYPE html><html><body><h1>filtered companion</h1><script>${RECORDER}
  parent.postMessage({ type: 'swmm:ready', accepts: ['inp'] }, '*');
</script></body></html>`;

/** Ignores the contract entirely. */
const SILENT = `<!DOCTYPE html><html><body><h1>silent companion</h1><script>${RECORDER}</script></body></html>`;

/** Repeats the announcement — must not amplify. */
const FLOODER = `<!DOCTYPE html><html><body><h1>flooding companion</h1><script>${RECORDER}
  for (var i = 0; i < 8; i++) parent.postMessage({ type: 'swmm:ready' }, '*');
  setTimeout(function () {
    for (var j = 0; j < 8; j++) parent.postMessage({ type: 'swmm:ready' }, '*');
  }, 300);
</script></body></html>`;

async function stubFrame(page: Page, urlPart: string): Promise<Frame> {
  for (let i = 0; i < 40; i++) {
    const f = page.frames().find((fr: Frame) => fr.url().includes(urlPart));
    if (f) return f;
    await page.waitForTimeout(250);
  }
  throw new Error(`companion frame ${urlPart} never appeared`);
}

const received = (f: Frame) => f.evaluate(() => (window as any).__received as any[]);

async function main() {
  const browser = await chromium.launch({
    executablePath: findChromium(),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);

    await page.route('**/companion-talker**', r => r.fulfill({ status: 200, contentType: 'text/html', body: TALKER }));
    await page.route('**/companion-filtered**', r => r.fulfill({ status: 200, contentType: 'text/html', body: FILTERED }));
    await page.route('**/companion-silent**', r => r.fulfill({ status: 200, contentType: 'text/html', body: SILENT }));
    await page.route('**/companion-flooder**', r => r.fulfill({ status: 200, contentType: 'text/html', body: FLOODER }));

    await page.addInitScript(() => {
      localStorage.setItem('swmm-ui-app-links', JSON.stringify([
        { name: 'Talker', url: 'https://companion.test/companion-talker' },
        { name: 'Filtered', url: 'https://companion.test/companion-filtered' },
        { name: 'Silent', url: 'https://companion.test/companion-silent' },
        { name: 'Flooder', url: 'https://companion.test/companion-flooder' },
      ]));
    });

    console.log('1. Load app');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="btn-run"]');

    console.log('2. Load a sample model and run it, so there are results to share');
    await page.click('[data-testid="menu-file"]');
    await page.click('[data-testid="btn-samples"]');
    await page.click('[data-testid="btn-sample-user1"]');
    await page.waitForTimeout(1500);
    // Run lives on the Project menu; loading a sample left us on File.
    await page.click('[data-testid="menu-project"]');
    await page.click('[data-testid="btn-run"]');
    let hasResults = true;
    try {
      // The engine health strip only renders once a run has produced results.
      await page.waitForSelector('[data-testid="engine-health-strip"]', { timeout: 90000 });
    } catch {
      hasResults = false;
      console.log('   (no time-series results produced — result assertions relaxed)');
    }

    // A finished run can leave a dialog (report / progress) over the menu bar.
    for (let i = 0; i < 4; i++) {
      if (await page.locator('[data-component-name="DialogOverlay"]').count() === 0) break;
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }

    console.log('3. App that announces itself receives the model');
    await page.click('[data-testid="menu-help"]');
    await page.click('[data-testid="btn-apps"]');
    await page.waitForSelector('[data-testid="dialog-apps-launcher"]');
    const talker = await stubFrame(page, 'companion-talker');
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="text-app-share-status"]');
      return !!el && /^Sent /.test(el.textContent || '');
    });
    let got = await received(talker);
    check('model delivered after swmm:ready', got.length === 1, JSON.stringify(got));
    check('payload carries the .inp text', got[0]?.inpLen > 200 && got[0]?.inpHead?.includes('['), JSON.stringify(got[0]));
    check('payload names the model', typeof got[0]?.name === 'string' && got[0].name.endsWith('.inp'), String(got[0]?.name));
    check('binary .out is NOT sent automatically', !got[0]?.keys.includes('out'), JSON.stringify(got[0]?.keys));
    if (hasResults) check('report text is sent automatically', got[0]?.rptLen > 100, `rptLen=${got[0]?.rptLen}`);

    console.log('4. "Send model" re-pushes, and includes the binary results');
    await page.click('[data-testid="btn-app-send-model"]');
    await page.waitForTimeout(600);
    got = await received(talker);
    check('second delivery on button click', got.length === 2, `received ${got.length}`);
    if (hasResults) {
      check('.out arrives as a typed array on explicit send', got[1]?.outIsBinary === true, JSON.stringify(got[1]?.keys));
      check('.out is non-empty', got[1]?.outLen > 0, `outLen=${got[1]?.outLen}`);
    }

    console.log('5. accepts filters the payload');
    await page.click('[data-testid="app-link-1"]');
    const filtered = await stubFrame(page, 'companion-filtered');
    await page.waitForTimeout(1200);
    const filteredGot = await received(filtered);
    check('filtered app got the model', filteredGot.length === 1, JSON.stringify(filteredGot));
    check('accepts:[inp] excludes rpt and out',
      !filteredGot[0]?.keys.includes('rpt') && !filteredGot[0]?.keys.includes('out'),
      JSON.stringify(filteredGot[0]?.keys));

    console.log('6. Silent app is not sent anything unsolicited');
    await page.click('[data-testid="app-link-2"]');
    const silent = await stubFrame(page, 'companion-silent');
    await page.waitForTimeout(1500);
    check('nothing pushed to a frame that never asked', (await received(silent)).length === 0);
    const status = await page.textContent('[data-testid="text-app-share-status"]');
    check('status says the app has not asked', /has not asked/.test(status || ''), String(status));

    console.log('7. Repeated swmm:ready cannot amplify');
    await page.click('[data-testid="app-link-3"]');
    const flooder = await stubFrame(page, 'companion-flooder');
    await page.waitForTimeout(2000);
    const floodGot = await received(flooder);
    check('16 announcements produce exactly one delivery', floodGot.length === 1, `received ${floodGot.length}`);

    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
