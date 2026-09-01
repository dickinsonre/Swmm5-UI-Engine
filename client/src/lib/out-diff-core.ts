/**
 * A results diff over two SWMM binary .out files.
 *
 * Continuity is a whole-run scalar computed from the very geometry under test,
 * so it closes whether or not a change mattered — a hydrograph can shift,
 * flatten or arrive late while the mass balance sits still. This module
 * measures the difference directly instead: every reporting period, every
 * element, against that element's OWN peak.
 *
 * It is a deliberate second implementation of
 * `.agents/skills/corinne-testing/scripts/out-diff.js`, which stays dependency
 * -free so it can be run against any pair of files from a shell. The two are
 * held together by `tests/out-diff-parity.test.ts`, which runs both over the
 * same pair and requires identical numbers — the parity contract this codebase
 * asks of engines, applied to its own tooling.
 *
 * Reads take a Uint8Array and honour its byteOffset, because engine output
 * often arrives as a view into a larger WASM heap rather than as a buffer of
 * its own.
 */

const MAGIC = 516114522;

export const FLOW_UNITS = ['CFS', 'GPM', 'MGD', 'CMS', 'LPS', 'MLD'] as const;

/** 1 litre/second in each of SWMM's flow units. */
const ONE_LPS_IN = [0.0353146667, 15.8503231, 0.0228244653, 0.001, 1.0, 0.0864];
const ONE_MM_IN_FT = 0.0032808399;
const ONE_MM_IN_M = 0.001;

export const LINK_TYPES = ['CONDUIT', 'PUMP', 'ORIFICE', 'WEIR', 'OUTLET'] as const;

const INPUT_TYPE_CODE = 0;

export interface OutHeader {
  version: number;
  flowUnits: number;
  flowUnitName: string;
  si: boolean;
  nSub: number;
  nNode: number;
  nLink: number;
  subNames: string[];
  nodeNames: string[];
  linkNames: string[];
  linkTypes: number[];
  nSubVars: number;
  nNodeVars: number;
  nLinkVars: number;
  nSysVars: number;
  subVarCodes: number[];
  nodeVarCodes: number[];
  linkVarCodes: number[];
  sysVarCodes: number[];
  reportStart: number;
  reportStep: number;
  startPos: number;
  nPeriods: number;
  bytesPerStep: number;
  errorCode: number;
  bytes: Uint8Array;
  view: DataView;
}

/**
 * Walk the .out header.
 *
 * Two traps live here. The input-property sections are INTERLEAVED per object
 * class — count, codes, values, three times — and a block of reporting-variable
 * counts sits between them and the report start date; walking past either
 * lands mid-record and yields plausible nonsense. And each object's property
 * record MIXES TYPES: where the first code is INPUT_TYPE_CODE the engine wrote
 * that slot as an INT4 and the rest as REAL4. The record length is identical
 * either way, so reading the type slot as a float keeps every later offset
 * correct while silently returning 0 — a weir (type 3) becomes a float32
 * denormal that rounds to zero and is counted as a conduit.
 */
