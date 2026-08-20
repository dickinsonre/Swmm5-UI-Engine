/**
 * Companion (external) data files referenced by an .inp but not contained in it.
 *
 * Desktop SWMM5 resolves a bare filename in a section like [RAINGAGES] relative
 * to the directory holding the .inp, so "it sits next to the model" is all a
 * user has to do. A browser has no such directory: we are handed one File and
 * never see its siblings. This module is the stand-in for that directory —
 * users attach the companion files once, and every engine writes them next to
 * the model before running.
 */

import type { SwmmProject } from './swmm-types';

export type ExternalRefKind = 'raingage' | 'timeseries';

export interface ExternalRef {
  /** Path exactly as written in the .inp, quotes stripped. */
  path: string;
  /** Object that references it (a gage ID, for example). */
  ownerId: string;
  kind: ExternalRefKind;
  /** Short human description of what the engine wants the file for. */
  purpose: string;
}

export interface Attachment {
  /** File name as supplied by the user. */
  name: string;
  bytes: Uint8Array;
  size: number;
  lastModified: number;
}

/**
 * Attachments are keyed by lower-cased BASE name. SWMM resolves a companion
 * file relative to the model directory, so the leading path in the .inp is not
 * meaningful here — what matters is that the user handed us a file with the
 * right name. Case is folded because .inp references routinely disagree in case
 * with the file on disk and desktop SWMM on Windows does not care.
 */
export function attachmentKey(pathOrName: string): string {
  const cleaned = pathOrName.trim().replace(/^"|"$/g, '');
  const base = cleaned.split(/[\\/]/).pop() || cleaned;
  return base.toLowerCase();
}

/**
 * Names the run itself owns. A model reference that collides with one of these
 * would have the companion writer clobber the model or its scratch output, so
 * such a reference is dropped rather than written.
 */
const RESERVED_ENGINE_FILES = new Set(['model.inp', 'model.rpt', 'model.out']);

/** Strip the surrounding quotes SWMM allows around a path. */
export function unquotePath(p: string): string {
  return (p || '').trim().replace(/^"|"$/g, '');
}

/**
 * Every external file the current model expects the engine to open.
 *
 * This is the ONE resolver — the dialog, model health and every engine must
 * ask it rather than re-deriving the list, or a reference will be shown as
 * satisfied in one place and be missing at run time in another.
 */
