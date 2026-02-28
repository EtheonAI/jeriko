# Jeriko — CLI Reference

All `jeriko` commands support 3 output formats via the global `--format` flag:

```bash
jeriko sys --info                  # Text (default): key=value key2=value2
jeriko --format json sys --info    # JSON: {"ok":true,"data":{...}}
jeriko --format logfmt sys --info  # Structured log: ok=true key=value
jeriko sys --info --format json    # --format also works after the command
```

**Default (Text)**: AI-optimized, minimal tokens, instant comprehension.
**JSON**: Machine-parseable, for piping between commands (`--format json`).
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
jeriko notify --message "Hello from Jeriko"
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
jeriko discover --raw             # raw text prompt (for piping to AI)
jeriko discover --list            # list available commands
jeriko discover --json            # structured command metadata
jeriko discover --name "MyBot"    # custom bot name in prompt
```

### jeriko prompt
Generate the FULL system prompt for any LLM backend. Includes every command, flag,
example, template, piping pattern, plugin doc, architecture, and runtime rule.
This is what gets sent to Claude, OpenAI, Ollama, or any other model.

```bash
jeriko prompt                     # full system prompt (JSON with metadata)
jeriko prompt --raw               # raw text prompt (pipe to any LLM)
jeriko prompt --name "MyBot"      # custom bot name
jeriko prompt --all-prompts       # include all trusted plugin PROMPT.md
jeriko prompt --plugins weather   # include specific plugin prompts
jeriko prompt --list              # list available commands
jeriko prompt --json              # structured command metadata
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

### jeriko chat
Interactive REPL for human-AI conversation. Launched automatically when `jeriko` is run with no arguments.
Features: color-coded output, spinner with elapsed time, tool call visualization, slash commands.

```bash
jeriko                            # launch interactive chat (default)
jeriko chat                       # same as above
# Slash commands inside chat:
#   /exit or /quit                # exit
#   /clear                        # clear screen
#   /help                         # show commands
#   /commands                     # list all jeriko commands
#   /memory                       # show recent memory
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

# Webhook Event Hook (used by trigger system)
jeriko stripe hook                    # format TRIGGER_EVENT env var → notify
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
jeriko twilio sms +1234567890 "Hello from Jeriko"   # send SMS
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

### jeriko parallel
Execute multiple independent tasks concurrently via sub-agent LLMs.
Use when performing similar operations on 5+ independent items.
Sub-tasks are text-only (no tool access). Pass content in the prompt.
Works with any configured AI backend (Claude, OpenAI, Kimi, Qwen, DeepSeek, local models).

```bash
jeriko parallel --tasks '[{"task_id":"t1","prompt":"Summarize: ..."},{"task_id":"t2","prompt":"Summarize: ..."}]'
echo '<json>' | jeriko parallel
jeriko parallel --tasks '[...]' --backend claude         # use Anthropic API
jeriko parallel --tasks '[...]' --backend openai         # use OpenAI API
jeriko parallel --tasks '[...]' --backend local           # use local model (Ollama, etc.)
jeriko parallel --tasks '[...]' --workers 8               # max concurrent workers
jeriko parallel --tasks '[...]' --max-tokens 2048         # per-task token limit
jeriko parallel --tasks '[...]' --model gpt-4o            # override model
```

The Go binary (`runtime/parallel-engine`) handles the actual parallel execution.
Supports two API formats: `anthropic` (Anthropic /v1/messages) and `openai` (any OpenAI-compatible endpoint).

### jeriko code
Run Python/Node.js/Bash code snippets in a sandboxed environment.

```bash
jeriko code --python "print('hello')"
jeriko code --node "console.log(42)"
jeriko code --bash "echo $SHELL"
echo "print(2+2)" | jeriko code --python
jeriko code --python "import math; print(math.pi)" --timeout 5000
```

### jeriko ai
AI image generation via OpenAI DALL-E API.

```bash
jeriko ai --image "A red fox in watercolor"
jeriko ai --image "Mountain sunset" --output ~/images/sunset.png
jeriko ai --image "Logo design" --size 1024x1024 --quality hd
jeriko ai --image "Abstract art" --model dall-e-3
```

### jeriko create
Scaffold a new app from templates.

```bash
jeriko create --list                    # list available templates
jeriko create nextjs my-app             # Next.js with App Router
jeriko create react my-app              # React with Vite
jeriko create express my-api            # Express.js API
jeriko create flask my-api              # Flask Python app
jeriko create static my-site            # Static HTML/CSS/JS
jeriko create expo my-mobile-app        # React Native with Expo
```

### jeriko doc
Read, write, analyze, and search documents. Supports PDF, Excel, Word, CSV, images, and all text files.
Uses Python (PyPDF2, openpyxl, python-docx, Pillow) — no npm dependencies.

```bash
# Read documents
jeriko doc --read report.pdf                    # extract text from PDF
jeriko doc --read report.pdf --pages 1-5        # specific page range
jeriko doc --read data.xlsx                     # read Excel (default sheet)
jeriko doc --read data.xlsx --sheet Sales       # specific sheet
jeriko doc --read data.xlsx --limit 50          # limit rows
jeriko doc --read proposal.docx                 # read Word document
jeriko doc --read contacts.csv                  # read CSV with auto-detect
jeriko doc --read notes.md                      # read any text file

