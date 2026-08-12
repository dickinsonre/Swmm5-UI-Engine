/**
 * Batch-run web worker for the in-browser SWMM engines.
 *
 * Runs one simulation per 'run' message and posts back the raw .rpt text and
 * .out binary; all parsing/validation stays on the main thread in
 * swmm-engine.ts. The dialog spawns a FRESH worker per run and terminates it
 * afterwards (or on cancel), which preserves the fresh-module-instance rule
 * for SWMM6 and gives hard cancellation via worker.terminate().
 *
 * engine: 'wasm'     -> EPA SWMM 5.2.4      (/swmm_engine.js, global Module, swmm_run)
 * engine: 'wasm6'    -> OpenSWMM 6 release  (/wasm6/openswmm6.js, createOswmm6Module factory)
 * engine: 'wasm6dev' -> OpenSWMM 6 develop  (/wasm6dev/openswmm6dev.js, createOswmm6DevModule factory)
 */

var SWMM6_VARIANTS = {
  wasm6:    { dir: '/wasm6',    js: 'openswmm6.js',    factory: 'createOswmm6Module' },
  wasm6dev: { dir: '/wasm6dev', js: 'openswmm6dev.js', factory: 'createOswmm6DevModule' },
};

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

async function loadSwmm6Module(variant, stderrLog) {
  var v = SWMM6_VARIANTS[variant] || SWMM6_VARIANTS.wasm6;
  if (typeof self[v.factory] !== 'function') {
    importScripts(v.dir + '/' + v.js);
  }
  if (typeof self[v.factory] !== 'function') {
    throw new Error(v.factory + ' factory not found after script load');
  }
  // Fresh instance per run — the engine traps are unrecoverable and MEMFS
  // lives in the glue, so a new factory call gives clean state each time.
  var mod = await self[v.factory]({
    noInitialRun: true,
    print: function () {},
    // Capture stderr — init failures (e.g. FV meshing rejections) report the
    // actual reason only here, never in the .rpt file.
    printErr: function (t) { if (stderrLog) stderrLog.push(String(t)); },
    locateFile: function (path) { return v.dir + '/' + path; },
  });
  if (typeof mod._swmm_engine_run !== 'function') {
    throw new Error(v.js + ' loaded but swmm_engine_run is not exported');
  }
  return mod;
}

function readFileSafe(mod, path) {
  try { return mod.FS.readFile(path); } catch (e) { return null; }
}

// swmm_engine_run destroys its handle before returning, losing the engine's
// error message. When it fails without writing a report, replay open+initialize
// on a fresh handle (failure happens at init, so this is cheap) and read
// swmm_get_last_error_msg from that handle.
function probeSwmm6InitError(mod) {
  try {
    var h = mod.ccall('swmm_engine_create', 'number', [], []);
    if (!h) return '';
    var msg = '';
    try {
      var rc = mod.ccall('swmm_engine_open', 'number', ['number', 'string', 'string', 'string'], [h, '/model.inp', '/probe.rpt', '/probe.out']);
      if (rc === 0) rc = mod.ccall('swmm_engine_initialize', 'number', ['number'], [h]);
      if (rc !== 0) msg = mod.ccall('swmm_get_last_error_msg', 'string', ['number'], [h]) || '';
    } finally {
      try { mod.ccall('swmm_engine_destroy', 'number', ['number'], [h]); } catch (e2) {}
    }
    return msg;
  } catch (e) {
    return '';
  }
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
  // Consolidated LID detail report (present only when the model requests it)
  var lidData = errCode === 0 ? readFileSafe(mod, 'model.lid') : null;
  var lidText = lidData ? new TextDecoder().decode(lidData) : '';
  return { errCode: errCode, rptText: rptText, outData: outData, lidText: lidText };
}

async function runSwmm6(inpText, variant) {
  post('progress', { pct: 10, msg: 'Initializing OpenSWMM 6 (worker)...' });
  var stderrLog = [];
  var mod = await loadSwmm6Module(variant, stderrLog);
  post('progress', { pct: 30, msg: 'Writing model to WASM filesystem...' });
  mod.FS.writeFile('/model.inp', inpText);
  post('progress', { pct: 35, msg: variant === 'wasm6dev' ? 'Running OpenSWMM 6 develop (WASM)...' : 'Running OpenSWMM 6 release (WASM)...' });
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
  var stderrText = stderrLog.filter(Boolean).slice(-5).join('; ');
  // SWMM6 has exited 0 on fatal failures — probe whenever the report is
  // empty and stderr gave us nothing, regardless of exit code.
  if (!rptText && !stderrText) {
    stderrText = probeSwmm6InitError(mod);
  }
  return { errCode: errCode, rptText: rptText, outData: outData, stderrText: stderrText };
}

self.onmessage = async function (e) {
  var data = e.data || {};
  if (data.type !== 'run') return;
  try {
    var result = (data.engine === 'wasm6' || data.engine === 'wasm6dev')
      ? await runSwmm6(data.inpText, data.engine)
      : await runSwmm5(data.inpText);
    var outBytes = result.outData && result.outData.length
      ? new Uint8Array(result.outData) // copy out of WASM heap before transfer
      : null;
    var transfer = outBytes ? [outBytes.buffer] : [];
    self.postMessage(
      { type: 'done', errCode: result.errCode, rptText: result.rptText, outData: outBytes, stderrText: result.stderrText || '', lidText: result.lidText || '' },
      transfer
    );
  } catch (err) {
    post('error', { message: (err && err.message) ? err.message : String(err) });
  }
};
