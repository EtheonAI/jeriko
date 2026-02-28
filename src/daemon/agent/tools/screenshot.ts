// Tool — Screenshot capture via platform provider.
// Silent on macOS (-x flag). Rate limiting is handled by the ExecutionGuard
// in the agent loop — not here. Tools stay simple; policy lives in the guard.

import { registerTool } from "./registry.js";
import type { ToolDefinition } from "./registry.js";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

/** Platform-specific screenshot capture. Always silent on macOS. */
async function captureScreenshot(region?: string): Promise<{ path: string }> {
  const outputPath = join(tmpdir(), `jeriko-screenshot-${randomUUID()}.png`);
  const platform = process.platform;

  return new Promise<{ path: string }>((resolve, reject) => {
    let proc: ReturnType<typeof spawn>;

    if (platform === "darwin") {
      const args = region
        ? ["-R", region, outputPath]
        : [outputPath];
      proc = spawn("screencapture", ["-x", ...args]);
    } else if (platform === "linux") {
      const args = region
        ? ["-a", region, outputPath]
        : [outputPath];
      proc = spawn("scrot", args);
    } else {
      reject(new Error(`Screenshot not supported on ${platform}`));
      return;
    }

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ path: outputPath });
      } else {
        reject(new Error(`Screenshot command exited with code ${code}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Screenshot command failed: ${err.message}`));
    });
  });
}

async function execute(args: Record<string, unknown>): Promise<string> {
  const region = args.region as string | undefined;

  try {
    const result = await captureScreenshot(region);
    return JSON.stringify({ ok: true, path: result.path });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ ok: false, error: msg });
  }
}

export const screenshotTool: ToolDefinition = {
  id: "screenshot",
  name: "screenshot",
  description: "Capture a screenshot of the screen or a specific region.",
  parameters: {
    type: "object",
    properties: {
      region: { type: "string", description: "Screen region as 'x,y,w,h' (default: full screen)" },
    },
  },
  execute,
  aliases: ["capture_screen", "take_screenshot", "screen_capture"],
};

registerTool(screenshotTool);
