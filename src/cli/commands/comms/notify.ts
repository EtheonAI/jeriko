import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { escapeAppleScript, escapeShellArg } from "../../../shared/escape.js";
import { execSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { basename } from "node:path";
import { platform } from "node:os";

// ---------------------------------------------------------------------------
// Telegram Bot API helpers — use curl for stateless CLI sends.
// ---------------------------------------------------------------------------

function getTelegramConfig(): { token: string; chatId: string } {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? process.env.JERIKO_TELEGRAM_TOKEN ?? "";
  const chatId = (process.env.ADMIN_TELEGRAM_IDS ?? process.env.JERIKO_ADMIN_IDS ?? "").split(",")[0] ?? "";

  if (!token || !chatId) {
    fail("Telegram not configured. Set TELEGRAM_BOT_TOKEN and ADMIN_TELEGRAM_IDS.", 3);
    process.exit(3);
  }

  return { token, chatId };
}

function telegramApiUrl(token: string, method: string): string {
  return `https://api.telegram.org/bot${token}/${method}`;
}

/** Send a text message. Tries Markdown first, falls back to plain text. */
function sendText(token: string, chatId: string, text: string): void {
  const truncated = text.slice(0, 4096);
  const encoded = encodeURIComponent(truncated);

  try {
    execSync(
      `curl -sS "${telegramApiUrl(token, "sendMessage")}?chat_id=${chatId}&text=${encoded}&parse_mode=Markdown"`,
      { encoding: "utf-8", timeout: 15000 },
    );
  } catch {
    // Markdown parse failure — retry as plain text
    execSync(
      `curl -sS "${telegramApiUrl(token, "sendMessage")}?chat_id=${chatId}&text=${encoded}"`,
      { encoding: "utf-8", timeout: 15000 },
    );
  }
}

/** Send a file via multipart form-data. Works for photos, documents, video, audio, voice. */
function sendFile(
  token: string,
  chatId: string,
  method: string,
  fieldName: string,
  filePath: string,
  caption?: string,
): void {
  if (!existsSync(filePath)) {
    fail(`File not found: ${filePath}`);
    return;
  }

  const parts = [
    `-F "chat_id=${chatId}"`,
    `-F "${fieldName}=@${filePath}"`,
  ];
  if (caption) {
    parts.push(`-F "caption=${caption.slice(0, 1024).replace(/"/g, '\\"')}"`);
  }

  execSync(
    `curl -sS ${parts.join(" ")} "${telegramApiUrl(token, method)}"`,
    { encoding: "utf-8", timeout: 120000 },
  );
}

// ---------------------------------------------------------------------------
// Detect file type for smart auto-sending.
// ---------------------------------------------------------------------------

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff"]);
const VIDEO_EXTS = new Set(["mp4", "mkv", "avi", "mov", "webm"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "flac", "aac", "m4a"]);
const VOICE_EXTS = new Set(["ogg", "oga"]); // Telegram voice requires OGG Opus

function getFileExt(path: string): string {
  return (path.split(".").pop() ?? "").toLowerCase();
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const command: CommandHandler = {
  name: "notify",
  description: "Send notification via Telegram or OS",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko notify [options]");
      console.log("\nSend a notification via Telegram or macOS Notification Center.");
      console.log("\nFlags:");
      console.log("  --message <text>  Text message to send");
      console.log("  --photo <path>    Send a photo (png, jpg, gif, webp)");
      console.log("  --document <path> Send a file/document");
      console.log("  --video <path>    Send a video (mp4, mkv, mov)");
      console.log("  --audio <path>    Send an audio file (mp3, wav, flac)");
      console.log("  --voice <path>    Send a voice message (ogg opus)");
      console.log("  --caption <text>  Caption for photo/video/document");
      console.log("  --title <text>    Notification title (OS only, default: Jeriko)");
      console.log("  --sound <name>    Alert sound name (OS only)");
      console.log("  --telegram        Force Telegram for text (default when --photo/--document/--video/--audio)");
      console.log("\nExamples:");
      console.log("  jeriko notify --message 'Deploy complete'");
      console.log("  jeriko notify --photo /tmp/screenshot.png --caption 'Homepage'");
      console.log("  jeriko notify --document report.pdf");
      console.log("  jeriko notify --video demo.mp4 --caption 'Demo recording'");
      console.log("  jeriko notify 'Quick message' --telegram");
      process.exit(0);
    }

    const message = flagStr(parsed, "message", "") || parsed.positional.join(" ");
    const photoPath = flagStr(parsed, "photo", "");
    const documentPath = flagStr(parsed, "document", "");
    const videoPath = flagStr(parsed, "video", "");
    const audioPath = flagStr(parsed, "audio", "");
    const voicePath = flagStr(parsed, "voice", "");
    const caption = flagStr(parsed, "caption", "");
    const useTelegram = flagBool(parsed, "telegram");

    const hasMedia = photoPath || documentPath || videoPath || audioPath || voicePath;

    // Media always goes via Telegram
    if (hasMedia) {
      const { token, chatId } = getTelegramConfig();

      try {
        if (photoPath) {
          sendFile(token, chatId, "sendPhoto", "photo", photoPath, caption || message);
          ok({ sent: true, channel: "telegram", type: "photo", file: basename(photoPath) });
        } else if (videoPath) {
          sendFile(token, chatId, "sendVideo", "video", videoPath, caption || message);
          ok({ sent: true, channel: "telegram", type: "video", file: basename(videoPath) });
        } else if (audioPath) {
          sendFile(token, chatId, "sendAudio", "audio", audioPath, caption || message);
          ok({ sent: true, channel: "telegram", type: "audio", file: basename(audioPath) });
        } else if (voicePath) {
          sendFile(token, chatId, "sendVoice", "voice", voicePath, caption || message);
          ok({ sent: true, channel: "telegram", type: "voice", file: basename(voicePath) });
        } else if (documentPath) {
          sendFile(token, chatId, "sendDocument", "document", documentPath, caption || message);
          ok({ sent: true, channel: "telegram", type: "document", file: basename(documentPath) });
        }

        // Also send text message if provided alongside media
        if (message && caption) {
          // Caption was used for the file — send the full message separately
          sendText(token, chatId, message);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        fail(`Telegram send failed: ${msg}`, 2);
      }
      return;
    }

    // Text-only
    if (!message) {
      fail("Missing message. Usage: jeriko notify --message <text> or jeriko notify <text>");
    }

    if (useTelegram) {
      const { token, chatId } = getTelegramConfig();
      try {
        sendText(token, chatId, message);
        ok({ sent: true, channel: "telegram", type: "text", message });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        fail(`Telegram send failed: ${msg}`, 2);
      }
      return;
    }

    // OS notification (macOS / Linux)
    const title = flagStr(parsed, "title", "Jeriko");
    const os = platform();

    try {
      switch (os) {
        case "darwin": {
          const titleEsc = escapeAppleScript(title);
          const msgEsc = escapeAppleScript(message);
          const sound = flagStr(parsed, "sound", "");
          const soundClause = sound ? ` sound name "${escapeAppleScript(sound)}"` : "";
          execSync(
            `osascript -e 'display notification "${msgEsc}" with title "${titleEsc}"${soundClause}'`,
            { encoding: "utf-8" },
          );
          break;
        }
        case "linux": {
          execSync(`notify-send ${escapeShellArg(title)} ${escapeShellArg(message)}`, { encoding: "utf-8" });
          break;
        }
        default:
          fail(`OS notifications not supported on: ${os}`);
      }
      ok({ sent: true, channel: "os", title, message });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`Notification failed: ${msg}`);
    }
  },
};
