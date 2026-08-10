/**
 * Batch-run web worker for the in-browser SWMM engines.
 *
 * Runs one simulation per 'run' message and posts back the raw .rpt text and
 * .out binary; all parsing/validation stays on the main thread in
 * swmm-engine.ts. The dialog spawns a FRESH worker per run and terminates it
 * afterwards (or on cancel), which preserves the fresh-module-instance rule
 * for SWMM6 and gives hard cancellation via worker.terminate().
 *
 * engine: 'wasm'  -> EPA SWMM 5.2.4  (/swmm_engine.js, global Module, swmm_run)
 * engine: 'wasm6' -> OpenSWMM 6      (/wasm6/openswmm6.js, createOswmm6Module factory)
 */

function post(type, data) {
  self.postMessage(Object.assign({ type: type }, data));
}

function loadSwmm5Module() {
  return new Promise(function (resolve, reject) {
    var timeout = setTimeout(function () {
      reject(new Error('SWMM WASM init timeout (45s)'));
    }, 45000);
    self.Module = {
      noInitialRun: true,
      print: function () {},
      printErr: function () {},
      locateFile: function (path) { return '/' + path; },
      onRuntimeInitialized: function () {
        clearTimeout(timeout);
        resolve(self.Module);
      },
      onAbort: function (what) {
        clearTimeout(timeout);
        reject(new Error('SWMM WASM aborted: ' + what));
      },
    };
    try {
      importScripts('/swmm_engine.js');
    } catch (e) {
      clearTimeout(timeout);
      reject(e);
    }
  });
}

async function loadSwmm6Module() {
  if (typeof self.createOswmm6Module !== 'function') {
    importScripts('/wasm6/openswmm6.js');
  }
  if (typeof self.createOswmm6Module !== 'function') {
    throw new Error('createOswmm6Module factory not found after script load');
  }
  // Fresh instance per run — the engine traps are unrecoverable and MEMFS
  // lives in the glue, so a new factory call gives clean state each time.
  var mod = await self.createOswmm6Module({
    noInitialRun: true,
    print: function () {},
    printErr: function () {},
    locateFile: function (path) { return '/wasm6/' + path; },
  });
  if (typeof mod._swmm_engine_run !== 'function') {
    throw new Error('openswmm6.wasm loaded but swmm_engine_run is not exported');
  }
  return mod;
}

function readFileSafe(mod, path) {
  try { return mod.FS.readFile(path); } catch (e) { return null; }
}

async function runSwmm5(inpText) {
  post('progress', { pct: 10, msg: 'Initializing SWMM 5.2.4 (worker)...' });
  var mod = await loadSwmm5Module();
  post('progress', { pct: 30, msg: 'Writing model to WASM filesystem...' });
  mod.FS.writeFile('model.inp', inpText);
  try { mod.FS.writeFile('model.rpt', ''); } catch (e) {}
  try { mod.FS.writeFile('model.out', ''); } catch (e) {}
  post('progress', { pct: 35, msg: 'Running SWMM 5.2.4 (WASM)...' });
  var swmm_run = mod.cwrap('swmm_run', 'number', ['string', 'string', 'string']);
  var errCode = swmm_run('model.inp', 'model.rpt', 'model.out');
  var rptData = readFileSafe(mod, 'model.rpt');
  var rptText = rptData ? new TextDecoder().decode(rptData) : '';
  var outData = errCode === 0 ? readFileSafe(mod, 'model.out') : null;
  return { errCode: errCode, rptText: rptText, outData: outData };
}

async function runSwmm6(inpText) {
  post('progress', { pct: 10, msg: 'Initializing OpenSWMM 6 (worker)...' });
  var mod = await loadSwmm6Module();
  post('progress', { pct: 30, msg: 'Writing model to WASM filesystem...' });
  mod.FS.writeFile('/model.inp', inpText);
  post('progress', { pct: 35, msg: 'Running OpenSWMM 6.0.0-alpha.3 (WASM)...' });
  var errCode;
  try {
    errCode = mod.ccall(
      'swmm_engine_run',
      'number',
      ['string', 'string', 'string', 'number'],
      ['/model.inp', '/model.rpt', '/model.out', 0]
    );
  } catch (runErr) {
    // Emscripten exit() throws even on success — treat ExitStatus 0 as OK.
    if (runErr && runErr.name === 'ExitStatus' && runErr.status === 0) {
      errCode = 0;
    } else {
      throw runErr;
    }
  }
  var rptData = readFileSafe(mod, '/model.rpt');
  var rptText = rptData ? new TextDecoder().decode(rptData) : '';
  var outData = readFileSafe(mod, '/model.out');
  return { errCode: errCode, rptText: rptText, outData: outData };
}

self.onmessage = async function (e) {
  var data = e.data || {};
  if (data.type !== 'run') return;
  try {
    var result = data.engine === 'wasm6'
      ? await runSwmm6(data.inpText)
      : await runSwmm5(data.inpText);
    var outBytes = result.outData && result.outData.length
      ? new Uint8Array(result.outData) // copy out of WASM heap before transfer
      : null;
    var transfer = outBytes ? [outBytes.buffer] : [];
    self.postMessage(
      { type: 'done', errCode: result.errCode, rptText: result.rptText, outData: outBytes },
      transfer
    );
  } catch (err) {
    post('error', { message: (err && err.message) ? err.message : String(err) });
  }
};
