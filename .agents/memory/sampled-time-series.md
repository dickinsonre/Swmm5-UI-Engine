---
name: Sampled (decimated) time series
description: Long .out runs are sampled, not cut — why, and the rule every duration/volume calculation must follow.
---

# Sampled time series

Only a bounded number of reporting periods from a binary `.out` are held in
memory. When a run exceeds it the series is **decimated with a uniform stride
across the whole run**, never cut at the front portion, and the final period is
always kept.

**Why:** hard-cutting silently deleted the entire tail of a long run — a late
peak simply vanished, and the reported duration described the loaded slice
rather than the simulation. Sampling keeps the series spanning the true run, and
the loaded-vs-actual period counts are carried on the results object so the UI
can say so.

**How to apply:**

- A loaded series is **not evenly spaced**. Keeping the final period usually
  leaves one short closing interval.
- Never derive a single `dt` from the first two samples and multiply it by a
  sample count. That inflates durations and volumes by roughly the stride on any
  sampled run. Use the per-sample gap / weight helpers instead.
- The weighting convention is Voronoi half-gaps: each sample owns the time
  closer to it than to its neighbours, so weights sum exactly to the span from
  the first to the last loaded sample. Nothing is invented past the ends.
- Anything expressed in elapsed time (event separation, gap detection, event
  duration) must compare real timestamps, not sample counts.
- Every surface that displays a sampled series has to disclose it, including the
  secondary series of a comparison run — a sampled compare leg is just as
  misleading as a sampled primary one.
- Peaks falling between samples are genuinely absent. Point users at the `.rpt`
  report for exact peaks rather than implying the plot is complete.
