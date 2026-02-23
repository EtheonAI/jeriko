# JerikoBot Command Reference

Complete reference for all 37 `jeriko` CLI commands (1 dispatcher + 36 commands).

---

## Global Flags

Every command supports these flags. They can appear before or after the command name.

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--format` | `json\|text\|logfmt` | `json` | Output format |
| `--quiet` | boolean | `false` | Suppress non-essential output |

```bash
jeriko --format json sys --info    # JSON (default): {"ok":true,"data":{...}}
jeriko --format text sys --info    # AI-optimized:   key=value key2=value2
jeriko --format logfmt sys --info  # Structured log: ok=true key=value
jeriko sys --info --format text    # --format also works after the command
```

**JSON** (default): Machine-parseable, used for piping between commands.
**Text**: Minimal tokens, instant AI comprehension -- use when reading results.
**Logfmt**: Key=value structured log format, greppable.

### Error Format

| Format | Success | Error |
|--------|---------|-------|
| JSON | `{"ok":true,"data":{...}}` | `{"ok":false,"error":"..."}` |
| Text | `key=value key2=value2` | `error <message>` |
| Logfmt | `ok=true key=value` | `ok=false error="..."` |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Network error |
| 3 | Auth error |
| 5 | Not found |
| 7 | Timeout |

---

## Dispatcher

### jeriko

The main entry point. Resolves commands in two phases: core (`bin/jeriko-<cmd>`) first, then plugin registry. When invoked with no arguments, launches the interactive chat REPL (`jeriko chat`).

**Platform:** All

```bash
jeriko                             # launch interactive chat (same as jeriko chat)
jeriko --help                      # list all available commands
jeriko <command> [options]         # run a command
jeriko --format text <command>     # run with global format flag
```

---

## System

### jeriko sys

System information: OS, CPU, memory, disk, uptime, processes, network interfaces, and battery.

**Platform:** All

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--info` | boolean | `true` | Full system info (default action) |
| `--processes` | boolean | `false` | List top processes by CPU usage |
| `--limit` | number | `15` | Max processes to return |
| `--network` | boolean | `false` | Network interfaces and traffic stats |
| `--battery` | boolean | `false` | Battery status and charge level |

```bash
jeriko sys                        # full system info (default)
jeriko sys --info                 # same as above
jeriko sys --processes --limit 5  # top 5 processes by CPU
jeriko sys --network              # network interfaces + traffic
jeriko sys --battery              # battery status
```

**Output (JSON):**
```json
{
  "ok": true,
  "data": {
    "os": "macOS 15.3",
    "arch": "arm64",
    "cpus": 10,
    "model": "Apple M1 Pro",
    "totalMemory": "16.00 GB",
    "freeMemory": "2.31 GB",
    "uptime": "3d 14h 22m",
    "hostname": "Khaleels-MacBook-Pro",
    "disk": { "total": "460.43 GB", "free": "123.45 GB", "used": "336.98 GB" }
  }
}
```

---

### jeriko proc

Process management: list, find, kill, and start background processes.

**Platform:** All

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--list` | boolean | `true` | List top processes by CPU (default action) |
| `--limit` | number | `15` | Max processes to return |
| `--kill` | number | - | Kill process by PID |
| `--signal` | string | `TERM` | Signal to send (TERM, KILL, HUP, etc.) |
| `--kill-name` | string | - | Kill processes matching name pattern |
| `--find` | string | - | Find processes by name pattern |
| `--start` | string | - | Start a command in the background, returns PID |

```bash
jeriko proc                         # top 15 processes by CPU (default)
jeriko proc --list --limit 10       # top 10 processes
jeriko proc --kill 12345            # kill process by PID
jeriko proc --kill 12345 --signal KILL  # force kill (SIGKILL)
jeriko proc --kill-name "node"      # kill by name pattern
jeriko proc --find "python"         # find processes by name
jeriko proc --start "sleep 999"     # run in background, returns PID
```

**Output (JSON) -- list:**
```json
{
  "ok": true,
  "data": [
    { "pid": 1234, "name": "node", "cpu": 12.5, "mem": 1.2, "command": "node server.js" }
  ]
}
```

**Output (JSON) -- kill:**
```json
{ "ok": true, "data": { "killed": true, "pid": 12345, "signal": "TERM" } }
```

---

### jeriko net

Network utilities: ping, DNS, port scanning, downloads, HTTP requests, and public IP lookup.

**Platform:** All

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--ping` | string | - | Ping a host |
| `--count` | number | `4` | Number of ping packets |
| `--dns` | string | - | DNS lookup for a domain |
| `--ports` | boolean | `false` | List listening ports |
| `--download` | string | - | URL to download |
| `--to` | string | - | Destination path for download |
| `--curl` | string | - | Make an HTTP request to URL |
| `--method` | string | `GET` | HTTP method (GET, POST, PUT, DELETE, etc.) |
| `--body` | string | - | Request body (JSON string) |
| `--headers` | string | - | Request headers (JSON string) |
| `--ip` | boolean | `false` | Show public IP address |

```bash
jeriko net --ping google.com        # ping (4 packets default)
jeriko net --ping google.com --count 10
jeriko net --dns example.com        # DNS lookup
jeriko net --ports                  # list listening ports
jeriko net --download "https://example.com/file.zip" --to ./file.zip
jeriko net --curl "https://api.example.com/data"
jeriko net --curl "https://api.example.com" --method POST --body '{"key":"val"}'
jeriko net --curl "https://api.example.com" --headers '{"Authorization":"Bearer tok"}'
jeriko net --ip                     # public IP address
```

**Output (JSON) -- ping:**
```json
{
  "ok": true,
  "data": {
    "host": "google.com",
    "packets": 4,
    "received": 4,
    "loss": "0%",
    "min": 5.2,
    "avg": 8.1,
    "max": 12.3
  }
}
```

**Output (JSON) -- ip:**
```json
{ "ok": true, "data": { "ip": "203.0.113.42" } }
```

---

### jeriko exec

Run arbitrary shell commands with optional timeout and working directory. Environment is stripped of sensitive keys.

**Platform:** All

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--timeout` | number | `30000` | Timeout in milliseconds |
| `--cwd` | string | `.` | Working directory for the command |

Accepts command as positional arguments or via stdin.

```bash
jeriko exec ls -la
jeriko exec --timeout 5000 "sleep 10"   # timeout in ms (default: 30000)
jeriko exec --cwd /tmp "pwd"
echo "uptime" | jeriko exec
```

**Output (JSON):**
```json
{
  "ok": true,
  "data": {
    "stdout": "total 42\ndrwxr-xr-x  5 user staff 160 Feb 23 10:00 .\n",
    "stderr": "",
    "exitCode": 0
  }
}
```

---

## Files

### jeriko fs

File operations: list directories, read files, write files, find files by name, search file contents, and get file metadata.

**Platform:** All

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--ls` | string | - | List directory contents |
| `--cat` | string | - | Read file contents |
| `--write` | string | - | Write stdin to file path |
| `--append` | boolean | `false` | Append instead of overwrite (with --write) |
| `--find` | string | - | Base directory for file search |
| `--grep` | string | - | Base directory for content search |
| `--glob` | string | - | File pattern filter for --grep (e.g., "*.js") |
| `--info` | string | - | Get file metadata (size, dates, permissions) |

