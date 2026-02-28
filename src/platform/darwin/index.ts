// Darwin — macOS platform implementation.
// Wires each PlatformInterface provider to its OS-specific implementation.

import type { Platform } from "../../shared/types.js";
import type { PlatformInterface } from "../interface.js";

import { DarwinNotes } from "./notes.js";
import { DarwinReminders } from "./reminders.js";
import { DarwinCalendar } from "./calendar.js";
import { DarwinContacts } from "./contacts.js";
import { DarwinMusic } from "./music.js";
import { DarwinAudio } from "./audio.js";
import { DarwinClipboard } from "./clipboard.js";
import { DarwinWindow } from "./window.js";
import { DarwinScreenshot } from "./screenshot.js";
import { DarwinCamera } from "./camera.js";
import { DarwinMail } from "./mail.js";
import { DarwinIMessage } from "./imessage.js";
import { DarwinLocation } from "./location.js";
import { DarwinNotify } from "./notify.js";
import { DarwinOpen } from "./open.js";

export class DarwinPlatform implements PlatformInterface {
  readonly name: Platform = "darwin";

  // Productivity
  notes = new DarwinNotes();
  reminders = new DarwinReminders();
  calendar = new DarwinCalendar();
  contacts = new DarwinContacts();

  // Media
  music = new DarwinMusic();
  audio = new DarwinAudio();
  camera = new DarwinCamera();

  // System
  clipboard = new DarwinClipboard();
  window = new DarwinWindow();
  screenshot = new DarwinScreenshot();
  notify = new DarwinNotify();
  open = new DarwinOpen();
  location = new DarwinLocation();
  mail = new DarwinMail();
  messaging = new DarwinIMessage();
}
