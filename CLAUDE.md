# JerikoBot — CLI Reference

All `jeriko` commands support 3 output formats via the global `--format` flag:

```bash
jeriko --format json sys --info    # JSON (default): {"ok":true,"data":{...}}
jeriko --format text sys --info    # AI-optimized:   key=value key2=value2
jeriko --format logfmt sys --info  # Structured log: ok=true key=value
jeriko sys --info --format text    # --format also works after the command
```

**Default (JSON)**: Machine-parseable, used for piping between commands.
**Text**: Minimal tokens, instant AI comprehension — use when reading results.
**Logfmt**: Key=value log format, greppable.

Errors: JSON `{"ok":false,"error":"..."}` / Text `error <message>` / Logfmt `ok=false error="..."`

## Exit Codes

| Code | Meaning    |
|------|------------|
| 0    | Success    |
| 1    | General    |
| 2    | Network    |
| 3    | Auth       |
| 5    | Not found  |
| 7    | Timeout    |

## Commands

### jeriko sys
System information.

```bash
jeriko sys                        # full system info (default)
jeriko sys --info                 # same as above
jeriko sys --processes --limit 5  # top 5 processes by CPU
jeriko sys --network              # network interfaces + traffic
jeriko sys --battery              # battery status
```

### jeriko screenshot
Desktop screenshot. Emits `SCREENSHOT:<path>` to stderr.

```bash
jeriko screenshot                 # capture primary display
jeriko screenshot --list          # list available displays
jeriko screenshot --display 1     # capture specific display
```

### jeriko search
Web search via DuckDuckGo.

```bash
jeriko search "Node.js streams"
echo "weather today" | jeriko search
```

### jeriko exec
Run a shell command.

```bash
jeriko exec ls -la
jeriko exec --timeout 5000 "sleep 10"   # timeout in ms (default: 30000)
jeriko exec --cwd /tmp "pwd"
echo "uptime" | jeriko exec
```

### jeriko fs
File operations.

```bash
jeriko fs --ls .                       # list directory
jeriko fs --cat package.json           # read file
echo "hello" | jeriko fs --write /tmp/test.txt  # write stdin to file
echo "more" | jeriko fs --write /tmp/test.txt --append  # append
jeriko fs --find . "*.js"              # find files by name
jeriko fs --grep . "TODO" --glob "*.js"  # search file contents
jeriko fs --info package.json          # file metadata
```

### jeriko browse
Browser automation (Playwright). Each invocation is a fresh browser.
Combine multiple flags in one call to share browser state.

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

Screenshots emit `SCREENSHOT:<path>` to stderr.

**Limitation:** Two separate `jeriko browse` calls do NOT share browser state. Use multiple flags in one call instead.

### jeriko notify
Send messages to Telegram via Bot API. Reads `TELEGRAM_BOT_TOKEN` and `ADMIN_TELEGRAM_IDS` from `.env`.

```bash
jeriko notify --message "Hello from JerikoBot"
jeriko notify --photo /path/to/image.png
jeriko notify --photo /path/to/image.png --caption "Look at this"
jeriko notify --document /path/to/file.pdf
echo "Server is healthy" | jeriko notify
```

When stdin is JSON from another jeriko command, the `data` field is extracted and formatted.

### jeriko camera
Webcam photo/video. Requires `ffmpeg` (`brew install ffmpeg`).

```bash
jeriko camera                     # take a photo (default)
jeriko camera --photo             # same
jeriko camera --video --duration 10  # record 10s video
```

### jeriko email
Read emails via IMAP. Run `jeriko email init` to set up.

```bash
jeriko email init                 # interactive IMAP setup (Gmail, Outlook, Yahoo, custom)
jeriko email                      # latest 10 emails
jeriko email --unread             # unread only
jeriko email --search "invoice"   # search emails
jeriko email --from "boss@co.com" # from specific sender
jeriko email --limit 5            # limit results
```

### jeriko notes
Apple Notes.

```bash
jeriko notes --list               # list all notes
jeriko notes --search "meeting"   # search by title
jeriko notes --read "My Note"     # read note content
jeriko notes --create "Title" --body "content"
echo "content" | jeriko notes --create "Title"
```

### jeriko remind
Apple Reminders.

```bash
jeriko remind --list              # incomplete reminders
jeriko remind --lists             # list all reminder lists
jeriko remind --create "Buy milk" --due "tomorrow 9am"
jeriko remind --complete "Buy milk"
```

