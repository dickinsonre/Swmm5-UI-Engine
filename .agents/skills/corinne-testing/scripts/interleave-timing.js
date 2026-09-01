#!/usr/bin/env node
/**
 * Test 6: establish the noise floor before quoting any speed ratio.
 *
 * A single timing of A and a single timing of B produce a ratio with no error
 * bar, and a machine that drifts, throttles or caches will hand you a
 * confident number that reverses on the next run. This script interleaves the
 * two commands — A, B, A, B, ... — so slow drift hits both sides equally, then
 * reports the spread alongside the ratio and states plainly whether the
 * difference is resolved above that spread.
 *
 * With only --a it measures the noise floor by itself, which is the number
 * that has to exist before any ratio is allowed to.
 *
 * Usage
 *   node interleave-timing.js -n 7 --a "cmd A" [--b "cmd B"]
 *
 * Options
 *   -n N          pairs (default 7). Odd counts give a clean median.
 *   --a CMD       the baseline command
 *   --b CMD       the command being compared; omit to measure A's noise floor
 *   --warmup N    discarded runs of each side first (default 1)
 *   --cwd DIR     working directory
 *   --json        machine-readable output
 *
 * Exit status is 0 whether or not a difference is resolved; "unresolved" is a
 * finding, not a failure.
 *
 * No dependencies. Run it; do not re-derive it.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const a = { n: 7, warmup: 1 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === '-n') a.n = Number(next());
    else if (k === '--a') a.a = next();
    else if (k === '--b') a.b = next();
    else if (k === '--warmup') a.warmup = Number(next());
    else if (k === '--cwd') a.cwd = next();
    else if (k === '--json') a.json = true;
    else if (k === '--help' || k === '-h') a.help = true;
    else throw new Error(`unknown option: ${k}`);
  }
  return a;
}

/** Wall-clock seconds for one run. Throws if the command fails. */
function timeOnce(cmd, cwd) {
  const t0 = process.hrtime.bigint();
  const r = spawnSync(cmd, { shell: true, cwd, stdio: 'ignore' });
  const t1 = process.hrtime.bigint();
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd}: exited ${r.status}`);
  return Number(t1 - t0) / 1e9;
}

const median = xs => {
  const s = [...xs].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function stats(xs) {
  const med = median(xs);
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  return { runs: xs, n: xs.length, median: med, min, max, spread: med > 0 ? (max - min) / med : NaN };
}

const s3 = x => `${x.toFixed(3)} s`;
const pct = x => `${(x * 100).toFixed(1)} %`;

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  if (args.help || !args.a) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
    process.exit(args.help ? 0 : 2);
  }
  if (!(args.n >= 2)) {
    console.error('-n must be at least 2; a single pair cannot show a noise floor');
    process.exit(2);
  }

  try {
    for (let i = 0; i < args.warmup; i++) {
      timeOnce(args.a, args.cwd);
      if (args.b) timeOnce(args.b, args.cwd);
    }
  } catch (e) {
    console.error(`warmup failed: ${e.message}`);
    process.exit(1);
  }

  const ta = [], tb = [];
  try {
    // Interleaved, not batched: a machine that slows down halfway through
    // would otherwise hand the whole penalty to whichever side ran second.
    for (let i = 0; i < args.n; i++) {
      ta.push(timeOnce(args.a, args.cwd));
      if (args.b) tb.push(timeOnce(args.b, args.cwd));
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  const sa = stats(ta);
  const sb = args.b ? stats(tb) : null;

  if (args.json) {
    const pairs = sb ? ta.map((t, i) => tb[i] / t) : null;
    console.log(JSON.stringify({
      a: args.a, b: args.b, pairs: args.n, warmup: args.warmup,
      aStats: sa, bStats: sb,
      ratioMedian: sb ? sb.median / sa.median : null,
      pairRatios: pairs,
      resolved: sb ? !(Math.min(...pairs) < 1 && Math.max(...pairs) > 1) : null,
    }, null, 2));
    return;
  }

  console.log('');
  console.log('Interleaved timing');
  console.log('='.repeat(60));
  console.log(`  ${args.n} pairs, ${args.warmup} warmup run(s) discarded`);
  console.log('');
  console.log(`  A  ${args.a}`);
  console.log(`     median ${s3(sa.median)}   range ${s3(sa.min)} .. ${s3(sa.max)}   spread ${pct(sa.spread)}`);

  if (!sb) {
    console.log('');
    console.log(`  Noise floor for this command on this machine: ${pct(sa.spread)}.`);
    console.log('  A speed claim smaller than that is not measurable here.');
    console.log('');
    console.log('  What this does not show');
    console.log('    - Any comparison. Only one command was timed.');
    console.log('');
    return;
  }

  console.log('');
  console.log(`  B  ${args.b}`);
  console.log(`     median ${s3(sb.median)}   range ${s3(sb.min)} .. ${s3(sb.max)}   spread ${pct(sb.spread)}`);
  console.log('');

  const ratios = ta.map((t, i) => tb[i] / t);
  const rMin = Math.min(...ratios), rMax = Math.max(...ratios);
  const rMed = sb.median / sa.median;
  const straddles = rMin < 1 && rMax > 1;
  const floor = Math.max(sa.spread, sb.spread);

  console.log(`  B/A median ratio      ${rMed.toFixed(3)}`);
  console.log(`  per-pair ratio range  ${rMin.toFixed(3)} .. ${rMax.toFixed(3)}`);
  console.log(`  noise floor           ${pct(floor)} (the larger of the two spreads)`);
  console.log('');

  if (straddles) {
    console.log('  UNRESOLVED. Individual pairs disagree about which command is');
    console.log('  faster, so the median ratio is not a result. Report the range,');
    console.log('  not the ratio.');
  } else if (Math.abs(rMed - 1) < floor) {
    console.log(`  UNRESOLVED. The ${pct(Math.abs(rMed - 1))} difference is inside the`);
    console.log(`  ${pct(floor)} noise floor. Every pair happened to agree on the sign,`);
    console.log('  which is suggestive, but the effect is not separated from noise.');
  } else {
    const faster = rMed < 1 ? 'B is faster' : 'A is faster';
    console.log(`  RESOLVED. ${faster} by ${pct(Math.abs(rMed - 1))}, which clears the`);
    console.log(`  ${pct(floor)} noise floor and every pair agrees on the sign.`);
  }
  console.log('');
  console.log('  What this does not show');
  console.log('    - Anything about correctness. Neither command\'s output was read.');
  console.log('    - Anything about another machine, another load, or another input.');
  console.log('    - A cause. It measures wall time, not where the time went.');
  console.log('');
}

main();
