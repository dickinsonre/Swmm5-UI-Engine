import { useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { BarChart3, ChevronDown, ChevronRight, ArrowUpDown } from 'lucide-react';

interface RptTable {
  title: string;
  headers: string[];
  rows: string[][];
  numericCols: number[];
}

interface RptSection {
  title: string;
  tables: RptTable[];
  textLines: string[];
}

function isDashLine(line: string): boolean {
  const t = line.trim();
  return t.length >= 8 && /^-+$/.test(t);
}

function isStarLine(line: string): boolean {
  const t = line.trim();
  return t.length >= 8 && /^\*+$/.test(t);
}

function isNumericToken(tok: string): boolean {
  return /^-?[\d.,]+(e[+-]?\d+)?%?$/i.test(tok) && /\d/.test(tok);
}

/** Build headers from fixed-width header lines using data-token character ranges. */
function buildHeaders(headerLines: string[], dataRows: string[]): { headers: string[]; cols: number } {
  // Determine column ranges from token positions across data rows
  const tokenRanges: { start: number; end: number }[] = [];
  const first = dataRows[0];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  const firstTokens: { start: number; end: number }[] = [];
  while ((m = re.exec(first)) !== null) firstTokens.push({ start: m.index, end: m.index + m[0].length });
  const nCols = firstTokens.length;
  // Expand ranges using all rows (only rows with same token count)
  for (let c = 0; c < nCols; c++) tokenRanges.push({ ...firstTokens[c] });
  for (const row of dataRows) {
    const toks: { start: number; end: number }[] = [];
    const r2 = /\S+/g;
    let mm: RegExpExecArray | null;
    while ((mm = r2.exec(row)) !== null) toks.push({ start: mm.index, end: mm.index + mm[0].length });
    if (toks.length !== nCols) continue;
    for (let c = 0; c < nCols; c++) {
      tokenRanges[c].start = Math.min(tokenRanges[c].start, toks[c].start);
      tokenRanges[c].end = Math.max(tokenRanges[c].end, toks[c].end);
    }
  }
  // Assign each whole header token to the column with the greatest overlap
  const parts: string[][] = Array.from({ length: nCols }, () => []);
  for (const hl of headerLines) {
    const r3 = /\S+/g;
    let ht: RegExpExecArray | null;
    while ((ht = r3.exec(hl)) !== null) {
      if (/^-+$/.test(ht[0])) continue;
      const tStart = ht.index;
      const tEnd = ht.index + ht[0].length;
      let best = 0;
      let bestScore = -Infinity;
      for (let c = 0; c < nCols; c++) {
        const overlap = Math.min(tEnd, tokenRanges[c].end) - Math.max(tStart, tokenRanges[c].start);
        const center = (tStart + tEnd) / 2;
        const colCenter = (tokenRanges[c].start + tokenRanges[c].end) / 2;
        const score = overlap > 0 ? overlap * 1000 - Math.abs(center - colCenter) : -Math.abs(center - colCenter);
        if (score > bestScore) { bestScore = score; best = c; }
      }
      parts[best].push(ht[0]);
    }
  }
  const headers = parts.map((p, c) => p.join(' ').replace(/\s+/g, ' ') || `Col ${c + 1}`);
  return { headers, cols: nCols };
}

export function parseRptSections(content: string): RptSection[] {
  const lines = content.split('\n').map(l => l.replace(/\r$/, ''));
  const sections: RptSection[] = [];
  let i = 0;
  let current: RptSection | null = null;

  const pushSection = (s: RptSection | null) => { if (s && (s.tables.length || s.textLines.some(l => l.trim()))) sections.push(s); };

  while (i < lines.length) {
    // Section banner: star line, title line(s), star line
    if (isStarLine(lines[i]) && i + 2 < lines.length) {
      let j = i + 1;
      const titleLines: string[] = [];
      while (j < lines.length && !isStarLine(lines[j]) && titleLines.length < 3) {
        if (lines[j].trim()) titleLines.push(lines[j].trim());
        j++;
      }
      if (j < lines.length && isStarLine(lines[j]) && titleLines.length > 0) {
        pushSection(current);
        current = { title: titleLines.join(' '), tables: [], textLines: [] };
        i = j + 1;
        continue;
      }
    }
    if (!current) { i++; continue; }

    // Table start: dash line followed by header lines then dash line then data
    if (isDashLine(lines[i])) {
      let j = i + 1;
      const headerLines: string[] = [];
      while (j < lines.length && !isDashLine(lines[j]) && lines[j].trim() && headerLines.length < 5) {
        headerLines.push(lines[j]);
        j++;
      }
      if (j < lines.length && isDashLine(lines[j]) && headerLines.length > 0) {
        // collect data rows
        let k = j + 1;
        const dataRows: string[] = [];
        while (k < lines.length && lines[k].trim() && !isDashLine(lines[k]) && !isStarLine(lines[k])) {
          dataRows.push(lines[k]);
          k++;
        }
        // Skip separator + trailing system row(s) if present after a dash line
        if (dataRows.length > 0) {
          const { headers, cols } = buildHeaders(headerLines, dataRows);
          const rows: string[][] = [];
          for (const dr of dataRows) {
            const toks = dr.trim().split(/\s+/);
            if (toks.length === cols) rows.push(toks);
            else if (toks.length > cols) {
              // merge leading tokens into first cell (e.g. names with spaces)
              rows.push([toks.slice(0, toks.length - cols + 1).join(' '), ...toks.slice(toks.length - cols + 1)]);
            }
          }
          if (rows.length > 0) {
            const numericCols: number[] = [];
            for (let c = 1; c < cols; c++) {
              const vals = rows.map(r => r[c]);
              const numCount = vals.filter(isNumericToken).length;
              if (numCount >= vals.length * 0.7) numericCols.push(c);
            }
            current.tables.push({ title: current.title, headers, rows, numericCols });
            i = k;
            continue;
          }
        }
      }
    }
    current.textLines.push(lines[i]);
    i++;
  }
  pushSection(current);
  return sections;
}

function parseNum(s: string): number {
  const v = parseFloat(s.replace(/,/g, '').replace(/%$/, ''));
  return isNaN(v) ? 0 : v;
}

function TableCard({ table, sectionIdx, tableIdx }: { table: RptTable; sectionIdx: number; tableIdx: number }) {
  const [chartCol, setChartCol] = useState<number | null>(null);
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDesc, setSortDesc] = useState(true);

  const sortedRows = useMemo(() => {
    if (sortCol === null) return table.rows;
    const numeric = table.numericCols.includes(sortCol);
    return [...table.rows].sort((a, b) => {
      const cmp = numeric ? parseNum(a[sortCol]) - parseNum(b[sortCol]) : a[sortCol].localeCompare(b[sortCol]);
      return sortDesc ? -cmp : cmp;
    });
  }, [table, sortCol, sortDesc]);

  const chartData = useMemo(() => {
    if (chartCol === null) return [];
    const data = table.rows
      .filter(r => isNumericToken(r[chartCol]))
      .map(r => ({ name: r[0], value: parseNum(r[chartCol]) }));
    data.sort((a, b) => b.value - a.value);
    return data.slice(0, 40);
  }, [table, chartCol]);

  return (
    <div className="border border-[#d0d0d8] rounded bg-white overflow-hidden">
      {table.numericCols.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 bg-[#f0f0f4] border-b border-[#e0e0e8]">
          <BarChart3 className="w-3 h-3 text-[#6b6b7b]" />
          <span className="text-[9px] text-[#6b6b7b] mr-1">Chart column:</span>
          <button
            className={`text-[9px] px-1.5 py-0.5 rounded border ${chartCol === null ? 'bg-[#2c6eb5] text-white border-[#2c6eb5]' : 'bg-white text-[#4a4a5a] border-[#d0d0d8] hover:bg-[#e8f0fb]'}`}
            onClick={() => setChartCol(null)}
            data-testid={`rpt-chart-none-${sectionIdx}-${tableIdx}`}
          >
            None
          </button>
          {table.numericCols.map(c => (
            <button
              key={c}
              className={`text-[9px] px-1.5 py-0.5 rounded border ${chartCol === c ? 'bg-[#2c6eb5] text-white border-[#2c6eb5]' : 'bg-white text-[#4a4a5a] border-[#d0d0d8] hover:bg-[#e8f0fb]'}`}
              onClick={() => setChartCol(chartCol === c ? null : c)}
              data-testid={`rpt-chart-col-${sectionIdx}-${tableIdx}-${c}`}
            >
              {table.headers[c]}
            </button>
          ))}
        </div>
      )}
      {chartCol !== null && chartData.length > 0 && (
        <div className="px-2 pt-2" style={{ height: 220 }} data-testid={`rpt-chart-${sectionIdx}-${tableIdx}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 40, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e8ee" />
              <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#6b6b7b' }} angle={-45} textAnchor="end" interval={0} height={50} />
              <YAxis tick={{ fontSize: 8, fill: '#6b6b7b' }} width={45} />
              <Tooltip contentStyle={{ fontSize: 10 }} formatter={(v: number) => [v, table.headers[chartCol]]} />
              <Bar dataKey="value" fill="#2c6eb5" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {table.rows.length > 40 && (
            <div className="text-[8px] text-[#9090a0] text-center -mt-1">Top 40 of {table.rows.length} shown (sorted by value)</div>
          )}
        </div>
      )}
      <div className="overflow-x-auto" style={{ maxHeight: 320 }}>
        <table className="w-full text-[10px] border-collapse">
          <thead className="sticky top-0 bg-[#f8f8fa]">
            <tr>
              {table.headers.map((h, c) => (
                <th
                  key={c}
                  className={`px-2 py-1 border-b border-[#d0d0d8] font-semibold text-[#2c3e6b] whitespace-nowrap cursor-pointer select-none hover:bg-[#e8f0fb] ${c === 0 ? 'text-left' : 'text-right'}`}
                  onClick={() => {
                    if (sortCol === c) setSortDesc(d => !d);
                    else { setSortCol(c); setSortDesc(true); }
                  }}
                  data-testid={`rpt-th-${sectionIdx}-${tableIdx}-${c}`}
                >
                  <span className="inline-flex items-center gap-0.5">
                    {h} {sortCol === c ? <ArrowUpDown className="w-2.5 h-2.5 text-[#2c6eb5]" /> : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r, ri) => (
              <tr key={ri} className={`${ri % 2 ? 'bg-[#fafafa]' : 'bg-white'} hover:bg-[#eef4fb]`}>
                {r.map((cell, c) => (
                  <td key={c} className={`px-2 py-0.5 border-b border-[#f0f0f4] whitespace-nowrap ${c === 0 ? 'text-left font-mono text-[#2a2a3e]' : 'text-right font-mono text-[#4a4a5a]'}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function RptHtmlView({ content, searchTerm }: { content: string; searchTerm?: string }) {
  const sections = useMemo(() => parseRptSections(content), [content]);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const visible = useMemo(() => {
    if (!searchTerm?.trim()) return sections.map((_, i) => i);
    const t = searchTerm.toLowerCase();
    return sections.map((s, i) => (s.title.toLowerCase().includes(t) ? i : -1)).filter(i => i >= 0);
  }, [sections, searchTerm]);

  if (sections.length === 0) {
    return <div className="text-[11px] text-[#9090a0] p-4">No structured sections found in this report.</div>;
  }

  const shown = visible.length > 0 ? visible : sections.map((_, i) => i);

  return (
    <div className="flex flex-col gap-2" data-testid="rpt-html-view">
      {searchTerm?.trim() && visible.length === 0 && (
        <div className="text-[10px] text-[#9090a0]">No section titles match "{searchTerm}" — showing all sections.</div>
      )}
      {shown.map(si => {
        const s = sections[si];
        const isCollapsed = collapsed.has(si);
        return (
          <div key={si}>
            <button
              className="flex items-center gap-1 w-full text-left px-2 py-1.5 bg-[#2c3e6b] text-white rounded-t text-[11px] font-semibold"
              onClick={() => setCollapsed(prev => { const n = new Set(prev); n.has(si) ? n.delete(si) : n.add(si); return n; })}
              data-testid={`rpt-section-${si}`}
            >
              {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {s.title}
              {s.tables.length > 0 && <span className="ml-auto text-[9px] font-normal opacity-70">{s.tables[0]?.rows.length ?? 0} rows</span>}
            </button>
            {!isCollapsed && (
              <div className="border border-t-0 border-[#d0d0d8] rounded-b p-2 bg-[#f8f8fa] flex flex-col gap-2">
                {s.tables.map((t, ti) => (
                  <TableCard key={ti} table={t} sectionIdx={si} tableIdx={ti} />
                ))}
                {s.tables.length === 0 && s.textLines.some(l => l.trim()) && (
                  <pre className="text-[10px] font-mono whitespace-pre overflow-x-auto text-[#4a4a5a] p-1">
                    {s.textLines.join('\n').replace(/^\n+|\n+$/g, '')}
                  </pre>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