export function readOutHeader(bytes: Uint8Array): OutHeader {
  if (bytes.byteLength < 64) throw new Error('Too small to be a SWMM .out file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 0;
  const i4 = () => { const v = view.getInt32(off, true); off += 4; return v; };
  const f8 = () => { const v = view.getFloat64(off, true); off += 8; return v; };

  if (i4() !== MAGIC) throw new Error('Not a SWMM .out file (bad magic)');
  const version = i4();
  const flowUnits = i4();
  const nSub = i4();
  const nNode = i4();
  const nLink = i4();
  const nPoll = i4();

  const readNames = (n: number) => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const len = i4();
      let s = '';
      for (let c = 0; c < len; c++) s += String.fromCharCode(view.getUint8(off + c));
      off += len;
      out.push(s);
    }
    return out;
  };
  const subNames = readNames(nSub);
  const nodeNames = readNames(nNode);
  const linkNames = readNames(nLink);
  readNames(nPoll);
  for (let i = 0; i < nPoll; i++) i4();

  const propSection = (nObj: number) => {
    const nProps = i4();
    const codes: number[] = [];
    for (let i = 0; i < nProps; i++) codes.push(i4());
    const hasType = codes[0] === INPUT_TYPE_CODE;
    const types: number[] = [];
    for (let o = 0; o < nObj; o++) {
      for (let p = 0; p < nProps; p++) {
        if (p === 0 && hasType) types.push(view.getInt32(off, true));
        off += 4;
      }
    }
    return { hasType, types, codes };
  };
  propSection(nSub);
  propSection(nNode);
  const linkProps = propSection(nLink);

  // Keep the CODES, not just the count. Two files can report the same NUMBER
  // of link variables while reporting different variables, and then index 0
  // means flow in one file and something else in the other.
  const varSection = (): number[] => {
    const n = i4();
    const codes: number[] = [];
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

  const end = bytes.byteLength;
  const magic2 = view.getInt32(end - 4, true);
  const errorCode = view.getInt32(end - 8, true);
  const storedPeriods = view.getInt32(end - 12, true);
  const outputStartPos = view.getInt32(end - 16, true);
  if (magic2 !== MAGIC) throw new Error('Closing magic is wrong; file is truncated or corrupt');
  if (outputStartPos > 0 && outputStartPos < end) startPos = outputStartPos;

  const bytesPerStep = 8 + 4 * (nSub * nSubVars + nNode * nNodeVars + nLink * nLinkVars + nSysVars);
  let nPeriods = storedPeriods;
  if (!(nPeriods > 0)) nPeriods = Math.floor((end - startPos - 24) / bytesPerStep);
  if (startPos + nPeriods * bytesPerStep > end - 24) {
    throw new Error(`Header claims ${nPeriods} periods but the file holds fewer`);
  }

  if (!linkProps.hasType) throw new Error('Link property block has no type code');

  return {
    version, flowUnits,
    flowUnitName: FLOW_UNITS[flowUnits] ?? `units#${flowUnits}`,
    si: flowUnits >= 3,
    nSub, nNode, nLink,
    subNames, nodeNames, linkNames,
    linkTypes: linkProps.types,
    nSubVars, nNodeVars, nLinkVars, nSysVars,
    subVarCodes, nodeVarCodes, linkVarCodes, sysVarCodes,
    reportStart, reportStep, startPos, nPeriods, bytesPerStep, errorCode,
    bytes, view,
  };
}

/** One variable of one object across every reporting period. */
export function readSeries(h: OutHeader, kind: 'node' | 'link', index: number, varIdx: number): Float64Array {
  const base = kind === 'node'
    ? h.nSub * h.nSubVars + index * h.nNodeVars
    : h.nSub * h.nSubVars + h.nNode * h.nNodeVars + index * h.nLinkVars;
  const out = new Float64Array(h.nPeriods);
  for (let p = 0; p < h.nPeriods; p++) {
    out[p] = h.view.getFloat32(h.startPos + p * h.bytesPerStep + 8 + 4 * (base + varIdx), true);
  }
  return out;
}

export interface ElementDiff {
  kind: 'node' | 'link';
  name: string;
  unit: string;
  peakA: number;
  peakB: number;
  /** Largest disagreement at any single period, as a fraction of the element's own peak. */
  worst: number;
  /** Time-averaged disagreement, as a fraction of the element's own peak. */
  mean: number;
  /** Change in the peak itself, signed. */
  peakChange: number;
  /** Disagreement left after the peak change is divided out — shape and timing alone. */
  shape: number;
  /** Periods by which the peak moved. */
  shiftPeriods: number;
}

export interface Distribution {
  n: number;
  median: number;
  p90: number;
  max: number;
  past1: number;
  past10: number;
  past25: number;
}

export interface OutDiff {
  kind: 'diff';
  identical: boolean;
  flowUnitName: string;
  si: boolean;
  nPeriods: number;
  reportStep: number;
  nNode: number;
  nLink: number;
  nSub: number;
  typeCensus: Record<string, number>;
  comparedLinks: number;
  excludedLinks: number;
  floor: number;
  nodeFloor: number;
  belowFloor: number;
  errorCodes: [number, number];
  elements: ElementDiff[];
  linkWorst: Distribution;
  linkMean: Distribution;
  nodeWorst: Distribution;
  nodeMean: Distribution;
  atWorstInstant: Distribution;
  worstPeriod: number;
  worstPeriodSeconds: number;
  peakChange: Distribution;
  shapeAndTiming: Distribution;
  peakMoved: number;
}

