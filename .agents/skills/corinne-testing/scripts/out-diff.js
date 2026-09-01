#!/usr/bin/env node
/**
 * Test 3: diff the results, do not trust the continuity line.
 *
 * A mass-balance error is a scalar summary of a whole run. It is blind to a
 * change that moves water around without losing any — a hydrograph can shift,
 * flatten or arrive late while continuity stays put. This script opens two
 * SWMM binary output files and compares every reporting period of every
 * element against that element's OWN peak, so "continuity barely moved"
 * cannot stand in for "nothing happened".
 *
 * It runs the controls the claim needs before it runs the comparison:
 *   - same question:  refuses if the two files are not the same network,
 *                     the same length and the same units
 *   - null effect:    byte-identical files are reported as such and nothing
 *                     further is claimed
 *   - magnitude floor: elements whose peak never clears the floor are dropped
 *                     and counted, so a 300 % swing in a trickle cannot
 *                     become a headline
 *   - conduits only:   pumps, orifices, weirs and outlets are excluded by
 *                     default because their flows are set by control rules,
 *                     not by the routing being tested
 *
 * Usage
 *   node out-diff.js A.out B.out [options]
 *
 * Options
 *   --floor F        flow magnitude floor, in the file's own flow units
 *                    (default: the equivalent of 1 L/s)
 *   --node-floor D   node depth floor, in the file's own length units
 *                    (default: the equivalent of 1 mm)
 *   --all-links      include pumps, orifices, weirs and outlets
 *   --csv FILE       write the per-element table
 *   --json           machine-readable output
 *   --top N          how many worst elements to list (default 10)
 *
 * No dependencies. Run it; do not re-derive it.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MAGIC = 516114522;

const FLOW_UNITS = ['CFS', 'GPM', 'MGD', 'CMS', 'LPS', 'MLD'];
/** 1 litre/second expressed in each of SWMM's flow units. */
const ONE_LPS_IN = [0.0353146667, 15.8503231, 0.0228244653, 0.001, 1.0, 0.0864];
/** 1 millimetre expressed in each unit system's length unit (ft for US, m for SI). */
const ONE_MM_IN_FT = 0.0032808399;
const ONE_MM_IN_M = 0.001;
const LINK_TYPES = ['CONDUIT', 'PUMP', 'ORIFICE', 'WEIR', 'OUTLET'];

// ------------------------------------------------------------------ reading

/**
 * Read the header of a SWMM binary .out file.
 *
 * The layout has two traps. The input-property sections are INTERLEAVED per
 * object class — count, codes, then values, three times — rather than grouped;
 * and a block of reporting-variable counts sits between them and the report
 * start date. Walking past either one lands mid-record and yields plausible
 * nonsense, so the walked offset is cross-checked against the authoritative
 * results position stored in the closing records.
 */