### jeriko calendar
Apple Calendar.

```bash
jeriko calendar                   # today's events (default)
jeriko calendar --today           # same
jeriko calendar --week            # next 7 days
jeriko calendar --calendars       # list all calendars
jeriko calendar --create "Meeting" --start "Feb 24, 2026 2:00 PM" --end "Feb 24, 2026 3:00 PM"
```

### jeriko contacts
Apple Contacts.

```bash
jeriko contacts --search "John"
jeriko contacts --list --limit 20
```

### jeriko clipboard
System clipboard.

```bash
jeriko clipboard                  # read clipboard (default)
jeriko clipboard --get            # same
jeriko clipboard --set "text"     # write to clipboard
echo "data" | jeriko clipboard --set
```

### jeriko audio
Microphone, volume, text-to-speech. Requires `ffmpeg` for recording.

```bash
jeriko audio --record 5           # record 5s from mic
jeriko audio --say "Hello world"  # text-to-speech
jeriko audio --say "Hi" --voice Samantha
jeriko audio --volume             # get current volume
jeriko audio --volume 50          # set volume to 50%
jeriko audio --mute
jeriko audio --unmute
```

### jeriko music
Control Apple Music or Spotify.

```bash
jeriko music                      # current track (default)
jeriko music --play               # play/resume
jeriko music --play "Bohemian Rhapsody"  # search and play
jeriko music --pause
jeriko music --next
jeriko music --prev
jeriko music --spotify --play     # use Spotify instead
```

### jeriko msg
iMessage.

```bash
jeriko msg --send "+1234567890" --message "hello"
jeriko msg --read                 # recent chats
jeriko msg --read --limit 5
```

### jeriko location
IP-based geolocation.

```bash
jeriko location                   # city, coords, ISP, timezone
```

### jeriko discover
Auto-discover installed commands and generate system prompts for any AI.

```bash
jeriko discover                   # generate system prompt (JSON)
jeriko discover --format raw      # raw text prompt (for piping to AI)
jeriko discover --list            # list available commands
jeriko discover --json            # structured command metadata
jeriko discover --name "MyBot"    # custom bot name in prompt
```

### jeriko memory
Session memory for persistent context across AI interactions.

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

### jeriko window
macOS window and app management via AppleScript.

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

### jeriko proc
Process management.

```bash
jeriko proc                         # top 15 processes by CPU (default)
jeriko proc --list --limit 10       # top 10 processes
jeriko proc --kill 12345            # kill process by PID
jeriko proc --kill 12345 --signal KILL  # force kill
jeriko proc --kill-name "node"      # kill by name pattern
jeriko proc --find "python"         # find processes by name
jeriko proc --start "sleep 999"     # run in background, returns PID
```

### jeriko net
Network utilities.

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

### jeriko server
Server lifecycle management.

```bash
jeriko server                       # start server (default)
jeriko server --start               # start in background (daemonized)
jeriko server --stop                # stop the server
jeriko server --restart             # restart
jeriko server --status              # check if running (PID, port)
```

### jeriko open
Open URLs, files, and apps.

```bash
jeriko open https://example.com     # open URL in default browser
jeriko open https://example.com --chrome  # open in Chrome
jeriko open /path/to/file.pdf       # open file in default app
jeriko open /path/to/file --with "Visual Studio Code"
jeriko open /path/to/dir --reveal   # reveal in Finder
jeriko open Terminal                # launch app by name
jeriko open server                  # open http://localhost:3000
```

### jeriko stripe
Full Stripe integration via REST API. Run `jeriko stripe init` to set up.