The second positional argument provides the pattern for `--find` or the search term for `--grep`.

```bash
jeriko fs --ls .                       # list directory
jeriko fs --cat package.json           # read file
echo "hello" | jeriko fs --write /tmp/test.txt  # write stdin to file
echo "more" | jeriko fs --write /tmp/test.txt --append  # append
jeriko fs --find . "*.js"              # find files by name
jeriko fs --grep . "TODO" --glob "*.js"  # search file contents
jeriko fs --info package.json          # file metadata
```

**Output (JSON) -- ls:**
```json
{
  "ok": true,
  "data": [
    { "name": "package.json", "type": "file", "size": 1234 },
    { "name": "bin", "type": "directory" }
  ]
}
```

**Output (JSON) -- info:**
```json
{
  "ok": true,
  "data": {
    "path": "/absolute/path/to/package.json",
    "size": 1234,
    "created": "2026-02-01T10:00:00.000Z",
    "modified": "2026-02-23T14:30:00.000Z",
    "permissions": "rw-r--r--"
  }
}
```

**Piping pattern:**
```bash
jeriko fs --cat config.json | jeriko notify   # read file and send via Telegram
```

---

## Browser & Search

### jeriko browse

Browser automation via Playwright. Each invocation launches a fresh browser instance. Combine multiple flags in a single call to share browser state across actions.

**Platform:** All (requires Playwright: `npx playwright install chromium`)

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--navigate` | string | - | Navigate to URL |
| `--screenshot` | boolean/string | `false` | Take screenshot. If string, used as URL to navigate first |
| `--text` | boolean | `false` | Extract visible page text |
| `--links` | boolean | `false` | Extract all links on page |
| `--click` | string | - | Click element by CSS selector |
| `--type` | string | - | Type into element by CSS selector |
| `--value` | string | - | Text value for --type |
| `--scroll` | string | - | Scroll direction: `up` or `down` |
| `--times` | number | `1` | Number of scroll iterations |
| `--js` | string | - | Execute JavaScript in page context |

Screenshots emit `SCREENSHOT:<path>` to stderr.

**Limitation:** Two separate `jeriko browse` calls do NOT share browser state. Combine multiple flags in one call instead.

```bash
jeriko browse --navigate "https://example.com"
jeriko browse --navigate "https://example.com" --screenshot   # navigate + screenshot
jeriko browse --screenshot "https://example.com"              # shorthand: navigate + screenshot
jeriko browse --navigate "https://example.com" --text         # get page text
jeriko browse --navigate "https://example.com" --links        # get all links
jeriko browse --click "#submit"
jeriko browse --type "#email" --value "user@example.com"
jeriko browse --scroll down                                   # scroll down one viewport
jeriko browse --scroll up --times 3                           # scroll up 3 times
jeriko browse --js "document.title"
jeriko browse --navigate "https://example.com" --screenshot --text --links  # all at once
```

**Output (JSON) -- navigate + text:**
```json
{
  "ok": true,
  "data": {
    "navigate": { "url": "https://example.com", "title": "Example Domain" },
    "text": "Example Domain\nThis domain is for use in illustrative examples..."
  }
}
```

**Output (JSON) -- links:**
```json
{
  "ok": true,
  "data": {
    "links": [
      { "text": "More information", "href": "https://www.iana.org/domains/example" }
    ]
  }
}
```

**Piping pattern:**
```bash
jeriko browse --screenshot "https://example.com" | jeriko notify --photo -
```

---

### jeriko search

Web search via DuckDuckGo. Returns search results with titles, URLs, and snippets.

**Platform:** All

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| (positional) | string | - | Search query |

Accepts query as a positional argument or via stdin.

```bash
jeriko search "Node.js streams"
echo "weather today" | jeriko search
```

**Output (JSON):**
```json
{
  "ok": true,
  "data": [
    {
      "title": "Stream | Node.js Documentation",
      "url": "https://nodejs.org/api/stream.html",
      "snippet": "A stream is an abstract interface for working with streaming data..."
    }
  ]
}
```

**Piping pattern:**
```bash
jeriko search "weather" | jeriko notify   # search and send results to Telegram
```

---

### jeriko screenshot

Capture desktop screenshot. Emits `SCREENSHOT:<path>` to stderr for downstream tools.

**Platform:** macOS, Linux (with `scrot` or `gnome-screenshot`)

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--list` | boolean | `false` | List available displays |
| `--display` | number | `0` | Capture specific display by index |

```bash
jeriko screenshot                 # capture primary display
jeriko screenshot --list          # list available displays
jeriko screenshot --display 1     # capture specific display
```

**Output (JSON):**
```json
{
  "ok": true,
  "data": { "path": "/tmp/screenshot-1708700000000.png", "display": 0 }
}
```

---

## Desktop

### jeriko window

macOS window and application management via AppleScript. List windows, focus/minimize/close apps, resize windows, and toggle fullscreen.

**Platform:** macOS only

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--list` | boolean | `false` | List all visible windows with position and size |
| `--apps` | boolean | `false` | List running foreground applications |
| `--focus` | string | - | Bring app to front by name |
| `--minimize` | string | - | Minimize all windows of an app |
| `--close` | string | - | Close all windows of an app |
| `--app` | string | - | Launch or activate an app by name |
| `--quit` | string | - | Quit an app by name |
| `--resize` | string | - | Resize windows of an app |
| `--width` | number | - | Width in pixels (with --resize) |
| `--height` | number | - | Height in pixels (with --resize) |
| `--x` | number | - | X position in pixels (with --resize) |
| `--y` | number | - | Y position in pixels (with --resize) |
| `--fullscreen` | string | - | Toggle fullscreen for an app |

```bash
jeriko window --list                # list all visible windows (app, title, position, size)
jeriko window --apps                # list running foreground apps
jeriko window --focus "Safari"      # bring app to front
jeriko window --minimize "Safari"   # minimize all windows of app
jeriko window --close "Safari"      # close all windows of app
jeriko window --app "Terminal"      # launch or activate app
jeriko window --quit "Safari"       # quit an app
jeriko window --resize "Safari" --width 1280 --height 720
jeriko window --resize "Safari" --width 800 --height 600 --x 0 --y 0
jeriko window --fullscreen "Safari" # toggle fullscreen
```

**Output (JSON) -- list:**
```json
{
  "ok": true,
  "data": [
    {
      "app": "Safari",
      "title": "Apple",
      "position": { "x": 0, "y": 25 },
      "size": { "width": 1440, "height": 875 }
    }
  ]
}
```

**Output (JSON) -- apps:**
```json
{
  "ok": true,
  "data": ["Safari", "Terminal", "Finder", "Visual Studio Code"]
}
```

---

### jeriko open

Open URLs, files, directories, and applications. Supports specifying browser or application.

**Platform:** macOS, Linux (with `xdg-open`), Windows/WSL (with `start`)

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| (positional) | string | - | URL, file path, directory path, or app name |
| `--chrome` | boolean | `false` | Open URL in Google Chrome |
| `--with` | string | - | Open file with specific application |
| `--reveal` | boolean | `false` | Reveal in Finder (macOS) / file manager |

The special value `server` opens `http://localhost:3000`.

