import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { registerMcpRoutes } from "./mcp";
import { serveStatic } from "./static";
import { createServer } from "http";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Build the Express app + HTTP server with all API routes wired up, but
// WITHOUT calling listen() or attaching the Vite/static frontend. This lets
// tests construct the real app in-process and drive it over an ephemeral port.
// The middleware order (JSON body cap, urlencoded, routes, MCP, error handler)
// is identical to production startup below.
export async function createApp(): Promise<{
  app: express.Express;
  httpServer: ReturnType<typeof createServer>;
}> {
  const app = express();
  const httpServer = createServer(app);

  app.use(
    express.json({
      // Large enough for full .inp models posted to the MCP endpoint.
      limit: "25mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));

  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          const keys = Object.keys(capturedJsonResponse);
          const sizeHint = keys.map(k => {
            const v = capturedJsonResponse![k];
            if (typeof v === 'string' && v.length > 60) return `${k}:[${v.length}ch]`;
            return `${k}:${JSON.stringify(v)}`;
          }).join(', ');
          logLine += ` :: {${sizeHint}}`;
        }

        log(logLine);
      }
    });

    next();
  });

  await registerRoutes(httpServer, app);
  registerMcpRoutes(app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  return { app, httpServer };
}

// This module auto-starts the listening server BY DEFAULT. A caller that only
// wants the app object (a test calling createApp() directly) must opt out by
// setting SWMM_NO_AUTOSTART=1 before importing.
//
// The opt-out is deliberately inverted rather than an "am I the entrypoint?"
// check: entrypoint detection via import.meta.url is erased by the esbuild CJS
// bundle used for production (`import_meta = {}`), so it would evaluate false
// in dist/index.cjs and the published server would never listen. Failing open
// means a wrong answer costs a test an extra port, not a dead deployment.
const AUTOSTART = process.env.SWMM_NO_AUTOSTART !== "1";

if (AUTOSTART) (async () => {
  const { app, httpServer } = await createApp();

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  // HOST stays 0.0.0.0 for dev and production. It is overridable only so tests
  // can boot the entrypoint on loopback, which keeps Replit's port detector
  // from writing a test-only port mapping into .replit on every test run.
  const host = process.env.HOST || "0.0.0.0";
  httpServer.listen(
    {
      port,
      host,
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
