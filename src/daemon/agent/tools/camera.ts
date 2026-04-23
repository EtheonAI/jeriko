// Tool — Camera capture via platform provider.
// Uses imagesnap on macOS, fswebcam on Linux. Returns the file path
// in JSON so the channel router can auto-send it as a photo.

import { registerTool } from "./registry.js";
import type { ToolDefinition } from "./registry.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { safeSpawn } from "../../../shared/spawn-safe.js";

/**
 * Wall-clock ceiling for a single frame capture. Broken USB cameras and
 * stuck drivers are the classic `fswebcam` hang vector; 20 s is far more
 * than any working capture needs.
 */
const CAMERA_CAPTURE_TIMEOUT_MS = 20_000;

/** Capture a photo from the webcam using platform-specific tools. */
async function capturePhoto(): Promise<{ path: string }> {
  const outputPath = join(tmpdir(), `jeriko-camera-${randomUUID()}.jpg`);
  const platform = process.platform;

  if (platform === "darwin") {
    const { DarwinCamera } = await import("../../../platform/darwin/camera.js");
    const camera = new DarwinCamera();
    const path = await camera.capture(outputPath);
    return { path };
  }

  if (platform === "linux") {
    // fswebcam is the standard Linux webcam CLI (apt install fswebcam).
    // A hung USB camera would freeze the agent forever without the timeout.
    const outcome = await safeSpawn({
      command: "fswebcam",
      args: ["-r", "1280x720", "--no-banner", outputPath],
      timeoutMs: CAMERA_CAPTURE_TIMEOUT_MS,
    });

    if (outcome.status === "exited" && outcome.code === 0) {
      return { path: outputPath };
    }
    if (outcome.status === "error") {
      const enoent = (outcome.error as NodeJS.ErrnoException).code === "ENOENT";
      throw new Error(enoent
        ? "fswebcam not found. Install it with: sudo apt install fswebcam"
        : `Camera capture failed: ${outcome.error.message}`);
    }
    if (outcome.status === "timeout") {
      throw new Error(`Camera capture timed out after ${outcome.timeoutMs}ms — camera may be disconnected`);
    }
    if (outcome.status === "exited") {
      throw new Error(`fswebcam exited with code ${outcome.code}. Install it with: sudo apt install fswebcam`);
    }
    throw new Error("Camera capture aborted");
  }

  throw new Error(`Camera capture is not supported on ${platform}`);
}

async function execute(args: Record<string, unknown>): Promise<string> {
  try {
    const result = await capturePhoto();
    return JSON.stringify({ ok: true, path: result.path });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ ok: false, error: msg });
  }
}

export const cameraTool: ToolDefinition = {
  id: "camera",
  name: "camera",
  description: "Capture a photo from the webcam/built-in camera. Returns the file path of the captured image.",
  parameters: {
    type: "object",
    properties: {},
  },
  execute,
  aliases: ["webcam", "take_photo", "capture_photo"],
};

registerTool(cameraTool);
