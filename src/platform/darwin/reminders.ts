// Darwin — Apple Reminders via AppleScript (osascript)

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { escapeAppleScript } from "../../shared/escape.js";
import type { RemindersProvider, Reminder } from "../interface.js";

const execAsync = promisify(exec);

function runOsascript(script: string): Promise<string> {
  return execAsync(`osascript <<'APPLESCRIPT'\n${script}\nAPPLESCRIPT`)
    .then((r) => r.stdout.trim());
}

function parseReminderList(raw: string): Reminder[] {
  if (!raw || raw === "missing value") return [];
  return raw.split("\n").filter(Boolean).map((line) => {
    const [id = "", title = "", dueDate = "", completed = "", list = ""] = line.split("\t");
    return {
      id,
      title,
      dueDate: dueDate === "missing value" ? undefined : dueDate,
      completed: completed === "true",
      list,
    };
  });
}

export class DarwinReminders implements RemindersProvider {
  async list(listName?: string): Promise<Reminder[]> {
    let script: string;
    if (listName) {
      const safeName = escapeAppleScript(listName);
      script = `
tell application "Reminders"
  set output to ""
  set targetList to list "${safeName}"
  repeat with r in (reminders of targetList whose completed is false)
    set dd to due date of r
    if dd is missing value then
      set ddStr to "missing value"
    else
      set ddStr to dd as string
    end if
    set output to output & (id of r) & "\t" & (name of r) & "\t" & ddStr & "\t" & ((completed of r) as string) & "\t" & "${safeName}" & "\n"
  end repeat
  return output
end tell`;
    } else {
      script = `
tell application "Reminders"
  set output to ""
  repeat with l in lists
    set listName to name of l
    repeat with r in (reminders of l whose completed is false)
      set dd to due date of r
      if dd is missing value then
        set ddStr to "missing value"
      else
        set ddStr to dd as string
      end if
      set output to output & (id of r) & "\t" & (name of r) & "\t" & ddStr & "\t" & ((completed of r) as string) & "\t" & listName & "\n"
    end repeat
  end repeat
  return output
end tell`;
    }

    const raw = await runOsascript(script);
    return parseReminderList(raw);
  }

  async create(title: string, dueDate?: string, listName?: string): Promise<Reminder> {
    const safeTitle = escapeAppleScript(title);

    let props = `{name:"${safeTitle}"}`;
    if (dueDate) {
      const safeDue = escapeAppleScript(dueDate);
      props = `{name:"${safeTitle}", due date:date "${safeDue}"}`;
    }

    let script: string;
    if (listName) {
      const safeList = escapeAppleScript(listName);
      script = `
tell application "Reminders"
  set targetList to list "${safeList}"
  set newReminder to make new reminder at end of targetList with properties ${props}
  return (id of newReminder) & "\t" & (name of newReminder)
end tell`;
    } else {
      script = `
tell application "Reminders"
  set newReminder to make new reminder with properties ${props}
  return (id of newReminder) & "\t" & (name of newReminder)
end tell`;
    }

    const raw = await runOsascript(script);
    const [id = "", createdTitle = ""] = raw.split("\t");
    return { id, title: createdTitle, dueDate, completed: false, list: listName };
  }

  async complete(id: string): Promise<void> {
    const safeId = escapeAppleScript(id);
    const script = `
tell application "Reminders"
  set targetReminder to reminder id "${safeId}"
  set completed of targetReminder to true
end tell`;
    await runOsascript(script);
  }

  async delete(id: string): Promise<void> {
    const safeId = escapeAppleScript(id);
    const script = `
tell application "Reminders"
  delete reminder id "${safeId}"
end tell`;
    await runOsascript(script);
  }
}
