// MCP (Model Context Protocol) endpoint so external AI clients — e.g. the
// Comet browser's connectors — can run SWMM5 simulations against this app.
//
// Transport: stateless Streamable HTTP at POST /mcp. Each request builds a
// fresh server+transport pair, so no session bookkeeping is needed and any
// MCP client that supports remote HTTP connectors can use it by URL.
import type { Express, Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { spawn } from 'child_process';
import { mkdir, writeFile, readFile, rm, stat, access } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

const SWMM_ENGINE_PATH = join(process.cwd(), 'swmm-engine', 'runswmm');
const SIM_TIMEOUT_MS = 120_000;
const MAX_REPORT_CHARS = 60_000;
const MAX_INP_CHARS = 20_000_000;

// Admission control mirroring /api/swmm/run: this endpoint spawns native
// processes for anonymous callers, so it must not be an unbounded compute sink.
const MAX_CONCURRENT_MCP_SIMS = 1;
const MCP_SIM_COOLDOWN_MS = 8_000;
let activeMcpSims = 0;
const lastSimByIp = new Map<string, number>();

function checkMcpAdmission(ip: string): string | null {
  if (activeMcpSims >= MAX_CONCURRENT_MCP_SIMS) {
    return 'Server is busy running another simulation. Retry in a few seconds.';
  }
  const last = lastSimByIp.get(ip) ?? 0;
  const waitMs = last + MCP_SIM_COOLDOWN_MS - Date.now();
  if (waitMs > 0) {
    return `Rate limited. Wait ${Math.ceil(waitMs / 1000)}s between simulation requests.`;
  }
  if (lastSimByIp.size > 1000) lastSimByIp.clear();
  lastSimByIp.set(ip, Date.now());
  return null;
}

interface RunResult {
  success: boolean;
  failureReason?: string;
  errorLines: string[];
  warningLines: string[];
  continuity: string[];
  reportContent: string;
}

async function runSwmm5(inpText: string, signal?: AbortSignal): Promise<RunResult> {
  if (inpText.length > MAX_INP_CHARS) {
    throw new Error(`Input model too large (${inpText.length} chars, max ${MAX_INP_CHARS})`);
  }
  const tmpDir = join('/tmp', `swmm-mcp-${randomUUID()}`);
  await mkdir(tmpDir, { recursive: true });
  const inpPath = join(tmpDir, 'model.inp');
  const rptPath = join(tmpDir, 'model.rpt');
  const outPath = join(tmpDir, 'model.out');
  activeMcpSims++;
  try {
    await writeFile(inpPath, inpText, 'utf-8');
    const exitCode = await new Promise<number>((resolve, reject) => {
      const proc = spawn(SWMM_ENGINE_PATH, [inpPath, rptPath, outPath]);
      // Abandoned clients must not keep burning CPU for up to 2 minutes.
      const onAbort = () => { try { proc.kill('SIGKILL'); } catch {} reject(new Error('Client disconnected; simulation cancelled')); };
      signal?.addEventListener('abort', onAbort, { once: true });
      const killTimer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch {}
        reject(new Error(`Simulation timed out after ${SIM_TIMEOUT_MS / 1000}s`));
      }, SIM_TIMEOUT_MS);
      const done = (fn: () => void) => { clearTimeout(killTimer); signal?.removeEventListener('abort', onAbort); fn(); };
      proc.on('error', (err) => done(() => reject(err)));
      proc.on('close', (code) => done(() => resolve(code ?? -1)));
    });

    let reportContent = '';
    try { reportContent = await readFile(rptPath, 'utf-8'); } catch {}
    let outSize = 0;
    try { outSize = (await stat(outPath)).size; } catch {}

    const lines = reportContent.split('\n');
    const errorLines = lines.filter(l => l.includes('ERROR')).map(l => l.trim()).slice(0, 20);
    const warningLines = lines.filter(l => l.includes('WARNING')).map(l => l.trim()).slice(0, 40);
    // Continuity error lines from the mass-balance sections.
    const continuity = lines
      .filter(l => /Continuity Error/i.test(l))
      .map(l => l.trim())
      .slice(0, 10);
    const reportValid = reportContent.includes('EPA STORM WATER MANAGEMENT MODEL');

    // Never trust the exit code alone — same classification as /api/swmm/run.
    let failureReason: string | undefined;
    if (exitCode !== 0) failureReason = `SWMM engine exited with code ${exitCode}`;
    else if (outSize === 0) failureReason = 'SWMM produced no results (.out file missing or empty)';
    else if (!reportValid) failureReason = 'SWMM report file is missing or invalid';
    else if (errorLines.length > 0) failureReason = 'SWMM simulation completed with errors';

    return { success: !failureReason, failureReason, errorLines, warningLines, continuity, reportContent };
  } finally {
    activeMcpSims--;
    try { await rm(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

function buildMcpServer(ip: string, signal: AbortSignal): McpServer {
  const server = new McpServer({ name: 'swmm5-ui', version: '1.0.0' });

  server.registerTool(
    'run_swmm_simulation',
    {
      title: 'Run SWMM5 simulation',
      description:
        'Run an EPA SWMM 5.2 stormwater simulation on the server\'s native engine. ' +
        'Input is the full .inp model file text. Returns success/failure, error and ' +
        'warning lines, and continuity (mass balance) errors. Set include_report to ' +
        'also get the full .rpt report text.',
      inputSchema: {
        inp: z.string().describe('Complete SWMM .inp input file contents'),
        include_report: z.boolean().optional().describe('Include the full .rpt report text (default false)'),
      },
    } as any,
    // Explicit param type: zod v3 + SDK generics trip TS2589 (excessively deep
    // instantiation) when inference runs through the raw shape.
    (async ({ inp, include_report }: { inp: string; include_report?: boolean }) => {
      const denied = checkMcpAdmission(ip);
      if (denied) return { content: [{ type: 'text', text: denied }], isError: true };
      try {
        const r = await runSwmm5(inp, signal);
        const summary = {
          status: r.success ? 'success' : 'failed',
          ...(r.failureReason ? { failureReason: r.failureReason } : {}),
          errors: r.errorLines,
          warnings: r.warningLines,
          continuityErrors: r.continuity,
        };
        const parts: string[] = [JSON.stringify(summary, null, 2)];
        if (include_report && r.reportContent) {
          const rpt = r.reportContent.length > MAX_REPORT_CHARS
            ? r.reportContent.slice(0, MAX_REPORT_CHARS) + `\n... [truncated, ${r.reportContent.length} chars total]`
            : r.reportContent;
          parts.push('--- REPORT (.rpt) ---\n' + rpt);
        }
        return { content: [{ type: 'text', text: parts.join('\n\n') }], isError: !r.success };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Engine error: ${e.message}` }], isError: true };
      }
    }) as any,
  );

  server.registerTool(
    'get_report_section',
    {
      title: 'Run SWMM5 and extract report sections',
      description:
        'Run a SWMM .inp model and return only the named report sections (e.g. ' +
        '"Node Depth Summary", "Link Flow Summary", "Flow Routing Continuity", ' +
        '"Subcatchment Runoff Summary", "Analysis Options"). Section matching is ' +
        'case-insensitive substring on the report\'s section headings.',
      inputSchema: {
        inp: z.string().describe('Complete SWMM .inp input file contents'),
        sections: z.array(z.string()).min(1).describe('Report section names to extract'),
      },
    } as any,
    (async ({ inp, sections }: { inp: string; sections: string[] }) => {
      const denied = checkMcpAdmission(ip);
      if (denied) return { content: [{ type: 'text', text: denied }], isError: true };
      try {
        const r = await runSwmm5(inp, signal);
        if (!r.reportContent) {
          return { content: [{ type: 'text', text: `No report produced. ${r.failureReason ?? ''}` }], isError: true };
        }
        // .rpt sections are star-underlined headings; split on those blocks.
        const lines = r.reportContent.split('\n');
        const found: string[] = [];
        for (const wanted of sections) {
          const lower = wanted.toLowerCase();
          // Headings sit next to a star line, but continuity blocks put column
          // headers on the star line itself — so match the heading text on any
          // non-star line adjacent to a line that starts with stars.
          let start = -1;
          for (let i = 0; i < lines.length; i++) {
            if (!lines[i].toLowerCase().includes(lower)) continue;
            const prevStars = i > 0 && /^\s*\*{4,}/.test(lines[i - 1]);
            const nextStars = i < lines.length - 1 && /^\s*\*{4,}/.test(lines[i + 1]);
            if (prevStars || nextStars) { start = prevStars ? i - 1 : i; break; }
          }
          if (start < 0) { found.push(`### ${wanted}\n(not found in report)`); continue; }
          // Section runs until the next star-marked heading block (a star line
          // preceded by a blank line).
          let end = lines.length;
          for (let i = start + 3; i < lines.length; i++) {
            if (/^\s*\*{4,}/.test(lines[i]) && !lines[i - 1].trim()) { end = i; break; }
          }
          found.push(lines.slice(start, end).join('\n').slice(0, MAX_REPORT_CHARS));
        }
        const status = r.success ? 'success' : `failed: ${r.failureReason}`;
        return {
          content: [{ type: 'text', text: `Run status: ${status}\n\n${found.join('\n\n')}` }],
          isError: !r.success,
        };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Engine error: ${e.message}` }], isError: true };
      }
    }) as any,
  );

  server.registerTool(
    'engine_status',
    {
      title: 'Check SWMM engine status',
      description: 'Check whether the native SWMM5 engine is available on this server.',
      inputSchema: {},
    },
    async () => {
      let available = false;
      try { await access(SWMM_ENGINE_PATH); available = true; } catch {}
      return { content: [{ type: 'text', text: JSON.stringify({ engine: 'EPA SWMM 5.2 (native)', available, endpoint: '/mcp' }) }] };
    },
  );

  return server;
}

export function registerMcpRoutes(app: Express) {
  app.post('/mcp', async (req: Request, res: Response) => {
    // Optional auth: if the MCP_API_KEY secret/env var is set, require it as a
    // Bearer token. Unset = open endpoint (fine for dev; set it before publishing).
    const requiredKey = process.env.MCP_API_KEY;
    if (requiredKey && req.headers.authorization !== `Bearer ${requiredKey}`) {
      res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized: missing or invalid Bearer token' }, id: null });
      return;
    }
    try {
      // Stateless: fresh server + transport per request; no session ids.
      const abort = new AbortController();
      const server = buildMcpServer(req.ip ?? 'unknown', abort.signal);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => { abort.abort(); transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e: any) {
      console.error('[mcp] request failed:', e);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
      }
    }
  });

  // Stateless transport: no server-push streams or sessions to manage.
  const methodNotAllowed = (_req: Request, res: Response) => {
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed. Use POST /mcp.' }, id: null });
  };
  app.get('/mcp', methodNotAllowed);
  app.delete('/mcp', methodNotAllowed);
}
