// Layer 1 — Platform detector + lazy loader.
// Detects the current OS and dynamically imports the correct platform module.

import type { Platform, Arch } from "../shared/types.js";
import type { PlatformInterface } from "./interface.js";

export type { PlatformInterface } from "./interface.js";
export type {
  Note,
  Reminder,
  CalendarEvent,
  Contact,
  MusicStatus,
  WindowInfo,
  ScreenshotResult,
  LocationInfo,
  EmailMessage,
  Message,
  NotesProvider,
  RemindersProvider,
  CalendarProvider,
  ContactsProvider,
  MusicProvider,
  AudioProvider,
  ClipboardProvider,
  WindowProvider,
  ScreenshotProvider,
  NotifyProvider,
  OpenProvider,
  LocationProvider,
  MailProvider,
  MessagingProvider,
  CameraProvider,
} from "./interface.js";

/** Detect the current operating system. */
export function detectPlatform(): Platform {
  return process.platform as Platform;
}

/** Detect CPU architecture (normalized to x64 | arm64). */
export function detectArch(): Arch {
  return process.arch === "arm64" ? "arm64" : "x64";
}

// Cached instance — only one platform per process
let _cached: PlatformInterface | null = null;

/**
 * Get the platform module for the current OS.
 *
 * Lazy-loads the correct implementation on first call, then caches it.
 * Throws if running on an unsupported platform.
 */
export async function getPlatform(): Promise<PlatformInterface> {
  if (_cached) return _cached;

  const os = detectPlatform();

  switch (os) {
    case "darwin": {
      const { DarwinPlatform } = await import("./darwin/index.js");
      _cached = new DarwinPlatform();
      return _cached;
    }
    case "linux": {
      const { LinuxPlatform } = await import("./linux/index.js");
      _cached = new LinuxPlatform();
      return _cached;
    }
    case "win32": {
      const { Win32Platform } = await import("./win32/index.js");
      _cached = new Win32Platform();
      return _cached;
    }
    default:
      throw new Error(`Unsupported platform: ${os}`);
  }
}

/**
 * Get the platform module synchronously if already loaded.
 * Returns null if getPlatform() hasn't been called yet.
 */
export function getPlatformSync(): PlatformInterface | null {
  return _cached;
}
