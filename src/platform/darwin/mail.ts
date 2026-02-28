// Darwin — Mail.app via AppleScript (osascript)

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { escapeAppleScript } from "../../shared/escape.js";
import type { MailProvider, EmailMessage } from "../interface.js";

const execAsync = promisify(exec);

function runOsascript(script: string): Promise<string> {
  return execAsync(`osascript <<'APPLESCRIPT'\n${script}\nAPPLESCRIPT`)
    .then((r) => r.stdout.trim());
}

function parseMessageList(raw: string): EmailMessage[] {
  if (!raw || raw === "missing value") return [];
  return raw.split("\n").filter(Boolean).map((line) => {
    const [id = "", from = "", subject = "", date = "", readStr = ""] = line.split("\t");
    return {
      id,
      from,
      subject,
      date,
      read: readStr === "true",
    };
  });
}

export class DarwinMail implements MailProvider {
  async unread(count: number = 20): Promise<EmailMessage[]> {
    const limit = Math.max(1, Math.min(100, Math.floor(count)));
    const script = `
tell application "Mail"
  set output to ""
  set unreadMsgs to (messages of inbox whose read status is false)
  set msgCount to count of unreadMsgs
  if msgCount > ${limit} then set msgCount to ${limit}
  repeat with i from 1 to msgCount
    set m to item i of unreadMsgs
    set msgId to id of m as string
    set msgFrom to sender of m
    set msgSubject to subject of m
    set msgDate to (date received of m) as string
    set msgRead to (read status of m) as string
    set output to output & msgId & "\t" & msgFrom & "\t" & msgSubject & "\t" & msgDate & "\t" & msgRead & "\n"
  end repeat
  return output
end tell`;
    const raw = await runOsascript(script);
    return parseMessageList(raw);
  }

  async search(query: string): Promise<EmailMessage[]> {
    const safeQuery = escapeAppleScript(query);
    const script = `
tell application "Mail"
  set output to ""
  set matchingMsgs to (messages of inbox whose subject contains "${safeQuery}" or sender contains "${safeQuery}")
  set msgCount to count of matchingMsgs
  if msgCount > 50 then set msgCount to 50
  repeat with i from 1 to msgCount
    set m to item i of matchingMsgs
    set msgId to id of m as string
    set msgFrom to sender of m
    set msgSubject to subject of m
    set msgDate to (date received of m) as string
    set msgRead to (read status of m) as string
    set output to output & msgId & "\t" & msgFrom & "\t" & msgSubject & "\t" & msgDate & "\t" & msgRead & "\n"
  end repeat
  return output
end tell`;
    const raw = await runOsascript(script);
    return parseMessageList(raw);
  }

  async send(to: string, subject: string, body: string): Promise<void> {
    const safeTo = escapeAppleScript(to);
    const safeSubject = escapeAppleScript(subject);
    const safeBody = escapeAppleScript(body);
    const script = `
tell application "Mail"
  set newMessage to make new outgoing message with properties {subject:"${safeSubject}", content:"${safeBody}", visible:false}
  tell newMessage
    make new to recipient at end of to recipients with properties {address:"${safeTo}"}
  end tell
  send newMessage
end tell`;
    await runOsascript(script);
  }
}
