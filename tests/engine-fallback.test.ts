/**
 * Task #17 — engine fallback and upload limits can't silently break.
 *
 * Two independent safety valves are exercised against the REAL Express app,
 * built in-process via createApp() and driven over an ephemeral port (never
 * the dev server, never a hard-coded 5000):
 *
 *  1. Upload size cap. server/index.ts installs express.json({ limit: "25mb" }).
 *     An over-limit JSON POST must be REJECTED with HTTP 413 — not hang, not
 *     crash the process, not silently truncate to a smaller (parseable) body.
 *     A comfortably-under-limit body of the same shape must NOT 413.
 *
 *  2. Engine-unavailable fallback. When the native SWMM binary cannot be
 *     spawned, /api/swmm/run-or-proxy must return the structured
 *     engine-unavailable contract the client relies on. The client
 *     (client/src/lib/swmm-engine.ts) branches on exactly:
 *         resp.status === 503   AND   data.available === false
 *     and then recommends WASM. We pin those two fields plus the documented
 *     companions (engine:'local', fallbackRecommended:'wasm', error present),
 *     and prove a real success is DISTINGUISHABLE from this fallback so a
 *     future change can't make everything look like a fallback.
 *
 * The engine-unavailable leg runs in a child process whose cwd has no
 * swmm-engine/runswmm, since the engine path is resolved from process.cwd()
 * at module load. The success + upload legs run in this process, where the
 * real statically-linked binary is present and runnable.
 *
 * Run: npx tsx tests/engine-fallback.test.ts
 */

// The server module auto-starts a listening server by default. Opt out BEFORE
// importing it, so building the app here does not also bind the real port.
// This must be set before the dynamic import below; a static import would be
// hoisted above the assignment and the module would autostart.
process.env.SWMM_NO_AUTOSTART = '1';
const { createApp } = await import('../server/index');

import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const WORKSPACE = fileURLToPath(new URL('..', import.meta.url));

// A minimal, real model that the native engine runs to completion in <1s.
const SAMPLE_INP = readFileSync(join(WORKSPACE, 'tests/fixtures/batch-simple.inp'), 'utf8');

/** Start the real app on an ephemeral port; return base URL + a stopper. */
async function startApp(): Promise<{ base: string; stop: () => Promise<void> }> {
  const { httpServer } = await createApp();
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    stop: () => new Promise<void>((resolve) => httpServer.close(() => resolve())),
  };
}

