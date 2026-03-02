// CLI command: jeriko share — Share a conversation session via public link.
//
// Usage:
//   jeriko share                          Share the current active session
//   jeriko share <session-id-or-slug>     Share a specific session
//   jeriko share --revoke <share-id>      Revoke a shared link
//   jeriko share --list                   List all active shares

import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export const command: CommandHandler = {
  name: "share",
  description: "Share a conversation via public link",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko share [session-id-or-slug]");
      console.log("       jeriko share --revoke <share-id>");
      console.log("       jeriko share --list");
      console.log("\nShare a conversation session via a public link on jeriko.ai.");
      console.log("\nFlags:");
      console.log("  --revoke <id>   Revoke a shared link");
      console.log("  --list          List all active shares");
      console.log("  --no-expire     Share without expiry (default: 30 days)");
      process.exit(0);
    }

    const revokeId = flagStr(parsed, "revoke", "");
    const listMode = flagBool(parsed, "list");
    // --no-expire: parser strips "no-" prefix and sets flags["expire"] = false
    const noExpire = parsed.flags["expire"] === false;
    const sessionTarget = parsed.positional[0];

    const socketPath = join(homedir(), ".jeriko", "daemon.sock");
    const daemonRunning = existsSync(socketPath);

    if (daemonRunning) {
      await handleViaDaemon({ revokeId, listMode, noExpire, sessionTarget });
    } else {
      await handleInProcess({ revokeId, listMode, noExpire, sessionTarget });
    }
  },
};

// ---------------------------------------------------------------------------
// Daemon mode — route through Unix socket IPC
// ---------------------------------------------------------------------------

async function handleViaDaemon(opts: {
  revokeId: string;
  listMode: boolean;
  noExpire: boolean;
  sessionTarget?: string;
}): Promise<void> {
  const { sendRequest } = await import("../../../daemon/api/socket.js");

  if (opts.revokeId) {
    const response = await sendRequest("share_revoke", { share_id: opts.revokeId });
    if (!response.ok) fail(response.error ?? "Failed to revoke share");
    ok(response.data);
    return;
  }

  if (opts.listMode) {
    const response = await sendRequest("shares", {});
    if (!response.ok) fail(response.error ?? "Failed to list shares");
    ok(response.data);
    return;
  }

  // Create a share
  const params: Record<string, unknown> = {};
  if (opts.sessionTarget) params.session_id = opts.sessionTarget;
  if (opts.noExpire) params.expires_in_ms = null;

  const response = await sendRequest("share", params);
  if (!response.ok) fail(response.error ?? "Failed to create share");
  ok(response.data);
}

// ---------------------------------------------------------------------------
// In-process mode — direct database access (no daemon running)
// ---------------------------------------------------------------------------

async function handleInProcess(opts: {
  revokeId: string;
  listMode: boolean;
  noExpire: boolean;
  sessionTarget?: string;
}): Promise<void> {
  // Initialize database
  const { getDatabase } = await import("../../../daemon/storage/db.js");
  getDatabase();

  if (opts.revokeId) {
    const { revokeShare } = await import("../../../daemon/storage/share.js");
    const revoked = revokeShare(opts.revokeId);
    if (!revoked) fail("Share not found or already revoked");
    ok({ share_id: opts.revokeId, status: "revoked" });
    return;
  }

  if (opts.listMode) {
    const { listShares } = await import("../../../daemon/storage/share.js");
    const { buildShareLink } = await import("../../../shared/urls.js");
    const shares = listShares();
    ok(shares.map((s) => ({
      share_id: s.share_id,
      url: buildShareLink(s.share_id),
      title: s.title,
      model: s.model,
      message_count: JSON.parse(s.messages).length,
      created_at: s.created_at,
      expires_at: s.expires_at,
      revoked_at: s.revoked_at,
    })));
    return;
  }

  // Create a share
  const { createShare } = await import("../../../daemon/storage/share.js");
  const { getSession, getSessionBySlug } = await import("../../../daemon/agent/session/session.js");
  const { getMessages } = await import("../../../daemon/agent/session/message.js");
  const { kvGet } = await import("../../../daemon/storage/kv.js");
  const { buildShareLink } = await import("../../../shared/urls.js");

  // Resolve session
  let sessionId: string | undefined;
  if (opts.sessionTarget) {
    const bySlug = getSessionBySlug(opts.sessionTarget);
    sessionId = bySlug?.id ?? opts.sessionTarget;
  } else {
    sessionId = kvGet<string>("state:last_session_id") ?? undefined;
  }

  if (!sessionId) fail("No active session to share. Specify a session ID or start a conversation first.");

  const session = getSession(sessionId);
  if (!session) fail("Session not found");

  const messages = getMessages(sessionId);
  if (messages.length === 0) fail("Session has no messages to share");

  const snapshot = messages.map((m) => ({
    role: m.role,
    content: m.content,
    created_at: m.created_at,
  }));

  const share = createShare({
    sessionId,
    title: session!.title,
    model: session!.model,
    messages: JSON.stringify(snapshot),
    expiresInMs: opts.noExpire ? null : undefined,
  });

  ok({
    share_id: share.share_id,
    url: buildShareLink(share.share_id),
    title: share.title,
    model: share.model,
    message_count: snapshot.length,
    created_at: share.created_at,
    expires_at: share.expires_at,
  });
}