function readOut(path) {
  const buf = readFileSync(path);
  if (buf.length < 64) throw new Error(`${path}: too small to be a SWMM .out file`);

  let off = 0;
  const i4 = () => { const v = buf.readInt32LE(off); off += 4; return v; };
  const f8 = () => { const v = buf.readDoubleLE(off); off += 8; return v; };

  const magic1 = i4();
  if (magic1 !== MAGIC) throw new Error(`${path}: not a SWMM .out file (magic ${magic1})`);
  const version = i4();
  const flowUnits = i4();
  const nSub = i4();
  const nNode = i4();
  const nLink = i4();
  const nPoll = i4();

  const names = n => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const len = i4();
      out.push(buf.toString('latin1', off, off + len));
      off += len;
    }
    return out;
  };
  const subNames = names(nSub);
  const nodeNames = names(nNode);
  const linkNames = names(nLink);
  names(nPoll);
  for (let i = 0; i < nPoll; i++) i4(); // concentration units

  // Each object's property record MIXES TYPES: when the first property code is
  // INPUT_TYPE_CODE the engine writes that slot as an INT4 and the rest as
  // REAL4. The record length is the same either way, so reading the type slot
  // as a float keeps every later offset correct while silently returning 0 —
  // a weir (type 3) becomes a denormal that rounds to zero and masquerades as
  // a conduit. Read the slot as what it is.
  const INPUT_TYPE_CODE = 0;
  const propSection = nObj => {
    const nProps = i4();
    const codes = [];
    for (let i = 0; i < nProps; i++) codes.push(i4());
    const hasType = codes[0] === INPUT_TYPE_CODE;
    const types = new Int32Array(nObj);
    const values = new Float32Array(nObj * nProps);
    for (let o = 0; o < nObj; o++) {
      for (let p = 0; p < nProps; p++) {
        if (p === 0 && hasType) types[o] = buf.readInt32LE(off);
        else values[o * nProps + p] = buf.readFloatLE(off);
        off += 4;
      }
    }
    return { nProps, codes, values, types, hasType };
  };
  propSection(nSub);
  propSection(nNode);
  const linkProps = propSection(nLink);

  // Keep the CODES, not just the count. Two files can report the same NUMBER
  // of link variables while reporting different variables, and then index 0
  // means flow in one file and something else in the other.
  const varSection = () => {
    const n = i4();
    const codes = [];
    for (let i = 0; i < n; i++) codes.push(i4());
    return codes;
  };
  const subVarCodes = varSection();
  const nodeVarCodes = varSection();
  const linkVarCodes = varSection();
  const sysVarCodes = varSection();
  const nSubVars = subVarCodes.length;
  const nNodeVars = nodeVarCodes.length;
  const nLinkVars = linkVarCodes.length;
  const nSysVars = sysVarCodes.length;

  const reportStart = f8();
  const reportStep = i4();
  let startPos = off;

  // Closing records: IDpos, inputPos, outputPos, nPeriods, errorCode, magic2.
  const magic2 = buf.readInt32LE(buf.length - 4);
  const errorCode = buf.readInt32LE(buf.length - 8);
  const nPeriodsStored = buf.readInt32LE(buf.length - 12);
  const outputStartPos = buf.readInt32LE(buf.length - 16);
  if (magic2 !== MAGIC) throw new Error(`${path}: closing magic is ${magic2}, file is truncated or corrupt`);
  if (outputStartPos > 0 && outputStartPos < buf.length) startPos = outputStartPos;

  const bytesPerStep = 8 + 4 * (nSub * nSubVars + nNode * nNodeVars + nLink * nLinkVars + nSysVars);
  let nPeriods = nPeriodsStored;
  if (!(nPeriods > 0)) nPeriods = Math.floor((buf.length - startPos - 24) / bytesPerStep);

  // The file must actually contain the periods it advertises.
  const need = startPos + nPeriods * bytesPerStep;
  if (need > buf.length - 24) {
    throw new Error(`${path}: header claims ${nPeriods} periods but the file holds only ` +
      `${Math.floor((buf.length - startPos - 24) / bytesPerStep)}`);
  }

  // Link type code, so conduits can be separated from control structures.
  if (!linkProps.hasType) {
    throw new Error(`${path}: link property block has no type code (codes ${linkProps.codes.join(',')})`);
  }
  const linkTypes = Array.from(linkProps.types);

  return {
    path, buf, version, flowUnits, nSub, nNode, nLink, nPoll,
    subNames, nodeNames, linkNames, linkTypes,
    nSubVars, nNodeVars, nLinkVars, nSysVars,
    subVarCodes, nodeVarCodes, linkVarCodes, sysVarCodes,
    reportStart, reportStep, startPos, nPeriods, bytesPerStep, errorCode,
  };
}

/** One variable of one object, across every reporting period. */
function series(o, kind, index, varIdx) {
  const base = kind === 'node'
    ? o.nSub * o.nSubVars + index * o.nNodeVars
    : o.nSub * o.nSubVars + o.nNode * o.nNodeVars + index * o.nLinkVars;
  const out = new Float64Array(o.nPeriods);
  for (let p = 0; p < o.nPeriods; p++) {
    out[p] = o.buf.readFloatLE(o.startPos + p * o.bytesPerStep + 8 + 4 * (base + varIdx));
  }
  return out;
}

