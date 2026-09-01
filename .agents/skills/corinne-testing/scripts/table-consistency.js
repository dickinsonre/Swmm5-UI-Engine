#!/usr/bin/env node
/**
 * Test 1: two descriptions of one object must agree by derivative.
 *
 * A closed conduit shape is stored twice in SWMM — an area table A(y) and a
 * width table T(y) — and the two are only descriptions of the same pipe if
 * T = dA/dy. This script differentiates the area description and diffs it
 * against the width description over the whole depth range, so "both tables
 * look right" is replaced by a number.
 *
 * It also honours test 7: a slope quoted at a table node is TWO numbers,
 * because the derivative jumps there. Any point metric reports both sides.
 *
 * Usage
 *   node table-consistency.js --shape CIRCULAR [--at 0.02]
 *   node table-consistency.js --area a.csv --width w.csv \
 *        [--area-scale k] [--width-scale k] [--inverted] [--at y]
 *   node table-consistency.js --list
 *
 * Options
 *   --shape NAME     a shape with built-in EPA 5.2.4 tables (--list to see)
 *   --area FILE      area table as CSV/newline numbers, A/Afull v. y/yFull
 *   --inverted       the --area file is a DEPTH-of-area table (y/yFull v.
 *                    A/Afull) and is inverted exactly, the way the engine
 *                    recovers area for the gothic family
 *   --width FILE     width table, W/Wmax v. y/yFull
 *   --area-scale k   aFull / yFull^2   (default 1)
 *   --width-scale k  wMax  / yFull     (default 1)
 *   --at y           operating point, y/yFull (default 0.02)
 *   --samples N      resampling density over the range (default 5000)
 *   --json           machine-readable output
 *
 * No dependencies. Run it; do not re-derive it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const a = { at: 0.02, samples: 5000, areaScale: 1, widthScale: 1 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === '--shape') a.shape = String(next()).toUpperCase();
    else if (k === '--area') a.area = next();
    else if (k === '--width') a.width = next();
    else if (k === '--area-scale') a.areaScale = Number(next());
    else if (k === '--width-scale') a.widthScale = Number(next());
    else if (k === '--at') a.at = Number(next());
    else if (k === '--samples') a.samples = Number(next());
    else if (k === '--inverted') a.inverted = true;
    else if (k === '--json') a.json = true;
    else if (k === '--list') a.list = true;
    else if (k === '--help' || k === '-h') a.help = true;
    else throw new Error(`unknown option: ${k}`);
  }
  return a;
}

function readTable(file) {
  const nums = readFileSync(file, 'utf8')
    .split(/[\s,;]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('#'))
    .map(Number);
  if (nums.length < 3 || nums.some(n => !Number.isFinite(n))) {
    throw new Error(`${file}: expected at least 3 finite numbers`);
  }
  return nums;
}

// ------------------------------------------------------------------ shapes

/** Piecewise-linear lookup of an equally spaced table on [0,1]. */
function lin(tab, x) {
  const n = tab.length;
  if (x <= 0) return tab[0];
  if (x >= 1) return tab[n - 1];
  const dx = 1 / (n - 1);
  const i = Math.min(n - 2, Math.floor(x / dx));
  const f = (x - i * dx) / dx;
  return tab[i] + f * (tab[i + 1] - tab[i]);
}

/**
 * The area description, as a normalised slope dA/dy with its breakpoints.
 *
 * Two constructions, because SWMM stores two kinds of shape:
 *  - a real area table, equally spaced in y: the slope is constant on each
 *    interval, breakpoints at i/(n-1);
 *  - no area table at all (the gothic family), where area is recovered by
 *    INVERTING the depth-of-area table. Inverting a piecewise-linear function
 *    gives another piecewise-linear function whose breakpoints sit at the
 *    table's y VALUES — unequally spaced. Resampling it onto an even y grid
 *    first would smear exactly the disagreement being measured.
 */
