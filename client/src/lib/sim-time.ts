import type { SwmmProject } from './swmm-types';

export function getSimStartMs(project: SwmmProject): number {
  const dateStr = (project.options?.['REPORT_START_DATE'] || project.options?.['START_DATE'] || '').trim();
  const timeStr = (project.options?.['REPORT_START_TIME'] || project.options?.['START_TIME'] || '00:00:00').trim();
  let year = 2024, month = 1, day = 1;
  const dm = dateStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dm) {
    month = parseInt(dm[1], 10);
    day = parseInt(dm[2], 10);
    year = parseInt(dm[3], 10);
    if (year < 100) year += year < 50 ? 2000 : 1900;
  }
  let h = 0, m = 0, s = 0;
  const tm = timeStr.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (tm) {
    h = parseInt(tm[1], 10);
    m = parseInt(tm[2], 10);
    s = tm[3] ? parseInt(tm[3], 10) : 0;
  }
  return Date.UTC(year, month - 1, day, h, m, s);
}

export function formatSimDateTime(startMs: number, elapsedSec: number): string {
  const d = new Date(startMs + elapsedSec * 1000);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(d.getUTCMonth() + 1)}/${p2(d.getUTCDate())}/${d.getUTCFullYear()} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
}

export function extractContinuityErrors(rptText: string): { runoff: number | null; flow: number | null } {
  const grab = (sectionHeader: RegExp): number | null => {
    const secMatch = rptText.match(sectionHeader);
    if (!secMatch || secMatch.index == null) return null;
    const tail = rptText.slice(secMatch.index);
    const ce = tail.match(/Continuity Error \(%\)[ .]*\s*(-?\d+(?:\.\d+)?)/);
    return ce ? parseFloat(ce[1]) : null;
  };
  return {
    runoff: grab(/Runoff Quantity Continuity/),
    flow: grab(/Flow Routing Continuity/),
  };
}
