// Darwin — Camera capture via imagesnap CLI

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { escapeShellArg } from "../../shared/escape.js";
import type { CameraProvider } from "../interface.js";

const execAsync = promisify(exec);

export class DarwinCamera implements CameraProvider {
  /**
   * Capture a photo from the built-in camera using imagesnap.
   * Requires: `brew install imagesnap`
   * @param outputPath  Optional output path. Defaults to a temp file.
   * @returns Path to the captured image
   */
  async capture(outputPath?: string): Promise<string> {
    const dir = process.env["TMPDIR"] ?? "/tmp";
    const path = outputPath ?? `${dir}jeriko-camera-${Date.now()}.jpg`;
    const safePath = escapeShellArg(path);

    // -w 1.0 = warm-up delay for camera auto-exposure
    try {
      await execAsync(`imagesnap -w 1.0 ${safePath}`);
    } catch (err) {
      // If imagesnap is not installed, provide a helpful error
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("not found") || msg.includes("ENOENT")) {
        throw new Error(
          "imagesnap not found. Install it with: brew install imagesnap",
        );
      }
      throw err;
    }

    return path;
  }
}
