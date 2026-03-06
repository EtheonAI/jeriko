# WhatsApp Channel Audit Analysis

## Source: `src/daemon/services/channels/whatsapp.ts`

---

## 1. Full Connection Lifecycle

```
constructor(config)
  -> sets authDir (default: <dataDir>/whatsapp-auth)
  -> sets allowedNumbers (Set from config array, empty = allow all)
  -> stores onQR callback

connect()
  -> if already connected, returns immediately (idempotent guard)
  -> useMultiFileAuthState(authDir) — loads persisted creds or creates new
  -> fetchLatestWaWebVersion() — gets current WA Web client revision
  -> creates connectionReady promise (120s timeout)
  -> calls createSocket() (inner function) which:
     1. makeWASocket({ auth: state, version, printQRInTerminal, logger, options.headers })
     2. Registers ev listeners:
        - "creds.update" -> saveCreds (persists auth)
        - "messages.upsert" -> handleIncoming(messages)
        - "connection.update" -> handles qr/open/close events

QR Phase:
  -> On `qr` event: resets 120s timer, calls onQR callback if provided
  -> If no onQR callback, Baileys prints QR to terminal (printQRInTerminal: true)

Auth Complete:
  -> On connection === "open": sets connected=true, resolves connectionReady promise

connect() returns -> caller unblocked
```

## 2. Reconnection Strategy

The `connection.update` handler with `connection === "close"` has three branches:

| Condition | Behavior |
|-----------|----------|
| `statusCode === 401` (loggedOut) | Rejects promise (fatal), no reconnect |
| `settled === true` (was previously connected) | Reconnects after 3s delay |
| `settled === false` (handshake phase) | Recreates socket after 2s delay |

**DisconnectReason codes from Baileys:**
- `connectionClosed` (428) -> reconnect
- `connectionLost` (408) -> reconnect
- `connectionReplaced` (440) -> reconnect
- `timedOut` (408) -> reconnect
- `loggedOut` (401) -> FATAL, no reconnect
- `badSession` (500) -> reconnect
- `restartRequired` (515) -> reconnect
- `multideviceMismatch` (411) -> reconnect
- `forbidden` (403) -> reconnect
- `unavailableService` (503) -> reconnect

Only `loggedOut` (401) is fatal. All others trigger reconnect.

## 3. Message Handling Flow

```
messages.upsert event
  -> handleIncoming(messages: WAMessage[])
     for each message:
       1. Skip if no msg.message or msg.key.fromMe (ignore own messages)
       2. Extract JID (remoteJid) and sender number
       3. If allowedNumbers is non-empty and sender not in set -> skip
       4. extractText(msg) — checks conversation, extendedText, image/video/doc captions
       5. extractAttachments(msg) — photo, document, video, audio/voice, sticker
       6. If attachments found, store msg in lastMessageByJid map (for downloadFile)
       7. Skip if no text AND no attachments
       8. Build MessageMetadata (channel, chat_id, is_group, sender_name, reply_to, message_id, attachments)
       9. Generate displayText = text or attachmentSummary
      10. Invoke all registered handlers with (senderNumber, displayText, metadata)
          - handler errors are caught and logged, don't break other handlers
```

## 4. Auth State Persistence

- **authDir**: Defaults to `<dataDir>/whatsapp-auth`, configurable via `config.authDir`
- **useMultiFileAuthState(authDir)**: Baileys built-in — stores creds as JSON files in the directory
- **creds.update event**: Wired to `saveCreds` returned by useMultiFileAuthState
- Auth state is shared across socket recreations (same `state` object passed to every makeWASocket call)
- On restart: if auth files exist, Baileys resumes the session without QR

## 5. Edge Cases and Error Paths

### Connection
- **connect() when already connected**: Returns immediately (idempotent)
- **disconnect() when not connected**: Returns immediately
- **120s timeout**: If QR not scanned in time, rejects with timeout error. Timer resets on each new QR.
- **onQR callback error**: Caught and logged as warning, does not break connection flow
- **fetchLatestWaWebVersion failure**: Not caught — will propagate and fail connect(). Could be an issue for offline/firewalled environments. The comment says "falls back to bundled version" but fetchLatestWaWebVersion itself may throw.

### Messaging
- **requireSocket()**: Throws "not connected" if socket is null or connected is false
- **editMessage failure**: Falls back to sending a new message
- **deleteMessage failure**: Silently caught (best effort)
- **sendTyping failure**: Silently caught (best effort)
- **sendLong**: Splits at newlines, then spaces, then hard-splits. Correctly handles messages shorter than limit.

### Media
- **sendPhoto**: Handles both file paths (Buffer) and URLs (object with url property)
- **sendDocument/Video/Audio/Voice**: Only file paths (readFileSync), no URL support
- **downloadFile**: Uses lastMessageByJid map — throws if no message stored for the JID
- **sendAudio/sendVoice with caption**: Sends caption as separate follow-up message (WA limitation)

### Number Filtering
- **allowedNumbers empty Set**: All numbers allowed
- **allowedNumbers populated**: Only matching numbers pass. Comparison is exact string match on the number part (before @).

## 6. Potential Bugs / Concerns

1. **fetchLatestWaWebVersion not wrapped in try/catch**: Line 115 calls `fetchLatestWaWebVersion()` without fallback. If this network call fails (offline, DNS issues), the entire `connect()` rejects. The code comment (line 114) says "Falls back to the bundled version if the fetch fails" but that fallback is inside Baileys' function, not guaranteed by the call site. If Baileys throws, connect fails.

2. **Timer leak on logout**: When `isLogout` is true (line 177), the timer is cleared. But if multiple QR resets happened before logout, only the last timer reference is cleared — this is fine because `timer` is reassigned on each QR, and `clearTimeout` on an already-fired timer is a no-op.

3. **No backoff on reconnect**: Post-connect reconnects always use a fixed 3s delay (line 184). No exponential backoff. If WA servers are down, this creates a tight reconnect loop. The relay client uses exponential backoff; this does not.

4. **Memory leak in lastMessageByJid**: The map grows unbounded. Each JID that sends media stores its latest message, but entries are never pruned. For a personal account this is negligible, but for a business account with many chats, this could accumulate.

5. **socket.end(undefined) on disconnect**: Line 203 calls `this.socket.end(undefined)`. This is the Baileys way to close the connection. However, the close event handler will fire, see `this.connected = false` (already set on line 205), and attempt to reconnect because `settled` is `true`. The reconnect `setTimeout(() => createSocket(), 3_000)` will fire after disconnect() has already nulled the socket. The new createSocket() will overwrite `this.socket` (now null), creating a zombie socket that reconnects in the background after an intentional disconnect. **This is a bug.**

6. **No cancellation of reconnect timers on disconnect()**: When `disconnect()` is called, pending `setTimeout` calls from the close handler are not cancelled. There is no mechanism to track and clear these timers.

7. **toJid assumes @s.whatsapp.net**: Group JIDs use `@g.us`. The `toJid` helper only appends `@s.whatsapp.net` for bare numbers. This is correct for the intended use (sending to individual numbers) but callers must pass the full JID for groups.
