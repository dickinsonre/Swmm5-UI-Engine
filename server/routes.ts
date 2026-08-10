import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { spawn } from "child_process";
import { writeFile, readFile, mkdir, rm, stat } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { existsSync, createReadStream } from "fs";
import { createGzip } from "zlib";
import { pipeline } from "stream";

const ALLOWED_HOSTS = [
  'raw.githubusercontent.com',
  'gist.githubusercontent.com',
  'raw.github.com',
];

const BATCH_SWMM_URL = 'https://batch-swmm-runner-robertdickinson.replit.app';
const SWMM_ENGINE_PATH = join(process.cwd(), 'swmm-engine', 'runswmm');
const MAX_INP_BYTES = 25 * 1024 * 1024; // 25 MB cap on uploaded models
const SIM_TIMEOUT_MS = 180000; // kill runaway simulations after 3 minutes

// Simple per-IP rate limiter: at most 1 simulation per IP every 8 seconds.
// This prevents accidental or intentional request floods without disrupting
// normal sequential engineering workflows.
const SIM_COOLDOWN_MS = 8000;
const lastSimByIp = new Map<string, number>();

// Cap concurrent native SWMM processes so a burst of requests cannot
// exhaust CPU/memory on the container.
const MAX_CONCURRENT_SIMS = 2;
let activeSims = 0;

// Large binary .out results are NOT embedded in the JSON response (base64
// inflates them ~33% and deployment proxies cap responses around 32 MiB,
// which silently kills big-model results in production). Instead they are
// parked on disk briefly and fetched by the client as a gzip-compressed
// binary download via GET /api/swmm/out/:id.
const INLINE_OUT_LIMIT = 5 * 1024 * 1024; // inline base64 only below 5 MB
const OUT_RESULT_TTL_MS = 5 * 60 * 1000;  // parked results expire after 5 min
const pendingOutFiles = new Map<string, { path: string; dir: string; expiresAt: number }>();

function pruneExpiredOutFiles() {
  const now = Date.now();
  for (const [id, entry] of pendingOutFiles) {
    if (entry.expiresAt < now) {
      pendingOutFiles.delete(id);
      rm(entry.dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

function checkSimRateLimit(req: Request): { allowed: boolean; retryAfterMs: number } {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const last = lastSimByIp.get(ip) ?? 0;
  const elapsed = now - last;
  if (elapsed < SIM_COOLDOWN_MS) {
    return { allowed: false, retryAfterMs: SIM_COOLDOWN_MS - elapsed };
  }
  lastSimByIp.set(ip, now);
  // Prune old entries periodically to avoid memory growth
  if (lastSimByIp.size > 2000) {
    const cutoff = now - SIM_COOLDOWN_MS * 10;
    for (const [k, v] of lastSimByIp) if (v < cutoff) lastSimByIp.delete(k);
  }
  return { allowed: true, retryAfterMs: 0 };
}

// Probe whether the SWMM binary can actually execute (not just exist).
// A binary built against a missing dynamic loader path exists on disk but
// fails to spawn with ENOENT in production containers.
let engineExecutable: boolean | null = null;
let engineProbeAt = 0;
const PROBE_TTL_MS = 30000; // re-probe a failed engine every 30s in case failure was transient

function markEngineUnavailable(err?: NodeJS.ErrnoException) {
  // Only hard-disable on deterministic exec errors; transient failures get retried via TTL.
  const code = err?.code || '';
  engineExecutable = false;
  engineProbeAt = ['ENOENT', 'EACCES', 'ENOEXEC'].includes(code)
    ? Date.now() + 3600000 // deterministic: back off re-probe for an hour
    : Date.now();          // transient: eligible for re-probe after TTL
}

async function probeEngine(): Promise<boolean> {
  if (engineExecutable === true) return true;
  if (engineExecutable === false && Date.now() - engineProbeAt < PROBE_TTL_MS) return false;
  engineProbeAt = Date.now();
  if (!existsSync(SWMM_ENGINE_PATH)) {
    engineExecutable = false;
    return false;
  }
  engineExecutable = await new Promise<boolean>((resolve) => {
    try {
      const proc = spawn(SWMM_ENGINE_PATH, ['--help']);
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };
      const probeTimer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch {}
        done(true); // it spawned; treat slow help output as executable
      }, 5000);
      proc.on('error', () => { clearTimeout(probeTimer); done(false); });
      proc.on('close', () => { clearTimeout(probeTimer); done(true); });
    } catch {
      resolve(false);
    }
  });
  console.log(`[swmm] engine probe: ${SWMM_ENGINE_PATH} executable=${engineExecutable}`);
  return engineExecutable;
}

function readBodyWithLimit(req: Request): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const onData = (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_INP_BYTES) {
        const err = new Error(`Request body exceeds ${MAX_INP_BYTES / (1024 * 1024)} MB limit`) as any;
        err.statusCode = 413;
        // Stop buffering and drain the rest so the 413 response can be
        // delivered cleanly instead of aborting the connection mid-upload.
        req.removeListener('data', onData);
        chunks.length = 0;
        req.resume();
        reject(err);
        return;
      }
      chunks.push(chunk);
    };
    req.on('data', onData);
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Unified structured response when the local engine cannot run. Both run
// endpoints return this same shape (HTTP 503) so the client can always
// detect it and fall back to WASM/remote.
function sendEngineUnavailable(res: Response, detail?: string) {
  if (res.headersSent) return;
  res.status(503).json({
    engine: 'local',
    available: false,
    fallbackRecommended: 'wasm',
    error: detail || 'Local SWMM engine not available',
  });
}

