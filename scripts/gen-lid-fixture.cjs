// Generator: produce a REAL consolidated `.lid` from the patched SWMM5 WASM
// engine (client/public/swmm_engine.js + .wasm) by running the committed
// fixture model tests/fixtures/lid_test.inp inside its virtual filesystem.
//
// This is what makes the LID parity gate a REAL engine regression gate: the
// consolidated .lid it emits is compared against the stock engine's per-unit
// goldens. Rebuild the WASM and the numbers/layout can drift — this fixture
// captures the current engine's actual output so the test suite can detect it.
//
// Usage:  node scripts/gen-lid-fixture.cjs
// Writes: tests/fixtures/golden-lid/consolidated.lid
//
// Engine run rules for these Emscripten WASM builds:
//   - fresh Module instance per run (this script runs once, so trivially so)
//   - noInitialRun (we drive swmm_run ourselves)
//   - NEVER trust the exit code — check the produced .lid file instead
//
// The engine .js/.wasm artifacts are NOT modified: we read the classic
// Emscripten script and evaluate it in a sandbox with a pre-seeded Module.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const ENGINE_JS = path.join(ROOT, 'client', 'public', 'swmm_engine.js');
const ENGINE_WASM = path.join(ROOT, 'client', 'public', 'swmm_engine.wasm');
const INP = path.join(ROOT, 'tests', 'fixtures', 'lid_test.inp');
const OUT_LID = path.join(ROOT, 'tests', 'fixtures', 'golden-lid', 'consolidated.lid');

/**
 * Load the classic Emscripten SWMM5 build under node, run the fixture model,
 * and return the consolidated `.lid` text the engine wrote to its virtual FS.
 * Resolves once the .lid file exists (never on the unreliable exit code).
 *
 * @returns {Promise<string>} consolidated .lid contents
 */
function runWasmAndGetLid({ quiet = false } = {}) {
  const say = quiet ? () => {} : (...a) => console.log(...a);
  const sayErr = quiet ? () => {} : (...a) => console.error(...a);
  return new Promise((resolve, reject) => {
    const wasmBinary = fs.readFileSync(ENGINE_WASM);
    const engineSrc = fs.readFileSync(ENGINE_JS, 'utf8');
    const inpText = fs.readFileSync(INP, 'utf8');

    const timer = setTimeout(
      () => reject(new Error('SWMM WASM init/run timeout (60s)')),
      60000
    );

    const Module = {
      wasmBinary,
      noInitialRun: true,
      // Point the loader at the real .wasm on disk (classic build resolves
      // paths relative to scriptDirectory otherwise).
      locateFile: (p) => (p === 'swmm_engine.wasm' ? ENGINE_WASM : p),
      print: (t) => say('[SWMM WASM]', t),
      printErr: (t) => sayErr('[SWMM WASM]', t),
      onAbort: (what) => {
        clearTimeout(timer);
        reject(new Error('SWMM WASM aborted: ' + what));
      },
      onRuntimeInitialized: () => {
        try {
          const mod = Module;
          // Clean slate, then write the model into the virtual FS.
          for (const f of ['model.inp', 'model.rpt', 'model.out', 'model.lid']) {
            try { mod.FS.unlink(f); } catch { /* not present */ }
          }
          mod.FS.writeFile('model.inp', inpText);
          try { mod.FS.writeFile('model.rpt', ''); } catch { /* ignore */ }
          try { mod.FS.writeFile('model.out', ''); } catch { /* ignore */ }

          const swmm_run = mod.cwrap('swmm_run', 'number', ['string', 'string', 'string']);
          let errCode;
          try {
            errCode = swmm_run('model.inp', 'model.rpt', 'model.out');
          } catch (runErr) {
            // Emscripten may throw ExitStatus even on success — keep going and
            // let the .lid presence check below be the real verdict.
            sayErr('[gen-lid] swmm_run threw:', runErr && runErr.message);
          }
          say('[gen-lid] swmm_run returned', errCode);

          let lidText = '';
          try {
            lidText = new TextDecoder().decode(mod.FS.readFile('model.lid'));
          } catch {
            // fall through to the check below
          }
          clearTimeout(timer);
          if (!lidText || !lidText.includes('[RESULTS]')) {
            let rptText = '';
            try { rptText = new TextDecoder().decode(mod.FS.readFile('model.rpt')); } catch { /* ignore */ }
            const errLines = rptText
              .split('\n')
              .filter((l) => /ERROR|WARNING/i.test(l))
              .slice(0, 8)
              .join('\n');
            reject(new Error(
              'Engine ran but produced no usable consolidated .lid ' +
              `(len=${lidText.length}).` + (errLines ? '\n' + errLines : '')
            ));
            return;
          }
          resolve(lidText);
        } catch (e) {
          clearTimeout(timer);
          reject(e);
        }
      },
    };

    // Evaluate the classic Emscripten script with our pre-seeded Module in a
    // sandbox that shares node globals it needs (process, require, fetch-free).
    const sandbox = {
      Module,
      process,
      require,
      __dirname: path.dirname(ENGINE_JS),
      __filename: ENGINE_JS,
      console,
      setTimeout,
      clearTimeout,
      TextDecoder,
      TextEncoder,
      Buffer,
      WebAssembly,
      URL,
      globalThis: null,
    };
    sandbox.global = sandbox;
    sandbox.globalThis = sandbox;
    try {
      vm.createContext(sandbox);
      vm.runInContext(engineSrc, sandbox, { filename: ENGINE_JS });
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}

module.exports = { runWasmAndGetLid };

// CLI entry point — regenerate the committed fixture.
if (require.main === module) (async () => {
  const lidText = await runWasmAndGetLid();
  fs.writeFileSync(OUT_LID, lidText);
  const rows = lidText.split('\n').filter((l) => /^\s*S\d\t/.test(l)).length;
  console.log(`[gen-lid] wrote ${OUT_LID} (${lidText.length} bytes, ~${rows} result rows)`);
})().catch((e) => {
  console.error('[gen-lid] FAILED:', e && e.stack ? e.stack : e);
  process.exit(1);
});