```bash
jeriko open https://example.com     # open URL in default browser
jeriko open https://example.com --chrome  # open in Chrome
jeriko open /path/to/file.pdf       # open file in default app
jeriko open /path/to/file --with "Visual Studio Code"
jeriko open /path/to/dir --reveal   # reveal in Finder
jeriko open Terminal                # launch app by name
jeriko open server                  # open http://localhost:3000
```

**Output (JSON):**
```json
{ "ok": true, "data": { "opened": "https://example.com" } }
```

---

### jeriko clipboard

Read from and write to the system clipboard.

**Platform:** macOS (`pbcopy`/`pbpaste`), Linux (`xclip`/`xsel`), Windows/WSL (`clip`/`powershell`)

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--get` | boolean | `true` | Read clipboard contents (default action) |
| `--set` | string | - | Write text to clipboard |

Accepts text for `--set` via the flag value or stdin.

```bash
jeriko clipboard                  # read clipboard (default)
jeriko clipboard --get            # same
jeriko clipboard --set "text"     # write to clipboard
echo "data" | jeriko clipboard --set
```

**Output (JSON) -- get:**
```json
{ "ok": true, "data": { "content": "copied text here" } }
```

**Output (JSON) -- set:**
```json
{ "ok": true, "data": { "written": true } }
```

---

## Communication

### jeriko notify

Send messages, photos, and documents to Telegram via Bot API. Reads `TELEGRAM_BOT_TOKEN` and `ADMIN_TELEGRAM_IDS` from `.env`. When stdin is JSON from another jeriko command, the `data` field is extracted and formatted automatically.

**Platform:** All

**Required env vars:** `TELEGRAM_BOT_TOKEN`, `ADMIN_TELEGRAM_IDS`

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--message` | string | - | Text message to send |
| `--photo` | string | - | Path to image file (use `-` for stdin) |
| `--caption` | string | - | Caption for photo |
| `--document` | string | - | Path to document file to send |

Accepts message text via stdin if no flags are provided.

```bash
jeriko notify --message "Hello from JerikoBot"
jeriko notify --photo /path/to/image.png
jeriko notify --photo /path/to/image.png --caption "Look at this"
jeriko notify --document /path/to/file.pdf
echo "Server is healthy" | jeriko notify
```

**Output (JSON):**
```json
{ "ok": true, "data": { "sent": true, "chatId": "123456789" } }
```

**Piping patterns:**
```bash
jeriko sys --info | jeriko notify                               # pipe system info
jeriko search "weather" | jeriko notify                         # search and notify
jeriko browse --screenshot "https://example.com" | jeriko notify --photo -  # screenshot and send
```

---

### jeriko email

Read emails via IMAP. Supports Gmail, Outlook, Yahoo, and custom IMAP servers. Run `jeriko email init` for interactive setup.

**Platform:** All

**Required env vars:** `IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASS` (set by `jeriko email init`)

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `init` | subcommand | - | Interactive IMAP setup wizard |
| `--unread` | boolean | `false` | Show unread emails only |
| `--search` | string | - | Search emails by keyword |
| `--from` | string | - | Filter by sender address |
| `--limit` | number | `10` | Max emails to return |

```bash
jeriko email init                 # interactive IMAP setup (Gmail, Outlook, Yahoo, custom)
jeriko email                      # latest 10 emails
jeriko email --unread             # unread only
jeriko email --search "invoice"   # search emails
jeriko email --from "boss@co.com" # from specific sender
jeriko email --limit 5            # limit results
```

**Output (JSON):**
```json
{
  "ok": true,
  "data": [
    {
      "from": "boss@company.com",
      "subject": "Q1 Report",
      "date": "2026-02-23T10:00:00Z",
      "snippet": "Please review the attached..."
    }
  ]
}
```

---

### jeriko mail

macOS Mail.app integration via AppleScript. Uses the local Mail.app directly -- no IMAP credentials needed. Supports reading, searching, replying, and sending emails.

**Platform:** macOS only

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--unread` | boolean | `false` | Get recent unread emails (newest first) |
| `--search` | string | - | Search emails by subject keyword |
| `--read` | string | - | Read full email by message ID |
| `--reply` | string | - | Reply to email by message ID |
| `--message` | string | - | Message body text (for --reply or --send) |
| `--send` | string | - | Compose and send to email address |
| `--subject` | string | `"No Subject"` | Subject line (for --send) |
| `--check-for` | string | - | Check for emails matching query in subject/sender (used by triggers) |
| `--limit` | number | `5` | Max results for --unread, --search, --check-for |

```bash
jeriko mail --unread                            # recent unread emails
jeriko mail --unread --limit 10                 # more results
jeriko mail --search "invoice"                  # search by subject
jeriko mail --read 12345                        # read full email by ID
jeriko mail --reply 12345 --message "Thanks!"   # reply to an email
jeriko mail --send "user@example.com" --subject "Hello" --message "Body text"
echo "Reply body" | jeriko mail --reply 12345   # reply via stdin
jeriko mail --check-for "alert"                 # trigger-compatible check
```

**Output (JSON) -- unread:**
```json
{
  "ok": true,
  "data": [
    { "id": "12345", "from": "sender@example.com", "subject": "Meeting Notes", "date": "Feb 23, 2026 10:00 AM" }
  ]
}
```

**Output (JSON) -- read:**
```json
{
  "ok": true,
  "data": {
    "from": "sender@example.com",
    "subject": "Meeting Notes",
    "date": "Feb 23, 2026 10:00 AM",
    "body": "Full email body text..."
  }
}
```

**Output (JSON) -- reply:**
```json
{ "ok": true, "data": { "replied": true, "messageId": "12345" } }
```

**Output (JSON) -- send:**
```json
{ "ok": true, "data": { "sent": true, "to": "user@example.com", "subject": "Hello" } }
```

---

### jeriko msg

Send and read iMessages.

**Platform:** macOS only

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--send` | string | - | Phone number or contact to send to |
| `--message` | string | - | Message text |
| `--read` | boolean | `false` | Read recent chat messages |
| `--limit` | number | `10` | Max messages to return |

