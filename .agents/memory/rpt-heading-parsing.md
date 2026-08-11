---
name: SWMM .rpt heading parsing quirks
description: Pitfalls when parsing EPA SWMM report sections by heading text
---
Rule: match .rpt section headings with startsWith on the trimmed line, never exact equality, and never break on a `****` separator line before any content has been captured.
**Why:** Continuity headings carry trailing column labels ("Runoff Quantity Continuity     acre-feet        inches"), and summary sections put a `****` underline directly below the heading — exact match / eager break silently yields empty metrics that render as healthy zeros.
**How to apply:** client/src/lib/engine-insights.ts and server/mcp.ts both parse .rpt sections; "Time-Step Critical Elements" mixes Node AND Link rows — keep both kinds.
