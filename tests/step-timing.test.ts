/**
 * Duration/volume math must survive an unevenly sampled series.
 *
 * A decimated .out (long runs are sampled — see out-truncation.test.ts) ends on
 * a shorter interval than the rest. Anything that turns sample counts into
 * hours or volumes has to use the real gaps, otherwise a sampled run reports
 * durations inflated by the sampling stride.
 *
 * Run: npx tsx tests/step-timing.test.ts
 */

import { stepDeltasSec, stepWeightsSec, medianStepSec } from '../client/src/lib/step-timing';

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) < tol;

const ts = (times: number[]) => times.map(t => ({ time: t }));

// ---------------------------------------------------------------------------
console.log('\nuniform series — matches the old fixed-dt behavior');
{
  const s = ts([0, 60, 120, 180, 240]);
  const d = stepDeltasSec(s);
  check('every delta is the reporting step', d.every(v => v === 60), d);
  check('first delta borrows the following gap', d[0] === 60);

  const w = stepWeightsSec(s);
  check('interior weights are the full reporting step', w.slice(1, -1).every(v => v === 60), w);
  check('end samples own only their inner half-gap', w[0] === 30 && w[4] === 30, [w[0], w[4]]);
  check('weights total EXACTLY the loaded span',
    near(w.reduce((a, b) => a + b, 0), 240), w.reduce((a, b) => a + b, 0));
  check('median step is the reporting step', medianStepSec(s) === 60);
}

// ---------------------------------------------------------------------------
console.log('\ndecimated series — short final interval');
{
  // stride 3 over a run whose last period is not on a stride boundary
  const s = ts([0, 180, 360, 540, 600]);
  const d = stepDeltasSec(s);
  check('interior deltas follow the stride', d[1] === 180 && d[2] === 180 && d[3] === 180, d);
  check('closing delta is the short one', d[4] === 60, d[4]);

  const w = stepWeightsSec(s);
  check('first sample owns only its inner half-gap', near(w[0], 90), w[0]);
  check('interior samples own half a gap either side', near(w[1], 180) && near(w[2], 180), [w[1], w[2]]);
  check('the sample before the short gap is down-weighted', near(w[3], (180 + 60) / 2), w[3]);
  check('the final sample owns only half the short closing gap', near(w[4], 30), w[4]);

  check('median ignores the one odd interval', medianStepSec(s) === 180, medianStepSec(s));

  // The point of the weights: counting samples must not inflate a duration.
  const totalWeighted = w.reduce((a, b) => a + b, 0);
  const naive = s.length * 180; // what "count × stride" would have given
  check('weights total EXACTLY the loaded span', near(totalWeighted, 600), totalWeighted);
  check('naive count × stride overstates the run', naive > totalWeighted, { naive, totalWeighted });
}

// ---------------------------------------------------------------------------
console.log('\nweights total the span for any spacing');
{
  const cases: Array<[string, number[]]> = [
    ['two samples', [0, 900]],
    ['long uniform run', Array.from({ length: 200 }, (_, i) => i * 300)],
    ['decimated with ragged tail', [...Array.from({ length: 50 }, (_, i) => i * 600), 29_460]],
    ['irregular spacing', [0, 15, 600, 610, 3600, 3610, 7200]],
  ];
  for (const [label, times] of cases) {
    const s = ts(times);
    const total = stepWeightsSec(s).reduce((a, b) => a + b, 0);
    const span = times[times.length - 1] - times[0];
    check(`${label}: weights total the span exactly`, near(total, span), { total, span });
  }
}

// ---------------------------------------------------------------------------
console.log('\nduration and volume on a ragged tail');
{
  // 10 samples at 600 s, then one final sample only 60 s later (the appended
  // last reporting period of a decimated run). A constant unit flow must
  // integrate to the true span, not to "11 samples × 600 s".
  const times = [...Array.from({ length: 10 }, (_, i) => i * 600), 5460];
  const s = ts(times);
  const w = stepWeightsSec(s);
  const volume = w.reduce((sum, hrs) => sum + 1 * hrs, 0); // unit flow
  check('unit-flow volume equals the true span', near(volume, 5460), volume);
  check('naive count × nominal step would have overstated it by >10%',
    s.length * 600 > volume * 1.1, { naive: s.length * 600, volume });

  // A state held only over the ragged tail must not be credited a full step.
  const tailHours = w[w.length - 1];
  check('tail sample credited only its own half-gap', near(tailHours, 30), tailHours);
}

// ---------------------------------------------------------------------------
console.log('\ndegenerate input');
{
  check('empty series yields no deltas', stepDeltasSec([]).length === 0);
  check('empty series yields no weights', stepWeightsSec([]).length === 0);
  check('single sample falls back', stepDeltasSec(ts([0]), 30)[0] === 30);
  check('single sample weight falls back', stepWeightsSec(ts([0]), 30)[0] === 30);
  check('median falls back below two samples', medianStepSec(ts([0]), 30) === 30);

  // Malformed/non-increasing times must not produce zero or negative durations
  // (they would divide into Infinity in the extended-variable derivatives).
  const bad = stepDeltasSec(ts([0, 0, 0]), 30);
  check('non-increasing times fall back rather than yielding 0', bad.every(v => v > 0), bad);
  const backwards = stepDeltasSec(ts([0, 100, 50]), 30);
  check('backwards time falls back', backwards[2] === 30, backwards);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
