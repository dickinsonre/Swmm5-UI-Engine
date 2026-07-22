import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseInpFile, projectToInp, SAMPLE_INP } from '../../client/src/lib/inp-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));

type Diff = { path: string; kind: 'altered' | 'omitted' | 'added'; before?: unknown; after?: unknown };

const NUM_TOL = 1e-9;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function normalizeScalar(v: unknown): unknown {
  if (typeof v === 'string') {
    const t = v.trim();
    if (t !== '' && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(t)) return Number(t);
    return t;
  }
  return v;
}

function scalarsEqual(a: unknown, b: unknown): boolean {
  const na = normalizeScalar(a);
  const nb = normalizeScalar(b);
  if (typeof na === 'number' && typeof nb === 'number') {
    if (Number.isNaN(na) && Number.isNaN(nb)) return true;
    const scale = Math.max(Math.abs(na), Math.abs(nb), 1);
    return Math.abs(na - nb) <= NUM_TOL * scale;
  }
  return na === nb;
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

/** Compare `before` (original parse) against `after` (re-parse of exported INP). */
function deepDiff(before: unknown, after: unknown, path: string, out: Diff[]): void {
  if (isEmpty(before) && isEmpty(after)) return;
  if (isEmpty(after) && !isEmpty(before)) {
    out.push({ path, kind: 'omitted', before });
    return;
  }
  if (isEmpty(before) && !isEmpty(after)) {
    out.push({ path, kind: 'added', after });
    return;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length) {
      out.push({ path: `${path}.length`, kind: 'altered', before: before.length, after: after.length });
    }
    const n = Math.max(before.length, after.length);
    for (let i = 0; i < n; i++) deepDiff(before[i], after[i], `${path}[${i}]`, out);
    return;
  }
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const k of keys) deepDiff(before[k], after[k], `${path}.${k}`, out);
    return;
  }
  if (!scalarsEqual(before, after)) {
    out.push({ path, kind: 'altered', before, after });
  }
}

/** Normalize a project for comparison: raw section lines collapse whitespace. */
function normalizeProject(p: ReturnType<typeof parseInpFile>): ReturnType<typeof parseInpFile> {
  const clone = JSON.parse(JSON.stringify(p)) as ReturnType<typeof parseInpFile>;
  const raw: Record<string, string[]> = {};
  for (const [name, lines] of Object.entries(clone.rawSections || {})) {
    const data = (lines as string[])
      .map(l => l.replace(/\s+/g, ' ').trim())
      .filter(l => l && !l.startsWith(';'));
    if (data.length) raw[name.toUpperCase()] = data;
  }
  clone.rawSections = raw;
  // Title lines: trim
  clone.title = (clone.title || []).map(t => t.trim()).filter(Boolean);
  return clone;
}

function fmtVal(v: unknown): string {
  const s = JSON.stringify(v);
  return s && s.length > 120 ? s.slice(0, 117) + '…' : String(s);
}

interface CaseResult {
  name: string;
  diffs: Diff[];
  error?: string;
}

function runCase(name: string, inpText: string): CaseResult {
  try {
    const first = parseInpFile(inpText);
    const exported = projectToInp(first);
    const second = parseInpFile(exported);
    const diffs: Diff[] = [];
    deepDiff(normalizeProject(first), normalizeProject(second), '$', diffs);
    return { name, diffs };
  } catch (e) {
    return { name, diffs: [], error: e instanceof Error ? e.stack || e.message : String(e) };
  }
}

// Targeted assertions: verify specific values survive the round trip.
type Assertion = { desc: string; get: (p: ReturnType<typeof parseInpFile>) => unknown; expect: unknown };

