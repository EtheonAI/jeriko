import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { execSync } from "node:child_process";
import { platform } from "node:os";
import { resolve, join } from "node:path";

export const command: CommandHandler = {
  name: "camera",
  description: "Camera capture (photo, video)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko camera <action> [options]");
      console.log("\nActions:");
      console.log("  photo             Take a photo");
      console.log("  video             Record video");
      console.log("\nFlags:");
      console.log("  --output <path>   Output file path");
      console.log("  --duration <s>    Video duration in seconds (default: 5)");
      console.log("  --device <name>   Camera device name");
      process.exit(0);
    }

    const action = parsed.positional[0] ?? "photo";
    const defaultPath = join(process.env.HOME || "~", "Desktop", `camera-${Date.now()}`);
    const os = platform();

    switch (action) {
      case "photo": {
        const output = resolve(flagStr(parsed, "output", `${defaultPath}.jpg`));
        if (os === "darwin") {
          // imagesnap is the standard macOS CLI camera tool
          try {
            execSync(`imagesnap "${output}"`, { encoding: "utf-8", timeout: 10000 });
            ok({ path: output, type: "photo" });
          } catch {
            fail("Camera capture failed. Install imagesnap: brew install imagesnap");
          }
        } else {
          fail(`Camera not supported on: ${os}. Install ffmpeg for cross-platform support.`);
        }
        break;
      }
      case "video": {
        const duration = flagStr(parsed, "duration", "5");
        const output = resolve(flagStr(parsed, "output", `${defaultPath}.mov`));
        if (os === "darwin") {
          try {
            execSync(`ffmpeg -f avfoundation -framerate 30 -i "0" -t ${duration} "${output}" -y 2>/dev/null`, {
              encoding: "utf-8",
              timeout: (parseInt(duration, 10) + 5) * 1000,
            });
            ok({ path: output, type: "video", duration_s: parseInt(duration, 10) });
          } catch {
            fail("Video recording failed. Install ffmpeg: brew install ffmpeg");
          }
        } else {
          fail(`Video recording not supported on: ${os}`);
        }
        break;
      }
      default:
        fail(`Unknown action: "${action}". Use photo or video.`);
    }
  },
};
