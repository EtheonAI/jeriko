// Layer 1 — Platform capability interface.
// Defines the contract every OS-specific platform module must implement.
// Sub-interfaces map 1:1 to Jeriko command categories (notes, reminders, etc.)

import type { Platform } from "../shared/types.js";

// ═══════════════════════════════════════════════════════════════
// COMMON RESULT TYPES
// ═══════════════════════════════════════════════════════════════

export interface Note {
  id: string;
  title: string;
  body: string;
  folder?: string;
  createdAt?: string;
  modifiedAt?: string;
}

export interface Reminder {
  id: string;
  title: string;
  dueDate?: string;
  completed: boolean;
  list?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  duration?: number;
  location?: string;
  notes?: string;
  allDay: boolean;
}

export interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  organization?: string;
}

export interface MusicStatus {
  playing: boolean;
  track?: string;
  artist?: string;
  album?: string;
  position?: number;
  duration?: number;
  app?: string;
}

export interface WindowInfo {
  id: number;
  app: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  focused: boolean;
}

export interface ScreenshotResult {
  path: string;
  width?: number;
  height?: number;
}

export interface LocationInfo {
  latitude: number;
  longitude: number;
  city?: string;
  region?: string;
  country?: string;
  timezone?: string;
  ip?: string;
}

export interface EmailMessage {
  id: string;
  from: string;
  subject: string;
  date: string;
  body?: string;
  read: boolean;
}

export interface Message {
  id: string;
  from: string;
  text: string;
  date: string;
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER INTERFACES
// ═══════════════════════════════════════════════════════════════

export interface NotesProvider {
  list(): Promise<Note[]>;
  get(id: string): Promise<Note>;
  create(title: string, body: string, folder?: string): Promise<Note>;
  search(query: string): Promise<Note[]>;
  delete(id: string): Promise<void>;
}

export interface RemindersProvider {
  list(listName?: string): Promise<Reminder[]>;
  create(title: string, dueDate?: string, listName?: string): Promise<Reminder>;
  complete(id: string): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface CalendarProvider {
  today(): Promise<CalendarEvent[]>;
  upcoming(days?: number): Promise<CalendarEvent[]>;
  create(title: string, date: string, time?: string, duration?: number): Promise<CalendarEvent>;
  delete(id: string): Promise<void>;
}

export interface ContactsProvider {
  search(query: string): Promise<Contact[]>;
  get(name: string): Promise<Contact>;
  list(): Promise<Contact[]>;
}

export interface MusicProvider {
  play(query?: string): Promise<MusicStatus>;
  pause(): Promise<void>;
  next(): Promise<MusicStatus>;
  previous(): Promise<MusicStatus>;
  status(): Promise<MusicStatus>;
}

export interface AudioProvider {
  speak(text: string, voice?: string): Promise<void>;
  record(duration: number): Promise<string>;
  volume(level?: number): Promise<number>;
  getVolume(): Promise<number>;
}

export interface ClipboardProvider {
  read(): Promise<string>;
  write(text: string): Promise<void>;
}

export interface WindowProvider {
  list(): Promise<WindowInfo[]>;
  focus(app: string): Promise<void>;
  minimize(app: string): Promise<void>;
  resize(app: string, width: number, height: number): Promise<void>;
  close(app: string): Promise<void>;
}

export interface ScreenshotProvider {
  capture(region?: string): Promise<ScreenshotResult>;
  captureWindow(app?: string): Promise<ScreenshotResult>;
}

export interface NotifyProvider {
  send(title: string, message: string, sound?: string): Promise<void>;
}

export interface OpenProvider {
  url(url: string): Promise<void>;
  file(path: string): Promise<void>;
  app(name: string): Promise<void>;
}

export interface LocationProvider {
  current(): Promise<LocationInfo>;
}

export interface MailProvider {
  unread(count?: number): Promise<EmailMessage[]>;
  search(query: string): Promise<EmailMessage[]>;
  send(to: string, subject: string, body: string): Promise<void>;
}

export interface MessagingProvider {
  send(to: string, message: string): Promise<void>;
  read(from?: string, count?: number): Promise<Message[]>;
}

// ═══════════════════════════════════════════════════════════════
// PLATFORM INTERFACE
// ═══════════════════════════════════════════════════════════════

export interface PlatformInterface {
  readonly name: Platform;

  // Productivity
  notes: NotesProvider;
  reminders: RemindersProvider;
  calendar: CalendarProvider;
  contacts: ContactsProvider;

  // Media
  music: MusicProvider;
  audio: AudioProvider;
  camera: CameraProvider;

  // System
  clipboard: ClipboardProvider;
  window: WindowProvider;
  screenshot: ScreenshotProvider;
  notify: NotifyProvider;
  open: OpenProvider;
  location: LocationProvider;
  mail: MailProvider;
  messaging: MessagingProvider;
}

export interface CameraProvider {
  capture(outputPath?: string): Promise<string>;
}
