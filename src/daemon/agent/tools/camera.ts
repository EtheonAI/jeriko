// Tool — Camera capture via platform provider.
// Uses imagesnap on macOS, fswebcam on Linux. Returns the file path
// in JSON so the channel router can auto-send it as a photo.

import { registerTool } from "./registry.js";
import type { ToolDefinition } from "./registry.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

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
    // fswebcam is the standard Linux webcam CLI (apt install fswebcam)
    const { spawn } = await import("node:child_process");
    return new Promise<{ path: string }>((resolve, reject) => {
      const proc = spawn("fswebcam", ["-r", "1280x720", "--no-banner", outputPath]);

      proc.on("close", (code) => {
        if (code === 0) {
          resolve({ path: outputPath });
        } else {
          reject(new Error(
            `fswebcam exited with code ${code}. Install it with: sudo apt install fswebcam`,
          ));
        }
      });

      proc.on("error", (err) => {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          reject(new Error("fswebcam not found. Install it with: sudo apt install fswebcam"));
        } else {
          reject(new Error(`Camera capture failed: ${err.message}`));
        }
      });
    });
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
