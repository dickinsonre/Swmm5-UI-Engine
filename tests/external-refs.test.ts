/**
 * External / named references in [RAINGAGES] and [XSECTIONS] must survive a
 * round trip.
 *
 * Both sections mix numbers and NAMES in fixed token slots, and both were
 * losing the names on write, which the engine then reported as a syntax error
 * against a file the user never wrote:
 *
 *   1. [RAINGAGES] "... FILE Fname Station Units" — the writer emitted only
 *      six tokens (through Fname) and dropped Station and Units. EPA SWMM
 *      requires all eight for a FILE gage and rejects the line with
 *      "ERROR 203: too few items at line N of [RAINGAGE] section".
 *
 *   2. [XSECTIONS] "Link CUSTOM Geom1 Curve (Barrels)" — the Geom2 slot holds
 *      a Shape-curve NAME for CUSTOM sections. The parser ran it through
 *      parseFloat2, so the name became 0 and the writer emitted a 0, sending
 *      the engine after a curve literally named "0":
 *      "ERROR 209: undefined object 0 at line N of [XSECT] section".
 *
 *   3. [XSECTIONS] "Link STREET StreetName" has the same shape in the Geom1
 *      slot. IRREGULAR was already handled there; STREET was not.
 *
 * The failure mode these share is silent corruption on SAVE: the model loads
 * and displays fine, and the damage only appears when the engine reads the
 * file back. So every check below asserts on the WRITTEN text, not just the
 * parsed object, and the token POSITIONS are pinned — a name in the right slot
 * but the wrong index is still a broken file.
 *
 * Run: npx tsx tests/external-refs.test.ts
 */

import { parseInpFile, projectToInp } from '../client/src/lib/inp-parser';
import { analyzeInputIntegrity } from '../client/src/lib/model-health';
import {
  attachBytes as attachBytesForTest,
  clearAttachments,
  collectExternalRefs,
  encodeAttachmentsForServer,
  resolveEngineFiles,
  writeCompanionFiles,
  SERVER_ATTACHMENT_LIMIT,
} from '../client/src/lib/external-files';

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`, detail !== undefined ? JSON.stringify(detail) : ''); }
}

/** Pull the body of one section out of a written .inp. */
function section(inp: string, name: string): string[] {
  const after = inp.split(`[${name}]`)[1];
  if (after === undefined) return [];
  return after
    .split(/\n\[/)[0]
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith(';'));
}

/** Tokens of the line whose first field is `id`. */
function row(inp: string, name: string, id: string): string[] {
  const line = section(inp, name).find(l => l.split(/\s+/)[0] === id);
  return line ? line.trim().split(/\s+/) : [];
}

// A model with real links and a real transect, so the writer's own validity
// filters (which drop xsections whose link or transect is missing) do not
// quietly remove the rows under test and leave the checks passing on nothing.
const SRC = `[TITLE]
External reference fidelity

[OPTIONS]
FLOW_UNITS           CMS
INFILTRATION         HORTON
FLOW_ROUTING         DYNWAVE

[RAINGAGES]
rgFile           VOLUME     00:01      1    FILE  "rg_bellinge_Jun2010_Aug2021.dat" rg5425 MM
rgTs             INTENSITY  0:05       1.0  TIMESERIES  ts1

[JUNCTIONS]
J1  10  0  0  0  0
J2  9   0  0  0  0
J3  8   0  0  0  0
J4  7   0  0  0  0
J5  6   0  0  0  0

[CONDUITS]
LinkCustom   J1  J2  100  0.01  0  0  0
LinkStreet   J2  J3  100  0.01  0  0  0
LinkIrr      J3  J4  100  0.01  0  0  0
LinkCirc     J4  J5  100  0.01  0  0  0

[XSECTIONS]
LinkCustom   CUSTOM     0.7875   shapeCurve1   0   0   1
LinkStreet   STREET     Main_St
LinkIrr      IRREGULAR  tsect1
LinkCirc     CIRCULAR   1.5      0   0   0   1

