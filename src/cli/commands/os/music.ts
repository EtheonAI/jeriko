import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { escapeAppleScript } from "../../../shared/escape.js";
import { execSync } from "node:child_process";
import { platform } from "node:os";

export const command: CommandHandler = {
  name: "music",
  description: "Music playback control (play, pause, skip, status)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko music <action>");
      console.log("\nActions:");
      console.log("  play              Resume playback");
      console.log("  pause             Pause playback");
      console.log("  next              Skip to next track");
      console.log("  prev              Go to previous track");
      console.log("  status            Current track info");
      console.log("  search <query>    Search library");
      process.exit(0);
    }

    if (platform() !== "darwin") fail("Music control is only available on macOS");

    const action = parsed.positional[0] ?? "status";

    const musicCmd = (cmd: string): string => {
      return execSync(`osascript -e 'tell application "Music" to ${cmd}'`, { encoding: "utf-8" }).trim();
    };

    switch (action) {
      case "play":
        musicCmd("play");
        ok({ action: "play" });
        break;
      case "pause":
        musicCmd("pause");
        ok({ action: "pause" });
        break;
      case "next":
        musicCmd("next track");
        ok({ action: "next" });
        break;
      case "prev":
        musicCmd("previous track");
        ok({ action: "prev" });
        break;
      case "status": {
        try {
          const name = musicCmd("get name of current track");
          const artist = musicCmd("get artist of current track");
          const album = musicCmd("get album of current track");
          const state = musicCmd("get player state as string");
          const position = musicCmd("get player position");
          ok({ track: name, artist, album, state, position_s: parseFloat(position) });
        } catch {
          ok({ state: "stopped", track: null });
        }
        break;
      }
      case "search": {
        const query = parsed.positional.slice(1).join(" ");
        if (!query) fail("Missing search query. Usage: jeriko music search <query>");
        const queryEsc = escapeAppleScript(query);
        const script = `tell application "Music" to get name of (every track whose name contains "${queryEsc}")`;
        try {
          const output = execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, { encoding: "utf-8", timeout: 15000 });
          const tracks = output.trim().split(", ").filter(Boolean);
          ok({ query, tracks, count: tracks.length });
        } catch {
          ok({ query, tracks: [], count: 0 });
        }
        break;
      }
      default:
        fail(`Unknown action: "${action}". Use play, pause, next, prev, status, or search.`);
    }
  },
};