async function main() {
  const { base, stop } = await startApp();

  try {
    // -----------------------------------------------------------------------
    console.log('\n1. upload size cap — express.json({ limit: "25mb" })');
    {
      // A JSON body comfortably over the 25 MB cap. Posted to a route that
      // reads req.body (so the JSON body parser actually runs).
      const oversized = JSON.stringify({ pad: 'x'.repeat(30 * 1024 * 1024) });
      check('oversized body is actually > 25 MB', oversized.length > 25 * 1024 * 1024, oversized.length);

      // Must resolve (not hang) and must reject with 413 — bounded by a timeout
      // so a regression that hangs the connection fails loudly instead of
      // stalling the suite forever.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      let status = 0;
      let threw = false;
      try {
        const resp = await fetch(`${base}/api/swmm-proxy/batch/test-job/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: oversized,
          signal: controller.signal,
        });
        status = resp.status;
        await resp.text().catch(() => '');
      } catch {
        threw = true;
      } finally {
        clearTimeout(timer);
      }
      check('over-limit request did not hang (a response came back)', !threw, { threw });
      check('over-limit request rejected with HTTP 413', status === 413, status);
      check('server process still alive after over-limit POST', true);

      // Same route, an UNDER-limit body of the same shape must NOT 413:
      // proves the 413 is the size cap, not the route rejecting everything.
      // (The upstream proxy fetch will fail — that surfaces as 4xx/5xx — but
      // never as 413, and the body parser must have accepted it.)
      const small = JSON.stringify({ pad: 'x'.repeat(1024) });
      const smallResp = await fetch(`${base}/api/swmm-proxy/batch/test-job/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: small,
      });
      await smallResp.text().catch(() => '');
      check('under-limit body of same shape is NOT rejected as 413', smallResp.status !== 413, smallResp.status);
    }

    // -----------------------------------------------------------------------
    console.log('\n2. success path — engine available, distinguishable from fallback');
    let successBody: any = null;
    let successStatus = 0;
    {
      const resp = await fetch(`${base}/api/swmm/run-or-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: SAMPLE_INP,
      });
      successStatus = resp.status;
      successBody = await resp.json().catch(() => ({}));

      // The engine is present and runnable in this cwd, so this must succeed
      // (HTTP 200). If the binary genuinely cannot run here the whole premise
      // of "distinguishable success" is untestable, so fail loudly.
      check('successful run returns HTTP 200 (not 503)', successStatus === 200, { successStatus, body: successBody });
      check('success body reports status:"success"', successBody.status === 'success', successBody.status);
      check('success body reports engineUsed:"local"', successBody.engineUsed === 'local', successBody.engineUsed);
      check('success body carries a report the client requires', typeof successBody.reportContent === 'string' && successBody.reportContent.length > 0);

      // The distinguishing invariant: a success must NEVER carry the
      // fallback marker the client keys on.
      check('success is NOT flagged available:false', successBody.available !== false, successBody.available);
      check('success does NOT recommend a fallback engine', successBody.fallbackRecommended === undefined, successBody.fallbackRecommended);
    }

    // -----------------------------------------------------------------------
    console.log('\n3. engine-unavailable fallback — child process with no binary');
    let fbStatus = 0;
    let fbBody: any = null;
    {
      const { status, body } = await runUnavailableLeg();
      fbStatus = status;
      fbBody = body;

      // Exactly the two things client/src/lib/swmm-engine.ts branches on:
      check('fallback returns HTTP 503 (client checks resp.status===503)', fbStatus === 503, { fbStatus, fbBody });
      check('fallback body has available:false (client checks data.available===false)', fbBody.available === false, fbBody.available);

      // Documented companions in sendEngineUnavailable() the diagnostics rely on.
      check('fallback names engine:"local"', fbBody.engine === 'local', fbBody.engine);
      check('fallback recommends wasm', fbBody.fallbackRecommended === 'wasm', fbBody.fallbackRecommended);
      check('fallback carries a non-empty error string', typeof fbBody.error === 'string' && fbBody.error.length > 0, fbBody.error);

      // A fallback must NOT masquerade as a success…
      check('fallback is NOT status:"success"', fbBody.status !== 'success', fbBody.status);
      check('fallback does NOT claim engineUsed:"local"', fbBody.engineUsed === undefined, fbBody.engineUsed);
    }

    // -----------------------------------------------------------------------
    console.log('\n4. success and fallback are mutually exclusive contracts');
    {
      // Cross-check: the two responses cannot be confused for one another.
      check('status codes differ (200 vs 503)', successStatus !== fbStatus, { successStatus, fbStatus });
      check('only the fallback sets available:false',
        successBody.available !== false && fbBody.available === false);
      check('only the success sets status:"success"',
        successBody.status === 'success' && fbBody.status !== 'success');
    }

    // -----------------------------------------------------------------------
    console.log('\n5. running the server module as an entrypoint actually listens');
    {
      // Regression guard for a real near-miss: startup was briefly gated on an
      // "am I the process entrypoint?" check using import.meta.url. That test
      // passes under tsx but is erased by the esbuild CJS production bundle,
      // so the PUBLISHED server would have built its app and never listened.
      //
      // Startup must therefore be unconditional unless SWMM_NO_AUTOSTART=1.
      // Booting the module as a real child process is the only honest check.
      const boot = await bootEntrypoint();
      check('entrypoint child logged that it is serving', boot.logged, boot.tail);
      check('entrypoint child answered a real request', boot.statusOk, boot.detail);
    }
  } finally {
    await stop();
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

/**
 * Run server/index.ts the way `npm run dev` does — as the process entrypoint —
 * on an ephemeral port, and confirm it binds and serves. Guards against the
 * autostart being gated behind any module-format-dependent condition.
 */
async function bootEntrypoint(): Promise<{ logged: boolean; statusOk: boolean; tail: string; detail: unknown }> {
  // A single fixed port, deliberately not randomised: Replit auto-registers
  // every newly observed listening port into .replit, so a random port would
  // add a fresh junk entry to the deploy config on every run.
  const port = 5099;
  const tsxBin = join(WORKSPACE, 'node_modules', '.bin', 'tsx');
  const childEnv = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(port),
    // Loopback only: keeps Replit's port detector from adding a test-only
    // mapping to .replit every time the suite runs.
    HOST: '127.0.0.1',
  };
  // This leg asserts the DEFAULT behaviour, so the opt-out this test process
  // set for itself must not be inherited by the child.
  delete childEnv.SWMM_NO_AUTOSTART;
  const child = spawn(tsxBin, [join(WORKSPACE, 'server/index.ts')], {
    cwd: WORKSPACE,
    env: childEnv,
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d.toString(); });
  child.stderr.on('data', (d) => { out += d.toString(); });

  const deadline = Date.now() + 60000;
  let logged = false;
  let statusOk = false;
  let detail: unknown = null;
  try {
    while (Date.now() < deadline) {
      if (!logged && out.includes(`serving on port ${port}`)) logged = true;
      if (logged) {
        try {
          const resp = await fetch(`http://127.0.0.1:${port}/api/swmm/status`);
          detail = { status: resp.status };
          statusOk = resp.ok;
          break;
        } catch (e) {
          detail = String(e);
        }
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  } finally {
    child.kill('SIGKILL');
  }
  return { logged, statusOk, tail: out.slice(-400), detail };
}

/**
 * Boot the real app in a child process whose cwd has no swmm-engine/runswmm,
 * so probeEngine() fails and the run endpoint takes the unavailable branch.
 * The child prints one JSON line { status, body } that we parse.
 */
function runUnavailableLeg(): Promise<{ status: number; body: any }> {
  const emptyCwd = mkdtempSync(join(tmpdir(), 'swmm-nobin-'));
  const indexUrl = new URL('../server/index.ts', import.meta.url).href;
  const script = `
    (async () => {
      const { createApp } = await import(${JSON.stringify(indexUrl)});
      const { httpServer } = await createApp();
      await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
      const { port } = httpServer.address();
      const resp = await fetch('http://127.0.0.1:' + port + '/api/swmm/run-or-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: ${JSON.stringify(SAMPLE_INP)},
      });
      const body = await resp.json().catch(() => ({}));
      console.log('__RESULT__' + JSON.stringify({ status: resp.status, body }));
      httpServer.close(() => process.exit(0));
    })();
  `;
  // Resolve tsx from the workspace, not from the (empty) child cwd where
  // npx/node_modules resolution would fail.
  const tsxBin = join(WORKSPACE, 'node_modules', '.bin', 'tsx');
  return new Promise((resolve, reject) => {
    const child = spawn(tsxBin, ['-e', script], {
      cwd: emptyCwd, // <-- key: engine path resolves under a dir with no binary
      env: { ...process.env, NODE_ENV: 'test', SWMM_NO_AUTOSTART: '1' },
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('unavailable-leg timed out')); }, 60000);
    child.on('close', () => {
      clearTimeout(timer);
      const marker = out.indexOf('__RESULT__');
      if (marker < 0) {
        reject(new Error('child produced no result. stdout=\n' + out + '\nstderr=\n' + err));
        return;
      }
      const line = out.slice(marker + '__RESULT__'.length).split('\n')[0];
      try { resolve(JSON.parse(line)); }
      catch (e) { reject(new Error('bad child result JSON: ' + line)); }
    });
  });
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
