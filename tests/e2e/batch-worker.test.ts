/**
 * E2E: batch runs execute in a web worker, UI stays responsive, cancel is immediate.
 * Run: npx tsx tests/e2e/batch-worker.test.ts
 */
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5000';

async function main() {
  const browser = await chromium.launch({
    executablePath: execSync('which chromium').toString().trim(),
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="btn-batch-runner"]', { timeout: 30000 });
  await page.click('[data-testid="btn-batch-runner"]');
  await page.waitForSelector('[data-testid="dialog-batch-runner"]');

  // Add two sample files via the hidden input
  const inp = readFileSync('client/public/samples/User1.inp', 'utf8');
  const inp2 = readFileSync('client/public/samples/User2.inp', 'utf8');
  await page.setInputFiles('input[type=file][accept=".inp"]', [
    { name: 'User1.inp', mimeType: 'text/plain', buffer: Buffer.from(inp) },
    { name: 'User2.inp', mimeType: 'text/plain', buffer: Buffer.from(inp2) },
  ]);

  // Select both wasm engines
  await page.click('[data-testid="chk-batch-engine-wasm"]');
  await page.click('[data-testid="chk-batch-engine-wasm6"]');

  // Track main-thread responsiveness during the batch via rAF-driven counter
  await page.evaluate(`(() => {
    window.__ticks = 0;
    const tick = () => { window.__ticks++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  })()`);

  await page.click('[data-testid="btn-batch-run"]');
  const t0 = Date.now();
  const ticks0 = await page.evaluate(`window.__ticks`) as number;

  // Wait for completion (Run button returns)
  await page.waitForSelector('[data-testid="btn-batch-run"]', { timeout: 120000 });
  const elapsed = (Date.now() - t0) / 1000;
  const ticks1 = await page.evaluate(`window.__ticks`) as number;
  const fps = (ticks1 - ticks0) / elapsed;
  console.log(`Batch (2 files x 2 engines) done in ${elapsed.toFixed(1)}s, main-thread ~${fps.toFixed(0)} fps during run`);
  if (fps < 20) throw new Error(`Main thread not responsive during batch: ${fps.toFixed(1)} fps`);

  // All 4 cells should be success
  const summary = await page.textContent('[data-testid="text-batch-summary"]').catch(() => null);
  console.log('Summary:', summary);
  const dots = await page.$$eval('[data-testid="dialog-batch-runner"] .bg-green-500', els => els.length);
  console.log('Green status dots:', dots);
  if (dots < 4) throw new Error(`Expected 4 successful runs, saw ${dots} green dots`);

  // --- Cancel test: start again and cancel immediately ---
  await page.click('[data-testid="btn-batch-run"]');
  await page.waitForSelector('[data-testid="btn-batch-cancel"]', { timeout: 10000 });
  const tCancel = Date.now();
  await page.click('[data-testid="btn-batch-cancel"]');
  await page.waitForSelector('[data-testid="btn-batch-run"]', { timeout: 15000 });
  const cancelMs = Date.now() - tCancel;
  console.log(`Cancel returned control in ${cancelMs}ms`);
  const partial = await page.textContent('[data-testid="text-batch-partial"]').catch(() => null);
  console.log('Partial notice:', partial);
  if (!partial || !/cancelled/i.test(partial)) throw new Error('Expected cancellation partial notice');

  if (errors.length) console.log('Page errors:', errors);
  await browser.close();
  console.log('PASS');
}

main().catch(e => { console.error('FAIL:', e); process.exit(1); });