function areaSlopeModel(tab, inverted) {
  const n = tab.length;
  if (!inverted) {
    const dy = 1 / (n - 1);
    const slopes = [];
    for (let i = 0; i < n - 1; i++) slopes.push((tab[i + 1] - tab[i]) / dy);
    const breaks = [];
    for (let i = 0; i < n; i++) breaks.push(i * dy);
    return {
      breaks,
      // Slope on the interval that CONTAINS y. `side` picks which interval
      // when y lands exactly on a breakpoint.
      slopeAt(y, side = 'right') {
        let i = Math.floor(y / dy);
        if (side === 'left') i = Math.ceil(y / dy) - 1;
        return slopes[Math.max(0, Math.min(slopes.length - 1, i))];
      },
    };
  }
  const da = 1 / (n - 1);
  const breaks = tab.slice();
  return {
    breaks,
    slopeAt(y, side = 'right') {
      for (let i = 0; i < n - 1; i++) {
        const lo = tab[i], hi = tab[i + 1];
        const inside = side === 'left' ? (y > lo && y <= hi) : (y >= lo && y < hi);
        if (inside) return hi > lo ? da / (hi - lo) : NaN;
      }
      const last = tab[n - 1] - tab[n - 2];
      return last > 0 ? da / last : NaN;
    },
  };
}

function loadShape(name) {
  const mod = JSON.parse(readFileSync(join(HERE, 'xsect-tables.json'), 'utf8'));
  const spec = mod.SHAPES[name];
  if (!spec) {
    throw new Error(`unknown shape ${name}; known: ${Object.keys(mod.SHAPES).join(', ')}`);
  }
  return {
    spec,
    areaTable: mod.TABLES[spec.area || spec.invert],
    widthTable: mod.TABLES[spec.width],
    inverted: !spec.area,
    // Turns a normalised area slope into a comparable normalised width.
    k: spec.aFull / spec.wMax,
    source: mod.SOURCE,
  };
}

// ---------------------------------------------------------------- measuring

function quantile(sorted, q) {
  if (sorted.length === 0) return NaN;
  const i = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[i];
}

function measure({ areaTable, widthTable, inverted, k, at, samples }) {
  const area = areaSlopeModel(areaTable, inverted);
  const width = y => lin(widthTable, y);

  // Whole-range disagreement, resampled densely so the answer is a property of
  // the two descriptions rather than of whichever grid one of them happens to
  // use.
  const rel = [];
  let worst = -Infinity;
  let worstY = NaN;
  for (let j = 1; j < samples; j++) {
    const y = j / samples;
    const s = area.slopeAt(y);
    const w = width(y);
    if (!Number.isFinite(s) || !(w > 0)) continue;
    const d = Math.abs((k * s) / w - 1);
    rel.push(d);
    if (d > worst) { worst = d; worstY = y; }
  }
  const sorted = [...rel].sort((a, b) => a - b);

  // The operating point. A metric evaluated at a breakpoint of EITHER
  // description is two numbers; say which and print both.
  const widthBreaks = [];
  for (let i = 0; i < widthTable.length; i++) widthBreaks.push(i / (widthTable.length - 1));
  const tol = 1e-9;
  const nearAreaKnot = area.breaks.some(b => Math.abs(b - at) < tol);
  const nearWidthKnot = widthBreaks.some(b => Math.abs(b - at) < tol);

  const wAt = width(at);
  const atLeft = (k * area.slopeAt(at, 'left')) / wAt - 1;
  const atRight = (k * area.slopeAt(at, 'right')) / wAt - 1;

  return {
    median: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
    max: sorted.length ? sorted[sorted.length - 1] : NaN,
    worstY,
    fractionPast10: rel.length ? rel.filter(x => x > 0.10).length / rel.length : NaN,
    fractionPast25: rel.length ? rel.filter(x => x > 0.25).length / rel.length : NaN,
    at,
    atLeft,
    atRight,
    onKnot: nearAreaKnot || nearWidthKnot,
    onAreaKnot: nearAreaKnot,
    onWidthKnot: nearWidthKnot,
    samples: rel.length,
  };
}

// ---------------------------------------------------------------- reporting