// Shared simulation service used by both run endpoints:
// validate → execute → timeout → cleanup → normalized errors → engine metadata.
async function runLocalSimulation(inpText: string, req: Request, res: Response): Promise<void> {
  // Rate limiting lives here so every run route (run, run-or-proxy, and any
  // future route) is covered by the same per-IP cooldown.
  const rateCheck = checkSimRateLimit(req);
  if (!rateCheck.allowed) {
    res.status(429).json({
      error: `Too many simulation requests. Please wait ${Math.ceil(rateCheck.retryAfterMs / 1000)} seconds before running again.`,
      retryAfterMs: rateCheck.retryAfterMs,
    });
    return;
  }

  if (!(await probeEngine())) {
    sendEngineUnavailable(res);
    return;
  }

  if (activeSims >= MAX_CONCURRENT_SIMS) {
    res.status(429).json({
      error: 'Server is busy running other simulations. Please try again shortly.',
      retryAfterMs: 3000,
    });
    return;
  }

  const jobId = randomUUID();
  const tmpDir = join('/tmp', `swmm-${jobId}`);
  await mkdir(tmpDir, { recursive: true });
  const cleanup = async () => { try { await rm(tmpDir, { recursive: true, force: true }); } catch {} };
  const inpPath = join(tmpDir, 'model.inp');
  const rptPath = join(tmpDir, 'model.rpt');
  const outPath = join(tmpDir, 'model.out');

  activeSims++;
  let simSlotReleased = false;
  const releaseSimSlot = () => {
    if (!simSlotReleased) { simSlotReleased = true; activeSims--; }
  };

  try {
    await writeFile(inpPath, inpText, 'utf-8');
    const proc = spawn(SWMM_ENGINE_PATH, [inpPath, rptPath, outPath]);
    let stdout = '';
    let stderr = '';
    let responded = false;
    const respond = (fn: () => void) => {
      if (responded || res.headersSent) return;
      responded = true;
      fn();
    };
    const killTimer = setTimeout(async () => {
      try { proc.kill('SIGKILL'); } catch {}
      respond(() => res.status(500).json({ error: `Simulation timed out after ${SIM_TIMEOUT_MS / 1000} seconds` }));
      await cleanup();
    }, SIM_TIMEOUT_MS);

    // If the HTTP client disconnects mid-run, kill the child process so
    // abandoned simulations don't keep burning CPU.
    const onClientGone = () => {
      if (!responded) {
        responded = true;
        console.log('[swmm] client disconnected; killing simulation process');
        try { proc.kill('SIGKILL'); } catch {}
      }
    };
    res.on('close', onClientGone);

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', async (code) => {
      clearTimeout(killTimer);
      res.removeListener('close', onClientGone);
      releaseSimSlot();
      let reportContent = '';
      try { reportContent = await readFile(rptPath, 'utf-8'); } catch (e: any) { console.log('[swmm] Failed to read rpt:', e.message); }
      let outSize = 0;
      try { outSize = (await stat(outPath)).size; } catch (e: any) { console.log('[swmm] Failed to stat out:', e.message); }

      // Strict success classification: ALL conditions must hold, otherwise
      // the run is reported as failed with a specific reason. Never report
      // success on a nonzero exit, missing .out, or an invalid report.
      const errorLines = reportContent
        .split('\n')
        .filter((line) => line.includes('ERROR'))
        .map((line) => line.trim())
        .slice(0, 20);
      const stdoutHasErrors = stdout.includes('There are errors') || stdout.includes('has errors');
      const reportValid = reportContent.includes('EPA STORM WATER MANAGEMENT MODEL');

      let failureReason: string | null = null;
      if (code !== 0) {
        failureReason = `SWMM engine exited with code ${code}`;
      } else if (outSize === 0) {
        failureReason = 'SWMM produced no results (.out file missing or empty)';
      } else if (!reportValid) {
        failureReason = 'SWMM report file is missing or invalid';
      } else if (errorLines.length > 0 || stdoutHasErrors) {
        failureReason = 'SWMM simulation completed with errors';
      }

      if (failureReason) {
        console.log(`[swmm] FAILED: ${failureReason} (rpt=${reportContent.length} bytes, out=${outSize} bytes, exit=${code}, errorLines=${errorLines.length})`);
        await cleanup();
        respond(() => res.status(422).json({
          status: 'failed',
          error: failureReason,
          errorLines,
          reportContent,
          stdout,
          stderr,
          exitCode: code,
          engineUsed: 'local',
        }));
        return;
      }

      if (outSize <= INLINE_OUT_LIMIT) {
        // Small result: inline as base64 (single round-trip)
        let outBase64 = '';
        try { const outBuf = await readFile(outPath); outBase64 = outBuf.toString('base64'); } catch (e: any) { console.log('[swmm] Failed to read out:', e.message); }
        console.log(`[swmm] rpt=${reportContent.length} bytes, out=${outSize} bytes (inline), exit=${code}`);
        await cleanup();
        respond(() => res.json({ status: 'success', reportContent, outBase64, stdout, exitCode: code, engineUsed: 'local' }));
      } else {
        // Large result: park on disk, client fetches it separately as
        // compressed binary (base64-in-JSON would exceed proxy limits).
        pruneExpiredOutFiles();
        const outId = jobId;
        pendingOutFiles.set(outId, { path: outPath, dir: tmpDir, expiresAt: Date.now() + OUT_RESULT_TTL_MS });
        console.log(`[swmm] rpt=${reportContent.length} bytes, out=${outSize} bytes (parked as ${outId}), exit=${code}`);
        respond(() => res.json({ status: 'success', reportContent, outId, outSize, stdout, exitCode: code, engineUsed: 'local' }));
      }
    });

    proc.on('error', async (err) => {
      clearTimeout(killTimer);
      res.removeListener('close', onClientGone);
      releaseSimSlot();
      markEngineUnavailable(err as NodeJS.ErrnoException);
      console.log(`[swmm] spawn failed (${err.message}); marking local engine unavailable`);
      await cleanup();
      respond(() => sendEngineUnavailable(res, `Local engine cannot execute: ${err.message}`));
    });
  } catch (error: any) {
    releaseSimSlot();
    await cleanup();
    if (!res.headersSent) res.status(error.statusCode || 500).json({ error: error.message });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/fetch-github", async (req, res) => {
    const url = req.query.url as string;
    if (!url) {
      return res.status(400).json({ error: "URL parameter required" });
    }

    try {
      let fetchUrl = url;
      if (fetchUrl.includes("github.com") && !fetchUrl.includes("raw.githubusercontent.com")) {
        fetchUrl = fetchUrl
          .replace("github.com", "raw.githubusercontent.com")
          .replace("/blob/", "/");
      }

      const parsed = new URL(fetchUrl);
      if (parsed.protocol !== 'https:') {
        return res.status(400).json({ error: "Only HTTPS URLs are allowed" });
      }
      if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
        return res.status(400).json({ error: "Only GitHub raw content URLs are allowed" });
      }

      const response = await fetch(fetchUrl, { redirect: 'error' });
      if (!response.ok) {
        return res.status(response.status).json({ error: `GitHub returned ${response.status}` });
      }

      const text = await response.text();
      res.type("text/plain").send(text);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/github-browse", async (req: Request, res: Response) => {
    const owner = (req.query.owner as string) || '';
    const repo = (req.query.repo as string) || '';
    const path = (req.query.path as string) || '';
    if (!owner || !repo) {
      return res.status(400).json({ error: "owner and repo parameters required" });
    }
    try {
      const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`;
      const response = await fetch(apiUrl, {
        headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'SWMM5-UI' },
      });
      if (!response.ok) {
        return res.status(response.status).json({ error: `GitHub API returned ${response.status}` });
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        const items = data.map((item: any) => ({
          name: item.name,
          type: item.type,
          path: item.path,
          size: item.size,
          download_url: item.download_url,
        }));
        items.sort((a: any, b: any) => {
          if (a.type === 'dir' && b.type !== 'dir') return -1;
          if (a.type !== 'dir' && b.type === 'dir') return 1;
          return a.name.localeCompare(b.name);
        });
        res.json(items);
      } else {
        res.json([{
          name: data.name,
          type: data.type,
          path: data.path,
          size: data.size,
          download_url: data.download_url,
        }]);
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/swmm/status", async (_req: Request, res: Response) => {
    const found = await probeEngine();
    res.json({ found, path: SWMM_ENGINE_PATH, mode: 'local' });
  });

  // Fetch a parked large .out result as gzip-compressed binary.
  // One-shot: the file is deleted after a successful download (or via TTL).
  app.get("/api/swmm/out/:id", (req: Request, res: Response) => {
    pruneExpiredOutFiles();
    const id = String(req.params.id);
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).json({ error: 'Invalid result id' });
    }
    const entry = pendingOutFiles.get(id);
    if (!entry) {
      return res.status(404).json({ error: 'Result expired or not found. Re-run the simulation.' });
    }
    pendingOutFiles.delete(id);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Cache-Control', 'no-store');
    const stream = createReadStream(entry.path);
    pipeline(stream, createGzip({ level: 6 }), res, (err) => {
      if (err) console.log('[swmm] out download stream error:', err.message);
      rm(entry.dir, { recursive: true, force: true }).catch(() => {});
    });
  });

  app.post("/api/swmm/run", async (req: Request, res: Response) => {
    try {
      const body = await readBodyWithLimit(req);
      const contentType = req.headers['content-type'] || '';
      let inpText: string;

      if (contentType.includes('multipart/form-data')) {
        const text = body.toString('latin1');
        const boundaryMatch = contentType.match(/boundary=(.+)/);
        if (!boundaryMatch) throw new Error('Missing boundary in multipart');
        const boundary = boundaryMatch[1];
        const parts = text.split(`--${boundary}`);
        let fileContent = '';
        for (const part of parts) {
          if (part.includes('filename=')) {
            const bodyStart = part.indexOf('\r\n\r\n');
            if (bodyStart >= 0) {
              fileContent = part.substring(bodyStart + 4).replace(/\r\n$/, '');
            }
          }
        }
        inpText = fileContent || body.toString('utf-8');
      } else {
        inpText = body.toString('utf-8');
      }

      await runLocalSimulation(inpText, req, res);
    } catch (error: any) {
      if (!res.headersSent) res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  app.post("/api/swmm/run-or-proxy", async (req: Request, res: Response) => {
    try {
      const body = await readBodyWithLimit(req);
      await runLocalSimulation(body.toString('utf-8'), req, res);
    } catch (error: any) {
      if (!res.headersSent) res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  app.get("/api/swmm-proxy/status", async (_req: Request, res: Response) => {
    try {
      const localFound = await probeEngine();
      if (localFound) {
        return res.json({ found: true, path: SWMM_ENGINE_PATH, mode: 'local', apiAvailable: true, apiVersion: 52004 });
      }
      const response = await fetch(`${BATCH_SWMM_URL}/api/swmm-status`);
      if (!response.ok) {
        return res.status(response.status).json({ found: false, error: `Remote returned ${response.status}` });
      }
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.json({ found: false, error: error.message });
    }
  });

  // Remote-only health check: always queries the BatchSWMM cloud API,
  // never short-circuits to the local engine. Used by engine diagnostics.
  app.get("/api/swmm-proxy/remote-status", async (_req: Request, res: Response) => {
    try {
      const response = await fetch(`${BATCH_SWMM_URL}/api/swmm-status`);
      if (!response.ok) {
        return res.status(200).json({ found: false, error: `Remote returned ${response.status}` });
      }
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.json({ found: false, error: error.message });
    }
  });

  app.post("/api/swmm-proxy/upload", async (req: Request, res: Response) => {
    try {
      const body = await readBodyWithLimit(req);
      const contentType = req.headers['content-type'] || '';

      const response = await fetch(`${BATCH_SWMM_URL}/api/upload`, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: body,
      });

      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({ error: text });
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  app.post("/api/swmm-proxy/batch/:jobId/start", async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const response = await fetch(`${BATCH_SWMM_URL}/api/batch/${jobId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body || {}),
      });

      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({ error: text });
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/swmm-proxy/batch/:jobId/status", async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const response = await fetch(`${BATCH_SWMM_URL}/api/batch/${jobId}/status`);
      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({ error: text });
      }
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/swmm-proxy/batch/:jobId/results", async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const response = await fetch(`${BATCH_SWMM_URL}/api/batch/${jobId}/results`);
      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({ error: text });
      }
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    if (url.pathname === '/api/swmm-proxy/ws') {
      wss.handleUpgrade(req, socket, head, (clientWs) => {
        const jobId = url.searchParams.get('jobId');
        if (!jobId) {
          clientWs.close(1008, 'Missing jobId');
          return;
        }

        const remoteWsUrl = `wss://batch-swmm-runner-robertdickinson.replit.app/api/ws?jobId=${jobId}`;
        const remoteWs = new WebSocket(remoteWsUrl);

        remoteWs.on('open', () => {
          clientWs.send(JSON.stringify({ type: 'proxy_connected' }));
        });

        remoteWs.on('message', (data) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(data.toString());
          }
        });

        remoteWs.on('error', (err) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'error', message: err.message }));
            clientWs.close(1011, 'Remote WS error');
          }
        });

        remoteWs.on('close', () => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.close();
          }
        });

        clientWs.on('close', () => {
          if (remoteWs.readyState === WebSocket.OPEN) {
            remoteWs.close();
          }
        });

        clientWs.on('error', () => {
          if (remoteWs.readyState === WebSocket.OPEN) {
            remoteWs.close();
          }
        });
      });
    }
  });

  return httpServer;
}
