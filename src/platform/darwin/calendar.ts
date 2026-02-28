// Darwin — Apple Calendar via AppleScript (osascript)

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { escapeAppleScript } from "../../shared/escape.js";
import type { CalendarProvider, CalendarEvent } from "../interface.js";

const execAsync = promisify(exec);

function runOsascript(script: string): Promise<string> {
  return execAsync(`osascript <<'APPLESCRIPT'\n${script}\nAPPLESCRIPT`)
    .then((r) => r.stdout.trim());
}

function parseEventList(raw: string): CalendarEvent[] {
  if (!raw || raw === "missing value") return [];
  return raw.split("\n").filter(Boolean).map((line) => {
    const [id = "", title = "", date = "", startTime = "", endTime = "", allDayStr = "", location = "", notes = ""] = line.split("\t");
    return {
      id,
      title,
      date,
      startTime: startTime === "missing value" ? undefined : startTime,
      endTime: endTime === "missing value" ? undefined : endTime,
      location: location === "missing value" ? undefined : location,
      notes: notes === "missing value" ? undefined : notes,
      allDay: allDayStr === "true",
    };
  });
}

export class DarwinCalendar implements CalendarProvider {
  async today(): Promise<CalendarEvent[]> {
    const script = `
tell application "Calendar"
  set todayStart to current date
  set time of todayStart to 0
  set todayEnd to todayStart + (1 * days)
  set output to ""
  repeat with cal in calendars
    set evts to (every event of cal whose start date >= todayStart and start date < todayEnd)
    repeat with e in evts
      set sd to (start date of e) as string
      set ed to (end date of e) as string
      set loc to location of e
      if loc is missing value then set loc to "missing value"
      set nt to description of e
      if nt is missing value then set nt to "missing value"
      set output to output & (uid of e) & "\t" & (summary of e) & "\t" & sd & "\t" & sd & "\t" & ed & "\t" & ((allday event of e) as string) & "\t" & loc & "\t" & nt & "\n"
    end repeat
  end repeat
  return output
end tell`;
    const raw = await runOsascript(script);
    return parseEventList(raw);
  }

  async upcoming(days: number = 7): Promise<CalendarEvent[]> {
    const script = `
tell application "Calendar"
  set todayStart to current date
  set time of todayStart to 0
  set futureEnd to todayStart + (${Math.floor(days)} * days)
  set output to ""
  repeat with cal in calendars
    set evts to (every event of cal whose start date >= todayStart and start date < futureEnd)
    repeat with e in evts
      set sd to (start date of e) as string
      set ed to (end date of e) as string
      set loc to location of e
      if loc is missing value then set loc to "missing value"
      set nt to description of e
      if nt is missing value then set nt to "missing value"
      set output to output & (uid of e) & "\t" & (summary of e) & "\t" & sd & "\t" & sd & "\t" & ed & "\t" & ((allday event of e) as string) & "\t" & loc & "\t" & nt & "\n"
    end repeat
  end repeat
  return output
end tell`;
    const raw = await runOsascript(script);
    return parseEventList(raw);
  }

  async create(title: string, date: string, time?: string, duration?: number): Promise<CalendarEvent> {
    const safeTitle = escapeAppleScript(title);
    const safeDate = escapeAppleScript(date);
    const safeTime = time ? escapeAppleScript(time) : "";
    const durationMinutes = duration ?? 60;

    const dateExpr = time
      ? `date "${safeDate} ${safeTime}"`
      : `date "${safeDate}"`;

    const script = `
tell application "Calendar"
  tell calendar 1
    set startDate to ${dateExpr}
    set endDate to startDate + (${durationMinutes} * minutes)
    set newEvent to make new event with properties {summary:"${safeTitle}", start date:startDate, end date:endDate}
    return (uid of newEvent) & "\t" & (summary of newEvent) & "\t" & ((start date of newEvent) as string)
  end tell
end tell`;
    const raw = await runOsascript(script);
    const [id = "", eventTitle = "", startDate = ""] = raw.split("\t");
    return {
      id,
      title: eventTitle,
      date: startDate,
      startTime: time,
      duration: durationMinutes,
      allDay: !time,
    };
  }

  async delete(id: string): Promise<void> {
    const safeId = escapeAppleScript(id);
    const script = `
tell application "Calendar"
  repeat with cal in calendars
    try
      set targetEvent to (first event of cal whose uid is "${safeId}")
      delete targetEvent
      return "deleted"
    end try
  end repeat
  error "Event not found"
end tell`;
    await runOsascript(script);
  }
}
