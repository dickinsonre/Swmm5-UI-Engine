import type { Express } from "express";
import { createServer, type Server } from "http";

const ALLOWED_HOSTS = [
  'raw.githubusercontent.com',
  'gist.githubusercontent.com',
  'raw.github.com',
];

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

  return httpServer;
}
