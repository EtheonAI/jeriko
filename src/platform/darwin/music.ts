// Darwin — Music control via AppleScript (Spotify + Apple Music)

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { escapeAppleScript } from "../../shared/escape.js";
import type { MusicProvider, MusicStatus } from "../interface.js";

const execAsync = promisify(exec);

function runOsascript(script: string): Promise<string> {
  return execAsync(`osascript <<'APPLESCRIPT'\n${script}\nAPPLESCRIPT`)
    .then((r) => r.stdout.trim());
}

async function isAppRunning(appName: string): Promise<boolean> {
  try {
    const result = await runOsascript(
      `tell application "System Events" to return (name of processes) contains "${escapeAppleScript(appName)}"`
    );
    return result === "true";
  } catch {
    return false;
  }
}

/** Detect which music app to target. Prefers Spotify if running. */
async function detectMusicApp(): Promise<"Spotify" | "Music"> {
  if (await isAppRunning("Spotify")) return "Spotify";
  return "Music";
}

function parseSpotifyStatus(raw: string): MusicStatus {
  const [state = "", track = "", artist = "", album = "", pos = "0", dur = "0"] = raw.split("\t");
  return {
    playing: state === "playing",
    track,
    artist,
    album,
    position: Math.round(Number(pos)),
    duration: Math.round(Number(dur)),
    app: "Spotify",
  };
}

function parseMusicStatus(raw: string): MusicStatus {
  const [state = "", track = "", artist = "", album = "", pos = "0", dur = "0"] = raw.split("\t");
  return {
    playing: state === "playing",
    track,
    artist,
    album,
    position: Math.round(Number(pos)),
    duration: Math.round(Number(dur)),
    app: "Music",
  };
}

export class DarwinMusic implements MusicProvider {
  async play(query?: string): Promise<MusicStatus> {
    const app = await detectMusicApp();

    if (query && app === "Spotify") {
      // Spotify search via URL scheme
      const encodedQuery = encodeURIComponent(query);
      await execAsync(`open "spotify:search:${encodedQuery}"`);
      // Give Spotify a moment to load the search results, then play
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await runOsascript(`tell application "Spotify" to play`);
    } else if (query && app === "Music") {
      const safeQuery = escapeAppleScript(query);
      await runOsascript(`
tell application "Music"
  set searchResults to search playlist 1 for "${safeQuery}"
  if (count of searchResults) > 0 then
    play item 1 of searchResults
  end if
end tell`);
    } else {
      await runOsascript(`tell application "${app}" to play`);
    }

    return this.status();
  }

  async pause(): Promise<void> {
    const app = await detectMusicApp();
    await runOsascript(`tell application "${app}" to pause`);
  }

  async next(): Promise<MusicStatus> {
    const app = await detectMusicApp();
    await runOsascript(`tell application "${app}" to next track`);
    return this.status();
  }

  async previous(): Promise<MusicStatus> {
    const app = await detectMusicApp();
    await runOsascript(`tell application "${app}" to previous track`);
    return this.status();
  }

  async status(): Promise<MusicStatus> {
    const app = await detectMusicApp();

    if (app === "Spotify") {
      try {
        const raw = await runOsascript(`
tell application "Spotify"
  set playerState to player state as string
  set trackName to name of current track
  set trackArtist to artist of current track
  set trackAlbum to album of current track
  set trackPos to player position
  set trackDur to (duration of current track) / 1000
  return playerState & "\t" & trackName & "\t" & trackArtist & "\t" & trackAlbum & "\t" & (trackPos as string) & "\t" & (trackDur as string)
end tell`);
        return parseSpotifyStatus(raw);
      } catch {
        return { playing: false, app: "Spotify" };
      }
    }

    // Apple Music
    try {
      const raw = await runOsascript(`
tell application "Music"
  set playerState to player state as string
  set trackName to name of current track
  set trackArtist to artist of current track
  set trackAlbum to album of current track
  set trackPos to player position
  set trackDur to duration of current track
  return playerState & "\t" & trackName & "\t" & trackArtist & "\t" & trackAlbum & "\t" & (trackPos as string) & "\t" & (trackDur as string)
end tell`);
      return parseMusicStatus(raw);
    } catch {
      return { playing: false, app: "Music" };
    }
  }
}