```bash
jeriko msg --send "+1234567890" --message "hello"
jeriko msg --read                 # recent chats
jeriko msg --read --limit 5
```

**Output (JSON) -- send:**
```json
{ "ok": true, "data": { "sent": true, "to": "+1234567890" } }
```

**Output (JSON) -- read:**
```json
{
  "ok": true,
  "data": [
    { "from": "+1234567890", "text": "Hey there!", "date": "2026-02-23T14:30:00Z" }
  ]
}
```

---

## macOS Native

### jeriko notes

Apple Notes integration via AppleScript. Create, read, list, and search notes.

**Platform:** macOS only

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--list` | boolean | `false` | List all notes |
| `--search` | string | - | Search notes by title |
| `--read` | string | - | Read note content by title |
| `--create` | string | - | Create note with given title |
| `--body` | string | - | Note body content (with --create) |

Accepts body content via stdin when using `--create`.

```bash
jeriko notes --list               # list all notes
jeriko notes --search "meeting"   # search by title
jeriko notes --read "My Note"     # read note content
jeriko notes --create "Title" --body "content"
echo "content" | jeriko notes --create "Title"
```

**Output (JSON) -- list:**
```json
{
  "ok": true,
  "data": [
    { "name": "Shopping List", "folder": "Notes", "modified": "2026-02-23" }
  ]
}
```

**Output (JSON) -- read:**
```json
{ "ok": true, "data": { "title": "My Note", "body": "Note content here..." } }
```

---

### jeriko remind

Apple Reminders integration via AppleScript. Create, list, and complete reminders.

**Platform:** macOS only

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--list` | boolean | `true` | List incomplete reminders (default action) |
| `--lists` | boolean | `false` | List all reminder lists |
| `--create` | string | - | Create reminder with given title |
| `--due` | string | - | Due date (natural language, e.g., "tomorrow 9am") |
| `--complete` | string | - | Mark reminder as complete by title |

```bash
jeriko remind --list              # incomplete reminders
jeriko remind --lists             # list all reminder lists
jeriko remind --create "Buy milk" --due "tomorrow 9am"
jeriko remind --complete "Buy milk"
```

**Output (JSON) -- list:**
```json
{
  "ok": true,
  "data": [
    { "name": "Buy milk", "dueDate": "2026-02-24T09:00:00Z", "list": "Reminders" }
  ]
}
```

**Output (JSON) -- create:**
```json
{ "ok": true, "data": { "created": true, "name": "Buy milk", "due": "tomorrow 9am" } }
```

---

### jeriko calendar

Apple Calendar integration via AppleScript. View events, list calendars, and create new events.

**Platform:** macOS only

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--today` | boolean | `true` | Show today's events (default action) |
| `--week` | boolean | `false` | Show events for the next 7 days |
| `--calendars` | boolean | `false` | List all calendars |
| `--create` | string | - | Create event with given title |
| `--start` | string | - | Event start date/time (with --create) |
| `--end` | string | - | Event end date/time (with --create) |

```bash
jeriko calendar                   # today's events (default)
jeriko calendar --today           # same
jeriko calendar --week            # next 7 days
jeriko calendar --calendars       # list all calendars
jeriko calendar --create "Meeting" --start "Feb 24, 2026 2:00 PM" --end "Feb 24, 2026 3:00 PM"
```

**Output (JSON) -- today:**
```json
{
  "ok": true,
  "data": [
    {
      "title": "Team Standup",
      "start": "2026-02-23T09:00:00Z",
      "end": "2026-02-23T09:30:00Z",
      "calendar": "Work",
      "location": "Zoom"
    }
  ]
}
```

---

### jeriko contacts

Apple Contacts integration via AppleScript. Search and list contacts.

**Platform:** macOS only

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--search` | string | - | Search contacts by name |
| `--list` | boolean | `false` | List all contacts |
| `--limit` | number | `20` | Max contacts to return |

```bash
jeriko contacts --search "John"
jeriko contacts --list --limit 20
```

**Output (JSON):**
```json
{
  "ok": true,
  "data": [
    {
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "+1234567890"
    }
  ]
}
```

---

### jeriko music

Control Apple Music or Spotify. Play, pause, skip, and get current track info.

**Platform:** macOS only

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| (default) | - | - | Show current track (default action) |
| `--play` | boolean/string | `false` | Play/resume, or search and play a track by name |
| `--pause` | boolean | `false` | Pause playback |
| `--next` | boolean | `false` | Skip to next track |
| `--prev` | boolean | `false` | Go to previous track |
| `--spotify` | boolean | `false` | Use Spotify instead of Apple Music |

```bash
jeriko music                      # current track (default)
jeriko music --play               # play/resume
jeriko music --play "Bohemian Rhapsody"  # search and play
jeriko music --pause
jeriko music --next
jeriko music --prev
jeriko music --spotify --play     # use Spotify instead
```

**Output (JSON) -- current track:**
```json
{
  "ok": true,
  "data": {
    "track": "Bohemian Rhapsody",
    "artist": "Queen",
    "album": "A Night at the Opera",
    "state": "playing",
    "position": 42,
    "duration": 354
  }
}
```

---

### jeriko audio

Microphone recording, system volume control, and text-to-speech. Requires `ffmpeg` for recording (`brew install ffmpeg`).

**Platform:** macOS (full), Linux (partial -- volume/TTS may vary)

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--record` | number | - | Record from mic for N seconds |
| `--say` | string | - | Text-to-speech output |
| `--voice` | string | system default | TTS voice name (e.g., "Samantha", "Alex") |
| `--volume` | number/boolean | - | Get current volume (no value) or set to 0-100 |
| `--mute` | boolean | `false` | Mute system audio |
| `--unmute` | boolean | `false` | Unmute system audio |

```bash
jeriko audio --record 5           # record 5s from mic
jeriko audio --say "Hello world"  # text-to-speech
jeriko audio --say "Hi" --voice Samantha
jeriko audio --volume             # get current volume
jeriko audio --volume 50          # set volume to 50%
jeriko audio --mute
jeriko audio --unmute
```

**Output (JSON) -- record:**
```json
{ "ok": true, "data": { "path": "/tmp/recording-1708700000000.wav", "duration": 5 } }
```

**Output (JSON) -- volume:**
```json
{ "ok": true, "data": { "volume": 50 } }
```

---

## Media

### jeriko camera

Capture photos or record video from the webcam. Requires `ffmpeg` (`brew install ffmpeg`).

**Platform:** macOS, Linux (with V4L2)

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--photo` | boolean | `true` | Take a photo (default action) |
| `--video` | boolean | `false` | Record video |
| `--duration` | number | `5` | Video recording duration in seconds |

```bash
jeriko camera                     # take a photo (default)
jeriko camera --photo             # same
jeriko camera --video --duration 10  # record 10s video
```