```bash
# Setup
jeriko stripe init                     # interactive setup wizard
jeriko stripe init --key sk_xxx        # non-interactive

# Customers
jeriko stripe customers list [--limit N] [--email user@example.com]
jeriko stripe customers create --name "John Doe" --email "john@example.com"
jeriko stripe customers get --id cus_xxx
jeriko stripe customers update --id cus_xxx --name "New Name"
jeriko stripe customers delete --id cus_xxx

# Products & Prices
jeriko stripe products list
jeriko stripe products create --name "Pro Plan" --description "Monthly"
jeriko stripe prices list [--product prod_xxx]
jeriko stripe prices create --product prod_xxx --amount 2000 --currency usd [--interval month]

# Payments
jeriko stripe payments list [--customer cus_xxx]
jeriko stripe payments create --amount 5000 --currency usd [--customer cus_xxx]
jeriko stripe payments confirm --id pi_xxx
jeriko stripe payments cancel --id pi_xxx

# Invoices
jeriko stripe invoices list [--customer cus_xxx] [--status draft|open|paid]
jeriko stripe invoices create --customer cus_xxx [--days-until-due 30]
jeriko stripe invoices send --id inv_xxx
jeriko stripe invoices pay --id inv_xxx
jeriko stripe invoices finalize --id inv_xxx

# Subscriptions
jeriko stripe subscriptions list [--customer cus_xxx]
jeriko stripe subscriptions create --customer cus_xxx --price price_xxx
jeriko stripe subscriptions cancel --id sub_xxx

# Checkout & Payment Links
jeriko stripe checkout create --price price_xxx --success-url https://... --cancel-url https://...
jeriko stripe checkout create --amount 9900 --currency usd --name "License"
jeriko stripe links create --price price_xxx
jeriko stripe links list

# Balance & Payouts
jeriko stripe balance
jeriko stripe balance transactions
jeriko stripe payouts list
jeriko stripe payouts create --amount 5000

# Charges & Refunds
jeriko stripe charges list
jeriko stripe refunds create --charge ch_xxx [--amount 500]

# Events & Webhooks
jeriko stripe events list [--type payment_intent.succeeded]
jeriko stripe webhooks list
jeriko stripe webhooks create --url https://example.com/hook --events "payment_intent.succeeded,invoice.paid"
```

### jeriko x
Full X.com (Twitter) API integration. Run `jeriko x init` to set up.

```bash
# Setup
jeriko x init                              # interactive setup wizard
jeriko x init --bearer-token xxx --client-id xxx  # non-interactive

# Auth (OAuth 2.0 PKCE)
jeriko x auth                              # login via browser
jeriko x auth --status                     # show auth state
jeriko x auth --revoke                     # revoke tokens

# Posts/Tweets
jeriko x post "Hello world"               # create tweet
jeriko x post --reply <tweet_id> "text"    # reply to tweet
jeriko x post --quote <tweet_id> "text"    # quote tweet
jeriko x delete <tweet_id>                 # delete tweet

# Search
jeriko x search "query"                    # search recent tweets (7 days)
jeriko x search "query" --limit 20

# Timeline
jeriko x timeline                          # home timeline
jeriko x timeline --user <handle>          # user's tweets
jeriko x timeline --mentions               # your mentions
jeriko x timeline --limit 5

# Tweet Actions
jeriko x like <tweet_id>
jeriko x unlike <tweet_id>
jeriko x retweet <tweet_id>
jeriko x unretweet <tweet_id>
jeriko x bookmark <tweet_id>
jeriko x unbookmark <tweet_id>

# Users
jeriko x me                                # authenticated user info
jeriko x user <handle>                     # lookup by @handle
jeriko x user --id <user_id>               # lookup by ID

# Follows
jeriko x follow <handle>
jeriko x unfollow <handle>
jeriko x followers <handle> [--limit N]
jeriko x following <handle> [--limit N]

# DMs
jeriko x dm <handle> "message"             # send DM
jeriko x dm --list                         # recent DM events
jeriko x dm --convo <id>                   # messages in conversation

# Lists
jeriko x lists                             # my lists
jeriko x lists --create "name" [--description "text"] [--private]
jeriko x lists --delete <list_id>
jeriko x lists --add <list_id> <handle>    # add user to list
jeriko x lists --remove <list_id> <handle> # remove user from list

# Mutes
jeriko x mute <handle>
jeriko x unmute <handle>
```

### jeriko twilio
Full Twilio Voice + SMS/MMS integration. Run `jeriko twilio init` to set up.

