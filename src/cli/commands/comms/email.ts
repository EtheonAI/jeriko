import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { escapeAppleScript } from "../../../shared/escape.js";
import { execSync } from "node:child_process";
import { platform } from "node:os";

export const command: CommandHandler = {
  name: "email",
  description: "Email (read unread, search, send) via native mail apps",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko email <action> [options]");
      console.log("\nActions:");
      console.log("  unread            List unread emails");
      console.log("  search <query>    Search emails");
      console.log("  send              Send an email");
      console.log("\nFlags:");
      console.log("  --to <addr>       Recipient (for send)");
      console.log("  --subject <text>  Subject line (for send)");
      console.log("  --body <text>     Email body (for send)");
      console.log("  --limit <n>       Max results (default: 20)");
      console.log("\nmacOS: uses Mail.app via AppleScript");
      console.log("Linux: uses sendmail/mutt for send, not yet supported for read");
      process.exit(0);
    }

    const action = parsed.positional[0];
    if (!action) fail("Missing action. Usage: jeriko email <unread|search|send>");

    const os = platform();

    switch (os) {
      case "darwin":
        await darwinEmail(action!, parsed);
        break;
      case "linux":
        await linuxEmail(action!, parsed);
        break;
      default:
        fail(`Email not supported on platform: ${os}`);
    }
  },
};

// ---------------------------------------------------------------------------
// macOS — Mail.app via AppleScript
// ---------------------------------------------------------------------------

const esc = escapeAppleScript;

function runAppleScript(script: string): string {
  return execSync(`osascript <<'APPLESCRIPT'\n${script}\nAPPLESCRIPT`, {
    encoding: "utf-8",
    timeout: 15000,
  }).trim();
}

interface ParsedEmail {
  id: string;
  from: string;
  subject: string;
  date: string;
  read: boolean;
}

function parseMailOutput(raw: string): ParsedEmail[] {
  if (!raw || raw === "missing value") return [];
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id = "", from = "", subject = "", date = "", readStr = ""] = line.split("\t");
      return { id, from, subject, date, read: readStr === "true" };
    });
}

async function darwinEmail(action: string, parsed: ReturnType<typeof parseArgs>) {
  switch (action) {
    case "unread": {
      const limit = parseInt(flagStr(parsed, "limit", "20"), 10);
      const cap = Math.max(1, Math.min(100, limit));
      const script = `
tell application "Mail"
  set output to ""
  set unreadMsgs to (messages of inbox whose read status is false)
  set msgCount to count of unreadMsgs
  if msgCount > ${cap} then set msgCount to ${cap}
  repeat with i from 1 to msgCount
    set m to item i of unreadMsgs
    set msgId to id of m as string
    set msgFrom to sender of m
    set msgSubject to subject of m
    set msgDate to (date received of m) as string
    set msgRead to (read status of m) as string
    set output to output & msgId & "\t" & msgFrom & "\t" & msgSubject & "\t" & msgDate & "\t" & msgRead & "\\n"
  end repeat
  return output
end tell`;
      try {
        const raw = runAppleScript(script);
        const messages = parseMailOutput(raw);
        ok({ messages, count: messages.length });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        fail(`Failed to read unread emails: ${msg}`);
      }
      break;
    }

    case "search": {
      const query = parsed.positional.slice(1).join(" ");
      if (!query) fail("Missing query. Usage: jeriko email search <query>");
      const safeQuery = esc(query);
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
    set output to output & msgId & "\t" & msgFrom & "\t" & msgSubject & "\t" & msgDate & "\t" & msgRead & "\\n"
  end repeat
  return output
end tell`;
      try {
        const raw = runAppleScript(script);
        const messages = parseMailOutput(raw);
        ok({ query, messages, count: messages.length });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        fail(`Failed to search emails: ${msg}`);
      }
      break;
    }

    case "send": {
      const to = flagStr(parsed, "to", "");
      const subject = flagStr(parsed, "subject", "");
      const body = flagStr(parsed, "body", "");
      if (!to) fail("Missing --to flag. Usage: jeriko email send --to <addr> --subject <text> --body <text>");
      const safeTo = esc(to);
      const safeSubject = esc(subject);
      const safeBody = esc(body);
      const script = `
tell application "Mail"
  set newMessage to make new outgoing message with properties {subject:"${safeSubject}", content:"${safeBody}", visible:false}
  tell newMessage
    make new to recipient at end of to recipients with properties {address:"${safeTo}"}
  end tell
  send newMessage
end tell`;
      try {
        runAppleScript(script);
        ok({ sent: true, to, subject });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        fail(`Failed to send email: ${msg}`);
      }
      break;
    }

    default:
      fail(`Unknown action: "${action}". Use unread, search, or send.`);
  }
}

// ---------------------------------------------------------------------------
// Linux — sendmail/mutt for send, mail CLI for read
// ---------------------------------------------------------------------------

async function linuxEmail(action: string, parsed: ReturnType<typeof parseArgs>) {
  switch (action) {
    case "send": {
      const to = flagStr(parsed, "to", "");
      const subject = flagStr(parsed, "subject", "");
      const body = flagStr(parsed, "body", "");
      if (!to) fail("Missing --to flag. Usage: jeriko email send --to <addr> --subject <text> --body <text>");

      // Try sendmail first, fall back to mail command
      const escapedTo = to.replace(/'/g, "'\"'\"'");
      const escapedSubject = subject.replace(/'/g, "'\"'\"'");
      const escapedBody = body.replace(/'/g, "'\"'\"'");

      try {
        execSync(
          `printf 'Subject: %s\\n\\n%s' '${escapedSubject}' '${escapedBody}' | sendmail '${escapedTo}'`,
          { encoding: "utf-8", timeout: 10000 },
        );
        ok({ sent: true, to, subject, via: "sendmail" });
      } catch {
        // Fall back to mail command
        try {
          execSync(
            `echo '${escapedBody}' | mail -s '${escapedSubject}' '${escapedTo}'`,
            { encoding: "utf-8", timeout: 10000 },
          );
          ok({ sent: true, to, subject, via: "mail" });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          fail(`Failed to send email. Ensure sendmail or mail is installed: ${msg}`);
        }
      }
      break;
    }

    case "unread":
    case "search":
      fail(`Email ${action} on Linux requires a configured mail client. Use 'jeriko exec' to run your preferred mail CLI.`);
      break;

    default:
      fail(`Unknown action: "${action}". Use unread, search, or send.`);
  }
}