export interface OutRefusal {
  kind: 'refused';
  problems: string[];
}

export type OutDiffOutcome = OutDiff | OutRefusal;

function compareElement(a: Float64Array, b: Float64Array) {
  const n = a.length;
  let peakA = 0, peakB = 0, argA = 0, argB = 0;
  for (let i = 0; i < n; i++) {
    const va = Math.abs(a[i]);
    const vb = Math.abs(b[i]);
    if (va > peakA) { peakA = va; argA = i; }
    if (vb > peakB) { peakB = vb; argB = i; }
  }
  const denom = Math.max(peakA, peakB);
  if (!(denom > 0)) {
    return { peakA, peakB, denom, worst: 0, mean: 0, peakChange: 0, shiftPeriods: 0, shape: NaN, perPeriod: null as Float64Array | null };
  }
  const perPeriod = new Float64Array(n);
  let worst = 0, sum = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(b[i] - a[i]) / denom;
    perPeriod[i] = d;
    if (d > worst) worst = d;
    sum += d;
  }
  // Undefined, not zero, when one side never rises off zero: there is no
  // common scale to divide out, and a signal that appears or vanishes is a
  // finding in its own right rather than a shape change of size 0.
  let shape = NaN;
  if (peakA > 0 && peakB > 0) {
    shape = 0;
    const k = peakA / peakB;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(b[i] * k - a[i]) / peakA;
      if (d > shape) shape = d;
    }
  }
  return {
    peakA, peakB, denom, worst,
    mean: sum / n,
    peakChange: peakA > 0 ? (peakB - peakA) / peakA : NaN,
    shiftPeriods: argB - argA,
    shape,
    perPeriod,
  };
}

function quantile(sorted: number[], q: number): number {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : NaN;
}

