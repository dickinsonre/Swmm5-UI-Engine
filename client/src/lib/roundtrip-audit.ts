import { parseInpFile, projectToInp } from './inp-parser';
import type { SwmmProject } from './swmm-types';

export type RoundTripDiffKind = 'altered' | 'omitted' | 'added';

export interface RoundTripDiff {
  path: string;
  kind: RoundTripDiffKind;
  before?: unknown;
  after?: unknown;
}

export interface RoundTripAuditReport {
  diffs: RoundTripDiff[];
  preservedSections: string[];
  unsupportedSections: string[];
  error?: string;
  exportedInp?: string;
}

const NUM_TOL = 1e-9;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function normalizeScalar(v: unknown): unknown {
  if (typeof v === 'string') {
    const t = v.trim();
    if (t !== '' && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(t)) return Number(t);
    return t;
  }
  return v;
}

function scalarsEqual(a: unknown, b: unknown): boolean {
  const na = normalizeScalar(a);
  const nb = normalizeScalar(b);
  if (typeof na === 'number' && typeof nb === 'number') {
    if (Number.isNaN(na) && Number.isNaN(nb)) return true;
    const scale = Math.max(Math.abs(na), Math.abs(nb), 1);
    return Math.abs(na - nb) <= NUM_TOL * scale;
  }
  return na === nb;
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

/** Compare `before` (current project) against `after` (re-parse of exported INP). */
export function deepDiff(before: unknown, after: unknown, path: string, out: RoundTripDiff[]): void {
  if (isEmpty(before) && isEmpty(after)) return;
  if (isEmpty(after) && !isEmpty(before)) {
    out.push({ path, kind: 'omitted', before });
    return;
  }
  if (isEmpty(before) && !isEmpty(after)) {
    out.push({ path, kind: 'added', after });
    return;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length) {
      out.push({ path: `${path}.length`, kind: 'altered', before: before.length, after: after.length });
    }
    const n = Math.max(before.length, after.length);
    for (let i = 0; i < n; i++) deepDiff(before[i], after[i], `${path}[${i}]`, out);
    return;
  }
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    keys.forEach(k => deepDiff((before as Record<string, unknown>)[k], (after as Record<string, unknown>)[k], `${path}.${k}`, out));
    return;
  }
  if (!scalarsEqual(before, after)) {
    out.push({ path, kind: 'altered', before, after });
  }
}

/** Normalize a project for comparison: raw section lines collapse whitespace, title lines trim. */
export function normalizeProject(p: SwmmProject): SwmmProject {
  const clone = JSON.parse(JSON.stringify(p)) as SwmmProject;
  const raw: Record<string, string[]> = {};
  for (const [name, lines] of Object.entries(clone.rawSections || {})) {
    const data = (lines as string[])
      .map(l => l.replace(/\s+/g, ' ').trim())
      .filter(l => l && !l.startsWith(';'));
    if (data.length) raw[name.toUpperCase()] = data;
  }
  clone.rawSections = raw;
  clone.title = (clone.title || []).map(t => t.trim()).filter(Boolean);
  return clone;
}

export function fmtVal(v: unknown): string {
  const s = JSON.stringify(v);
  return s && s.length > 120 ? s.slice(0, 117) + '…' : String(s);
}

/** Top-level project keys that hold structured (fully supported) data. */
const SECTION_LABELS: Record<string, string> = {
  title: 'TITLE', options: 'OPTIONS', reportOptions: 'REPORT', raingages: 'RAINGAGES',
  subcatchments: 'SUBCATCHMENTS', subareas: 'SUBAREAS', infiltration: 'INFILTRATION',
  junctions: 'JUNCTIONS', outfalls: 'OUTFALLS', dividers: 'DIVIDERS', storageUnits: 'STORAGE',
  conduits: 'CONDUITS', pumps: 'PUMPS', weirs: 'WEIRS', orifices: 'ORIFICES', outlets: 'OUTLETS',
  xsections: 'XSECTIONS', losses: 'LOSSES', transects: 'TRANSECTS', timeseries: 'TIMESERIES',
  timeseriesFiles: 'TIMESERIES (FILE)', curves: 'CURVES', patterns: 'PATTERNS', controls: 'CONTROLS',
  pollutants: 'POLLUTANTS', landuses: 'LANDUSES', dwf: 'DWF', lidControls: 'LID_CONTROLS',
  lidUsage: 'LID_USAGE', aquifers: 'AQUIFERS', groundwater: 'GROUNDWATER', snowpacks: 'SNOWPACKS',
  labels: 'LABELS', mapExtent: 'MAP',
};

function hasData(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (isPlainObject(v)) return Object.keys(v).length > 0;
  return true;
}

/**
 * Run the round-trip audit against the current in-memory project:
 * export via projectToInp, re-parse, deep-compare normalized forms.
 */
export function runRoundTripAudit(project: SwmmProject): RoundTripAuditReport {
  try {
    const exported = projectToInp(project);
    const reparsed = parseInpFile(exported);
    const diffs: RoundTripDiff[] = [];
    deepDiff(normalizeProject(project), normalizeProject(reparsed), '$', diffs);

    const diffedTopKeys = new Set(
      diffs.map(d => {
        const m = /^\$\.([A-Za-z0-9_]+)/.exec(d.path);
        return m ? m[1] : '';
      })
    );

    const preservedSections: string[] = [];
    for (const [key, label] of Object.entries(SECTION_LABELS)) {
      if (hasData((project as unknown as Record<string, unknown>)[key]) && !diffedTopKeys.has(key)) {
        preservedSections.push(label);
      }
    }

    // rawSections are passed through verbatim but not structurally understood
    const unsupportedSections = Object.entries(project.rawSections || {})
      .filter(([, lines]) => (lines as string[]).some(l => l.trim() && !l.trim().startsWith(';')))
      .map(([name]) => name.toUpperCase())
      .sort();

    return { diffs, preservedSections, unsupportedSections, exportedInp: exported };
  } catch (e) {
    return {
      diffs: [],
      preservedSections: [],
      unsupportedSections: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
