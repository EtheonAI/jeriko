import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { execSync } from "node:child_process";
import { platform } from "node:os";

export const command: CommandHandler = {
  name: "browse",
  description: "Open URLs and fetch web content via CLI",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko browse <action> [options]");
      console.log("\nActions:");
      console.log("  open <url>        Open URL in default browser");
      console.log("  fetch <url>       Fetch URL content (returns text)");
      console.log("  headers <url>     Fetch HTTP headers only");
      console.log("\nFlags:");
      console.log("  --output <path>   Save fetched content to file");
      console.log("  --timeout <s>     Request timeout in seconds (default: 30)");
      console.log("  --user-agent <ua> Custom User-Agent header");
      process.exit(0);
    }

    const action = parsed.positional[0];
    if (!action) fail("Missing action. Usage: jeriko browse <open|fetch|headers>");

    switch (action) {
      case "open": {
        const url = parsed.positional[1];
        if (!url) fail("Missing URL. Usage: jeriko browse open <url>");
        openUrl(url);
        break;
      }

      case "fetch": {
        const url = parsed.positional[1];
        if (!url) fail("Missing URL. Usage: jeriko browse fetch <url>");
        const timeout = parseInt(flagStr(parsed, "timeout", "30"), 10);
        const output = flagStr(parsed, "output", "");
        const userAgent = flagStr(parsed, "user-agent", "jeriko/2.0");
        fetchUrl(url, timeout, userAgent, output);
        break;
      }

      case "headers": {
        const url = parsed.positional[1];
        if (!url) fail("Missing URL. Usage: jeriko browse headers <url>");
        const timeout = parseInt(flagStr(parsed, "timeout", "30"), 10);
        fetchHeaders(url, timeout);
        break;
      }

      default:
        fail(`Unknown action: "${action}". Use open, fetch, or headers.`);
    }
  },
};

// ---------------------------------------------------------------------------
// open — cross-platform URL opener
// ---------------------------------------------------------------------------

function escapeForShell(s: string): string {
  return `'${s.replace(/'/g, "'\"'\"'")}'`;
}

function openUrl(url: string) {
  const os = platform();
  const safeUrl = escapeForShell(url);

  try {
    switch (os) {
      case "darwin":
        execSync(`open ${safeUrl}`, { encoding: "utf-8" });
        break;
      case "linux":
        execSync(`xdg-open ${safeUrl}`, { encoding: "utf-8" });
        break;
      case "win32":
        execSync(`start "" ${safeUrl}`, { encoding: "utf-8" });
        break;
      default:
        fail(`Open not supported on platform: ${os}`);
    }
    ok({ opened: url, platform: os });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`Failed to open URL: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// fetch — curl-based content fetcher
// ---------------------------------------------------------------------------

function fetchUrl(url: string, timeout: number, userAgent: string, outputPath: string) {
  const safeUrl = escapeForShell(url);
  const safeAgent = escapeForShell(userAgent);
  const outputFlag = outputPath ? `-o ${escapeForShell(outputPath)}` : "";

  try {
    const result = execSync(
      `curl -sL --max-time ${timeout} -A ${safeAgent} ${outputFlag} ${safeUrl}`,
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024, timeout: (timeout + 5) * 1000 },
    );

    if (outputPath) {
      ok({ url, saved: outputPath });
    } else {
      // Truncate very large responses for JSON output
      const content = result.length > 50000 ? result.slice(0, 50000) + "\n[...truncated]" : result;
      ok({ url, length: result.length, content });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`Failed to fetch URL: ${msg}`, 2);
  }
}

// ---------------------------------------------------------------------------
// headers — curl -I for HTTP headers
// ---------------------------------------------------------------------------

function fetchHeaders(url: string, timeout: number) {
  const safeUrl = escapeForShell(url);

  try {
    const raw = execSync(
      `curl -sI --max-time ${timeout} ${safeUrl}`,
      { encoding: "utf-8", timeout: (timeout + 5) * 1000 },
    );
    const headers: Record<string, string> = {};
    let status = "";
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("HTTP/")) {
        status = trimmed;
        continue;
      }
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx > 0) {
        const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
        const value = trimmed.slice(colonIdx + 1).trim();
        headers[key] = value;
      }
    }
    ok({ url, status, headers });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`Failed to fetch headers: ${msg}`, 2);
  }
}
