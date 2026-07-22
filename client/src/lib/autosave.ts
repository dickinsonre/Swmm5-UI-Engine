export interface AutosaveSnapshot {
  fileName: string;
  timestamp: number;
  inp: string;
}

const STORAGE_KEY = 'swmm5-autosaves-v1';
const BASELINE_KEY = 'swmm5-autosave-baseline-v1';
const MAX_SNAPSHOTS = 5;
const MIN_INTERVAL_MS = 15000;

let lastSaveTime = 0;
let storageDisabled = false;

export function listSnapshots(): AutosaveSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((s: any) => s && typeof s.inp === 'string' && typeof s.timestamp === 'number');
  } catch {
    return [];
  }
}

export function getLatestSnapshot(): AutosaveSnapshot | null {
  const snaps = listSnapshots();
  if (snaps.length === 0) return null;
  return snaps.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));
}

export interface SaveResult {
  ok: boolean;
  error?: string;
}

export function saveSnapshot(fileName: string, inp: string, force = false): SaveResult {
  if (storageDisabled) return { ok: false, error: 'Autosave disabled (storage quota exceeded)' };
  const now = Date.now();
  if (!force && now - lastSaveTime < MIN_INTERVAL_MS) return { ok: true };
  let snaps = listSnapshots();
  const latest = snaps.length > 0 ? snaps[snaps.length - 1] : null;
  if (latest && latest.inp === inp && latest.fileName === fileName) {
    return { ok: true };
  }
  snaps = [...snaps, { fileName, timestamp: now, inp }];
  while (snaps.length > MAX_SNAPSHOTS) snaps.shift();
  while (snaps.length > 0) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps));
      lastSaveTime = now;
      return { ok: true };
    } catch {
      if (snaps.length === 1) {
        storageDisabled = true;
        return { ok: false, error: 'Autosave failed: browser storage quota exceeded. The model may be too large for autosave.' };
      }
      snaps.shift();
    }
  }
  storageDisabled = true;
  return { ok: false, error: 'Autosave failed: browser storage unavailable.' };
}

export function clearSnapshots(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  storageDisabled = false;
  lastSaveTime = 0;
}

export function getRecoveryBaseline(): number {
  try {
    const raw = localStorage.getItem(BASELINE_KEY);
    if (!raw) return 0;
    const v = JSON.parse(raw);
    return typeof v?.acknowledgedAt === 'number' ? v.acknowledgedAt : 0;
  } catch {
    return 0;
  }
}

export function setRecoveryBaseline(ts: number = Date.now()): void {
  try {
    localStorage.setItem(BASELINE_KEY, JSON.stringify({ acknowledgedAt: ts }));
  } catch {}
}

export function getRecoverableSnapshot(loadedInp?: string): AutosaveSnapshot | null {
  const snap = getLatestSnapshot();
  if (!snap) return null;
  if (snap.timestamp <= getRecoveryBaseline()) return null;
  if (loadedInp !== undefined && snap.inp === loadedInp) return null;
  return snap;
}

export function isAutosaveDisabled(): boolean {
  return storageDisabled;
}

export function formatSnapshotTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
}

export function formatSnapshotSize(inp: string): string {
  const bytes = inp.length;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
