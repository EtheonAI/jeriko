// Darwin — Apple Contacts via AppleScript (osascript)

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { escapeAppleScript } from "../../shared/escape.js";
import type { ContactsProvider, Contact } from "../interface.js";

const execAsync = promisify(exec);

function runOsascript(script: string): Promise<string> {
  return execAsync(`osascript <<'APPLESCRIPT'\n${script}\nAPPLESCRIPT`)
    .then((r) => r.stdout.trim());
}

function parseContactList(raw: string): Contact[] {
  if (!raw || raw === "missing value") return [];
  return raw.split("\n").filter(Boolean).map((line) => {
    const [id = "", name = "", email = "", phone = "", org = ""] = line.split("\t");
    return {
      id,
      name,
      email: email === "missing value" ? undefined : email,
      phone: phone === "missing value" ? undefined : phone,
      organization: org === "missing value" ? undefined : org,
    };
  });
}

export class DarwinContacts implements ContactsProvider {
  async search(query: string): Promise<Contact[]> {
    const safeQuery = escapeAppleScript(query);
    const script = `
tell application "Contacts"
  set output to ""
  set matchingPeople to (every person whose name contains "${safeQuery}")
  repeat with p in matchingPeople
    set personId to id of p
    set personName to name of p
    set personEmail to "missing value"
    if (count of emails of p) > 0 then
      set personEmail to value of first email of p
    end if
    set personPhone to "missing value"
    if (count of phones of p) > 0 then
      set personPhone to value of first phone of p
    end if
    set personOrg to organization of p
    if personOrg is missing value then set personOrg to "missing value"
    set output to output & personId & "\t" & personName & "\t" & personEmail & "\t" & personPhone & "\t" & personOrg & "\n"
  end repeat
  return output
end tell`;
    const raw = await runOsascript(script);
    return parseContactList(raw);
  }

  async get(name: string): Promise<Contact> {
    const safeName = escapeAppleScript(name);
    const script = `
tell application "Contacts"
  set p to first person whose name is "${safeName}"
  set personId to id of p
  set personName to name of p
  set personEmail to "missing value"
  if (count of emails of p) > 0 then
    set personEmail to value of first email of p
  end if
  set personPhone to "missing value"
  if (count of phones of p) > 0 then
    set personPhone to value of first phone of p
  end if
  set personOrg to organization of p
  if personOrg is missing value then set personOrg to "missing value"
  return personId & "\t" & personName & "\t" & personEmail & "\t" & personPhone & "\t" & personOrg
end tell`;
    const raw = await runOsascript(script);
    const [id = "", contactName = "", email = "", phone = "", org = ""] = raw.split("\t");
    return {
      id,
      name: contactName,
      email: email === "missing value" ? undefined : email,
      phone: phone === "missing value" ? undefined : phone,
      organization: org === "missing value" ? undefined : org,
    };
  }

  async list(): Promise<Contact[]> {
    const script = `
tell application "Contacts"
  set output to ""
  repeat with p in people
    set personId to id of p
    set personName to name of p
    set personEmail to "missing value"
    if (count of emails of p) > 0 then
      set personEmail to value of first email of p
    end if
    set personPhone to "missing value"
    if (count of phones of p) > 0 then
      set personPhone to value of first phone of p
    end if
    set personOrg to organization of p
    if personOrg is missing value then set personOrg to "missing value"
    set output to output & personId & "\t" & personName & "\t" & personEmail & "\t" & personPhone & "\t" & personOrg & "\n"
  end repeat
  return output
end tell`;
    const raw = await runOsascript(script);
    return parseContactList(raw);
  }
}