export function distribution(values: number[]): Distribution {
  const s = [...values].sort((x, y) => x - y);
  const n = s.length;
  const past = (t: number) => (n ? s.filter(v => v > t).length / n : NaN);
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

/** The two files must be answering the same question before any number is produced. */
export function sameQuestion(A: OutHeader, B: OutHeader): string[] {
  const problems: string[] = [];
  const eq = (x: string[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  if (A.flowUnits !== B.flowUnits) problems.push(`Flow units differ: ${A.flowUnitName} vs ${B.flowUnitName}`);
  if (!eq(A.nodeNames, B.nodeNames)) problems.push(`Node sets differ (${A.nNode} vs ${B.nNode})`);
  if (!eq(A.linkNames, B.linkNames)) problems.push(`Link sets differ (${A.nLink} vs ${B.nLink})`);
  if (A.nPeriods !== B.nPeriods) problems.push(`Period counts differ: ${A.nPeriods} vs ${B.nPeriods}`);
  if (A.reportStep !== B.reportStep) problems.push(`Report steps differ: ${A.reportStep} s vs ${B.reportStep} s`);
  const eqNum = (x: number[], y: number[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  if (!eqNum(A.nodeVarCodes, B.nodeVarCodes) || !eqNum(A.linkVarCodes, B.linkVarCodes)) {
    problems.push('Reported variables differ (different pollutant sets?) — the same column index ' +
      'does not hold the same quantity in both files');
  }
  // Same names, same count, same step, but starting at a different moment:
  // comparing by index would line up two different timestamps and call the
  // offset a difference between the runs.
  if (A.reportStart !== B.reportStart) {
    problems.push(`Report start dates differ: ${A.reportStart} vs ${B.reportStart} (decimal days)`);
  }
  // A link that changed type changes which population "conduits only" selects,
  // so the two sides would be summarising different sets of links.
  if (!eqNum(A.linkTypes, B.linkTypes)) {
    const changed = A.linkTypes
      .map((t, i) => (t === B.linkTypes[i] ? null : A.linkNames[i]))
      .filter(Boolean) as string[];
    problems.push(`Link types differ (${changed.slice(0, 5).join(', ')}${changed.length > 5 ? ', …' : ''})`);
  }
  return problems;
}

export interface DiffOptions {
  /** Flow magnitude floor in the file's own units. Defaults to the equivalent of 1 L/s. */
  floor?: number;
  /** Node depth floor in the file's own length units. Defaults to the equivalent of 1 mm. */
  nodeFloor?: number;
  /** Include pumps, orifices, weirs and outlets, which answer a different question. */
  allLinks?: boolean;
}

export function diffOut(aBytes: Uint8Array, bBytes: Uint8Array, opts: DiffOptions = {}): OutDiffOutcome {
  const A = readOutHeader(aBytes);
  const B = readOutHeader(bBytes);

  const problems = sameQuestion(A, B);
  if (problems.length) return { kind: 'refused', problems };

  const floor = Number.isFinite(opts.floor) ? (opts.floor as number) : ONE_LPS_IN[A.flowUnits];
  const nodeFloor = Number.isFinite(opts.nodeFloor)
    ? (opts.nodeFloor as number)
    : (A.si ? ONE_MM_IN_M : ONE_MM_IN_FT);

  const typeCensus: Record<string, number> = {};
  for (const t of A.linkTypes) {
    const name = LINK_TYPES[t] ?? `type#${t}`;
    typeCensus[name] = (typeCensus[name] || 0) + 1;
  }

  const identical =
    aBytes.byteLength === bBytes.byteLength &&
    aBytes.every((v, i) => v === bBytes[i]);

  const linkIdx: number[] = [];
  for (let l = 0; l < A.nLink; l++) if (opts.allLinks || A.linkTypes[l] === 0) linkIdx.push(l);

  const elements: ElementDiff[] = [];
  const perPeriods: (Float64Array | null)[] = [];
  let belowFloor = 0;

  const collect = (kind: 'node' | 'link', idx: number[], names: string[], varIdx: number, fl: number, unit: string) => {
    for (const i of idx) {
      const c = compareElement(readSeries(A, kind, i, varIdx), readSeries(B, kind, i, varIdx));
      if (c.denom < fl) { belowFloor++; continue; }
      elements.push({
        kind, name: names[i], unit,
        peakA: c.peakA, peakB: c.peakB,
        worst: c.worst, mean: c.mean,
        peakChange: c.peakChange, shape: c.shape, shiftPeriods: c.shiftPeriods,
      });
      perPeriods.push(c.perPeriod);
    }
  };
  collect('link', linkIdx, A.linkNames, 0, floor, A.flowUnitName);
  collect('node', A.nodeNames.map((_, i) => i), A.nodeNames, 0, nodeFloor, A.si ? 'm' : 'ft');

  // The worst instant: the single period at which the largest share of
  // elements disagree past 10 % of their own peak.
  let worstPeriod = 0;
  let worstShare = -1;
  for (let p = 0; p < A.nPeriods; p++) {
    let c = 0;
    for (const pp of perPeriods) if (pp && pp[p] > 0.10) c++;
    const share = elements.length ? c / elements.length : 0;
    if (share > worstShare) { worstShare = share; worstPeriod = p; }
  }

  const links = elements.filter(e => e.kind === 'link');
  const nodes = elements.filter(e => e.kind === 'node');

  return {
    kind: 'diff',
    identical,
    flowUnitName: A.flowUnitName,
    si: A.si,
    nPeriods: A.nPeriods,
    reportStep: A.reportStep,
    nNode: A.nNode,
    nLink: A.nLink,
    nSub: A.nSub,
    typeCensus,
    comparedLinks: linkIdx.length,
    excludedLinks: A.nLink - linkIdx.length,
    floor,
    nodeFloor,
    belowFloor,
    errorCodes: [A.errorCode, B.errorCode],
    elements,
    linkWorst: distribution(links.map(e => e.worst)),
    linkMean: distribution(links.map(e => e.mean)),
    nodeWorst: distribution(nodes.map(e => e.worst)),
    nodeMean: distribution(nodes.map(e => e.mean)),
    atWorstInstant: distribution(perPeriods.map(pp => (pp ? pp[worstPeriod] : 0))),
    worstPeriod,
    worstPeriodSeconds: worstPeriod * A.reportStep,
    peakChange: distribution(links.map(e => Math.abs(e.peakChange)).filter(Number.isFinite)),
    shapeAndTiming: distribution(links.map(e => e.shape).filter(Number.isFinite)),
    peakMoved: links.filter(e => e.shiftPeriods !== 0).length,
  };
}