# File info & metadata
jeriko doc --info report.pdf                    # pages, title, author, encrypted
jeriko doc --info photo.jpg                     # dimensions, format, EXIF data
jeriko doc --info data.xlsx                     # sheet names, row/col counts
jeriko doc --sheets data.xlsx                   # list all Excel sheets

# Search inside documents
jeriko doc --search report.pdf --query "revenue"
jeriko doc --search data.xlsx --query "Widget"
jeriko doc --search proposal.docx --query "budget"

# Write documents
echo '{"headers":["Name","Score"],"rows":[["Alice",95]]}' | jeriko doc --write output.xlsx
echo '{"title":"Report","content":["Paragraph 1",{"heading":"Section","level":1}]}' | jeriko doc --write output.docx
echo '{"headers":["a","b"],"data":[{"a":1,"b":2}]}' | jeriko doc --write output.csv

# Image operations
jeriko doc --resize photo.png --width 800 --height 600 --output thumb.png
jeriko doc --convert photo.png --output photo.jpg
```

Supported formats: PDF, XLSX/XLS, DOCX, CSV, TSV, PNG, JPG, GIF, BMP, WEBP, TIFF, SVG + all text/code files.

Prerequisites: `pip3 install PyPDF2 openpyxl python-docx Pillow`

### jeriko email --send
Send emails via SMTP (auto-detected from IMAP config).

```bash
jeriko email --send "to@email.com" --subject "Hello" --body "Message body"
jeriko email --send "to@email.com" --subject "Report" --attach report.pdf
echo "email body" | jeriko email --send "to@email.com" --subject "Piped"
```

### jeriko mail
macOS Mail.app integration via AppleScript. No IMAP credentials needed — uses the local Mail app directly.

```bash
jeriko mail --unread                              # recent unread emails (default: 5)
jeriko mail --unread --limit 10                   # more unread
jeriko mail --search "invoice"                    # search by subject
jeriko mail --search "invoice" --limit 3          # limited search
jeriko mail --read <message-id>                   # read full email by ID
jeriko mail --reply <message-id> --message "text" # reply to email
echo "reply text" | jeriko mail --reply <id>      # reply via stdin
jeriko mail --send "to@email.com" --subject "Hi" --message "Body"  # compose and send
jeriko mail --check-for "query"                   # check for matching emails (used by triggers)
```

Platform: macOS only (uses AppleScript + Mail.app).

### jeriko github
Full GitHub integration via REST API. Run `jeriko github init` to set up.

```bash
# Setup
jeriko github init                              # interactive setup (Personal Access Token)
jeriko github init --token ghp_xxx              # non-interactive

# Repos
jeriko github repos                             # list your repos
jeriko github repos --org myorg                 # org repos
jeriko github repos --limit 20 --sort stars     # sorted, limited

# Issues
jeriko github issues                            # list open issues (auto-detects repo from .git)
jeriko github issues --repo owner/repo          # specify repo
jeriko github issues --create "Bug title" --body "description" --labels "bug,urgent"
jeriko github issues --view 42                  # view issue details
jeriko github issues --close 42                 # close issue
jeriko github issues --reopen 42                # reopen issue
jeriko github issues --comment 42 --body "Fixed in v2"

# Pull Requests
jeriko github prs                               # list open PRs
jeriko github prs --create "PR title" --head feature-branch --base main
jeriko github prs --view 10                     # view PR details
jeriko github prs --merge 10                    # merge PR
jeriko github prs --merge 10 --merge-method squash
jeriko github prs --close 10

# Actions (CI/CD)
jeriko github actions                           # list workflow runs
jeriko github actions --branch main --status completed
jeriko github actions --run 12345               # view run details
jeriko github actions --jobs 12345              # list jobs for run
jeriko github actions --rerun 12345             # re-run workflow
jeriko github actions --cancel 12345            # cancel run

# Releases
jeriko github releases                          # list releases
jeriko github releases --latest                 # latest release
jeriko github releases --create "v1.0.0" --title "First Release" --notes "Changelog..."
jeriko github releases --view v1.0.0            # view release
jeriko github releases --delete 12345           # delete release