[TRANSECTS]
NC  0.05  0.05  0.05
X1  tsect1  2  1  3  0  0  0  0  0
GR  10  0   8  1   8  3   10  4

[CURVES]
shapeCurve1  SHAPE  0  0
shapeCurve1  0.5  0.9
shapeCurve1  1.0  1.0

[TIMESERIES]
ts1  0:00  0.1
ts1  1:00  0.2
tsFile  FILE  "inflow_hydrograph.dat"
`;

console.log('\n1. FILE rain gage keeps its station ID and units');
{
  const written = projectToInp(parseInpFile(SRC));
  const t = row(written, 'RAINGAGES', 'rgFile');

  // EPA SWMM reads a FILE gage strictly by position:
  //   0=Name 1=Form 2=Intvl 3=SCF 4=FILE 5=Fname 6=Station 7=Units
  check('FILE gage writes all 8 required tokens', t.length === 8, t);
  check('token 4 is FILE', t[4] === 'FILE', t[4]);
  check('token 5 is the data file name', t[5] === '"rg_bellinge_Jun2010_Aug2021.dat"', t[5]);
  check('token 6 is the station ID', t[6] === 'rg5425', t[6]);
  check('token 7 is the rain units', t[7] === 'MM', t[7]);

  // The bug produced exactly six tokens. Pin that specific shape as dead.
  check('does not regress to the 6-token form the engine rejects', t.length !== 6, t);

  // A TIMESERIES gage has no station/units and must not grow phantom ones.
  const ts = row(written, 'RAINGAGES', 'rgTs');
  check('TIMESERIES gage stays at 6 tokens', ts.length === 6, ts);
  check('TIMESERIES gage names its series', ts[5] === 'ts1', ts[5]);
}

console.log('\n2. CUSTOM cross-section keeps its Shape curve name');
{
  const project = parseInpFile(SRC);
  const xs = project.xsections['LinkCustom'];
  check('parser retains the curve name', xs?.shapeCurve === 'shapeCurve1', xs);
  check('parser keeps Geom1 numeric', xs?.geom1 === 0.7875, xs?.geom1);

  const t = row(projectToInp(project), 'XSECTIONS', 'LinkCustom');
  // Slot 3 (Geom2) is where SWMM looks for the curve on a CUSTOM section.
  check('curve name is written in the Geom2 slot', t[3] === 'shapeCurve1', t);
  check('Geom2 slot is not the literal 0 that caused ERROR 209', t[3] !== '0', t);
  check('Geom1 slot still holds the height', t[2] === '0.7875', t[2]);
  check('barrels still trails the row', t[6] === '1', t);
}

console.log('\n3. STREET and IRREGULAR keep their names in the Geom1 slot');
{
  const written = projectToInp(parseInpFile(SRC));

  const st = row(written, 'XSECTIONS', 'LinkStreet');
  check('STREET name survives the round trip', st[2] === 'Main_St', st);
  check('STREET name is not zeroed', st[2] !== '0', st);

  // IRREGULAR was already correct; guard it so the shape-aware branch that now
  // handles STREET and CUSTOM cannot break it later.
  const ir = row(written, 'XSECTIONS', 'LinkIrr');
  check('IRREGULAR transect name survives', ir[2] === 'tsect1', ir);

  // And an ordinary numeric section must be untouched by all of the above.
  const ci = row(written, 'XSECTIONS', 'LinkCirc');
  check('CIRCULAR geometry is unaffected', ci[2] === '1.5' && ci[3] === '0', ci);
}

console.log('\n4. Round trip is stable across a second save');
{
  const once = projectToInp(parseInpFile(SRC));
  const twice = projectToInp(parseInpFile(once));
  check('second write is byte-identical to the first', once === twice);

  // Re-parsing our own output must not lose what we just fixed — that is the
  // path a user actually takes (open, save, reopen, run).
  const reparsed = parseInpFile(once);
  const rg = reparsed.raingages.find(r => r.id === 'rgFile');
  check('station ID survives reopen', rg?.stationId === 'rg5425', rg);
  check('units survive reopen', rg?.units === 'MM', rg);
  check('curve name survives reopen', reparsed.xsections['LinkCustom']?.shapeCurve === 'shapeCurve1');
  check('street name survives reopen', reparsed.xsections['LinkStreet']?.geom1 === 'Main_St');
}

console.log('\n5. A FILE gage is flagged until its data file is attached');
{
  const project = parseInpFile(SRC);
  const DAT = 'rg_bellinge_Jun2010_Aug2021.dat';
  const noticesFor = (id: string) =>
    analyzeInputIntegrity(project).filter(i => i.objectId === id && /rainfall from/i.test(i.message));

  clearAttachments();
  const hit = noticesFor('rgFile');
  check('unattached FILE gage raises exactly one notice', hit.length === 1, analyzeInputIntegrity(project).map(i => i.message));
  check('notice names the data file', hit[0]?.message.includes(DAT), hit[0]?.message);
  check('notice is a warning, not a hard error', hit[0]?.severity === 'warning', hit[0]?.severity);
  check('notice points at where to fix it', /Data Files/.test(hit[0]?.message || ''), hit[0]?.message);

  // The notice must be specific to FILE gages: a TIMESERIES gage that resolves
  // fine should stay silent, or the warning is just noise on every model.
  check('TIMESERIES gage raises no notice', noticesFor('rgTs').length === 0, noticesFor('rgTs'));

  // Attaching the file must silence it — a warning that never clears trains
  // users to ignore the health panel.
  attachBytesForTest(DAT, new Uint8Array([49, 10, 50]));
  check('attached FILE gage raises no notice', noticesFor('rgFile').length === 0, noticesFor('rgFile'));

  // Name matching follows SWMM's own resolution: base name, case-insensitive.
  clearAttachments();
  attachBytesForTest(DAT.toUpperCase(), new Uint8Array([49]));
  check('case-differing file name still counts as attached', noticesFor('rgFile').length === 0);

  clearAttachments();
  attachBytesForTest('some_other_gage.dat', new Uint8Array([49]));
  check('an unrelated attachment does not silence the notice', noticesFor('rgFile').length === 1);
  clearAttachments();
}

console.log('\n5b. Attached files are handed to the engine beside the model');
{
  const project = parseInpFile(SRC);
  const DAT = 'rg_bellinge_Jun2010_Aug2021.dat';
  clearAttachments();
  check('nothing is shipped when nothing is attached', resolveEngineFiles(project).length === 0);

  attachBytesForTest(DAT, new Uint8Array([1, 2, 3]));
  attachBytesForTest('unreferenced.dat', new Uint8Array([9]));
  const shipped = resolveEngineFiles(project);
  check('only referenced files are shipped', shipped.length === 1, shipped.map(f => f.path));
  check('shipped under the name the .inp uses', shipped[0]?.path === DAT, shipped[0]?.path);
  check('shipped with its real bytes', shipped[0]?.bytes.length === 3, shipped[0]?.bytes);

  // The engine opens the path written in the model, so a directory in the
  // reference has to be preserved rather than flattened.
  const nested = parseInpFile(SRC.replace(DAT, `data/${DAT}`));
  check('a relative sub-path is preserved for the engine', resolveEngineFiles(nested)[0]?.path === `data/${DAT}`, resolveEngineFiles(nested)[0]?.path);

  // An absolute path from the author's machine can never resolve in a sandbox
  // filesystem; falling back to the bare name is what "next to the .inp" means.
  const abs = parseInpFile(SRC.replace(DAT, `C:\\models\\${DAT}`));
  check('a foreign absolute path falls back to the bare name', resolveEngineFiles(abs)[0]?.path === DAT, resolveEngineFiles(abs)[0]?.path);

  // Emscripten FS stand-in: prove the writer actually places the file and
  // creates intermediate directories rather than throwing them away.
  const placed: string[] = [];
  const dirs: string[] = [];
  const fakeFS = {
    writeFile: (p: string, _d: Uint8Array) => { placed.push(p); },
    mkdir: (p: string) => { dirs.push(p); },
  };
  writeCompanionFiles(fakeFS, resolveEngineFiles(nested), '/');
  check('companion written at the absolute engine path', placed[0] === `/data/${DAT}`, placed);
  check('intermediate directory created first', dirs.includes('/data'), dirs);
  clearAttachments();
}

console.log('\n5c. A [TIMESERIES] FILE is an external reference too');
{
  const project = parseInpFile(SRC);
  const TS = 'inflow_hydrograph.dat';
  clearAttachments();

  // Fixture guard: a resolver test is worthless if the model stopped having
  // the reference it is supposed to find.
  check('sample really does declare a FILE time series (fixture still valid)',
    Object.values(project.timeseriesFiles || {}).some(f => f.includes(TS)), project.timeseriesFiles);

  const refs = collectExternalRefs(project);
  const tsRef = refs.find(r => r.kind === 'timeseries');
  check('the FILE time series is collected as an external reference', !!tsRef, refs);
  check('its quoted path is unquoted', tsRef?.path === TS, tsRef?.path);
  check('it is attributed to the series, not a gage', tsRef?.ownerId === 'tsFile', tsRef?.ownerId);

  // Both a gage file and a series file must ship — an engine that receives one
  // and not the other still runs on incomplete forcing data.
  attachBytesForTest(TS, new Uint8Array([7]));
  attachBytesForTest('rg_bellinge_Jun2010_Aug2021.dat', new Uint8Array([8]));
  const shipped = resolveEngineFiles(project).map(f => f.path).sort();
  check('both external files are shipped together', shipped.length === 2, shipped);
  check('the time series file is among them', shipped.includes(TS), shipped);
  clearAttachments();
}

console.log('\n5e. A reference is model data, not a trusted path');
{
  const ORIG = 'FILE  "rg_bellinge_Jun2010_Aug2021.dat"';
  // Guard: a string replacement that silently matches nothing would make every
  // assertion below a test of the untouched fixture.
  check('fixture guard: the FILE gage line is where these variants expect it',
    SRC.includes(ORIG), ORIG);

  const traversal = parseInpFile(SRC.replace(ORIG, 'FILE  "../../etc/passwd"'));
  clearAttachments();
  attachBytesForTest('passwd', new Uint8Array([1]));
  const escaped = resolveEngineFiles(traversal).map(f => f.path);
  check('a climbing path collapses to its bare name',
    escaped.every(p => !p.includes('..')), escaped);

  // A reference naming the run's own model file would have the companion
  // writer clobber the model just written for the engine.
  const collide = parseInpFile(SRC.replace(ORIG, 'FILE  "model.inp"'));
  clearAttachments();
  attachBytesForTest('model.inp', new Uint8Array([1]));
  check('a reference to the run\'s own model file is refused',
    resolveEngineFiles(collide).length === 0, resolveEngineFiles(collide).map(f => f.path));
  clearAttachments();
}

console.log('\n5d. The server envelope carries the bytes intact');
{
  const project = parseInpFile(SRC);
  const DAT = 'rg_bellinge_Jun2010_Aug2021.dat';
  clearAttachments();

  // Bytes above 0x7F and a NUL prove the encoder is not going through a
  // UTF-8 text path, which would silently mangle a binary data file.
  const payload = new Uint8Array([0, 1, 127, 128, 200, 255, 10, 13]);
  attachBytesForTest(DAT, payload);
  const envelope = encodeAttachmentsForServer(project);
  check('one entry per shipped file', envelope.length === 1, envelope.map(e => e.name));
  check('entry is named for the engine path', envelope[0]?.name === DAT, envelope[0]?.name);
  const decoded = Uint8Array.from(atob(envelope[0].data), c => c.charCodeAt(0));
  check('base64 round-trips byte-for-byte', decoded.length === payload.length && payload.every((b, i) => decoded[i] === b), decoded);

  // A chunked encoder is easy to get wrong at the chunk seam.
  clearAttachments();
  const big = new Uint8Array(0x8000 * 2 + 5);
  for (let i = 0; i < big.length; i++) big[i] = i % 256;
  attachBytesForTest(DAT, big);
  const bigDecoded = Uint8Array.from(atob(encodeAttachmentsForServer(project)[0].data), c => c.charCodeAt(0));
  check('encoding is correct across chunk boundaries',
    bigDecoded.length === big.length && bigDecoded[0x8000] === big[0x8000] && bigDecoded[big.length - 1] === big[big.length - 1],
    { len: bigDecoded.length, expected: big.length });

  // The advertised limit must actually survive base64 inflation inside the
  // server's own body cap, or the user gets an opaque 413 instead.
  const SERVER_BODY_CAP = 25 * 1024 * 1024;
  check('limit leaves room for base64 inflation under the server body cap',
    Math.ceil(SERVER_ATTACHMENT_LIMIT / 3) * 4 < SERVER_BODY_CAP,
    { encoded: Math.ceil(SERVER_ATTACHMENT_LIMIT / 3) * 4, cap: SERVER_BODY_CAP });
  clearAttachments();
}

console.log('\n6. Negative control: the checks can actually fail');
{
  // Prove sections 1-3 are not vacuous by feeding the writer a project whose
  // names have been stripped, exactly as the old code left them.
  const project = parseInpFile(SRC);
  const rg = project.raingages.find(r => r.id === 'rgFile')!;
  rg.stationId = undefined;
  rg.units = undefined;
  project.xsections['LinkCustom'].shapeCurve = undefined;

  const written = projectToInp(project);
  const t = row(written, 'RAINGAGES', 'rgFile');
  const x = row(written, 'XSECTIONS', 'LinkCustom');
  check('stripped FILE gage really does fall back to 6 tokens', t.length === 6, t);
  check('stripped CUSTOM really does emit a numeric Geom2', x[3] === '0', x);
}

console.log('\n7. Quoted file paths containing spaces stay one token');
{
  // Whitespace tokenisation splits a quoted path apart and slides the station
  // and units into the wrong slots — the same corruption, one layer lower.
  const src = SRC.replace(
    'FILE  "rg_bellinge_Jun2010_Aug2021.dat" rg5425 MM',
    'FILE  "C:\\My Rain Data\\rg 5425.dat" rg5425 MM 1/1/2010',
  );
  const project = parseInpFile(src);
  const rg = project.raingages.find(r => r.id === 'rgFile');
  check('quoted path with spaces parses as ONE token', rg?.sourceName === '"C:\\My Rain Data\\rg 5425.dat"', rg?.sourceName);
  check('station ID is not the tail of the path', rg?.stationId === 'rg5425', rg?.stationId);
  check('units are not shifted', rg?.units === 'MM', rg?.units);
  check('optional start date is captured', rg?.startDate === '1/1/2010', rg?.startDate);

  const t = row(projectToInp(project), 'RAINGAGES', 'rgFile');
  check('written line keeps the quoted path intact', t[5] === '"C:\\My', t[5]);
  const written = section(projectToInp(project), 'RAINGAGES').find(l => l.startsWith('rgFile'))!;
  check('written line ends with station, units and start date',
    /"C:\\My Rain Data\\rg 5425\.dat"\s+rg5425\s+MM\s+1\/1\/2010\s*$/.test(written), written);

  // Unquoted lines must tokenise exactly as before.
  check('unquoted TIMESERIES gage is unaffected by quote handling',
    row(projectToInp(parseInpFile(SRC)), 'RAINGAGES', 'rgTs').length === 6);
}

console.log('\n8. Groundwater and aquifer optional columns survive');
{
  const src = SRC + `
