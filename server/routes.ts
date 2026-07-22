import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { spawn } from "child_process";
import { writeFile, readFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { existsSync } from "fs";

const ALLOWED_HOSTS = [
  'raw.githubusercontent.com',
  'gist.githubusercontent.com',
  'raw.github.com',
];

const BATCH_SWMM_URL = 'https://batch-swmm-runner-robertdickinson.replit.app';
const SWMM_ENGINE_PATH = join(process.cwd(), 'swmm-engine', 'runswmm');
const MAX_INP_BYTES = 25 * 1024 * 1024; // 25 MB cap on uploaded models
const SIM_TIMEOUT_MS = 180000; // kill runaway simulations after 3 minutes

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
      proc.on('error', () => done(false));
      proc.on('close', () => done(true));
      setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch {}
        done(true); // it spawned; treat slow help output as executable
      }, 5000);
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
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_INP_BYTES) {
        const err = new Error(`Request body exceeds ${MAX_INP_BYTES / (1024 * 1024)} MB limit`) as any;
        err.statusCode = 413;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
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

  app.post("/api/swmm/run", async (req: Request, res: Response) => {
    const jobId = randomUUID();
    const tmpDir = join('/tmp', `swmm-${jobId}`);
    await mkdir(tmpDir, { recursive: true });
    const cleanup = async () => { try { await rm(tmpDir, { recursive: true, force: true }); } catch {} };

    const inpPath = join(tmpDir, 'model.inp');
    const rptPath = join(tmpDir, 'model.rpt');
    const outPath = join(tmpDir, 'model.out');

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

      await writeFile(inpPath, inpText, 'utf-8');

      if (!(await probeEngine())) {
        await cleanup();
        return res.status(500).json({ error: 'SWMM engine binary not found or not executable' });
      }

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

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', async (code) => {
        clearTimeout(killTimer);
        let reportContent = '';
        try { reportContent = await readFile(rptPath, 'utf-8'); } catch {}

        let outBase64 = '';
        try {
          const outBuf = await readFile(outPath);
          outBase64 = outBuf.toString('base64');
        } catch {}

        const hasErrors = reportContent.includes('ERROR') ||
          (stdout.includes('There are errors') || stdout.includes('has errors'));

        await cleanup();

        respond(() => {
          if (hasErrors) {
            res.json({
              status: 'failed',
              error: 'SWMM simulation completed with errors',
              reportContent,
              stdout,
              exitCode: code,
            });
          } else {
            res.json({
              status: 'success',
              reportContent,
              outBase64,
              stdout,
              exitCode: code,
            });
          }
        });
      });

      proc.on('error', async (err) => {
        clearTimeout(killTimer);
        markEngineUnavailable(err as NodeJS.ErrnoException);
        await cleanup();
        respond(() => res.status(500).json({ error: `Failed to spawn SWMM engine: ${err.message}` }));
      });
    } catch (error: any) {
      await cleanup();
      if (!res.headersSent) res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  app.post("/api/swmm/run-or-proxy", async (req: Request, res: Response) => {
    const localFound = await probeEngine();
    if (localFound) {
      const jobId = randomUUID();
      const tmpDir = join('/tmp', `swmm-${jobId}`);
      await mkdir(tmpDir, { recursive: true });
      const cleanup = async () => { try { await rm(tmpDir, { recursive: true, force: true }); } catch {} };
      const inpPath = join(tmpDir, 'model.inp');
      const rptPath = join(tmpDir, 'model.rpt');
      const outPath = join(tmpDir, 'model.out');
      try {
        const body = await readBodyWithLimit(req);
        const inpText = body.toString('utf-8');
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
        proc.stdout.on('data', (data) => { stdout += data.toString(); });
        proc.stderr.on('data', (data) => { stderr += data.toString(); });
        proc.on('close', async (code) => {
          clearTimeout(killTimer);
          let reportContent = '';
          try { reportContent = await readFile(rptPath, 'utf-8'); } catch (e: any) { console.log('[swmm] Failed to read rpt:', e.message); }
          let outBase64 = '';
          try { const outBuf = await readFile(outPath); outBase64 = outBuf.toString('base64'); } catch (e: any) { console.log('[swmm] Failed to read out:', e.message); }
          console.log(`[swmm] rpt=${reportContent.length} bytes, out=${outBase64.length} base64 chars, exit=${code}, stdout=${stdout.substring(0, 200)}`);
          const hasErrors = reportContent.includes('ERROR') || stdout.includes('There are errors') || stdout.includes('has errors');
          await cleanup();
          respond(() => {
            if (hasErrors) {
              res.json({ status: 'failed', error: 'SWMM simulation completed with errors', reportContent, stdout, exitCode: code });
            } else {
              res.json({ status: 'success', reportContent, outBase64, stdout, exitCode: code, engineUsed: 'local' });
            }
          });
        });
        proc.on('error', async (err) => {
          clearTimeout(killTimer);
          markEngineUnavailable(err as NodeJS.ErrnoException);
          console.log(`[swmm] spawn failed (${err.message}); marking local engine unavailable`);
          await cleanup();
          respond(() => res.status(404).json({ error: `Local engine cannot execute: ${err.message}`, useRemote: true }));
        });
      } catch (error: any) {
        await cleanup();
        if (!res.headersSent) res.status(error.statusCode || 500).json({ error: error.message });
      }
    } else {
      res.status(404).json({ error: 'Local engine not available', useRemote: true });
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

  app.post("/api/swmm-proxy/upload", async (req: Request, res: Response) => {
    try {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', async () => {
        try {
          const body = Buffer.concat(chunks);
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
          res.status(500).json({ error: error.message });
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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
