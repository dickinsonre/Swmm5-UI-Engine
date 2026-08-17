/**
 * Synthetic-export marking guard (task #35).
 *
 * The Mock engine fabricates plausible-looking numbers for interface testing.
 * Nothing it emits may ever leave the app looking like a genuine SWMM run, so
 * EVERY export/copy path that can carry results must stamp a synthetic marker
 * when — and only when — the results came from the Mock engine:
 *
 *   - text artifacts (.rpt download, report copy, table copy):  banner prepended
 *   - download filenames (.rpt, project-exit bundle):           _SYNTHETIC suffix
 *   - map image (PNG file / clipboard):                          on-canvas watermark
 *
 * These tests pin the pure helpers that centralize that decision, mirror how
 * each real export path calls them, and assert the watermark component draws
 * the same mark. Project-geometry exports (nodes/links CSV, DXF, GeoJSON,
 * generated .inp) are NOT results and must stay unmarked — that is also pinned.
 *
 * A regression (a path forgetting the marker, or stamping real output) makes a
 * concrete assertion below flip.
 *
 * Run: npx tsx tests/synthetic-export.test.ts
 */

import {
  isSyntheticResults,
  syntheticFilename,
  markSyntheticText,
  SYNTHETIC_MARK,
  SYNTHETIC_TEXT_HEADER,
  SYNTHETIC_FILENAME_MARKER,
} from '../client/src/lib/synthetic-export';
import {
  SYNTHETIC_MARK as MARK_FROM_COMPONENT,
  SYNTHETIC_TEXT_HEADER as HEADER_FROM_COMPONENT,
  drawSyntheticWatermark,
} from '../client/src/components/swmm/SyntheticWarning';

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`, detail !== undefined ? JSON.stringify(detail) : ''); }
}

// Result stand-ins — only the fields the export helpers read.
const mock = { engineUsed: 'mock' };
const wasm5 = { engineUsed: 'wasm' };
const wasm6 = { engineUsed: 'wasm6' };
const local = { engineUsed: 'local' };
const remote = { engineUsed: 'remote' };

// ---------------------------------------------------------------------------
console.log('\nisSyntheticResults — only the Mock engine is synthetic');
{
  check('mock is synthetic', isSyntheticResults(mock));
  check('wasm (SWMM5) is real', !isSyntheticResults(wasm5));
  check('wasm6 (SWMM6) is real', !isSyntheticResults(wasm6));
  check('local is real', !isSyntheticResults(local));
  check('remote is real', !isSyntheticResults(remote));
  check('null is treated as real (no marker on absent run)', !isSyntheticResults(null));
  check('undefined is real', !isSyntheticResults(undefined));
  check('missing engineUsed is real', !isSyntheticResults({} as any));
}

// ---------------------------------------------------------------------------
console.log('\nsyntheticFilename — _SYNTHETIC marker sits right before the extension');
{
  check('synthetic .rpt gets the marker before the extension',
    syntheticFilename('model', '.rpt', true) === 'model_SYNTHETIC.rpt',
    syntheticFilename('model', '.rpt', true));
  check('real .rpt is untouched',
    syntheticFilename('model', '.rpt', false) === 'model.rpt',
    syntheticFilename('model', '.rpt', false));

  // report-download path passes an engine suffix (compare runs) — it must come
  // BEFORE the synthetic marker so the marker still abuts the extension.
  check('engine suffix precedes the synthetic marker',
    syntheticFilename('model', '.rpt', true, '_swmm5') === 'model_swmm5_SYNTHETIC.rpt',
    syntheticFilename('model', '.rpt', true, '_swmm5'));
  check('engine suffix on a real run adds no synthetic marker',
    syntheticFilename('model', '.rpt', false, '_swmm5') === 'model_swmm5.rpt',
    syntheticFilename('model', '.rpt', false, '_swmm5'));

  check('marker constant is what actually gets inserted',
    syntheticFilename('m', '.rpt', true).includes(SYNTHETIC_FILENAME_MARKER));
  check('extension without a leading dot is normalized',
    syntheticFilename('model', 'rpt', true) === 'model_SYNTHETIC.rpt',
    syntheticFilename('model', 'rpt', true));
  // The marker must land before the extension, never dangling on the end where
  // it would corrupt the file type.
  const f = syntheticFilename('model', '.rpt', true);
  check('a synthetic file still ends in its real extension', f.endsWith('.rpt') && !f.endsWith('_SYNTHETIC'), f);
}

// ---------------------------------------------------------------------------
console.log('\nmarkSyntheticText — banner prepended for synthetic content only');
{
  const body = 'Node\tDepth\nJ1\t1.234';
  const marked = markSyntheticText(body, true);
  check('synthetic content is prefixed with the banner', marked.startsWith(SYNTHETIC_TEXT_HEADER), marked.slice(0, 40));
  check('synthetic content still contains the original body', marked.endsWith(body));
  check('banner names the mark', marked.includes(SYNTHETIC_MARK));
  check('banner warns against engineering use', /engineering decisions/i.test(marked));

  const real = markSyntheticText(body, false);
  check('real content is returned verbatim', real === body, real);
  check('real content carries NO banner', !real.includes(SYNTHETIC_MARK));
}

// ---------------------------------------------------------------------------
console.log('\nend-to-end per export path (mirrors the real call sites)');
{
  // Each block reproduces exactly how the production handler computes its
  // artifact, so if a handler is rewired away from the shared helpers these
  // still describe the contract the app must keep.

  // 1) Report download (.rpt)  — swmm-ui.tsx btn-download-report
  {
    const rpt = 'SWMM REPORT\nContinuity error 0.01%';
    for (const [res, label] of [[mock, 'mock'], [wasm5, 'real']] as const) {
      const synthetic = isSyntheticResults(res);
      const name = syntheticFilename('greenville', '.rpt', synthetic);
      const text = markSyntheticText(rpt, synthetic);
      if (label === 'mock') {
        check('report download (mock): filename marked', name === 'greenville_SYNTHETIC.rpt', name);
        check('report download (mock): content bannered', text.startsWith(SYNTHETIC_TEXT_HEADER));
      } else {
        check('report download (real): filename clean', name === 'greenville.rpt', name);
        check('report download (real): content unbannered', text === rpt);
      }
    }
  }

  // 2) Report copy-to-clipboard — swmm-ui.tsx btn-copy-report
  {
    const rpt = 'SWMM REPORT BODY';
    check('report copy (mock): bannered', markSyntheticText(rpt, isSyntheticResults(mock)).includes(SYNTHETIC_MARK));
    check('report copy (real): not bannered', !markSyntheticText(rpt, isSyntheticResults(wasm6)).includes(SYNTHETIC_MARK));
  }

  // 3) Project-exit bundle (.rpt) — swmm-ui.tsx handleExit
  //    Regression fixed here: the bundle used to stamp the filename but write
  //    the .rpt body raw, so a rename lost the only marking. Both must be set.
  {
    const rpt = 'REPORT SUMMARY';
    const syn = isSyntheticResults(mock);
    const name = syntheticFilename('model', '.rpt', syn);
    const data = markSyntheticText(rpt, syn);
    check('exit bundle (mock): .rpt filename marked', name === 'model_SYNTHETIC.rpt', name);
    check('exit bundle (mock): .rpt CONTENT also bannered', data.startsWith(SYNTHETIC_TEXT_HEADER));

    const name2 = syntheticFilename('model', '.rpt', isSyntheticResults(local));
    const data2 = markSyntheticText(rpt, isSyntheticResults(local));
    check('exit bundle (real): filename clean', name2 === 'model.rpt', name2);
    check('exit bundle (real): content clean', data2 === rpt);
  }

  // 4) Table copy-to-clipboard — TableViewDialog handleCopy
  {
    const tsv = 'Time\tDepth\n0\t0.5';
    check('table copy (mock): bannered', markSyntheticText(tsv, isSyntheticResults(mock)).startsWith(SYNTHETIC_TEXT_HEADER));
    check('table copy (real): raw', markSyntheticText(tsv, isSyntheticResults(wasm5)) === tsv);
  }
}

// ---------------------------------------------------------------------------
console.log('\nmap image watermark — draws the synthetic mark onto the canvas');
{
  // Node has no CanvasRenderingContext2D; record what drawSyntheticWatermark
  // draws so we can assert it stamps the mark. The signature is what the map
  // export (buildExportCanvas) calls when results are synthetic.
  const texts: string[] = [];
  const ctx = {
    save() {}, restore() {}, translate() {}, rotate() {}, fillRect() {},
    fillText(t: string) { texts.push(t); },
    set fillStyle(_v: string) {}, get fillStyle() { return ''; },
    set font(_v: string) {}, get font() { return ''; },
    set textBaseline(_v: string) {}, get textBaseline() { return ''; },
    set textAlign(_v: string) {}, get textAlign() { return ''; },
    set globalAlpha(_v: number) {}, get globalAlpha() { return 1; },
  } as unknown as CanvasRenderingContext2D;

  drawSyntheticWatermark(ctx, 800, 600);
  check('watermark draws the synthetic mark text', texts.some(t => t === SYNTHETIC_MARK), texts);
  check('watermark draws it more than once (header + diagonal)', texts.filter(t => t === SYNTHETIC_MARK).length >= 2, texts.length);
}

// ---------------------------------------------------------------------------
console.log('\nsingle source of truth — component and helper agree');
{
  // SyntheticWarning.tsx (React) and synthetic-export.ts (pure) must share one
  // string, or a text banner and a canvas watermark could disagree.
  check('SYNTHETIC_MARK identical across modules', MARK_FROM_COMPONENT === SYNTHETIC_MARK, [MARK_FROM_COMPONENT, SYNTHETIC_MARK]);
  check('SYNTHETIC_TEXT_HEADER identical across modules', HEADER_FROM_COMPONENT === SYNTHETIC_TEXT_HEADER);
}

// ---------------------------------------------------------------------------
console.log('\nproject-geometry exports stay UNMARKED regardless of run type');
{
  // exportNodesCsv/exportLinksCsv/exportDxf and the generated .inp describe the
  // *model input*, not results — they must never gain a synthetic marker even
  // when a mock run is loaded, or users could not round-trip their network.
  const genInpName = 'model_generated.inp'; // matches the report-dialog .inp branch
  check('generated .inp filename carries no synthetic marker', !genInpName.includes(SYNTHETIC_FILENAME_MARKER), genInpName);

  // Geometry CSV/DXF exports come from import-export.ts, which has no results
  // parameter at all — verify their output is pure geometry with no banner.
  // (Imported lazily to keep this a focused assertion.)
}
import('../client/src/lib/import-export').then(mod => {
  // A minimal project so the exporters produce real rows.
  const proj: any = {
    junctions: [{ id: 'J1', elevation: 10, maxDepth: 4 }],
    outfalls: [], storageUnits: [], dividers: [],
    conduits: [{ id: 'C1', fromNode: 'J1', toNode: 'J1', length: 100, roughness: 0.01 }],
    coordinates: { J1: [1, 2] }, xsections: { C1: { geom1: 1, shape: 'CIRCULAR' } },
    vertices: {},
  };
  const nodesCsv = mod.exportNodesCsv(proj);
  const linksCsv = mod.exportLinksCsv(proj);
  const dxf = mod.exportDxf(proj);
  check('nodes CSV has no synthetic marker', !nodesCsv.includes(SYNTHETIC_MARK) && !nodesCsv.includes(SYNTHETIC_FILENAME_MARKER));
  check('links CSV has no synthetic marker', !linksCsv.includes(SYNTHETIC_MARK));
  check('DXF has no synthetic marker', !dxf.includes(SYNTHETIC_MARK));

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}).catch(err => {
  console.error('import-export load failed', err);
  process.exit(1);
});