# Gists
jeriko github gists                             # list your gists
jeriko github gists --create "file.js" --content "code here" --desc "My snippet"
jeriko github gists --view abc123               # view gist
jeriko github gists --delete abc123

# Search
jeriko github search "query"                    # search repos (default)
jeriko github search "query" --code             # search code
jeriko github search "query" --issues           # search issues/PRs
jeriko github search "query" --users            # search users

# Clone
jeriko github clone owner/repo                  # clone repo
jeriko github clone owner/repo --depth 1        # shallow clone
```

### jeriko vercel
Full Vercel integration via REST API. Run `jeriko vercel init` to set up.

```bash
# Setup
jeriko vercel init                              # interactive setup
jeriko vercel init --token xxx                  # non-interactive

# User
jeriko vercel user                              # current user info

# Projects
jeriko vercel projects                          # list projects
jeriko vercel projects --limit 50

# Deployments
jeriko vercel deployments                       # list deployments
jeriko vercel deployments --project myapp       # filter by project
jeriko vercel deployments --state READY

# Deploy
jeriko vercel deploy --project myapp            # preview deployment
jeriko vercel deploy --project myapp --prod     # production deployment
jeriko vercel deploy --hook https://api.vercel.com/v1/integrations/deploy/xxx  # trigger hook

# Domains
jeriko vercel domains                           # list domains
jeriko vercel domains add --name example.com    # add domain
jeriko vercel domains delete --name example.com # remove domain

# Environment Variables
jeriko vercel env --project myapp               # list env vars
jeriko vercel env --project myapp --set KEY --value "val"
jeriko vercel env --project myapp --delete KEY

# Logs
jeriko vercel logs --deployment dpl_xxx         # deployment logs

# DNS
jeriko vercel dns --domain example.com          # list records
jeriko vercel dns --domain example.com --create --type A --name sub --value 1.2.3.4

# Other
jeriko vercel certs                             # SSL certificates
jeriko vercel promote --deployment dpl_xxx --project myapp  # promote to production
jeriko vercel delete --id dpl_xxx               # delete deployment
jeriko vercel aliases                           # list aliases
jeriko vercel teams                             # list teams
```

### jeriko gdrive
Google Drive integration via REST API v3. Run `jeriko gdrive init` to set up (requires Google Cloud OAuth2 client).

```bash
# Setup (OAuth2 device code flow)
jeriko gdrive init                              # interactive setup wizard
jeriko gdrive init --client-id xxx --client-secret xxx --refresh-token xxx  # non-interactive

# List files
jeriko gdrive list                              # root files (default: 20)
jeriko gdrive list --limit 50                   # limit results
jeriko gdrive list --folder <folder_id>         # list folder contents
jeriko gdrive list --type document              # filter: document, spreadsheet, presentation, pdf, image, folder

# Search
jeriko gdrive search "quarterly report"         # search by name
jeriko gdrive search "budget" --type spreadsheet

# File info
jeriko gdrive info <file_id>                    # full metadata

# Download
jeriko gdrive download <file_id>                # download to current dir
jeriko gdrive download <file_id> --to ./out.pdf # download to path
jeriko gdrive download <file_id> --export pdf   # export Google Docs as PDF/docx/txt/csv/xlsx

# Upload
jeriko gdrive upload ./report.pdf               # upload to root
jeriko gdrive upload ./report.pdf --folder <folder_id>  # upload to folder
jeriko gdrive upload ./report.pdf --name "Q4 Report"    # custom name

# Create folder
jeriko gdrive mkdir "New Folder"                # in root
jeriko gdrive mkdir "Sub" --parent <folder_id>  # subfolder

# Share
jeriko gdrive share <file_id> --email user@gmail.com           # share (reader)
jeriko gdrive share <file_id> --email user@gmail.com --role writer  # share (writer)
jeriko gdrive share <file_id> --anyone                          # link sharing

# Delete
jeriko gdrive delete <file_id>                  # move to trash
jeriko gdrive delete <file_id> --permanent      # permanent delete

# Storage info
jeriko gdrive about                             # usage, quota, user info
```

### jeriko onedrive
OneDrive integration via Microsoft Graph REST API. Run `jeriko onedrive init` to set up (requires Azure app registration).

```bash
# Setup (OAuth2 device code flow)
jeriko onedrive init                            # interactive setup wizard
jeriko onedrive init --client-id xxx --refresh-token xxx  # non-interactive

# List files
jeriko onedrive list                            # root files (default: 20)
jeriko onedrive list --limit 50                 # limit results
jeriko onedrive list --folder <folder_id>       # list folder contents
jeriko onedrive list --path "/Documents/Work"   # list by path

# Search
jeriko onedrive search "quarterly report"       # search across drive

# File info
jeriko onedrive info <item_id>                  # full metadata

