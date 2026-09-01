/**
 * Two descriptions of one pipe must agree by derivative.
 *
 * SWMM stores a closed conduit twice — an area table A(y) and a width table
 * T(y) — and the two only describe the same pipe if T = dA/dy. This suite
 * guards the tool that measures that, on three fronts:
 *
 *   1. The constants are not transcribed. They are generated from the
 *      vendored EPA source, so a number in a verification report traces back
 *      to the engine's own xsect.dat. This test re-derives them and fails if
 *      the committed JSON has drifted from the source.
 *
 *   2. The two documented rows still reproduce exactly. CIRCULAR at median
 *      0.7 % and GOTHIC at 14.4 % are the published results; if the tool stops
 *      reproducing them it is measuring something else now.
 *
 *   3. The knot rule holds. A slope quoted at a table node is TWO numbers
 *      because the derivative jumps there, and y/D = 0.02 is a node of every
 *      51-point table. A single number at a knot is the defect this checks
 *      for.
 *
 * The gothic case carries the subtlety worth protecting: those shapes have no
 * area table at all, so area is recovered by inverting the depth-of-area
 * table. Inverting a piecewise-linear function puts the breakpoints on the
 * table's y VALUES, which are unequally spaced. Resampling onto an even grid
 * first looks harmless and quietly moves the answer from 14.4 % to 13.1 %.
 *
 * Run: npx tsx tests/table-consistency.test.ts
 */

import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';

const SKILL = '.agents/skills/corinne-testing/scripts';
const TABLES = `${SKILL}/xsect-tables.json`;
const GEN = `${SKILL}/gen-xsect-tables.cjs`;
const SCRIPT = `${SKILL}/table-consistency.js`;
const XSECT_DAT = 'swmm-engine/Stormwater-Management-Model-5.2.4/src/solver/xsect.dat';

let passed = 0;
let failed = 0;

function check(label: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

function near(label: string, actual: number, expected: number, tol: number) {
  check(label, Math.abs(actual - expected) <= tol,
    `expected ${expected} ± ${tol}, got ${actual}`);
}

function run(args: string[]): any {
  const out = execFileSync('node', [SCRIPT, ...args, '--json'], { encoding: 'utf8' });
  return JSON.parse(out);
}

console.log('\n1. The constants come from the engine source, not from a transcription\n');

const committed = JSON.parse(readFileSync(TABLES, 'utf8'));

if (!existsSync(XSECT_DAT)) {
  console.log('  ~ vendored EPA source not present; skipping the drift check');
} else {
  // Re-derive into a scratch copy and compare. The generator writes in place,
  // so read the file, regenerate, compare, and confirm nothing changed.
  const before = readFileSync(TABLES, 'utf8');
  execFileSync('node', [GEN], { encoding: 'utf8' });
  const after = readFileSync(TABLES, 'utf8');
  check('committed tables match a fresh generation from xsect.dat', before === after,
    'run node ' + GEN + ' and commit the result');
}

check('CIRCULAR has a real area table', !!committed.SHAPES.CIRCULAR.area);
check('GOTHIC has no area table and must be inverted', !committed.SHAPES.GOTHIC.area && !!committed.SHAPES.GOTHIC.invert);
check('the circular area table is the 51-point EPA table', committed.TABLES.A_Circ.length === 51);
check('the gothic width table is 21 points, not 51', committed.TABLES.W_Gothic.length === 21);
check('area tables start at zero', committed.TABLES.A_Circ[0] === 0);
check('area tables end at full', committed.TABLES.A_Circ[50] === 1);

console.log('\n2. The published rows reproduce exactly\n');

{
  const c = run(['--shape', 'CIRCULAR', '--at', '0.02']);
  near('CIRCULAR median disagreement is 0.7 %', c.median * 100, 0.7, 0.05);
  near('CIRCULAR exceeds 10 % across 5 % of the depth range', c.fractionPast10 * 100, 5, 0.5);
  near('CIRCULAR at the 2 % knot, from below, is -34 %', c.atLeft * 100, -34, 0.5);
  near('CIRCULAR at the 2 % knot, from above, is +22 %', c.atRight * 100, 22, 0.5);

  const g = run(['--shape', 'GOTHIC', '--at', '0.02']);
  near('GOTHIC median disagreement is 14.4 %', g.median * 100, 14.4, 0.05);
  near('GOTHIC exceeds 10 % across 65 % of the depth range', g.fractionPast10 * 100, 65, 0.5);
  near('GOTHIC at 2 % is +202 %', g.atRight * 100, 202, 1);

  check('gothic disagrees with itself far more than circular does',
    g.median > 10 * c.median, `circular ${c.median}, gothic ${g.median}`);
}

console.log('\n3. Both sides of a knot\n');

{
  const c = run(['--shape', 'CIRCULAR', '--at', '0.02']);
  check('y/D = 0.02 is recognised as a table node', c.onKnot === true);
  check('and the two sides genuinely differ', Math.abs(c.atLeft - c.atRight) > 0.5,
    `left ${c.atLeft}, right ${c.atRight}`);
  check('the two sides fall on opposite sides of agreement',
    c.atLeft < 0 && c.atRight > 0);

  // Halfway between two nodes the derivative is constant, so there is one
  // answer and the tool must not manufacture a second.
  const mid = run(['--shape', 'CIRCULAR', '--at', '0.03']);
  check('a point between nodes is not reported as a knot', mid.onKnot === false);
  check('and gives a single value', mid.atLeft === mid.atRight);
}

console.log('\n4. The measurement is a property of the tables, not of the sampling grid\n');

{
  const coarse = run(['--shape', 'CIRCULAR', '--samples', '2000']);
  const fine = run(['--shape', 'CIRCULAR', '--samples', '20000']);
  near('the median is stable under a 10x finer grid', fine.median * 100, coarse.median * 100, 0.1);
  near('so is the fraction past 10 %', fine.fractionPast10 * 100, coarse.fractionPast10 * 100, 0.5);
}

console.log('\n5. Every shape with built-in tables can be measured\n');

{
  for (const name of Object.keys(committed.SHAPES)) {
    const r = run(['--shape', name]);
    check(`${name} produces a finite median`, Number.isFinite(r.median) && r.samples > 0,
      `median ${r.median}, samples ${r.samples}`);
  }
}

console.log(`\n${'═'.repeat(46)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(46)}\n`);

if (failed > 0) process.exit(1);