**Output (JSON) -- photo:**
```json
{ "ok": true, "data": { "path": "/tmp/camera-1708700000000.jpg", "type": "photo" } }
```

**Output (JSON) -- video:**
```json
{ "ok": true, "data": { "path": "/tmp/camera-1708700000000.mp4", "type": "video", "duration": 10 } }
```

---

## Location

### jeriko location

IP-based geolocation lookup. Returns city, coordinates, ISP, and timezone.

**Platform:** All (requires internet)

No flags. Returns location data based on public IP.

```bash
jeriko location                   # city, coords, ISP, timezone
```

**Output (JSON):**
```json
{
  "ok": true,
  "data": {
    "ip": "203.0.113.42",
    "city": "San Francisco",
    "region": "California",
    "country": "US",
    "lat": 37.7749,
    "lon": -122.4194,
    "isp": "Comcast",
    "timezone": "America/Los_Angeles"
  }
}
```

---

## Payments & APIs

### jeriko stripe

Full Stripe integration via REST API. Manage customers, products, prices, payments, invoices, subscriptions, checkout sessions, payment links, balance, payouts, charges, refunds, events, and webhooks.

**Platform:** All

**Required env vars:** `STRIPE_SECRET_KEY` (set by `jeriko stripe init`)

#### Setup

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `init` | subcommand | - | Interactive setup wizard |
| `init --key` | string | - | Non-interactive setup with secret key |

```bash
jeriko stripe init                     # interactive setup wizard
jeriko stripe init --key sk_xxx        # non-interactive
```

#### Customers

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `customers list` | subcommand | - | List customers |
| `--limit` | number | `10` | Max results |
| `--email` | string | - | Filter by email |
| `customers create` | subcommand | - | Create a customer |
| `--name` | string | - | Customer name |
| `--email` | string | - | Customer email |
| `customers get` | subcommand | - | Get customer by ID |
| `--id` | string | - | Customer ID (cus_xxx) |
| `customers update` | subcommand | - | Update customer |
| `customers delete` | subcommand | - | Delete customer |

```bash
jeriko stripe customers list [--limit N] [--email user@example.com]
jeriko stripe customers create --name "John Doe" --email "john@example.com"
jeriko stripe customers get --id cus_xxx
jeriko stripe customers update --id cus_xxx --name "New Name"
jeriko stripe customers delete --id cus_xxx
```

#### Products & Prices

```bash
jeriko stripe products list
jeriko stripe products create --name "Pro Plan" --description "Monthly"
jeriko stripe prices list [--product prod_xxx]
jeriko stripe prices create --product prod_xxx --amount 2000 --currency usd [--interval month]
```

#### Payments

```bash
jeriko stripe payments list [--customer cus_xxx]
jeriko stripe payments create --amount 5000 --currency usd [--customer cus_xxx]
jeriko stripe payments confirm --id pi_xxx
jeriko stripe payments cancel --id pi_xxx
```

#### Invoices

```bash
jeriko stripe invoices list [--customer cus_xxx] [--status draft|open|paid]
jeriko stripe invoices create --customer cus_xxx [--days-until-due 30]
jeriko stripe invoices send --id inv_xxx
jeriko stripe invoices pay --id inv_xxx
jeriko stripe invoices finalize --id inv_xxx
```

#### Subscriptions

```bash
jeriko stripe subscriptions list [--customer cus_xxx]
jeriko stripe subscriptions create --customer cus_xxx --price price_xxx
jeriko stripe subscriptions cancel --id sub_xxx
```

#### Checkout & Payment Links

```bash
jeriko stripe checkout create --price price_xxx --success-url https://... --cancel-url https://...
jeriko stripe checkout create --amount 9900 --currency usd --name "License"
jeriko stripe links create --price price_xxx
jeriko stripe links list
```

#### Balance & Payouts

```bash
jeriko stripe balance
jeriko stripe balance transactions
jeriko stripe payouts list
jeriko stripe payouts create --amount 5000
```

#### Charges & Refunds

```bash
jeriko stripe charges list
jeriko stripe refunds create --charge ch_xxx [--amount 500]
```

#### Events & Webhooks

```bash
jeriko stripe events list [--type payment_intent.succeeded]
jeriko stripe webhooks list
jeriko stripe webhooks create --url https://example.com/hook --events "payment_intent.succeeded,invoice.paid"
```

**Output (JSON) -- customers list:**
```json
{
  "ok": true,
  "data": [
    { "id": "cus_abc123", "name": "John Doe", "email": "john@example.com", "created": 1708700000 }
  ]
}
```

**Output (JSON) -- balance:**
```json
{
  "ok": true,
  "data": {
    "available": [{ "amount": 50000, "currency": "usd" }],
    "pending": [{ "amount": 12000, "currency": "usd" }]
  }
}
```

---

### jeriko stripe-hook

Stripe webhook event formatter. Reads a `TRIGGER_EVENT` environment variable containing a Stripe webhook payload, formats it into a human-readable message, and sends it via `jeriko notify`. This is an internal command used by the trigger system, not typically invoked directly.

**Platform:** All

**Required env vars:** `TRIGGER_EVENT` (JSON webhook payload), `TELEGRAM_BOT_TOKEN`, `ADMIN_TELEGRAM_IDS`

**Supported event types:** `customer.created`, `customer.updated`, `customer.deleted`, `product.created`, `product.updated`, `price.created`, `payment_intent.created`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.succeeded`, `charge.failed`, `charge.refunded`, `invoice.created`, `invoice.paid`, `invoice.payment_failed`, `invoice.sent`, `subscription.created`, `subscription.updated`, `subscription.deleted`, `payout.paid`, `payout.failed`.

This command is typically wired into a webhook trigger:

```bash
# Usually configured as a trigger action, not called directly
TRIGGER_EVENT='{"body":{"type":"payment_intent.succeeded","data":{"object":{"amount":5000,"currency":"usd"}}}}' jeriko stripe-hook
```

---

### jeriko x

Full X.com (Twitter) API integration via OAuth 2.0 PKCE. Post tweets, search, view timelines, manage follows, send DMs, manage lists, and more.

**Platform:** All

**Required env vars:** `X_BEARER_TOKEN`, `X_CLIENT_ID` (set by `jeriko x init`); `X_ACCESS_TOKEN`, `X_REFRESH_TOKEN` (set by `jeriko x auth`)

#### Setup & Auth

```bash
jeriko x init                              # interactive setup wizard
jeriko x init --bearer-token xxx --client-id xxx  # non-interactive
jeriko x auth                              # login via browser (OAuth 2.0 PKCE)
jeriko x auth --status                     # show auth state
jeriko x auth --revoke                     # revoke tokens
```

#### Posts/Tweets

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `post` | subcommand | - | Create a tweet (text as positional arg) |
| `--reply` | string | - | Tweet ID to reply to |
| `--quote` | string | - | Tweet ID to quote |
| `delete` | subcommand | - | Delete a tweet by ID |

```bash
jeriko x post "Hello world"               # create tweet
jeriko x post --reply <tweet_id> "text"    # reply to tweet
jeriko x post --quote <tweet_id> "text"    # quote tweet
jeriko x delete <tweet_id>                 # delete tweet
```

#### Search

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `search` | subcommand | - | Search recent tweets (7-day window) |
| `--limit` | number | `10` | Max results |

```bash
jeriko x search "query"                    # search recent tweets (7 days)
jeriko x search "query" --limit 20
```

#### Timeline

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `timeline` | subcommand | - | Home timeline (default) |
| `--user` | string | - | Show specific user's tweets |
| `--mentions` | boolean | `false` | Show your mentions |
| `--limit` | number | `10` | Max results |

```bash
jeriko x timeline                          # home timeline
jeriko x timeline --user <handle>          # user's tweets
jeriko x timeline --mentions               # your mentions
jeriko x timeline --limit 5
```

#### Tweet Actions

```bash
jeriko x like <tweet_id>
jeriko x unlike <tweet_id>
jeriko x retweet <tweet_id>
jeriko x unretweet <tweet_id>
jeriko x bookmark <tweet_id>
jeriko x unbookmark <tweet_id>
```

#### Users

```bash
jeriko x me                                # authenticated user info
jeriko x user <handle>                     # lookup by @handle
jeriko x user --id <user_id>               # lookup by ID
```

#### Follows

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--limit` | number | `100` | Max results for followers/following |

