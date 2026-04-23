// Tool — Screenshot capture via platform provider.
// Silent on macOS (-x flag). Rate limiting is handled by the ExecutionGuard
// in the agent loop — not here. Tools stay simple; policy lives in the guard.

import { registerTool } from "./registry.js";
import type { ToolDefinition } from "./registry.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { safeSpawn } from "../../../shared/spawn-safe.js";

/**
 * Wall-clock ceiling for a single screen capture. Wayland stalls, GPU
 * deadlocks, and locked framebuffers are the common hang vectors here.
 */
const SCREENSHOT_CAPTURE_TIMEOUT_MS = 10_000;

/** Platform-specific screenshot capture. Always silent on macOS. */
async function captureScreenshot(region?: string): Promise<{ path: string }> {
  const outputPath = join(tmpdir(), `jeriko-screenshot-${randomUUID()}.png`);
  const platform = process.platform;

  let command: string;
  let args: string[];

  if (platform === "darwin") {
    command = "screencapture";
    args = region ? ["-x", "-R", region, outputPath] : ["-x", outputPath];
  } else if (platform === "linux") {
    command = "scrot";
    args = region ? ["-a", region, outputPath] : [outputPath];
  } else {
    throw new Error(`Screenshot not supported on ${platform}`);
  }

  const outcome = await safeSpawn({
    command,
    args,
    timeoutMs: SCREENSHOT_CAPTURE_TIMEOUT_MS,
  });

  if (outcome.status === "exited" && outcome.code === 0) {
    return { path: outputPath };
  }
  if (outcome.status === "error") {
    throw new Error(`Screenshot command failed: ${outcome.error.message}`);
  }
  if (outcome.status === "timeout") {
    throw new Error(`Screenshot timed out after ${outcome.timeoutMs}ms — display server may be stalled`);
  }
  if (outcome.status === "exited") {
    throw new Error(`Screenshot command exited with code ${outcome.code}: ${outcome.stderr.trim() || "no stderr"}`);
  }
  throw new Error("Screenshot aborted");
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
