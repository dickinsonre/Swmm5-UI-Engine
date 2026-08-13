/** One-off check: LID Viewer dialog resize handle. */
import { chromium } from 'playwright-core';
import { execSync } from 'child_process';

const BASE_URL = 'http://127.0.0.1:5000';
let failed = 0;
const check = (n: string, ok: boolean, d?: string) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) failed++;
};

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

    console.log('1. load LID fixture');
    await page.setInputFiles('[data-testid="file-input"]', 'tests/fixtures/lid_test.inp');
    await page.waitForTimeout(1500);

    console.log('2. switch engine to WASM 5.2.4');
    for (let i = 0; i < 9; i++) {
      const label = await page.locator('[data-testid="btn-engine-toggle"]').innerText();
      if (label.includes('WASM 5.2.4')) break;
      await page.click('[data-testid="btn-engine-toggle"]');
      await page.waitForTimeout(300);
    }
    check('engine is WASM 5.2.4',
      (await page.locator('[data-testid="btn-engine-toggle"]').innerText()).includes('WASM 5.2.4'));

    console.log('3. run');
    await page.click('[data-testid="btn-run"]');
    await page.waitForSelector('[data-testid="btn-lid-viewer"]', { timeout: 90000 });
    await page.waitForTimeout(3000);
    for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }

    console.log('4. open LID viewer');
    await page.click('[data-testid="btn-lid-viewer"]');
    const dlg = page.locator('[data-testid="lid-viewer-dialog"]');
    await dlg.waitFor();
    await page.waitForTimeout(800);
    const before = (await dlg.boundingBox())!;
    console.log(`   default size ${Math.round(before.width)}x${Math.round(before.height)}`);
    await page.screenshot({ path: '/tmp/lid-default.png' });

    console.log('5. drag the resize corner');
    const handle = page.locator('[data-testid="lid-resize-handle"]');
    check('resize handle present', (await handle.count()) === 1);
    const hb = (await handle.boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + 120, hb.y + 80, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const after = (await dlg.boundingBox())!;
    console.log(`   dragged size ${Math.round(after.width)}x${Math.round(after.height)}`);
    check('dialog grew wider', after.width > before.width + 100, `${before.width} -> ${after.width}`);
    check('dialog grew taller', after.height > before.height + 60, `${before.height} -> ${after.height}`);
    check('corner tracks cursor (within 12px)',
      Math.abs(after.x + after.width - (hb.x + 120)) < 12,
      `right edge ${Math.round(after.x + after.width)} vs cursor ${Math.round(hb.x + 120)}`);
    check('content still visible', (await page.locator('[data-testid="lid-stack-svg"]').count()) === 1);
    await page.screenshot({ path: '/tmp/lid-resized.png' });

    console.log('6. size persists across reopen');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.click('[data-testid="btn-lid-viewer"]');
    await dlg.waitFor();
    await page.waitForTimeout(600);
    const reopened = (await dlg.boundingBox())!;
    check('remembered size', Math.abs(reopened.width - after.width) < 4, `${reopened.width} vs ${after.width}`);

    console.log('7. double-click resets');
    await handle.dblclick();
    await page.waitForTimeout(400);
    const reset = (await dlg.boundingBox())!;
    check('back to default width', Math.abs(reset.width - before.width) < 4, `${reset.width} vs ${before.width}`);
    await page.screenshot({ path: '/tmp/lid-reset.png' });

    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exitCode = failed ? 1 : 0;
  } finally {
    await browser.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