# Download
jeriko onedrive download <item_id>              # download to current dir
jeriko onedrive download <item_id> --to ./out.pdf  # download to path

# Upload
jeriko onedrive upload ./report.pdf             # upload to root
jeriko onedrive upload ./report.pdf --folder <folder_id>    # upload to folder
jeriko onedrive upload ./report.pdf --path "/Documents"     # upload to path
jeriko onedrive upload ./report.pdf --name "Q4 Report"      # custom name

# Create folder
jeriko onedrive mkdir "New Folder"              # in root
jeriko onedrive mkdir "Sub" --parent <folder_id>  # subfolder

# Share
jeriko onedrive share <item_id>                 # create view link
jeriko onedrive share <item_id> --role edit     # create edit link
jeriko onedrive share <item_id> --email user@example.com  # share with user

# Delete
jeriko onedrive delete <item_id>                # move to recycle bin

# Storage info
jeriko onedrive about                           # usage, quota, owner info
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
jeriko github init                     # GitHub
jeriko vercel init                     # Vercel
jeriko gdrive init                     # Google Drive
jeriko onedrive init                   # OneDrive
```

### jeriko create
Scaffold projects from templates into `~/.jeriko/projects/`.

```bash
jeriko create --list                          # list available templates
jeriko create --projects                      # list created projects
jeriko create nextjs my-app                   # scaffold Next.js app
jeriko create react portfolio-site            # scaffold React (Vite) app
jeriko create expo mobile-app                 # scaffold Expo (React Native) app
jeriko create express api-server              # scaffold Express.js API
jeriko create flask ml-service                # scaffold Flask (Python) app
jeriko create static landing-page             # scaffold static HTML/CSS/JS
jeriko create --open my-app                   # open project in detected editor
jeriko create nextjs my-app --cwd /tmp        # override target directory
```

Templates: `nextjs`, `react`, `expo`, `express`, `flask`, `static`

Projects are created in `~/.jeriko/projects/<name>/` by default.
After scaffolding, the response includes the detected editor and open command.

## Local Model Configuration

Jeriko can run entirely offline using local LLMs. Set `AI_BACKEND=local` in `.env`.

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
  jeriko-email     # IMAP email reader + SMTP sender
  jeriko-mail      # macOS Mail.app integration (AppleScript)
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
  jeriko-prompt    # full system prompt for any LLM backend
  jeriko-memory    # session memory & key-value store
  jeriko-chat      # interactive REPL (launched by `jeriko` with no args)
  jeriko-window    # window/app management (macOS)
  jeriko-proc      # process management
  jeriko-net       # network utilities (ping, dns, curl, download)
  jeriko-server    # server lifecycle (start/stop/restart)
  jeriko-open      # open URLs, files, apps
  jeriko-stripe    # Stripe payments, customers, subscriptions, invoices, webhook hook
  jeriko-stripe-hook # shim → delegates to jeriko stripe hook
  jeriko-x         # X.com (Twitter) — post, search, timeline, DMs, follows
  jeriko-twilio    # Twilio Voice + SMS/MMS — calls, messages, recordings, numbers
  jeriko-install   # plugin installer (npm + local, upgrade)
  jeriko-uninstall # plugin remover
  jeriko-trust     # plugin trust management
  jeriko-plugin    # plugin validate/test
  jeriko-init      # first-run onboarding
  jeriko-doc       # document reader/writer (PDF, Excel, Word, CSV, images)
  jeriko-parallel  # parallel LLM task execution (Go binary wrapper)
  jeriko-code      # code execution (Python/Node.js/Bash)
  jeriko-ai        # AI image generation (DALL-E)
  jeriko-create    # app scaffolding from templates
  jeriko-github    # GitHub REST API — repos, issues, PRs, actions, releases, gists
  jeriko-vercel    # Vercel REST API — projects, deployments, domains, env vars
  jeriko-gdrive    # Google Drive REST API — list, upload, download, share
  jeriko-onedrive  # OneDrive/Microsoft Graph — list, upload, download, share
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
  index.js         # tool registry (all slash commands, for Telegram)
runtime/
  main.go          # Go parallel engine (model-agnostic, anthropic + openai formats)
  go.mod           # Go module (stdlib only, no external deps)
  build.sh         # cross-compile: darwin/arm64, darwin/amd64, linux/amd64, linux/arm64, windows/amd64
  parallel-engine  # compiled Go binary (built via: cd runtime && go build -ldflags="-s -w" -o parallel-engine)
templates/
  nextjs.json      # Next.js app template
  react.json       # React + Vite template
  express.json     # Express.js API template
  flask.json       # Flask Python template
  static.json      # Static HTML/CSS/JS template
  expo.json        # React Native Expo template
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