```bash
# Setup
jeriko twilio init                                 # interactive 3-step wizard
jeriko twilio init --sid ACxxx --token xxx --phone +1xxx  # non-interactive

# Make a call
jeriko twilio call +1234567890 --say "Hello world"     # text-to-speech call
jeriko twilio call +1234567890 --say "Hi" --voice man  # custom voice
jeriko twilio call +1234567890 --play https://example.com/audio.mp3  # play audio
jeriko twilio call +1234567890 --url https://handler.twiml.url       # TwiML URL
jeriko twilio call +1234567890 --say "Hi" --record     # call + record

# List calls
jeriko twilio calls                                # recent calls (default: 20)
jeriko twilio calls --limit 5
jeriko twilio calls --status completed
jeriko twilio calls --to +1234567890
jeriko twilio calls --from +1234567890

# Call details / management
jeriko twilio call-status CA_SID                   # get call details
jeriko twilio hangup CA_SID                        # end an active call
jeriko twilio delete CA_SID                        # delete call record

# SMS / MMS
jeriko twilio sms +1234567890 "Hello from JerikoBot"   # send SMS
jeriko twilio sms +1234567890 --media https://example.com/image.png  # send MMS (image only)
jeriko twilio sms +1234567890 "Check this out" --media https://example.com/img.jpg  # SMS + MMS

# List messages
jeriko twilio messages                             # recent messages (default: 20)
jeriko twilio messages --limit 5
jeriko twilio messages --to +1234567890
jeriko twilio messages --from +1234567890

# Message details / management
jeriko twilio message-status SM_SID                # get message details
jeriko twilio delete-message SM_SID                # delete message record

# Recordings
jeriko twilio recordings                           # list all recordings
jeriko twilio recordings --call CA_SID             # recordings for a call
jeriko twilio recordings --limit 5
jeriko twilio recording RE_SID                     # get recording details
jeriko twilio recording RE_SID --delete            # delete a recording

# Account & numbers
jeriko twilio account                              # name, status, balance
jeriko twilio numbers                              # list owned phone numbers
jeriko twilio numbers --limit 5
```

## Piping Patterns

```bash
# Pipe system info to Telegram
jeriko sys --info | jeriko notify

# Search and notify
jeriko search "weather" | jeriko notify

# Screenshot and send
jeriko browse --screenshot "https://example.com" | jeriko notify --photo -

# Chain with &&
jeriko browse --navigate "https://example.com" --screenshot && jeriko notify --message "Done"
```

### jeriko install
Install and manage third-party plugins.

```bash
jeriko install jeriko-weather          # install from npm (untrusted by default)
jeriko install jeriko-weather@2.1.0    # specific version
jeriko install ./my-plugin             # install from local path (dev mode)
jeriko install --upgrade jeriko-weather # upgrade to latest
jeriko install --list                  # list installed plugins with trust status
jeriko install --info jeriko-weather   # show plugin details
```

### jeriko uninstall
Remove installed plugins.

```bash
jeriko uninstall jeriko-weather
```

### jeriko trust
Manage plugin trust. Untrusted plugins can run commands but cannot register webhooks or inject AI prompts.

```bash
jeriko trust jeriko-weather --yes      # trust (enables webhooks + prompts)
jeriko trust --revoke jeriko-weather   # revoke trust
jeriko trust --list                    # show all plugins with trust status
jeriko trust --audit                   # show security audit log
jeriko trust --audit --limit 100
```

### jeriko plugin
Validate and test plugins.

```bash
jeriko plugin validate ./my-plugin     # validate manifest, check files, verify contract
jeriko plugin test ./my-plugin         # run commands and verify output format
```

### jeriko init
First-run onboarding. 6-step interactive wizard: AI backend, Telegram, security, tunnel, server, verify.

```bash
jeriko init                            # interactive 6-step wizard
jeriko init --ai claude --yes          # non-interactive
jeriko init --skip-ai --skip-telegram  # minimal setup

# Third-party service setup (each has its own init wizard):
jeriko stripe init                     # Stripe payments
jeriko x init                          # X.com (Twitter)
jeriko email init                      # Email (IMAP)
```

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

**Setup:**
```bash
# Option 1: Interactive wizard (auto-detects Ollama, lists models)
jeriko init

# Option 2: Non-interactive
jeriko init --ai local --local-url http://localhost:11434/v1 --local-model llama3.2 --yes

# Option 3: Manual .env edit
echo "AI_BACKEND=local" >> .env
echo "LOCAL_MODEL=llama3.2" >> .env
```

**How it works:** The local backend uses the OpenAI-compatible `/v1/chat/completions` endpoint with `stream: false`. The model receives the same system prompt (auto-generated via `jeriko discover`) and bash tool definition. No streaming avoids the Ollama tool_calls streaming bug.

## Plugins

Third-party commands installed to `~/.jeriko/plugins/`.
Each plugin provides: commands (`bin/`), manifest (`jeriko-plugin.json`),
AI prompt (`PROMPT.md`), and command docs (`COMMANDS.md`).

