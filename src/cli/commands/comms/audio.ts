import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { escapeShellArg } from "../../../shared/escape.js";
import { execSync } from "node:child_process";
import { platform } from "node:os";

export const command: CommandHandler = {
  name: "audio",
  description: "Text-to-speech, recording, volume",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko audio <action> [options]");
      console.log("\nActions:");
      console.log("  say <text>        Text-to-speech");
      console.log("  volume [<0-100>]  Get or set system volume");
      console.log("  record <file>     Record audio to file");
      console.log("  play <file>       Play audio file");
      console.log("\nFlags:");
      console.log("  --voice <name>    TTS voice name (macOS only)");
      console.log("  --rate <n>        Speech rate (words per minute)");
      console.log("  --duration <s>    Recording duration in seconds");
      process.exit(0);
    }

    const action = parsed.positional[0];
    if (!action) fail("Missing action. Usage: jeriko audio <say|volume|record|play>");

    const os = platform();

    switch (action) {
      case "say": {
        const text = parsed.positional.slice(1).join(" ");
        if (!text) fail("Missing text. Usage: jeriko audio say <text>");
        const voice = flagStr(parsed, "voice", "");
        const rate = flagStr(parsed, "rate", "");

        if (os === "darwin") {
          const voiceFlag = voice ? `-v ${escapeShellArg(voice)}` : "";
          const rateNum = rate ? parseInt(rate, 10) : 0;
          const rateFlag = rateNum > 0 ? `-r ${rateNum}` : "";
          execSync(`say ${voiceFlag} ${rateFlag} ${escapeShellArg(text)}`, { encoding: "utf-8" });
        } else if (os === "linux") {
          execSync(`espeak ${escapeShellArg(text)}`, { encoding: "utf-8" });
        } else {
          fail(`Text-to-speech not supported on: ${os}`);
        }
        ok({ action: "say", text });
        break;
      }
      case "volume": {
        const level = parsed.positional[1];
        if (os !== "darwin") fail(`Volume control not supported on: ${os}`);

        if (level !== undefined) {
          const vol = parseInt(level, 10);
          if (isNaN(vol) || vol < 0 || vol > 100) fail("Volume must be 0-100");
          execSync(`osascript -e 'set volume output volume ${vol}'`, { encoding: "utf-8" });
          ok({ action: "volume", level: vol });
        } else {
          const output = execSync(`osascript -e 'output volume of (get volume settings)'`, { encoding: "utf-8" });
          ok({ action: "volume", level: parseInt(output.trim(), 10) });
        }
        break;
      }
      case "record": {
        const file = parsed.positional[1];
        if (!file) fail("Missing output file. Usage: jeriko audio record <file> --duration <seconds>");
        fail("Audio recording requires sox or ffmpeg. Install with: brew install sox");
        break;
      }
      case "play": {
        const file = parsed.positional[1];
        if (!file) fail("Missing audio file. Usage: jeriko audio play <file>");
        if (os === "darwin") {
          execSync(`afplay ${escapeShellArg(file)}`, { encoding: "utf-8" });
        } else {
          execSync(`aplay ${escapeShellArg(file)}`, { encoding: "utf-8" });
        }
        ok({ action: "play", file });
        break;
      }
      default:
        fail(`Unknown action: "${action}". Use say, volume, record, or play.`);
    }
  },
};