// ---------------------------------------------------------------- comparing

function compareElement(a, b) {
  const n = a.length;
  let peakA = 0, peakB = 0, argA = 0, argB = 0;
  for (let i = 0; i < n; i++) {
    const va = Math.abs(a[i]), vb = Math.abs(b[i]);
    if (va > peakA) { peakA = va; argA = i; }
    if (vb > peakB) { peakB = vb; argB = i; }
  }
  const denom = Math.max(peakA, peakB);
  if (!(denom > 0)) {
    return { peakA, peakB, denom, worst: 0, mean: 0, peakChange: 0, shiftPeriods: 0, shape: NaN, perPeriod: null };
  }
  const perPeriod = new Float64Array(n);
  let worst = 0, sum = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(b[i] - a[i]) / denom;
    perPeriod[i] = d;
    if (d > worst) worst = d;
    sum += d;
  }
  // Shape and timing with the peak change divided out: rescale B onto A's peak
  // and see what disagreement survives. A pure amplitude change collapses to
  // ~0 here; a shifted or reshaped hydrograph does not.
  // Undefined, not zero, when one side never rises off zero: there is no
  // common scale to divide out, and a signal that appears or vanishes is a
  // finding in its own right rather than a shape change of size 0.
  let shape = NaN;
  if (peakB > 0 && peakA > 0) {
    shape = 0;
    const k = peakA / peakB;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(b[i] * k - a[i]) / peakA;
      if (d > shape) shape = d;
    }
  }
  return {
    peakA, peakB, denom,
    worst,
    mean: sum / n,
    peakChange: peakA > 0 ? (peakB - peakA) / peakA : NaN,
    shiftPeriods: argB - argA,
    shape,
    perPeriod,
  };
}

const quantile = (sorted, q) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : NaN;

function distribution(values) {
  const s = [...values].sort((x, y) => x - y);
  const n = s.length;
  const past = t => (n ? s.filter(v => v > t).length / n : NaN);
  return {
    n,
    median: quantile(s, 0.5),
    p90: quantile(s, 0.9),
    max: n ? s[n - 1] : NaN,
    past1: past(0.01),
    past10: past(0.10),
    past25: past(0.25),
  };
}

// ---------------------------------------------------------------- reporting