export function collectExternalRefs(project: SwmmProject): ExternalRef[] {
  const refs: ExternalRef[] = [];
  for (const rg of project.raingages || []) {
    if ((rg.sourceType || '').toUpperCase() !== 'FILE') continue;
    const path = unquotePath(rg.sourceName || '');
    if (!path) continue;
    refs.push({
      path,
      ownerId: rg.id,
      kind: 'raingage',
      purpose: `Rainfall for gage "${rg.id}"`,
    });
  }
  // [TIMESERIES] "Name FILE Fname" — the same arrangement as a FILE gage, and
  // just as unreadable without the file itself.
  for (const [tsName, fname] of Object.entries(project.timeseriesFiles || {})) {
    const path = unquotePath(fname || '');
    if (!path) continue;
    refs.push({
      path,
      ownerId: tsName,
      kind: 'timeseries',
      purpose: `Time series "${tsName}"`,
    });
  }
  return refs;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const attachments = new Map<string, Attachment>();
const listeners = new Set<() => void>();

/**
 * useSyncExternalStore compares snapshots by identity, so the snapshot has to be
 * a cached value that only changes when the data changes. Rebuilding the array
 * on every call would loop forever.
 */
let snapshot: Attachment[] = [];

function publish(): void {
  snapshot = Array.from(attachments.values()).sort((a, b) => a.name.localeCompare(b.name));
  for (const l of listeners) l();
}

export function subscribeAttachments(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getAttachmentsSnapshot(): Attachment[] {
  return snapshot;
}

export function getAttachment(pathOrName: string): Attachment | undefined {
  return attachments.get(attachmentKey(pathOrName));
}

export function hasAttachment(pathOrName: string): boolean {
  return attachments.has(attachmentKey(pathOrName));
}

export function attachedBytesTotal(): number {
  let n = 0;
  for (const a of attachments.values()) n += a.size;
  return n;
}

/** Add or replace a companion file from raw bytes. */
export function attachBytes(name: string, bytes: Uint8Array, lastModified = Date.now()): Attachment {
  const rec: Attachment = { name, bytes, size: bytes.byteLength, lastModified };
  attachments.set(attachmentKey(name), rec);
  publish();
  return rec;
}

/** Add or replace a companion file. Returns the stored record. */
export async function addAttachment(file: File): Promise<Attachment> {
  return attachBytes(file.name, new Uint8Array(await file.arrayBuffer()), file.lastModified);
}

export function removeAttachment(pathOrName: string): void {
  if (attachments.delete(attachmentKey(pathOrName))) publish();
}

export function clearAttachments(): void {
  if (attachments.size === 0) return;
  attachments.clear();
  publish();
}

/**
 * Companion files to place beside the model for a run: only those the CURRENT
 * model actually references. Attaching a file the model never names is
 * harmless, but shipping it to the engine is noise, and for server runs it is
 * a needless upload.
 *
 * The write path is the reference AS WRITTEN in the .inp, because that is the
 * string the engine will open. A reference carrying directories is honoured as
 * a relative path so "data/rain.dat" still resolves.
 */
export function resolveEngineFiles(project: SwmmProject): { path: string; bytes: Uint8Array }[] {
  const out: { path: string; bytes: Uint8Array }[] = [];
  const seen = new Set<string>();
  for (const ref of collectExternalRefs(project)) {
    const att = getAttachment(ref.path);
    if (!att) continue;
    // A path is only usable as-is when it is relative. An absolute or
    // drive-lettered path from another machine can never resolve here, so fall
    // back to the bare name — the engine's working directory is the model
    // directory, which is what the user meant by "next to the .inp".
    const raw = ref.path.replace(/\\/g, '/');
    let usable = raw.startsWith('/') || /^[A-Za-z]:/.test(raw)
      ? (raw.split('/').pop() as string)
      : raw;
    // A reference is model data, not a trusted path. Anything that could climb
    // out of the model directory, or that names a file the run itself owns,
    // collapses to the bare name — the engine's working directory IS the model
    // directory, so the bare name is always what the user meant.
    const segments = usable.split('/');
    if (segments.some(seg => seg === '..' || seg === '.' || seg === '')) {
      usable = segments[segments.length - 1] || '';
    }
    if (!usable || RESERVED_ENGINE_FILES.has(usable.toLowerCase())) continue;
    if (seen.has(usable)) continue;
    seen.add(usable);
    out.push({ path: usable, bytes: att.bytes });
  }
  return out;
}

/** External refs the model names but nothing has been attached for. */
export function missingExternalRefs(project: SwmmProject): ExternalRef[] {
  return collectExternalRefs(project).filter(r => !hasAttachment(r.path));
}

/**
 * Write companion files into an Emscripten filesystem next to the model.
 * `prefix` matches whatever the caller used for model.inp ('' for a relative
 * cwd write, '/' for an absolute one) so the engine's own relative open of the
 * companion file lands on the same directory.
 *
 * Returns the paths written so the caller can unlink them after the run.
 */
export function writeCompanionFiles(
  FS: { writeFile: (p: string, d: Uint8Array) => void; mkdir: (p: string) => void; analyzePath?: (p: string) => { exists: boolean } },
  files: { path: string; bytes: Uint8Array }[],
  prefix: '' | '/' = '',
): string[] {
  const written: string[] = [];
  for (const f of files) {
    const full = prefix + f.path;
    const slash = f.path.lastIndexOf('/');
    if (slash > 0) {
      // Create intermediate directories one level at a time; Emscripten's FS
      // has no recursive mkdir.
      let dir: string = prefix;
      for (const seg of f.path.slice(0, slash).split('/')) {
        if (!seg) continue;
        dir = dir ? `${dir}${dir.endsWith('/') ? '' : '/'}${seg}` : seg;
        try { FS.mkdir(dir); } catch { /* already exists */ }
      }
    }
    try {
      FS.writeFile(full, f.bytes);
      written.push(full);
    } catch (e) {
      throw new Error(`Could not place companion file "${f.path}" for the engine: ${(e as Error).message}`);
    }
  }
  return written;
}

/** Total attached bytes that would be uploaded for the current model. */
export function engineFilesBytes(project: SwmmProject): number {
  return resolveEngineFiles(project).reduce((n, f) => n + f.bytes.byteLength, 0);
}

/**
 * Server runs carry companion files in a JSON body, so they are bounded by the
 * request body limit rather than by available memory.
 *
 * The whole envelope must fit the server's 25 MB body cap AFTER base64 inflates
 * the bytes by 4/3, and the model text shares that budget. 12 MiB of files
 * encode to 16 MiB, leaving roughly 8 MB of headroom for even a very large
 * .inp — a limit quoted higher than this produces a confusing server 413
 * instead of the clear message below.
 */
export const SERVER_ATTACHMENT_LIMIT = 12 * 1024 * 1024;

export function encodeAttachmentsForServer(project: SwmmProject): { name: string; data: string }[] {
  return resolveEngineFiles(project).map(f => {
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < f.bytes.length; i += CHUNK) {
      bin += String.fromCharCode(...f.bytes.subarray(i, i + CHUNK));
    }
    return { name: f.path, data: btoa(bin) };
  });
}
