/**
 * vite-plugin-jeriko-debug — Debug log collector for AI agent workflows.
 *
 * Features:
 *   1. POST /__jeriko__/logs — stores debug data from the browser
 *   2. GET  /__jeriko__/logs — returns stored debug data for the agent
 *   3. Injects <script src="/__jeriko__/debug-collector.js"> into HTML
 *
 * Debug data stored at /tmp/jeriko-debug-logs.json (rotated at 1MB).
 * Agent reads via: jeriko dev logs
 */

import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import type { Plugin } from "vite";

const LOGS_FILE = "/tmp/jeriko-debug-logs.json";
const MAX_FILE_SIZE = 1024 * 1024; // 1MB rotation
const MAX_ENTRIES = 500;

interface DebugLogs {
  consoleLogs: unknown[];
  networkRequests: unknown[];
  uiEvents: unknown[];
  lastUpdated: string | null;
  rotatedAt?: string;
}

function readLogs(): DebugLogs {
  try {
    if (existsSync(LOGS_FILE)) {
      return JSON.parse(readFileSync(LOGS_FILE, "utf-8"));
    }
  } catch {
    // Corrupt file — reset
  }
  return { consoleLogs: [], networkRequests: [], uiEvents: [], lastUpdated: null };
}

function writeLogs(data: DebugLogs): void {
  try {
    if (data.consoleLogs?.length > MAX_ENTRIES) {
      data.consoleLogs = data.consoleLogs.slice(-MAX_ENTRIES);
    }
    if (data.networkRequests?.length > MAX_ENTRIES) {
      data.networkRequests = data.networkRequests.slice(-MAX_ENTRIES);
    }
    if (data.uiEvents?.length > MAX_ENTRIES) {
      data.uiEvents = data.uiEvents.slice(-MAX_ENTRIES);
    }
    data.lastUpdated = new Date().toISOString();

    const content = JSON.stringify(data, null, 2);
    writeFileSync(LOGS_FILE, content, "utf-8");

    // Rotate if too large
    if (statSync(LOGS_FILE).size > MAX_FILE_SIZE) {
      const trimmed: DebugLogs = {
        consoleLogs: data.consoleLogs.slice(-100),
        networkRequests: data.networkRequests.slice(-50),
        uiEvents: data.uiEvents.slice(-100),
        lastUpdated: data.lastUpdated,
        rotatedAt: new Date().toISOString(),
      };
      writeFileSync(LOGS_FILE, JSON.stringify(trimmed, null, 2), "utf-8");
    }
  } catch (err: any) {
    console.error("[jeriko-debug] Failed to write logs:", err.message);
  }
}

function parseBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: string) => {
      body += chunk;
      if (body.length > 512 * 1024) reject(new Error("Body too large"));
    });
    req.on("end", () => {
      try { resolve(JSON.parse(body)); } catch { resolve(null); }
    });
    req.on("error", reject);
  });
}

export default function jerikoDebugPlugin(): Plugin {
  return {
    name: "vite-plugin-jeriko-debug",
    enforce: "pre",

    configureServer(server) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (!req.url?.startsWith("/__jeriko__/logs")) return next();

        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");

        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.method === "POST") {
          try {
            const incoming = await parseBody(req);
            if (!incoming) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "Invalid JSON" }));
              return;
            }

            const stored = readLogs();

            if (Array.isArray(incoming.consoleLogs)) stored.consoleLogs.push(...incoming.consoleLogs);
            if (Array.isArray(incoming.networkRequests)) stored.networkRequests.push(...incoming.networkRequests);
            if (Array.isArray(incoming.uiEvents)) stored.uiEvents.push(...incoming.uiEvents);
            if (Array.isArray(incoming.sessionEvents)) stored.uiEvents.push(...incoming.sessionEvents);

            writeLogs(stored);

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        if (req.method === "GET") {
          const stored = readLogs();
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(stored));
          return;
        }

        res.statusCode = 405;
        res.end(JSON.stringify({ error: "Method not allowed" }));
      });
    },

    transformIndexHtml(html) {
      const scriptTag = '<script src="/__jeriko__/debug-collector.js" defer></script>';
      if (html.includes("</head>")) {
        return html.replace("</head>", `  ${scriptTag}\n</head>`);
      }
      return scriptTag + "\n" + html;
    },
  };
}