const pct = x => (Number.isFinite(x) ? `${(x * 100).toFixed(1)} %` : 'n/a');
const sgn = x => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)} %` : 'n/a');

function printDistribution(label, d) {
  console.log(`  ${label} (${d.n} elements)`);
  console.log(`    median ${pct(d.median)}   p90 ${pct(d.p90)}   worst ${pct(d.max)}`);
  console.log(`    past 1 % ${pct(d.past1)}   past 10 % ${pct(d.past10)}   past 25 % ${pct(d.past25)}`);
}

/**
 * The continuity line from a sibling .rpt, if one is there. It is printed as
 * the diagnostic the comparison is meant to outrank — never as evidence.
 */
function siblingContinuity(outPath) {
  const rpt = outPath.replace(/\.out$/i, '.rpt');
  if (!existsSync(rpt)) return null;
  const text = readFileSync(rpt, 'latin1');
  const grab = re => { const m = text.match(re); return m ? Number(m[1]) : null; };
  return {
    path: rpt,
    runoff: grab(/Runoff Quantity Continuity[\s\S]{0,4000}?Continuity Error \(%\)\s*\.+\s*(-?[\d.]+)/),
    flow: grab(/Flow Routing Continuity[\s\S]{0,4000}?Continuity Error \(%\)\s*\.+\s*(-?[\d.]+)/),
  };
}

// -------------------------------------------------------------------- main

function parseArgs(argv) {
  const a = { top: 10 };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === '--floor') a.floor = Number(next());
    else if (k === '--node-floor') a.nodeFloor = Number(next());
    else if (k === '--all-links') a.allLinks = true;
    else if (k === '--csv') a.csv = next();
    else if (k === '--json') a.json = true;
    else if (k === '--top') a.top = Number(next());
    else if (k === '--help' || k === '-h') a.help = true;
    else if (k.startsWith('--')) throw new Error(`unknown option: ${k}`);
    else rest.push(k);
  }
  a.files = rest;
  return a;
}

function sameQuestion(A, B) {
  const problems = [];
  const eq = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
  if (A.flowUnits !== B.flowUnits) {
    problems.push(`flow units differ: ${FLOW_UNITS[A.flowUnits]} vs ${FLOW_UNITS[B.flowUnits]}`);
  }
  if (!eq(A.nodeNames, B.nodeNames)) problems.push(`node sets differ (${A.nNode} vs ${B.nNode})`);
  if (!eq(A.linkNames, B.linkNames)) problems.push(`link sets differ (${A.nLink} vs ${B.nLink})`);
  if (A.nPeriods !== B.nPeriods) problems.push(`period counts differ: ${A.nPeriods} vs ${B.nPeriods}`);
  if (A.reportStep !== B.reportStep) problems.push(`report steps differ: ${A.reportStep} s vs ${B.reportStep} s`);
  if (!eq(A.nodeVarCodes, B.nodeVarCodes) || !eq(A.linkVarCodes, B.linkVarCodes)) {
    problems.push('reported variables differ (different pollutant sets?) — the same ' +
      'column index does not hold the same quantity in both files');
  }
  // Same names, same count, same step, but starting at a different moment:
  // comparing by index would line up two different timestamps and call the
  // offset a difference between the runs.
  if (A.reportStart !== B.reportStart) {
    problems.push(`report start dates differ: ${A.reportStart} vs ${B.reportStart} (decimal days)`);
  }
  // A link that changed type changes which population "conduits only" selects,
  // so the two sides would be summarising different sets of links.
  if (!eq(A.linkTypes, B.linkTypes)) {
    const changed = A.linkTypes
      .map((t, i) => (t === B.linkTypes[i] ? null : A.linkNames[i]))
      .filter(Boolean);
    problems.push(`link types differ (${changed.slice(0, 5).join(', ')}${changed.length > 5 ? ', …' : ''})`);
  }
  return problems;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  if (args.help || args.files.length !== 2) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
    process.exit(args.help ? 0 : 2);
  }

  const [pathA, pathB] = args.files;
  let A, B;
  try {
    A = readOut(pathA);
    B = readOut(pathB);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  // Control: are these two files even answering the same question?
  const problems = sameQuestion(A, B);
  if (problems.length) {
    console.error('These two files are not answering the same question:');
    for (const p of problems) console.error(`  - ${p}`);
    console.error('\nRefusing to compare. Any number produced here would be a comparison');
    console.error('of two different questions, not of one change.');
    process.exit(1);
  }

  const unitName = FLOW_UNITS[A.flowUnits] || `units#${A.flowUnits}`;
  const si = A.flowUnits >= 3;
  const floor = Number.isFinite(args.floor) ? args.floor : ONE_LPS_IN[A.flowUnits];
  const nodeFloor = Number.isFinite(args.nodeFloor) ? args.nodeFloor : (si ? ONE_MM_IN_M : ONE_MM_IN_FT);

  console.log('');
  console.log('Results diff');
  console.log('='.repeat(60));
  console.log(`  A  ${pathA}`);
  console.log(`  B  ${pathB}`);
  console.log('');

  // Census: say what was actually compared before saying what it showed.
  const conduitIdx = [];
  for (let l = 0; l < A.nLink; l++) {
    if (args.allLinks || A.linkTypes[l] === 0) conduitIdx.push(l);
  }
  const typeCensus = {};
  for (const t of A.linkTypes) {
    const name = LINK_TYPES[t] || `type#${t}`;
    typeCensus[name] = (typeCensus[name] || 0) + 1;
  }
  console.log('  Network');
  console.log(`    ${A.nNode} nodes, ${A.nLink} links ` +
    `(${Object.entries(typeCensus).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ')}), ` +
    `${A.nSub} subcatchments`);
  console.log(`    ${A.nPeriods} reporting periods at ${A.reportStep} s, flow in ${unitName}`);
  console.log(`    comparing ${conduitIdx.length} link${conduitIdx.length === 1 ? '' : 's'}` +
    `${args.allLinks ? ' (all types)' : ' (conduits only; --all-links to widen)'}`);
  if (A.errorCode !== 0 || B.errorCode !== 0) {
    console.log(`    WARNING: engine error codes A=${A.errorCode} B=${B.errorCode} — a run did not finish clean`);
  }
  console.log('');

  // Control: the null effect. If the bytes are identical there is nothing to
  // measure, and no amount of downstream statistics should pretend otherwise.
  if (A.buf.length === B.buf.length && A.buf.equals(B.buf)) {
    console.log('  The two files are byte-identical.');
    console.log('  The change under test produced no effect on results at all.');
    console.log('  Nothing further is claimed.');
    console.log('');
    process.exit(0);
  }

  const rows = [];
  let belowFloor = 0;
  const collect = (kind, idx, names, varIdx, fl, unit) => {
    for (const i of idx) {
      const c = compareElement(series(A, kind, i, varIdx), series(B, kind, i, varIdx));
      if (c.denom < fl) { belowFloor++; continue; }
      rows.push({ kind, name: names[i], unit, ...c });
    }
  };
  collect('link', conduitIdx, A.linkNames, 0, floor, unitName);
  collect('node', [...A.nodeNames.keys()], A.nodeNames, 0, nodeFloor, si ? 'm' : 'ft');

  const links = rows.filter(r => r.kind === 'link');
  const nodes = rows.filter(r => r.kind === 'node');

  console.log('  Magnitude floor');
  console.log(`    flow  ${floor.toPrecision(3)} ${unitName} (1 L/s)`);
  console.log(`    depth ${nodeFloor.toPrecision(3)} ${si ? 'm' : 'ft'} (1 mm)`);
  console.log(`    ${belowFloor} element${belowFloor === 1 ? '' : 's'} never cleared it and ` +
    `${belowFloor === 1 ? 'was' : 'were'} dropped`);
  console.log('');

  if (rows.length === 0) {
    console.log('  Nothing cleared the magnitude floor. No claim can be made from this pair.');
    console.log('');
    process.exit(0);
  }

  // The worst instant: the single reporting period at which the largest share
  // of elements disagree past 10 % of their own peak.
  let worstPeriod = 0, worstShare = -1;
  for (let p = 0; p < A.nPeriods; p++) {
    let c = 0;
    for (const r of rows) if (r.perPeriod && r.perPeriod[p] > 0.10) c++;
    const share = c / rows.length;
    if (share > worstShare) { worstShare = share; worstPeriod = p; }
  }
  const atWorst = distribution(rows.map(r => (r.perPeriod ? r.perPeriod[worstPeriod] : 0)));

  console.log('  Disagreement, each element against its own peak');
  console.log('');
  printDistribution('Per element, worst over the run — conduits', distribution(links.map(r => r.worst)));
  printDistribution('Per element, worst over the run — node depth', distribution(nodes.map(r => r.worst)));
  console.log('');
  printDistribution('Per element, time-averaged — conduits', distribution(links.map(r => r.mean)));
  printDistribution('Per element, time-averaged — node depth', distribution(nodes.map(r => r.mean)));
  console.log('');
  const worstHours = (worstPeriod * A.reportStep) / 3600;
  printDistribution(`At the worst instant (period ${worstPeriod}, ${worstHours.toFixed(2)} h)`, atWorst);
  console.log('');

  // Peak change reported apart from shape and timing, because "the peak moved
  // 5 %" and "the hydrograph is a different shape" are different findings.
  const peakDist = distribution(links.map(r => Math.abs(r.peakChange)).filter(Number.isFinite));
  const shapeDist = distribution(links.map(r => r.shape).filter(Number.isFinite));
  const shifted = links.filter(r => r.shiftPeriods !== 0);
  console.log('  Split by kind of change (conduits)');
  console.log(`    peak magnitude      median ${pct(peakDist.median)}   worst ${pct(peakDist.max)}`);
  console.log(`    shape and timing    median ${pct(shapeDist.median)}   worst ${pct(shapeDist.max)}`);
  console.log(`      (peak change divided out first, so this is what is left)`);
  console.log(`    peak arrival moved  ${shifted.length} of ${links.length} conduits` +
    (shifted.length
      ? `, by ${Math.min(...shifted.map(r => r.shiftPeriods))} to ` +
        `${Math.max(...shifted.map(r => r.shiftPeriods))} periods`
      : ''));
  console.log('');

  const top = [...rows].sort((x, y) => y.worst - x.worst).slice(0, Math.max(0, args.top));
  if (top.length) {
    console.log(`  Worst ${top.length} elements`);
    console.log(`    ${'element'.padEnd(20)} ${'kind'.padEnd(6)} ${'worst'.padStart(9)} ${'mean'.padStart(9)} ${'peak A'.padStart(11)} ${'peak B'.padStart(11)} ${'dPeak'.padStart(9)}`);
    for (const r of top) {
      console.log(`    ${r.name.slice(0, 20).padEnd(20)} ${r.kind.padEnd(6)} ` +
        `${pct(r.worst).padStart(9)} ${pct(r.mean).padStart(9)} ` +
        `${r.peakA.toPrecision(4).padStart(11)} ${r.peakB.toPrecision(4).padStart(11)} ` +
        `${sgn(r.peakChange).padStart(9)}`);
    }
    console.log('');
  }

  const contA = siblingContinuity(pathA);
  const contB = siblingContinuity(pathB);
  if (contA && contB) {
    console.log('  For contrast, the diagnostic this test exists to outrank:');
    console.log(`    routing continuity  ${contA.flow ?? 'n/a'} %  ->  ${contB.flow ?? 'n/a'} %`);
    console.log(`    runoff continuity   ${contA.runoff ?? 'n/a'} %  ->  ${contB.runoff ?? 'n/a'} %`);
    console.log('    Continuity is a whole-run scalar. Read it as a sanity check on');
    console.log('    each run, never as a measure of the difference between them.');
    console.log('');
  }

  console.log('  What this does not show');
  console.log('    - Which run is right. It measures that they differ, not which');
  console.log('      one matches a real pipe network.');
  console.log('    - Anything about elements below the magnitude floor, or about');
  console.log(`      the ${A.nLink - conduitIdx.length} link(s) excluded by type.`);
  console.log('    - Anything about run time. One run each measures nothing about');
  console.log('      speed; use interleave-timing.js for that.');
  console.log('    - Any behaviour outside this one network and this one event.');
  console.log('');

  if (args.csv) {
    const head = 'kind,element,unit,worst_frac_of_peak,mean_frac_of_peak,peak_a,peak_b,peak_change_frac,shape_frac_of_peak,peak_shift_periods\n';
    const body = rows.map(r => [
      r.kind, JSON.stringify(r.name), r.unit,
      r.worst, r.mean, r.peakA, r.peakB, r.peakChange, r.shape, r.shiftPeriods,
    ].join(',')).join('\n');
    writeFileSync(args.csv, head + body + '\n');
    console.log(`  Per-element table written to ${args.csv}`);
    console.log('');
  }

  if (args.json) {
    console.log(JSON.stringify({
      a: pathA, b: pathB,
      flowUnits: unitName, periods: A.nPeriods, reportStep: A.reportStep,
      nodes: A.nNode, links: A.nLink, comparedLinks: conduitIdx.length,
      floor, nodeFloor, belowFloor,
      worstPeriod, worstPeriodShare: worstShare,
      linkWorst: distribution(links.map(r => r.worst)),
      linkMean: distribution(links.map(r => r.mean)),
      nodeWorst: distribution(nodes.map(r => r.worst)),
      nodeMean: distribution(nodes.map(r => r.mean)),
      atWorstInstant: atWorst,
      peakChange: peakDist, shapeAndTiming: shapeDist,
      elements: rows.map(({ perPeriod, ...r }) => r),
    }, null, 2));
  }
}

main();
