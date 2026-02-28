// Darwin — iMessage via AppleScript (Messages.app)

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { escapeAppleScript } from "../../shared/escape.js";
import type { MessagingProvider, Message } from "../interface.js";

const execAsync = promisify(exec);

function runOsascript(script: string): Promise<string> {
  return execAsync(`osascript <<'APPLESCRIPT'\n${script}\nAPPLESCRIPT`)
    .then((r) => r.stdout.trim());
}

export class DarwinIMessage implements MessagingProvider {
  /**
   * Send an iMessage to a phone number or email.
   * The recipient must be reachable via iMessage.
   */
  async send(to: string, message: string): Promise<void> {
    const safeTo = escapeAppleScript(to);
    const safeMessage = escapeAppleScript(message);
    const script = `
tell application "Messages"
  set targetService to 1st account whose service type = iMessage
  set targetBuddy to participant "${safeTo}" of targetService
  send "${safeMessage}" to targetBuddy
end tell`;
    await runOsascript(script);
  }

  /**
   * Read recent messages.
   * Note: AppleScript access to Messages.app chat history is limited.
   * This reads from the most recent chat or a specific sender.
   */
  async read(from?: string, count: number = 10): Promise<Message[]> {
    const limit = Math.max(1, Math.min(50, Math.floor(count)));

    if (from) {
      const safeFrom = escapeAppleScript(from);
      // Read from a specific chat
      const script = `
tell application "Messages"
  set output to ""
  set targetChat to missing value
  repeat with c in chats
    repeat with p in participants of c
      if handle of p is "${safeFrom}" then
        set targetChat to c
        exit repeat
      end if
    end repeat
    if targetChat is not missing value then exit repeat
  end repeat
  if targetChat is missing value then return ""
  set msgs to messages of targetChat
  set msgCount to count of msgs
  set startIdx to 1
  if msgCount > ${limit} then set startIdx to msgCount - ${limit} + 1
  repeat with i from startIdx to msgCount
    set m to item i of msgs
    set msgId to id of m as string
    set msgSender to handle of sender of m
    set msgText to text of m
    set msgDate to (date of m) as string
    set output to output & msgId & "\t" & msgSender & "\t" & msgText & "\t" & msgDate & "\n"
  end repeat
  return output
end tell`;
      const raw = await runOsascript(script);
      return this.parseMessages(raw);
    }

    // Read from most recent chat
    const script = `
tell application "Messages"
  set output to ""
  if (count of chats) = 0 then return ""
  set recentChat to item 1 of chats
  set msgs to messages of recentChat
  set msgCount to count of msgs
  set startIdx to 1
  if msgCount > ${limit} then set startIdx to msgCount - ${limit} + 1
  repeat with i from startIdx to msgCount
    set m to item i of msgs
    set msgId to id of m as string
    set msgSender to handle of sender of m
    set msgText to text of m
    set msgDate to (date of m) as string
    set output to output & msgId & "\t" & msgSender & "\t" & msgText & "\t" & msgDate & "\n"
  end repeat
  return output
end tell`;
    const raw = await runOsascript(script);
    return this.parseMessages(raw);
  }

  private parseMessages(raw: string): Message[] {
    if (!raw || raw === "missing value") return [];
    return raw.split("\n").filter(Boolean).map((line) => {
      const [id = "", from = "", text = "", date = ""] = line.split("\t");
      return { id, from, text, date };
    });
  }
}
