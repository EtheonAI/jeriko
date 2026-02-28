// Win32 — Windows platform implementation.
// Clipboard, screenshot, notify, open, and window are implemented via PowerShell.
// Productivity and media providers throw "not implemented" until Windows-specific backends are built.

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

import { Win32Clipboard } from "./clipboard.js";
import { Win32Screenshot } from "./screenshot.js";
import { Win32Notify } from "./notify.js";
import { Win32Open } from "./open.js";
import { Win32Window } from "./window.js";

// ═══════════════════════════════════════════════════════════════
// STUB PROVIDERS — throw "not implemented" for all methods
// ═══════════════════════════════════════════════════════════════

function notImplemented(feature: string): never {
  throw new Error(`${feature} is not implemented on Windows`);
}

class Win32Notes implements NotesProvider {
  async list(): Promise<Note[]> { notImplemented("Notes"); }
  async get(_id: string): Promise<Note> { notImplemented("Notes"); }
  async create(_title: string, _body: string): Promise<Note> { notImplemented("Notes"); }
  async search(_query: string): Promise<Note[]> { notImplemented("Notes"); }
  async delete(_id: string): Promise<void> { notImplemented("Notes"); }
}

class Win32Reminders implements RemindersProvider {
  async list(): Promise<Reminder[]> { notImplemented("Reminders"); }
  async create(_title: string): Promise<Reminder> { notImplemented("Reminders"); }
  async complete(_id: string): Promise<void> { notImplemented("Reminders"); }
  async delete(_id: string): Promise<void> { notImplemented("Reminders"); }
}

class Win32Calendar implements CalendarProvider {
  async today(): Promise<CalendarEvent[]> { notImplemented("Calendar"); }
  async upcoming(): Promise<CalendarEvent[]> { notImplemented("Calendar"); }
  async create(_title: string, _date: string): Promise<CalendarEvent> { notImplemented("Calendar"); }
  async delete(_id: string): Promise<void> { notImplemented("Calendar"); }
}

class Win32Contacts implements ContactsProvider {
  async search(_query: string): Promise<Contact[]> { notImplemented("Contacts"); }
  async get(_name: string): Promise<Contact> { notImplemented("Contacts"); }
  async list(): Promise<Contact[]> { notImplemented("Contacts"); }
}

class Win32Music implements MusicProvider {
  async play(): Promise<MusicStatus> { notImplemented("Music"); }
  async pause(): Promise<void> { notImplemented("Music"); }
  async next(): Promise<MusicStatus> { notImplemented("Music"); }
  async previous(): Promise<MusicStatus> { notImplemented("Music"); }
  async status(): Promise<MusicStatus> { notImplemented("Music"); }
}

class Win32Audio implements AudioProvider {
  async speak(_text: string): Promise<void> { notImplemented("Audio"); }
  async record(_duration: number): Promise<string> { notImplemented("Audio"); }
  async volume(_level?: number): Promise<number> { notImplemented("Audio"); }
  async getVolume(): Promise<number> { notImplemented("Audio"); }
}

class Win32Camera implements CameraProvider {
  async capture(): Promise<string> { notImplemented("Camera"); }
}

class Win32Mail implements MailProvider {
  async unread(): Promise<EmailMessage[]> { notImplemented("Mail"); }
  async search(_query: string): Promise<EmailMessage[]> { notImplemented("Mail"); }
  async send(_to: string, _subject: string, _body: string): Promise<void> { notImplemented("Mail"); }
}

class Win32Messaging implements MessagingProvider {
  async send(_to: string, _message: string): Promise<void> { notImplemented("Messaging"); }
  async read(): Promise<Message[]> { notImplemented("Messaging"); }
}

class Win32Location implements LocationProvider {
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

export class Win32Platform implements PlatformInterface {
  readonly name: Platform = "win32";

  // Productivity — stubs
  notes = new Win32Notes();
  reminders = new Win32Reminders();
  calendar = new Win32Calendar();
  contacts = new Win32Contacts();

  // Media — stubs
  music = new Win32Music();
  audio = new Win32Audio();
  camera = new Win32Camera();

  // System — implemented
  clipboard = new Win32Clipboard();
  window = new Win32Window();
  screenshot = new Win32Screenshot();
  notify = new Win32Notify();
  open = new Win32Open();
  location = new Win32Location();
  mail = new Win32Mail();
  messaging = new Win32Messaging();
}