const pct = x => (Number.isFinite(x) ? `${(x * 100).toFixed(1)} %` : 'n/a');
const signedPct = x => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)} %` : 'n/a');

function print(label, m, extra) {
  console.log('');
  console.log(`Two descriptions of ${label}`);
  console.log('='.repeat(60));
  console.log(`  T = dA/dy disagreement over the whole depth range`);
  console.log(`    median            ${pct(m.median)}`);
  console.log(`    p90               ${pct(m.p90)}`);
  // The extreme always sits at the invert or the crown, where the width goes
  // to zero and the ratio is dividing by nothing. Print WHERE, so the number
  // is read as the singularity it is rather than as a typical disagreement.
  const where = m.worstY < 0.5 ? 'the invert' : 'the crown';
  console.log(`    worst             ${pct(m.max)} at y/yFull = ${m.worstY.toFixed(4)} (${where}, where the width vanishes)`);
  console.log(`    past 10 %         ${pct(m.fractionPast10)} of the range`);
  console.log(`    past 25 %         ${pct(m.fractionPast25)} of the range`);
  console.log('');
  if (m.onKnot) {
    const which = [m.onAreaKnot && 'area', m.onWidthKnot && 'width'].filter(Boolean).join(' and ');
    console.log(`  At y/yFull = ${m.at} — this point IS a ${which} table node,`);
    console.log(`  so the derivative jumps and the answer is two numbers:`);
    console.log(`    approached from below   ${signedPct(m.atLeft)}`);
    console.log(`    approached from above   ${signedPct(m.atRight)}`);
  } else {
    console.log(`  At y/yFull = ${m.at} (not a table node)   ${signedPct(m.atRight)}`);
  }
  console.log('');
  console.log('  What this does not show');
  console.log('    - Which of the two descriptions is wrong. It measures that');
  console.log('      they disagree, not which one matches the real pipe.');
  console.log('    - Any effect on a simulation. A geometry disagreement is a');
  console.log('      correctness claim, not a predictive one.');
  console.log(`    - Behaviour under the engine's own lookup(), which applies a`);
  console.log('      quadratic correction in the first two intervals. This is');
  console.log('      plain piecewise-linear resampling.');
  if (extra) console.log(extra);
  console.log('');
}

// -------------------------------------------------------------------- main

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }

  if (args.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
    return;
  }

  if (args.list) {
    const mod = JSON.parse(readFileSync(join(HERE, 'xsect-tables.json'), 'utf8'));
    console.log(`Shapes with built-in tables (from ${mod.SOURCE}):`);
    for (const [name, s] of Object.entries(mod.SHAPES)) {
      const how = s.area ? `area table ${s.area}` : `inverted depth-of-area table ${s.invert}`;
      console.log(`  ${name.padEnd(15)} ${how}, width ${s.width}`);
    }
    return;
  }

  let model, label, provenance;
  if (args.shape) {
    const s = loadShape(args.shape);
    model = { areaTable: s.areaTable, widthTable: s.widthTable, inverted: s.inverted, k: s.k };
    label = `one ${args.shape} pipe`;
    provenance = `    - Tables are EPA ${s.source} constants, not a digitisation.`;
  } else if (args.area && args.width) {
    const areaTable = readTable(args.area);
    const widthTable = readTable(args.width);
    if (!(args.widthScale > 0)) {
      console.error('--width-scale must be positive');
      process.exit(2);
    }
    model = {
      areaTable,
      widthTable,
      inverted: !!args.inverted,
      k: args.areaScale / args.widthScale,
    };
    label = `${args.area} and ${args.width}`;
    provenance = `    - Tables came from files, so their own digitisation error is\n      inside every number above.`;
  } else {
    console.error('give either --shape NAME or both --area FILE and --width FILE');
    console.error('run with --help for usage, --list for known shapes');
    process.exit(2);
  }

  const m = measure({ ...model, at: args.at, samples: args.samples });

  if (args.json) {
    console.log(JSON.stringify({ label, ...m }, null, 2));
    return;
  }
  print(label, m, provenance);
}

main();
