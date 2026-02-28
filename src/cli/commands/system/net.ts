import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { escapeShellArg } from "../../../shared/escape.js";
import { execSync } from "node:child_process";

export const command: CommandHandler = {
  name: "net",
  description: "Network tools (ping, dns, ports, curl)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko net <action> [options]");
      console.log("\nActions:");
      console.log("  ping <host>       Ping a host");
      console.log("  dns <domain>      DNS lookup");
      console.log("  ports [--host]    List open ports");
      console.log("  curl <url>        HTTP request");
      console.log("\nFlags:");
      console.log("  --count <n>       Ping count (default: 4)");
      console.log("  --method <m>      HTTP method for curl (default: GET)");
      process.exit(0);
    }

    const action = parsed.positional[0];
    if (!action) fail("Missing action. Usage: jeriko net <ping|dns|ports|curl>");

    switch (action) {
      case "ping": {
        const host = parsed.positional[1];
        if (!host) fail("Missing host. Usage: jeriko net ping <host>");
        const count = parseInt(flagStr(parsed, "count", "4"), 10);
        if (isNaN(count) || count < 1 || count > 100) fail("Invalid count: must be 1-100");
        try {
          const output = execSync(`ping -c ${count} ${escapeShellArg(host)}`, { encoding: "utf-8", timeout: 30000 });
          ok({ host, output: output.trim() });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          fail(`Ping failed: ${msg}`);
        }
        break;
      }
      case "dns": {
        const domain = parsed.positional[1];
        if (!domain) fail("Missing domain. Usage: jeriko net dns <domain>");
        try {
          const output = execSync(`dig +short ${escapeShellArg(domain)}`, { encoding: "utf-8", timeout: 10000 });
          const records = output.trim().split("\n").filter(Boolean);
          ok({ domain, records });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          fail(`DNS lookup failed: ${msg}`);
        }
        break;
      }
      case "ports": {
        try {
          const output = execSync("lsof -i -P -n | head -50", { encoding: "utf-8", timeout: 10000 });
          const lines = output.trim().split("\n");
          ok({ ports: lines });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          fail(`Port scan failed: ${msg}`);
        }
        break;
      }
      case "curl": {
        const url = parsed.positional[1];
        if (!url) fail("Missing URL. Usage: jeriko net curl <url>");
        const method = flagStr(parsed, "method", "GET").toUpperCase();
        // Validate HTTP method to prevent injection via --method
        const validMethods = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];
        if (!validMethods.includes(method)) fail(`Invalid HTTP method: "${method}"`);
        try {
          const output = execSync(`curl -sS -X ${escapeShellArg(method)} ${escapeShellArg(url)}`, { encoding: "utf-8", timeout: 30000 });
          ok({ url, method, body: output });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          fail(`HTTP request failed: ${msg}`);
        }
        break;
      }
      default:
        fail(`Unknown action: "${action}". Use ping, dns, ports, or curl.`);
    }
  },
};