const COMPREHENSIVE_ASSERTIONS: Assertion[] = [
  { desc: 'weir W2 width preserved', get: p => p.weirs.find(w => w.id === 'W2')?.width, expect: 10 },
  { desc: 'weir W2 surcharge flag', get: p => p.weirs.find(w => w.id === 'W2')?.surcharge, expect: 'YES' },
  { desc: 'xsection C4 culvert code', get: p => Number(p.xsections['C4']?.culvert), expect: 3 },
  { desc: 'xsection C4 barrels', get: p => p.xsections['C4']?.barrels, expect: 1 },
  { desc: 'storage ST1 suction head (psi)', get: p => p.storageUnits.find(s => s.id === 'ST1')?.psi, expect: 4.0 },
  { desc: 'storage ST1 ksat', get: p => p.storageUnits.find(s => s.id === 'ST1')?.ksat, expect: 0.4 },
  { desc: 'storage ST1 imd', get: p => p.storageUnits.find(s => s.id === 'ST1')?.imd, expect: 0.35 },
  { desc: 'storage ST2 tabular curve name', get: p => p.storageUnits.find(s => s.id === 'ST2')?.curveParams?.[0], expect: 'SC1' },
  { desc: 'FILE timeseries TS2 preserved', get: p => p.timeseriesFiles?.['TS2'], expect: 'inflow.dat' },
  { desc: 'timeseries TS1 point count', get: p => p.timeseries['TS1']?.length, expect: 3 },
  { desc: 'timeseries TS1 second value', get: p => p.timeseries['TS1']?.[1]?.value, expect: 0.25 },
  { desc: 'LID usage drainTo', get: p => p.lidUsage[0]?.drainTo, expect: 'S1' },
  { desc: 'LID usage fromPerv', get: p => Number(p.lidUsage[0]?.fromPerv), expect: 30 },
  { desc: 'LID usage rptFile', get: p => String(p.lidUsage[0]?.rptFile || '').replace(/"/g, ''), expect: 'rpt.txt' },
  { desc: 'LID control layer count', get: p => p.lidControls.find(l => l.id === 'LID1')?.layers.length, expect: 4 },
  { desc: 'MAP units preserved', get: p => p.mapExtent?.units, expect: 'Feet' },
  { desc: 'RDII raw section preserved', get: p => (p.rawSections['RDII'] || []).filter(l => l.trim() && !l.trim().startsWith(';')).length, expect: 1 },
  { desc: 'HYDROGRAPHS raw section preserved', get: p => (p.rawSections['HYDROGRAPHS'] || []).filter(l => l.trim() && !l.trim().startsWith(';')).length, expect: 4 },
  { desc: 'TREATMENT lines preserved', get: p => (p.rawSections['TREATMENT'] || []).filter(l => l.trim() && !l.trim().startsWith(';')).length, expect: 2 },
  { desc: 'controls rule lines', get: p => p.controls.length >= 3, expect: true },
  { desc: 'transect TR1 station count', get: p => p.transects.find(t => t.id === 'TR1')?.stations.length, expect: 5 },
  { desc: 'transect TR1 channel roughness', get: p => p.transects.find(t => t.id === 'TR1')?.roughness.channel, expect: 0.035 },
  { desc: 'groundwater entry preserved', get: p => p.groundwater.length, expect: 1 },
  { desc: 'aquifer AQ1 porosity', get: p => p.aquifers.find(a => a.id === 'AQ1')?.porosity, expect: 0.5 },
  { desc: 'snowpack SP1 surface groups', get: p => Object.keys(p.snowpacks.find(s => s.id === 'SP1')?.parameters || {}).length, expect: 4 },
  { desc: 'pollutant Lead co-pollutant', get: p => p.pollutants.find(po => po.id === 'Lead')?.coPollutant, expect: 'TSS' },
  { desc: 'landuse Residential sweep interval', get: p => p.landuses.find(l => l.id === 'Residential')?.sweepInterval, expect: 7 },
  { desc: 'DWF pattern preserved', get: p => p.dwf.find(d => d.nodeId === 'J1')?.patterns.filter(x => x && x !== '""').length, expect: 1 },
  { desc: 'divider DV1 cutoff flow', get: p => p.dividers.find(d => d.id === 'DV1')?.cutoffFlow, expect: 2.5 },
  { desc: 'outfall OF3 timeseries stage data', get: p => p.outfalls.find(o => o.id === 'OF3')?.stageData, expect: 'TIDE1' },
  { desc: 'outfall OF3 route-to', get: p => p.outfalls.find(o => o.id === 'OF3')?.routeTo, expect: 'J2' },
  { desc: 'pump P1 startup depth', get: p => p.pumps.find(x => x.id === 'P1')?.startupDepth, expect: 4.5 },
  { desc: 'orifice OR1 close time', get: p => p.orifices.find(o => o.id === 'OR1')?.closeTime, expect: 0.2 },
  { desc: 'outlet OT1 rating curve', get: p => p.outlets.find(o => o.id === 'OT1')?.curveOrTable, expect: 'RC1' },
  { desc: 'conduit C1 losses seepage', get: p => p.losses['C1']?.seepageRate, expect: 0.001 },
  { desc: 'curve SC1 typed as STORAGE', get: p => p.curves['SC1']?.[0]?.type, expect: 'STORAGE' },
  { desc: 'curve SC1 point count', get: p => p.curves['SC1']?.length, expect: 3 },
  { desc: 'pattern HP1 24 multipliers', get: p => p.patterns['HP1']?.multipliers.length, expect: 24 },
  { desc: 'pattern DP1 7 daily multipliers', get: p => p.patterns['DP1']?.multipliers.length, expect: 7 },
  { desc: 'label preserved', get: p => p.labels[0]?.text, expect: 'Pump Station' },
  { desc: 'subarea S2 pctRouted', get: p => Number(p.subareas['S2']?.pctRouted), expect: 50 },
  { desc: 'raingage RG2 FILE source', get: p => p.raingages.find(r => r.id === 'RG2')?.sourceType, expect: 'FILE' },
];

function runAssertions(inpText: string): { pass: number; failures: string[] } {
  const first = parseInpFile(inpText);
  const second = parseInpFile(projectToInp(first));
  const failures: string[] = [];
  let pass = 0;
  for (const a of COMPREHENSIVE_ASSERTIONS) {
    for (const [stage, proj] of [['parse', first], ['round-trip', second]] as const) {
      const got = a.get(proj);
      const ok = typeof a.expect === 'number' && typeof got === 'number'
        ? Math.abs(got - a.expect) <= NUM_TOL * Math.max(Math.abs(a.expect), 1)
        : got === a.expect;
      if (ok) pass++;
      else failures.push(`  ✗ [${stage}] ${a.desc}: expected ${fmtVal(a.expect)}, got ${fmtVal(got)}`);
    }
  }
  return { pass, failures };
}

// ---- main ----
const fixturesDir = join(__dirname, 'fixtures');
const fixtures: { name: string; text: string }[] = readdirSync(fixturesDir)
  .filter(f => f.endsWith('.inp'))
  .sort()
  .map(f => ({ name: f, text: readFileSync(join(fixturesDir, f), 'utf8') }));
fixtures.push({ name: 'SAMPLE_INP (built-in)', text: SAMPLE_INP });

let failed = 0;
console.log('=== INP Round-Trip Audit ===\n');

for (const fx of fixtures) {
  const res = runCase(fx.name, fx.text);
  if (res.error) {
    failed++;
    console.log(`✗ ${fx.name}: ERROR\n${res.error}\n`);
    continue;
  }
  if (res.diffs.length === 0) {
    console.log(`✓ ${fx.name}: all parsed properties preserved`);
  } else {
    failed++;
    console.log(`✗ ${fx.name}: ${res.diffs.length} difference(s)`);
    for (const d of res.diffs.slice(0, 40)) {
      if (d.kind === 'omitted') console.log(`    OMITTED ${d.path}  was ${fmtVal(d.before)}`);
      else if (d.kind === 'added') console.log(`    ADDED   ${d.path}  now ${fmtVal(d.after)}`);
      else console.log(`    ALTERED ${d.path}  ${fmtVal(d.before)} → ${fmtVal(d.after)}`);
    }
    if (res.diffs.length > 40) console.log(`    … and ${res.diffs.length - 40} more`);
  }
}

console.log('\n=== Targeted field assertions (comprehensive.inp) ===');
const compText = fixtures.find(f => f.name === 'comprehensive.inp')!.text;
const { pass, failures } = runAssertions(compText);
console.log(`${pass} assertion checks passed`);
if (failures.length) {
  failed++;
  console.log(`${failures.length} FAILED:`);
  failures.forEach(f => console.log(f));
}

console.log(failed ? `\nRESULT: FAIL (${failed} failing group(s))` : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