```bash
jeriko x follow <handle>
jeriko x unfollow <handle>
jeriko x followers <handle> [--limit N]
jeriko x following <handle> [--limit N]
```

#### DMs

```bash
jeriko x dm <handle> "message"             # send DM
jeriko x dm --list                         # recent DM events
jeriko x dm --convo <id>                   # messages in conversation
```

#### Lists

```bash
jeriko x lists                             # my lists
jeriko x lists --create "name" [--description "text"] [--private]
jeriko x lists --delete <list_id>
jeriko x lists --add <list_id> <handle>    # add user to list
jeriko x lists --remove <list_id> <handle> # remove user from list
```

#### Mutes

```bash
jeriko x mute <handle>
jeriko x unmute <handle>
```

**Output (JSON) -- post:**
```json
{
  "ok": true,
  "data": { "id": "1234567890", "text": "Hello world" }
}
```

**Output (JSON) -- search:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "1234567890",
      "text": "Sample tweet about query",
      "author": "user123",
      "created_at": "2026-02-23T10:00:00Z"
    }
  ]
}
```

---

### jeriko twilio

Full Twilio Voice + SMS/MMS integration. Make calls, send texts, manage recordings, and view account info.

**Platform:** All

**Required env vars:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` (set by `jeriko twilio init`)

#### Setup

```bash
jeriko twilio init                                 # interactive 3-step wizard
jeriko twilio init --sid ACxxx --token xxx --phone +1xxx  # non-interactive
```

#### Make a Call

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `call` | subcommand | - | Call a phone number (positional) |
| `--say` | string | - | Text-to-speech message for the call |
| `--voice` | string | `woman` | TTS voice: `man`, `woman`, `alice` |
| `--play` | string | - | Audio URL to play during call |
| `--url` | string | - | TwiML URL for call handling |
| `--record` | boolean | `false` | Record the call |

```bash
jeriko twilio call +1234567890 --say "Hello world"     # text-to-speech call
jeriko twilio call +1234567890 --say "Hi" --voice man  # custom voice
jeriko twilio call +1234567890 --play https://example.com/audio.mp3  # play audio
jeriko twilio call +1234567890 --url https://handler.twiml.url       # TwiML URL
jeriko twilio call +1234567890 --say "Hi" --record     # call + record
```

#### List Calls

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `calls` | subcommand | - | List recent calls |
| `--limit` | number | `20` | Max results |
| `--status` | string | - | Filter by status (queued, ringing, in-progress, completed, failed, etc.) |
| `--to` | string | - | Filter by destination number |
| `--from` | string | - | Filter by source number |

```bash
jeriko twilio calls                                # recent calls (default: 20)
jeriko twilio calls --limit 5
jeriko twilio calls --status completed
jeriko twilio calls --to +1234567890
jeriko twilio calls --from +1234567890
```

#### Call Management

```bash
jeriko twilio call-status CA_SID                   # get call details
jeriko twilio hangup CA_SID                        # end an active call
jeriko twilio delete CA_SID                        # delete call record
```

#### SMS / MMS

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `sms` | subcommand | - | Send SMS/MMS to phone number |
| `--media` | string | - | Media URL for MMS (image) |

```bash
jeriko twilio sms +1234567890 "Hello from JerikoBot"   # send SMS
jeriko twilio sms +1234567890 --media https://example.com/image.png  # send MMS (image only)
jeriko twilio sms +1234567890 "Check this out" --media https://example.com/img.jpg  # SMS + MMS
```

#### List Messages

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `messages` | subcommand | - | List recent messages |
| `--limit` | number | `20` | Max results |
| `--to` | string | - | Filter by destination number |
| `--from` | string | - | Filter by source number |

```bash
jeriko twilio messages                             # recent messages (default: 20)
jeriko twilio messages --limit 5
jeriko twilio messages --to +1234567890
jeriko twilio messages --from +1234567890
```

#### Message Management

```bash
jeriko twilio message-status SM_SID                # get message details
jeriko twilio delete-message SM_SID                # delete message record
```

#### Recordings

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `recordings` | subcommand | - | List all recordings |
| `--call` | string | - | Filter recordings by call SID |
| `--limit` | number | `20` | Max results |
| `recording` | subcommand | - | Get recording details by SID |
| `--delete` | boolean | `false` | Delete the recording |

```bash
jeriko twilio recordings                           # list all recordings
jeriko twilio recordings --call CA_SID             # recordings for a call
jeriko twilio recordings --limit 5
jeriko twilio recording RE_SID                     # get recording details
jeriko twilio recording RE_SID --delete            # delete a recording
```

#### Account & Numbers

```bash
jeriko twilio account                              # name, status, balance
jeriko twilio numbers                              # list owned phone numbers
jeriko twilio numbers --limit 5
```

**Output (JSON) -- sms:**
```json
{
  "ok": true,
  "data": { "sid": "SM_xxx", "to": "+1234567890", "status": "queued" }
}
```

**Output (JSON) -- account:**
```json
{
  "ok": true,
  "data": {
    "name": "My Account",
    "status": "active",
    "balance": "42.50",
    "currency": "USD"
  }
}
```

---

## Server

### jeriko server

Server lifecycle management. Starts the Express + WebSocket + Telegram + WhatsApp server in the foreground or as a background daemon.

**Platform:** All

