/**
 * Reporting-interval helpers.
 *
 * A full .out has perfectly uniform reporting periods, so most code has always
 * derived a single `dt` from the first two samples. That assumption breaks on a
 * DECIMATED series: long runs are sampled every Nth period (see
 * MAX_LOADED_PERIODS in swmm-out-parser), and the final period is always kept,
 * which usually leaves a shorter last interval.
 *
 * Anything that turns sample counts into durations or volumes must use the real
 * gaps between samples instead of one derived `dt`, or it silently reports the
 * wrong hours / volumes on a sampled run.
 */

export interface HasTime {
  time: number;
}

/**
 * Seconds between each sample and the one before it. The first entry uses the
 * following gap (there is nothing before it). `fallback` covers a series with
 * fewer than two samples, or non-increasing times from a malformed file.
 */
export function stepDeltasSec(steps: readonly HasTime[], fallback = 30): number[] {
  const n = steps.length;
  if (n === 0) return [];
  if (n === 1) return [fallback];

  const deltas = new Array<number>(n);
  for (let i = 1; i < n; i++) {
    const d = steps[i].time - steps[i - 1].time;
    deltas[i] = d > 0 ? d : fallback;
  }
  deltas[0] = deltas[1];
  return deltas;
}

/**
 * Seconds of simulated time each sample represents, so that "state held for
 * these N samples" converts to a duration and "value × time" to a volume even
 * when the samples are unevenly spaced.
 *
 * Convention: each sample owns the time closer to it than to its neighbours —
 * half the gap on each side, and the first and last own only their one inner
 * half-gap. The weights therefore sum EXACTLY to the span the loaded series
 * covers (last sample time − first sample time); nothing is invented beyond the
 * ends of the data. On a uniformly reported series every interior sample gets
 * the full reporting step, so results match the old fixed-dt behavior.
 */
export function stepWeightsSec(steps: readonly HasTime[], fallback = 30): number[] {
  const n = steps.length;
  if (n === 0) return [];
  if (n === 1) return [fallback];

  const deltas = stepDeltasSec(steps, fallback);
  const weights = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    // deltas[i] is the gap BEFORE sample i (deltas[0] borrows the one after it).
    const halfBefore = i === 0 ? 0 : deltas[i] / 2;
    const halfAfter = i === n - 1 ? 0 : deltas[i + 1] / 2;
    weights[i] = halfBefore + halfAfter;
  }
  return weights;
}

/**
 * The interval the series is nominally reported at — the median gap, which
 * ignores the one odd interval a decimated series ends on.
 */
export function medianStepSec(steps: readonly HasTime[], fallback = 30): number {
  if (steps.length < 2) return fallback;
  const gaps = stepDeltasSec(steps, fallback).slice(1).sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 === 0 ? (gaps[mid - 1] + gaps[mid]) / 2 : gaps[mid];
  return median > 0 ? median : fallback;
}
