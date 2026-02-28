// Linux — Platform implementation.
// Clipboard, screenshot, notify, open, and window are implemented.
// Productivity and media providers throw "not implemented" until Linux-specific backends are built.

import type { Platform } from "../../shared/types.js";
import type {
  PlatformInterface,
  NotesProvider,
  RemindersProvider,
  CalendarProvider,
  ContactsProvider,
  MusicProvider,
  AudioProvider,
  CameraProvider,
  MailProvider,
  MessagingProvider,
  LocationProvider,
  Note,
  Reminder,
  CalendarEvent,
  Contact,
  MusicStatus,
  EmailMessage,
  Message,
  LocationInfo,
} from "../interface.js";

import { LinuxClipboard } from "./clipboard.js";
import { LinuxScreenshot } from "./screenshot.js";
import { LinuxNotify } from "./notify.js";
import { LinuxOpen } from "./open.js";
import { LinuxWindow } from "./window.js";

// ═══════════════════════════════════════════════════════════════
// STUB PROVIDERS — throw "not implemented" for all methods
// ═══════════════════════════════════════════════════════════════

function notImplemented(feature: string): never {
  throw new Error(`${feature} is not implemented on Linux`);
}

class LinuxNotes implements NotesProvider {
  async list(): Promise<Note[]> { notImplemented("Notes"); }
  async get(_id: string): Promise<Note> { notImplemented("Notes"); }
  async create(_title: string, _body: string): Promise<Note> { notImplemented("Notes"); }
  async search(_query: string): Promise<Note[]> { notImplemented("Notes"); }
  async delete(_id: string): Promise<void> { notImplemented("Notes"); }
}

class LinuxReminders implements RemindersProvider {
  async list(): Promise<Reminder[]> { notImplemented("Reminders"); }
  async create(_title: string): Promise<Reminder> { notImplemented("Reminders"); }
  async complete(_id: string): Promise<void> { notImplemented("Reminders"); }
  async delete(_id: string): Promise<void> { notImplemented("Reminders"); }
}

class LinuxCalendar implements CalendarProvider {
  async today(): Promise<CalendarEvent[]> { notImplemented("Calendar"); }
  async upcoming(): Promise<CalendarEvent[]> { notImplemented("Calendar"); }
  async create(_title: string, _date: string): Promise<CalendarEvent> { notImplemented("Calendar"); }
  async delete(_id: string): Promise<void> { notImplemented("Calendar"); }
}

class LinuxContacts implements ContactsProvider {
  async search(_query: string): Promise<Contact[]> { notImplemented("Contacts"); }
  async get(_name: string): Promise<Contact> { notImplemented("Contacts"); }
  async list(): Promise<Contact[]> { notImplemented("Contacts"); }
}

class LinuxMusic implements MusicProvider {
  async play(): Promise<MusicStatus> { notImplemented("Music"); }
  async pause(): Promise<void> { notImplemented("Music"); }
  async next(): Promise<MusicStatus> { notImplemented("Music"); }
  async previous(): Promise<MusicStatus> { notImplemented("Music"); }
  async status(): Promise<MusicStatus> { notImplemented("Music"); }
}

class LinuxAudio implements AudioProvider {
  async speak(_text: string): Promise<void> { notImplemented("Audio"); }
  async record(_duration: number): Promise<string> { notImplemented("Audio"); }
  async volume(_level?: number): Promise<number> { notImplemented("Audio"); }
  async getVolume(): Promise<number> { notImplemented("Audio"); }
}

class LinuxCamera implements CameraProvider {
  async capture(): Promise<string> { notImplemented("Camera"); }
}

class LinuxMail implements MailProvider {
  async unread(): Promise<EmailMessage[]> { notImplemented("Mail"); }
  async search(_query: string): Promise<EmailMessage[]> { notImplemented("Mail"); }
  async send(_to: string, _subject: string, _body: string): Promise<void> { notImplemented("Mail"); }
}

class LinuxMessaging implements MessagingProvider {
  async send(_to: string, _message: string): Promise<void> { notImplemented("Messaging"); }
  async read(): Promise<Message[]> { notImplemented("Messaging"); }
}

class LinuxLocation implements LocationProvider {
  /** IP geolocation works cross-platform. */
  async current(): Promise<LocationInfo> {
    const response = await fetch("http://ip-api.com/json/?fields=lat,lon,city,regionName,country,timezone,query");
    if (!response.ok) throw new Error(`Location lookup failed: HTTP ${response.status}`);
    const data = await response.json() as {
      lat?: number; lon?: number; city?: string;
      regionName?: string; country?: string; timezone?: string; query?: string;
    };
    return {
      latitude: data.lat ?? 0,
      longitude: data.lon ?? 0,
      city: data.city,
      region: data.regionName,
      country: data.country,
      timezone: data.timezone,
      ip: data.query,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// PLATFORM CLASS
// ═══════════════════════════════════════════════════════════════

export class LinuxPlatform implements PlatformInterface {
  readonly name: Platform = "linux";

  // Productivity — stubs
  notes = new LinuxNotes();
  reminders = new LinuxReminders();
  calendar = new LinuxCalendar();
  contacts = new LinuxContacts();

  // Media — stubs
  music = new LinuxMusic();
  audio = new LinuxAudio();
  camera = new LinuxCamera();

  // System — implemented
  clipboard = new LinuxClipboard();
  window = new LinuxWindow();
  screenshot = new LinuxScreenshot();
  notify = new LinuxNotify();
  open = new LinuxOpen();
  location = new LinuxLocation();
  mail = new LinuxMail();
  messaging = new LinuxMessaging();
}