**Required env vars:** `NODE_AUTH_SECRET` (required), `TELEGRAM_BOT_TOKEN` (optional), `ADMIN_TELEGRAM_IDS` (optional)

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| (default) | - | - | Start server in foreground |
| `--start` | boolean | `false` | Start server in background (daemonized) |
| `--stop` | boolean | `false` | Stop the running server |
| `--restart` | boolean | `false` | Restart the server |
| `--status` | boolean | `false` | Check if server is running (PID, port) |

```bash
jeriko server                       # start server (default, foreground)
jeriko server --start               # start in background (daemonized)
jeriko server --stop                # stop the server
jeriko server --restart             # restart
jeriko server --status              # check if running (PID, port)
```

**Output (JSON) -- status:**
```json
{
  "ok": true,
  "data": { "running": true, "pid": 12345, "port": 3000 }
}
```

---

### jeriko chat

Interactive AI chat REPL. Presents a terminal UI with banner, spinner, and step-by-step tool call visualization. Uses the AI backend configured in `.env` (`AI_BACKEND`). Supports slash commands within the REPL.

**Platform:** All

| Slash Command | Description |
|---------------|-------------|
| `/help` | Show available jeriko commands |
| `/commands` | List all discovered commands |
| `/memory` | Show recent session memory |
| `/clear` | Clear screen and redraw banner |
| `/exit`, `/quit` | Exit the REPL |

```bash
jeriko chat                        # launch interactive chat
jeriko                             # same (dispatcher defaults to chat)
```

The chat REPL streams AI responses, shows tool calls as numbered steps, and displays execution time.

---

## Plugins

### jeriko install

Install and manage third-party plugins from npm or local paths. Plugins are untrusted by default.

**Platform:** All

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| (positional) | string | - | Package name, name@version, or local path |
| `--upgrade` | string | - | Upgrade installed plugin to latest version |
| `--list` | boolean | `false` | List installed plugins with trust status |
| `--info` | string | - | Show plugin details |

```bash
jeriko install jeriko-weather          # install from npm (untrusted by default)
jeriko install jeriko-weather@2.1.0    # specific version
jeriko install ./my-plugin             # install from local path (dev mode)
jeriko install --upgrade jeriko-weather # upgrade to latest
jeriko install --list                  # list installed plugins with trust status
jeriko install --info jeriko-weather   # show plugin details
```

**Output (JSON) -- install:**
```json
{
  "ok": true,
  "data": { "plugin": "jeriko-weather", "version": "1.0.0", "trusted": false }
}
```

**Output (JSON) -- list:**
```json
{
  "ok": true,
  "data": [
    { "name": "jeriko-weather", "version": "1.0.0", "trusted": false, "commands": ["weather"] }
  ]
}
```

---

### jeriko uninstall

Remove installed plugins. Removes the plugin directory and registry entry.

**Platform:** All

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| (positional) | string | - | Plugin name to uninstall |

```bash
jeriko uninstall jeriko-weather
```

**Output (JSON):**
```json
{ "ok": true, "data": { "removed": "jeriko-weather" } }
```

---

### jeriko trust

Manage plugin trust. Untrusted plugins can run commands but cannot register webhooks or inject AI prompts via `PROMPT.md`. Trust enables full plugin features.

**Platform:** All

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| (positional) | string | - | Plugin name to trust |
| `--yes` | boolean | `false` | Confirm trust without prompting |
| `--revoke` | string | - | Revoke trust for a plugin |
| `--list` | boolean | `false` | Show all plugins with trust status |
| `--audit` | boolean | `false` | Show security audit log |
| `--limit` | number | `50` | Max audit log entries |

```bash
jeriko trust jeriko-weather --yes      # trust (enables webhooks + prompts)
jeriko trust --revoke jeriko-weather   # revoke trust
jeriko trust --list                    # show all plugins with trust status
jeriko trust --audit                   # show security audit log
jeriko trust --audit --limit 100
```

**Output (JSON) -- trust:**
```json
{ "ok": true, "data": { "plugin": "jeriko-weather", "trusted": true } }
```

**Output (JSON) -- audit:**
```json
{
  "ok": true,
  "data": [
    {
      "timestamp": "2026-02-23T14:30:00Z",
      "action": "trust_granted",
      "plugin": "jeriko-weather"
    }
  ]
}
```

---

### jeriko plugin

Validate and test plugins during development. Checks manifest structure, file existence, and output contract compliance.

**Platform:** All

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `validate` | subcommand | - | Validate plugin manifest and files |
| `test` | subcommand | - | Run plugin commands and verify output format |
| (positional) | string | - | Path to plugin directory |

```bash
jeriko plugin validate ./my-plugin     # validate manifest, check files, verify contract
jeriko plugin test ./my-plugin         # run commands and verify output format
```

**Output (JSON) -- validate:**
```json
{
  "ok": true,
  "data": {
    "valid": true,
    "manifest": true,
    "binaries": true,
    "commands": ["weather", "forecast"]
  }
}
```

---

### jeriko discover

Auto-discover installed commands and generate system prompts for any AI. Reads `CLAUDE.md` for core command documentation and includes trusted plugin prompts.

**Platform:** All

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--list` | boolean | `false` | List available commands with source (core vs. plugin) |
| `--json` | boolean | `false` | Structured command metadata (bin paths, sources) |
| `--raw` | boolean | `false` | Raw text prompt (for piping to AI) |
| `--name` | string | `"JerikoBot"` | Custom bot name in generated prompt |

```bash
jeriko discover                   # generate system prompt (JSON)
jeriko discover --format raw      # raw text prompt (for piping to AI)
jeriko discover --list            # list available commands
jeriko discover --json            # structured command metadata
jeriko discover --name "MyBot"    # custom bot name in prompt
```

**Output (JSON) -- list:**
```json
{
  "ok": true,
  "data": [
    { "name": "sys", "source": "core" },
    { "name": "weather", "source": "jeriko-weather", "trusted": true }
  ]
}
```

---

## Setup & Memory

### jeriko init

First-run onboarding wizard. 6-step interactive setup: AI backend, Telegram, security, tunnel, server, and verification. Also supports non-interactive mode for automation.

**Platform:** All

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--ai` | string | - | AI backend: `claude`, `openai`, or `local` |
| `--yes` | boolean | `false` | Accept defaults without prompting |
| `--skip-ai` | boolean | `false` | Skip AI backend configuration |
| `--skip-telegram` | boolean | `false` | Skip Telegram bot setup |
| `--local-url` | string | - | Local model API URL (with `--ai local`) |
| `--local-model` | string | - | Local model name (with `--ai local`) |

```bash
jeriko init                            # interactive 6-step wizard
jeriko init --ai claude --yes          # non-interactive
jeriko init --skip-ai --skip-telegram  # minimal setup
jeriko init --ai local --local-url http://localhost:11434/v1 --local-model llama3.2 --yes
```

Third-party services have their own init wizards:

