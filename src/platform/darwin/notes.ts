// Darwin — Apple Notes via AppleScript (osascript)

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { escapeAppleScript } from "../../shared/escape.js";
import type { NotesProvider, Note } from "../interface.js";

const execAsync = promisify(exec);

function runOsascriptMultiline(script: string): Promise<string> {
  // Use heredoc to safely pass multi-line AppleScript
  return execAsync(`osascript <<'APPLESCRIPT'\n${script}\nAPPLESCRIPT`)
    .then((r) => r.stdout.trim());
}

function parseNoteList(raw: string): Note[] {
  if (!raw || raw === "missing value") return [];
  // Each line: id\ttitle\tfolder\tmodifiedAt
  return raw.split("\n").filter(Boolean).map((line) => {
    const [id = "", title = "", folder = "", modifiedAt = ""] = line.split("\t");
    return { id, title, body: "", folder, modifiedAt };
  });
}

export class DarwinNotes implements NotesProvider {
  async list(): Promise<Note[]> {
    const script = `
tell application "Notes"
  set output to ""
  repeat with n in notes
    set output to output & (id of n) & "\t" & (name of n) & "\t" & (name of container of n) & "\t" & ((modification date of n) as string) & "\n"
  end repeat
  return output
end tell`;
    const raw = await runOsascriptMultiline(script);
    return parseNoteList(raw);
  }

  async get(id: string): Promise<Note> {
    const safeId = escapeAppleScript(id);
    const script = `
tell application "Notes"
  set n to note id "${safeId}"
  set noteId to id of n
  set noteTitle to name of n
  set noteBody to plaintext of n
  set noteFolder to name of container of n
  set noteDate to (modification date of n) as string
  return noteId & "\t" & noteTitle & "\t" & noteBody & "\t" & noteFolder & "\t" & noteDate
end tell`;
    const raw = await runOsascriptMultiline(script);
    const [noteId = "", title = "", body = "", folder = "", modifiedAt = ""] = raw.split("\t");
    return { id: noteId, title, body, folder, modifiedAt };
  }

  async create(title: string, body: string, folder?: string): Promise<Note> {
    const safeTitle = escapeAppleScript(title);
    const safeBody = escapeAppleScript(body);

    let script: string;
    if (folder) {
      const safeFolder = escapeAppleScript(folder);
      script = `
tell application "Notes"
  set targetFolder to folder "${safeFolder}" of default account
  set newNote to make new note at targetFolder with properties {name:"${safeTitle}", body:"${safeBody}"}
  return (id of newNote) & "\t" & (name of newNote)
end tell`;
    } else {
      script = `
tell application "Notes"
  set newNote to make new note with properties {name:"${safeTitle}", body:"${safeBody}"}
  return (id of newNote) & "\t" & (name of newNote)
end tell`;
    }

    const raw = await runOsascriptMultiline(script);
    const [id = "", createdTitle = ""] = raw.split("\t");
    return { id, title: createdTitle, body, folder };
  }

  async search(query: string): Promise<Note[]> {
    const safeQuery = escapeAppleScript(query);
    const script = `
tell application "Notes"
  set output to ""
  set matchingNotes to (notes whose name contains "${safeQuery}" or plaintext contains "${safeQuery}")
  repeat with n in matchingNotes
    set output to output & (id of n) & "\t" & (name of n) & "\t" & (name of container of n) & "\t" & ((modification date of n) as string) & "\n"
  end repeat
  return output
end tell`;
    const raw = await runOsascriptMultiline(script);
    return parseNoteList(raw);
  }

  async delete(id: string): Promise<void> {
    const safeId = escapeAppleScript(id);
    const script = `
tell application "Notes"
  delete note id "${safeId}"
end tell`;
    await runOsascriptMultiline(script);
  }
}
