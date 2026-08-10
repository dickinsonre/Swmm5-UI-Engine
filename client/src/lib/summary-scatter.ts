// Extracts peak-value maps from SWMM .rpt summary tables for the Rossman-style
// engine-vs-engine scatter plots. Ported from the user's BatchSWMMRunner
// project (summaryScatter.ts + qaqcReport.ts). Plain .ts (no JSX) so node
// tests can import.
//
// The summary tables use multi-line headers, so generic header matching fails;
// instead each parser walks to the section, skips the header block, and reads
// whitespace-split data rows at known column positions:
//
//   Link Flow Summary:      Link Type MaxFlow days hr:min MaxVel [MaxFullFlow MaxFullDepth]
//   Node Depth Summary:     Node Type AvgDepth MaxDepth MaxHGL days hr:min [ReportedMaxDepth]
//   Subcatchment Runoff:    Name Precip Runon Evap Infil ImpervRO PervRO TotalRO(depth) TotalRO(vol) PeakRO Coeff

export interface ScatterValues {
  /** Link name -> maximum |flow|. */
  flows: Map<string, number>;
  /** Node name -> maximum HGL (falls back to maximum depth when HGL column missing). */
  heads: Map<string, number>;
  /** Subcatchment name -> peak runoff flow (CFS/CMS). */
  runoff: Map<string, number>;
  /** Node name -> maximum depth (always the Maximum Depth column). */
  nodeDepths: Map<string, number>;
  /** Conduit name -> max/full depth ratio (fraction of the pipe filled). */
  linkDepths: Map<string, number>;
  /** Axis captions. */
  headsLabel: "Maximum HGL" | "Maximum Depth";
}

/** Return the data lines of a named summary section (between its dashed rules). */
function sectionRows(lines: string[], title: RegExp): string[][] {
  let i = lines.findIndex(l => title.test(l));
  if (i < 0) return [];
  // Skip to the dashed line that opens the header block.
  while (i < lines.length && !/^\s*-{10,}/.test(lines[i])) i++;
  if (i >= lines.length) return [];
  i++;
  // Skip header lines until the dashed line that closes the header block.
  while (i < lines.length && !/^\s*-{10,}/.test(lines[i])) i++;
  i++;
  const rows: string[][] = [];
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) break;
    if (/^-{10,}/.test(t) || /^\*{3,}/.test(t)) break;
    rows.push(t.split(/\s+/));
  }
  return rows;
}

function num(s: string | undefined): number | undefined {
  if (s === undefined) return undefined;
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : undefined;
}

export function extractScatterValues(report: string): ScatterValues {
  const lines = report.split("\n");
  const flows = new Map<string, number>();
  const heads = new Map<string, number>();
  const runoff = new Map<string, number>();
  const nodeDepths = new Map<string, number>();
  const linkDepths = new Map<string, number>();
  let headsLabel: ScatterValues["headsLabel"] = "Maximum HGL";

  // Link Flow Summary — col 2 is Maximum |Flow| (name, type, flow, ...).
  // Conduit rows carry velocity + Max/Full Flow + Max/Full Depth (8 columns).
  // Weir/orifice rows skip velocity and Max/Full Flow, ending with Max/Full
  // Depth (6 tokens when present, 5 when blank). Pump rows end with Max/Full
  // Flow — a flow ratio, not a depth — so they are excluded. Dummy links have
  // no ratio columns at all.
  for (const row of sectionRows(lines, /^\s*Link Flow Summary\s*$/)) {
    if (row.length < 3) continue;
    const v = num(row[2]);
    if (v !== undefined) flows.set(row[0], Math.abs(v));
    const type = row[1]?.toUpperCase();
    let d: number | undefined;
    if (type === "CONDUIT" && row.length >= 8) d = num(row[7]);
    else if ((type === "WEIR" || type === "ORIFICE") && row.length >= 6) d = num(row[5]);
    if (d !== undefined) linkDepths.set(row[0], d);
  }

  // Node Depth Summary — cols: name type avgDepth maxDepth maxHGL days hr:min.
  // Detect whether the HGL column exists by checking the header block.
  const nodeHeaderIdx = lines.findIndex(l => /^\s*Node Depth Summary\s*$/.test(l));
  const hasHgl = nodeHeaderIdx >= 0 &&
    lines.slice(nodeHeaderIdx, nodeHeaderIdx + 8).some(l => /HGL/i.test(l));
  if (!hasHgl) headsLabel = "Maximum Depth";
  for (const row of sectionRows(lines, /^\s*Node Depth Summary\s*$/)) {
    if (row.length < 4) continue;
    const v = num(hasHgl ? row[4] : row[3]);
    if (v !== undefined) heads.set(row[0], v);
    const d = num(row[3]);
    if (d !== undefined) nodeDepths.set(row[0], d);
  }

  // Subcatchment Runoff Summary — columns: name, precip, runon, evap, infil,
  // imperv RO, perv RO, total RO depth, total RO volume, PEAK runoff, coeff.
  // Peak runoff flow is col 9.
  for (const row of sectionRows(lines, /^\s*Subcatchment Runoff Summary\s*$/)) {
    if (row.length < 11) continue;
    const v = num(row[9]);
    if (v !== undefined) runoff.set(row[0], v);
  }

  return { flows, heads, runoff, nodeDepths, linkDepths, headsLabel };
}

/** Pearson r-squared of paired values. */
export function rSquared(pairs: { x: number; y: number }[]): number | undefined {
  const n = pairs.length;
  if (n < 2) return undefined;
  const mx = pairs.reduce((a, p) => a + p.x, 0) / n;
  const my = pairs.reduce((a, p) => a + p.y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of pairs) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return undefined;
  return (sxy * sxy) / (sxx * syy);
}