```bash
jeriko stripe init                     # Stripe payments
jeriko x init                          # X.com (Twitter)
jeriko twilio init                     # Twilio Voice + SMS
jeriko email init                      # Email (IMAP)
```

---

### jeriko memory

Session memory for persistent context across AI interactions. Provides a JSONL session log and a key-value store. Used by the AI router to inject context into prompts.

**Platform:** All

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| (default) | - | - | Show recent session entries (default: 20) |
| `--recent` | number | `20` | Number of recent session entries to show |
| `--search` | string | - | Search session memory by keyword |
| `--set` | string | - | Store a key in the key-value store |
| `--value` | string | - | Value for the key (with --set) |
| `--get` | string | - | Retrieve a key from the key-value store |
| `--context` | boolean | `false` | Get formatted context block for system prompts |
| `--log` | boolean | `false` | Log a new session entry |
| `--command` | string | - | Command string for log entry (with --log) |
| `--result` | string | - | Result JSON for log entry (with --log) |
| `--clear` | boolean | `false` | Clear the session log |

```bash
jeriko memory                     # recent session history (default: 20)
jeriko memory --recent 50         # last 50 entries
jeriko memory --search "deploy"   # search memory
jeriko memory --set "key" --value "val"  # store key-value
jeriko memory --get "key"         # retrieve key-value
jeriko memory --context           # get context block for system prompt
jeriko memory --log --command "jeriko sys" --result '{"ok":true}'  # log entry
jeriko memory --clear             # clear session log
```

**Output (JSON) -- recent:**
```json
{
  "ok": true,
  "data": [
    {
      "timestamp": "2026-02-23T14:30:00Z",
      "command": "jeriko sys --info",
      "result": "ok"
    }
  ]
}
```

**Output (JSON) -- get:**
```json
{ "ok": true, "data": { "key": "deploy_target", "value": "production" } }
```

---

## Piping Patterns

JerikoBot commands are designed for Unix-style composition. JSON flows naturally between commands.

```bash
# Pipe system info to Telegram
jeriko sys --info | jeriko notify

# Search and notify
jeriko search "weather" | jeriko notify

# Screenshot and send via Telegram
jeriko browse --screenshot "https://example.com" | jeriko notify --photo -

# Chain with &&
jeriko browse --navigate "https://example.com" --screenshot && jeriko notify --message "Done"

# Read file and send
jeriko fs --cat config.json | jeriko notify

# Copy command output to clipboard
jeriko sys --info --format text | jeriko clipboard --set

# Record and notify
jeriko audio --record 10 && jeriko notify --message "Recording saved"
```

---

## Local Model Configuration

JerikoBot can run entirely offline using local LLMs. Set `AI_BACKEND=local` in `.env`.

```bash
# .env configuration
AI_BACKEND=local
LOCAL_MODEL_URL=http://localhost:11434/v1   # Ollama default
LOCAL_MODEL=llama3.2                        # model name
# LOCAL_API_KEY=                            # optional, for secured endpoints
```

| Runtime | Default URL | Notes |
|---------|------------|-------|
| Ollama | `http://localhost:11434/v1` | Most popular, auto-detected by `jeriko init` |
| LM Studio | `http://localhost:1234/v1` | GUI-based, easy setup |
| vLLM | `http://localhost:8000/v1` | Production-grade serving |
| llama.cpp server | `http://localhost:8080/v1` | Lightweight C++ |
| Any OpenAI-compatible | Custom URL | Just set `LOCAL_MODEL_URL` |

The local backend uses the OpenAI-compatible `/v1/chat/completions` endpoint with `stream: false`. The model receives the same system prompt (auto-generated via `jeriko discover`) and bash tool definition.

---

## Command Summary

| # | Command | Category | Platform | Description |
|---|---------|----------|----------|-------------|
| 1 | `jeriko` | Dispatcher | All | Command dispatcher, launches chat if no args |
| 2 | `jeriko sys` | System | All | System information (OS, CPU, memory, disk) |
| 3 | `jeriko proc` | System | All | Process management (list, kill, find, start) |
| 4 | `jeriko net` | System | All | Network utilities (ping, DNS, curl, download) |
| 5 | `jeriko exec` | System | All | Run shell commands |
| 6 | `jeriko fs` | Files | All | File operations (ls, cat, write, find, grep) |
| 7 | `jeriko browse` | Browser | All | Browser automation via Playwright |
| 8 | `jeriko search` | Search | All | Web search via DuckDuckGo |
| 9 | `jeriko screenshot` | Desktop | macOS/Linux | Desktop screenshot capture |
| 10 | `jeriko window` | Desktop | macOS | Window and app management |
| 11 | `jeriko open` | Desktop | All | Open URLs, files, and apps |
| 12 | `jeriko clipboard` | Desktop | All | System clipboard read/write |
| 13 | `jeriko notify` | Communication | All | Telegram notifications |
| 14 | `jeriko email` | Communication | All | Read emails via IMAP |
| 15 | `jeriko mail` | Communication | macOS | Apple Mail.app integration |
| 16 | `jeriko msg` | Communication | macOS | iMessage send/read |
| 17 | `jeriko notes` | macOS Native | macOS | Apple Notes |
| 18 | `jeriko remind` | macOS Native | macOS | Apple Reminders |
| 19 | `jeriko calendar` | macOS Native | macOS | Apple Calendar |
| 20 | `jeriko contacts` | macOS Native | macOS | Apple Contacts |
| 21 | `jeriko music` | macOS Native | macOS | Apple Music / Spotify control |
| 22 | `jeriko audio` | macOS Native | macOS/Linux | Mic, volume, TTS |
| 23 | `jeriko camera` | Media | macOS/Linux | Webcam photo/video |
| 24 | `jeriko location` | Location | All | IP-based geolocation |
| 25 | `jeriko stripe` | Payments & APIs | All | Stripe payments integration |
| 26 | `jeriko stripe-hook` | Payments & APIs | All | Stripe webhook event formatter |
| 27 | `jeriko x` | Payments & APIs | All | X.com (Twitter) integration |
| 28 | `jeriko twilio` | Payments & APIs | All | Twilio Voice + SMS/MMS |
| 29 | `jeriko server` | Server | All | Server lifecycle management |
| 30 | `jeriko chat` | Server | All | Interactive AI chat REPL |
| 31 | `jeriko install` | Plugins | All | Install third-party plugins |
| 32 | `jeriko uninstall` | Plugins | All | Remove plugins |
| 33 | `jeriko trust` | Plugins | All | Plugin trust management |
| 34 | `jeriko plugin` | Plugins | All | Plugin validate/test |
| 35 | `jeriko discover` | Plugins | All | Auto-discover commands, generate AI prompts |
| 36 | `jeriko init` | Setup | All | First-run onboarding wizard |
| 37 | `jeriko memory` | Setup | All | Session memory and key-value store |
