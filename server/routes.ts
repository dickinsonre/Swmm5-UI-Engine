import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";

const ALLOWED_HOSTS = [
  'raw.githubusercontent.com',
  'gist.githubusercontent.com',
  'raw.github.com',
];

const BATCH_SWMM_URL = 'https://batch-swmm-runner-robertdickinson.replit.app';

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

  app.get("/api/swmm-proxy/status", async (_req: Request, res: Response) => {
    try {
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
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', async () => {
        try {
          const body = Buffer.concat(chunks).toString();
          const response = await fetch(`${BATCH_SWMM_URL}/api/batch/${jobId}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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

  return httpServer;
}