[AQUIFERS]
AQUIFER-1  0.4  0.15  0.3  5  5  5  0.5  10  0.02  0  2  0.25  SEASONAL

[GROUNDWATER]
S1  AQUIFER-1  J1  10  0.001  1  0  1  0  0  1  0  2  0.25
S2  AQUIFER-1  J2  10  0.001  1  0  1  0  0  *  0  2  0.25

[SUBCATCHMENTS]
S1  rgTs  J1  10  50  500  0.5  0
S2  rgTs  J2  10  50  500  0.5  0
`;
  const project = parseInpFile(src);

  check('aquifer evaporation pattern name is retained', project.aquifers[0]?.params?.[0] === 'SEASONAL', project.aquifers[0]?.params);
  check('pattern name is not coerced to 0', String(project.aquifers[0]?.params?.[0]) !== '0', project.aquifers[0]?.params);

  const gw1 = project.groundwater.find(g => g.subcatchId === 'S1');
  check('groundwater keeps its four optional columns', gw1?.params.length === 3, gw1?.params);

  const written = projectToInp(project);
  const aq = row(written, 'AQUIFERS', 'AQUIFER-1');
  check('written aquifer row carries the pattern name', aq[13] === 'SEASONAL', aq);
  check('written aquifer row is not truncated at Umc', aq.length === 14, aq.length);

  const g1 = row(written, 'GROUNDWATER', 'S1');
  check('written groundwater row keeps all 14 columns', g1.length === 14, g1);
  check('trailing groundwater values are not dropped', g1[11] === '0' && g1[12] === '2' && g1[13] === '0.25', g1.slice(11));

  // "*" means "use the surface elevation" — writing 0 instead is a real
  // elevation and a real behaviour change.
  const g2 = row(written, 'GROUNDWATER', 'S2');
  check('literal "*" threshold survives instead of becoming 0', g2[10] === '*', g2[10]);

  const reparsed = parseInpFile(written);
  check('pattern name survives a second round trip', reparsed.aquifers[0]?.params?.[0] === 'SEASONAL');
  check('groundwater columns survive a second round trip',
    reparsed.groundwater.find(g => g.subcatchId === 'S1')?.params.length === 3);
  check('aquifer/groundwater write is idempotent', projectToInp(reparsed) === written);
}

console.log('\n9. The real Greenville sample round-trips without silent loss');
{
  // This is the model the app ships with, and it exercises both defects above.
  // If the fixture ever moves, skip loudly rather than passing on nothing.
  const { existsSync, readFileSync: rf } = await import('fs');
  const candidates = [
    'attached_assets/Greenville_all_SWMM5_Features_1773159138883.inp',
    'samples/Greenville_all_SWMM5_Features.inp',
  ];
  const path = candidates.find(existsSync);
  if (!path) {
    fail++;
    console.error('  ✗ Greenville sample not found — checked:', candidates.join(', '));
  } else {
    const original = rf(path, 'utf8');
    const written = projectToInp(parseInpFile(original));

    const origAq = section(original, 'AQUIFERS');
    const newAq = section(written, 'AQUIFERS');
    check('sample really does contain an ETupat pattern (fixture still valid)',
      origAq.some(l => /\bSEASONAL\b/.test(l)), origAq[0]);
    check('every aquifer keeps its pattern name',
      newAq.filter(l => /\bSEASONAL\b/.test(l)).length === origAq.filter(l => /\bSEASONAL\b/.test(l)).length,
      { before: origAq.length, after: newAq.length });

    const origGw = section(original, 'GROUNDWATER');
    const newGw = section(written, 'GROUNDWATER');
    check('sample really does have optional groundwater columns (fixture still valid)',
      origGw.length > 0 && origGw[0].trim().split(/\s+/).length > 11, origGw[0]);
    check('no groundwater row loses columns on save',
      origGw.length === newGw.length &&
      origGw.every((l, i) => newGw[i].trim().split(/\s+/).length === l.trim().split(/\s+/).length),
      { firstBefore: origGw[0], firstAfter: newGw[0] });
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