Security: plugins are untrusted by default. Untrusted plugins can run commands
but cannot register webhooks or inject `PROMPT.md` into the AI system prompt.
Use `jeriko trust <plugin> --yes` to enable full features after reviewing permissions.

Env isolation: plugin commands only see their declared env vars + safe system vars.
They cannot access `STRIPE_SECRET_KEY` unless they declare it in their manifest.

```bash
jeriko install <npm-package>           # install
jeriko trust <plugin> --yes            # review permissions + trust
jeriko plugin validate ./my-plugin     # validate before publishing
```

## Architecture

- `lib/cli.js` — shared arg parsing, JSON output, stdin reader, .env loader
- `lib/plugins.js` — plugin SDK (registry, trust, env isolation, audit, integrity)
- `bin/jeriko` — dispatcher: core `bin/jeriko-<cmd>` first, then plugin registry
- `bin/jeriko-*` — individual commands wrapping `tools/*.js`
- `tools/*.js` — library layer (unchanged, also used by Telegram slash commands)
- `~/.jeriko/plugins/` — installed third-party plugins
- `~/.jeriko/plugins/registry.json` — plugin registry (trust, versions, integrity)
- `~/.jeriko/audit.log` — security audit log

## Project Structure

```
bin/
  jeriko           # dispatcher
  jeriko-sys       # system info
  jeriko-screenshot # desktop capture
  jeriko-search    # web search
  jeriko-exec      # shell execution
  jeriko-fs        # file operations
  jeriko-browse    # browser automation
  jeriko-notify    # telegram notifications
  jeriko-camera    # webcam photo/video
  jeriko-email     # IMAP email reader
  jeriko-notes     # Apple Notes
  jeriko-remind    # Apple Reminders
  jeriko-calendar  # Apple Calendar
  jeriko-contacts  # Apple Contacts
  jeriko-clipboard # system clipboard
  jeriko-audio     # mic, volume, TTS
  jeriko-music     # Music/Spotify control
  jeriko-msg       # iMessage
  jeriko-location  # IP geolocation
  jeriko-discover  # auto-generate system prompts for AI
  jeriko-memory    # session memory & key-value store
  jeriko-window    # window/app management (macOS)
  jeriko-proc      # process management
  jeriko-net       # network utilities (ping, dns, curl, download)
  jeriko-server    # server lifecycle (start/stop/restart)
  jeriko-open      # open URLs, files, apps
  jeriko-stripe    # Stripe payments, customers, subscriptions, invoices
  jeriko-x         # X.com (Twitter) — post, search, timeline, DMs, follows
  jeriko-twilio    # Twilio Voice + SMS/MMS — calls, messages, recordings, numbers
  jeriko-install   # plugin installer (npm + local, upgrade)
  jeriko-uninstall # plugin remover
  jeriko-trust     # plugin trust management
  jeriko-plugin    # plugin validate/test
  jeriko-init      # first-run onboarding
lib/
  cli.js           # shared CLI infrastructure (parseArgs, ok, fail, escapeAppleScript)
  plugins.js       # plugin SDK (registry, trust, env isolation, audit)
tools/
  system.js        # system info functions
  screenshot.js    # desktop screenshot
  search.js        # DuckDuckGo search
  shell.js         # shell exec (env-stripped)
  files.js         # file operations
  browser.js       # Playwright browser
  index.js         # tool registry (all 20 commands, for Telegram slash commands)
data/
  session.jsonl    # auto-logged session history
  memory.json      # persistent key-value store
  triggers.json    # trigger definitions
  trigger-log.json # trigger execution log
server/
  index.js         # main entry point (Express + WebSocket + Telegram + WhatsApp)
  router.js        # AI backend (Claude/OpenAI/local, auto-discovers commands, injects memory)
  auth.js          # HMAC token auth + admin ID validation
  telegram.js      # Telegram bot with all slash commands + triggers
  whatsapp.js      # WhatsApp integration via Baileys
  websocket.js     # WebSocket for multi-machine orchestration
  triggers/
    engine.js      # trigger lifecycle (cron, webhook, email, http, file)
    store.js       # trigger persistence
    executor.js    # action execution (Claude or shell)
    notify.js      # macOS + node-notifier notifications
    webhooks.js    # webhook receiver + signature verification
    pollers/
      email.js     # IMAP email polling
```
