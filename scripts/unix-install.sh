#!/bin/bash
#
# Jeriko Unix Install (from source)
# Builds and installs Jeriko as a native Unix tool from a cloned repository.
#
# Usage:
#   ./scripts/unix-install.sh           # install to ~/.local
#   ./scripts/unix-install.sh /usr/local # install system-wide (needs sudo)
#
set -euo pipefail

# ── Config ──────────────────────────────────────────────────────
PREFIX="${1:-$HOME/.local}"
JERIKO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

BIN_DIR="$PREFIX/bin"
LIB_DIR="$PREFIX/lib/jeriko"
CONF_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/jeriko"
DATA_DIR="$HOME/.jeriko"
COMPLETION_DIR="$PREFIX/share/bash-completion/completions"
ZSH_COMP_DIR="$PREFIX/share/zsh/site-functions"
MAN_DIR="$PREFIX/share/man/man1"

# ── Colors (only when stdout is a terminal) ─────────────────────
RED=''; GREEN=''; YELLOW=''; BLUE=''; BOLD=''; NC=''
if [[ -t 1 ]]; then
    RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
    BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
fi

info()  { echo -e "${BLUE}→${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}!${NC} $1"; }
err()   { echo -e "${RED}✗${NC} $1" >&2; exit 1; }

# Replace $HOME prefix with ~ for clean display paths.
tildify() {
    if [[ "$1" == "$HOME"/* ]]; then
        echo "~${1#"$HOME"}"
    else
        echo "$1"
    fi
}

# ── Detect OS ──────────────────────────────────────────────────
OS="$(uname -s)"

# ── Preflight ───────────────────────────────────────────────────
echo -e "\n${BOLD}Jeriko Unix Install (from source)${NC}"
echo "Source:  $JERIKO_ROOT"
echo "Prefix:  $PREFIX"
echo "OS:      $OS"
echo ""


# Check Bun runtime
command -v bun >/dev/null 2>&1 || err "Bun >= 1.1 required. Install: https://bun.sh"
BUN_VER=$(bun --version 2>/dev/null || echo "0.0.0")
BUN_MAJOR=$(echo "$BUN_VER" | cut -d. -f1)
BUN_MINOR=$(echo "$BUN_VER" | cut -d. -f2)
if [ "$BUN_MAJOR" -lt 1 ] || { [ "$BUN_MAJOR" -eq 1 ] && [ "$BUN_MINOR" -lt 1 ]; }; then
  err "Bun >= 1.1 required (found $BUN_VER). Update: bun upgrade"
fi
info "Bun $BUN_VER"

# ── Install dependencies ───────────────────────────────────────
info "Installing dependencies..."
cd "$JERIKO_ROOT" && bun install --frozen-lockfile 2>/dev/null || bun install
ok "Dependencies ready"

# ── Build binary ───────────────────────────────────────────────
# Use build.ts — handles externals, plugins, codesigning, and all build config
# in a single source of truth. Output goes to project root (default target).
info "Building Jeriko binary..."
bun run scripts/build.ts

BINARY="$JERIKO_ROOT/jeriko"
if [ ! -f "$BINARY" ]; then
  err "Build failed — binary not found at $BINARY"
fi

# Verify the binary runs
if ! "$BINARY" --version >/dev/null 2>&1; then
  warn "Binary verification skipped"
else
  JERIKO_VER=$("$BINARY" --version 2>/dev/null || echo "unknown")
  ok "Built Jeriko $JERIKO_VER"
fi

# ── Create directories ──────────────────────────────────────────
info "Creating directories..."
mkdir -p "$BIN_DIR" "$LIB_DIR" "$CONF_DIR" \
         "$DATA_DIR/data" "$DATA_DIR/data/logs" "$DATA_DIR/data/files" \
         "$DATA_DIR/projects" "$DATA_DIR/memory" \
         "$DATA_DIR/plugins" "$DATA_DIR/prompts" \
         "$DATA_DIR/skills" "$DATA_DIR/data/tasks" "$DATA_DIR/data/jobs" \
         "$DATA_DIR/downloads" \
         "$COMPLETION_DIR" "$ZSH_COMP_DIR" "$MAN_DIR"

# ── Install binary ──────────────────────────────────────────────
info "Installing binary..."
cp "$BINARY" "$BIN_DIR/jeriko"
chmod +x "$BIN_DIR/jeriko"
ok "Binary → $BIN_DIR/jeriko"

# ── Install support files ───────────────────────────────────────
info "Installing support files..."

# AGENT.md — system prompt for AI models (canonical location: config dir)
if [ -f "$JERIKO_ROOT/AGENT.md" ]; then
  cp "$JERIKO_ROOT/AGENT.md" "$CONF_DIR/agent.md"
  ok "Agent prompt → $CONF_DIR/agent.md"
else
  warn "AGENT.md not found in source — agent will have no system prompt"
fi

# Templates — for `jeriko create` (web-static, web-db-user, deploy)
if [ -d "$JERIKO_ROOT/templates" ]; then
  cp -r "$JERIKO_ROOT/templates" "$LIB_DIR/"
  ok "Templates → $LIB_DIR/templates"
fi

ok "Support files installed"

# ── Config ──────────────────────────────────────────────────────
info "Checking config..."

if [ -f "$CONF_DIR/config.json" ]; then
  ok "Config exists → $(tildify "$CONF_DIR/config.json")"
else
  # No config yet — the onboarding wizard creates it on first launch.
  # This ensures the user picks their provider before config is written.
  ok "Config will be created on first launch (onboarding wizard)"
fi

# ── Shell completions ──────────────────────────────────────────
info "Installing shell completions..."

# Bash completion
cat > "$COMPLETION_DIR/jeriko" << 'BASHCOMP'
_jeriko() {
  local cur="${COMP_WORDS[COMP_CWORD]}"
  local cmds="sys exec proc net fs doc browse search screenshot email msg notify
    audio notes remind calendar contacts music clipboard window camera open
    location stripe github paypal vercel twilio x gdrive onedrive gmail outlook
    connectors code create dev parallel ask memory discover prompt skill share
    init server task job install trust uninstall setup update
    plan upgrade billing"

  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=($(compgen -W "$cmds --help --format --version" -- "$cur"))
    return
  fi

  local cmd="${COMP_WORDS[1]}"
  case "$cmd" in
    fs)         COMPREPLY=($(compgen -W "ls cat write append find grep info mkdir rm cp mv" -- "$cur")) ;;
    stripe)     COMPREPLY=($(compgen -W "customers products prices payments invoices subscriptions balance payouts refunds events webhooks checkout links init hook" -- "$cur")) ;;
    paypal)     COMPREPLY=($(compgen -W "orders payments subscriptions plans products invoices payouts disputes webhooks init hook" -- "$cur")) ;;
    github)     COMPREPLY=($(compgen -W "repos issues prs actions releases search clone gists" -- "$cur")) ;;
    x)          COMPREPLY=($(compgen -W "post search timeline like retweet bookmark follow dm lists mute" -- "$cur")) ;;
    twilio)     COMPREPLY=($(compgen -W "call sms recordings account hook" -- "$cur")) ;;
    vercel)     COMPREPLY=($(compgen -W "projects deploy deployments domains env team" -- "$cur")) ;;
    connectors) COMPREPLY=($(compgen -W "list status connect disconnect" -- "$cur")) ;;
    proc)       COMPREPLY=($(compgen -W "list find kill" -- "$cur")) ;;
    net)        COMPREPLY=($(compgen -W "ping dns ports curl download ip" -- "$cur")) ;;
    notes)      COMPREPLY=($(compgen -W "create list search read" -- "$cur")) ;;
    remind)     COMPREPLY=($(compgen -W "create list complete" -- "$cur")) ;;
    calendar)   COMPREPLY=($(compgen -W "today list create" -- "$cur")) ;;
    contacts)   COMPREPLY=($(compgen -W "search list get" -- "$cur")) ;;
    music)      COMPREPLY=($(compgen -W "play pause next prev status search" -- "$cur")) ;;
    window)     COMPREPLY=($(compgen -W "list focus minimize fullscreen" -- "$cur")) ;;
    msg)        COMPREPLY=($(compgen -W "send recent" -- "$cur")) ;;
    server)     COMPREPLY=($(compgen -W "start stop restart status logs" -- "$cur")) ;;
    skill)      COMPREPLY=($(compgen -W "list info create validate remove install edit" -- "$cur")) ;;
    dev)        COMPREPLY=($(compgen -W "--start --stop --status --logs --preview" -- "$cur")) ;;
    memory)     COMPREPLY=($(compgen -W "--get --set --delete --list --context --conversations --resume --stats" -- "$cur")) ;;
    *)          COMPREPLY=($(compgen -W "--help --format" -- "$cur")) ;;
  esac
}
complete -F _jeriko jeriko
BASHCOMP

# Zsh completion
cat > "$ZSH_COMP_DIR/_jeriko" << 'ZSHCOMP'
#compdef jeriko

_jeriko() {
  local -a commands=(
    'sys:System info (CPU, RAM, disk, battery, network)'
    'exec:Run shell commands'
    'proc:Process management'
    'net:Network utilities'
    'fs:Filesystem operations'
    'doc:Read PDF, Excel, Word, CSV'
    'browse:Browser automation'
    'search:Web search'
    'screenshot:Capture display'
    'notify:Send notifications'
    'email:IMAP email'
    'msg:iMessage'
    'notes:Apple Notes'
    'remind:Apple Reminders'
    'calendar:Apple Calendar'
    'contacts:Contacts'
    'music:Music playback control'
    'audio:TTS, microphone, volume'
    'clipboard:System clipboard'
    'window:Window management'
    'open:Open files/apps/URLs'
    'camera:Webcam capture'
    'location:IP geolocation'
    'stripe:Stripe API'
    'paypal:PayPal API'
    'x:X/Twitter API'
    'twilio:Twilio API'
    'github:GitHub API'
    'vercel:Vercel API'
    'gdrive:Google Drive'
    'onedrive:OneDrive'
    'gmail:Gmail API'
    'outlook:Outlook API'
    'connectors:Manage OAuth and API connectors'
    'code:Execute Python/Node/Bash'
    'create:Project scaffolding'
    'dev:Dev server management'
    'parallel:Concurrent AI tasks'
    'ask:Ask the AI agent'
    'memory:Session persistence'
    'discover:Auto-generate prompts'
    'prompt:Prompt management'
    'skill:Manage reusable agent skills'
    'share:Share agent sessions'
    'server:Daemon lifecycle'
    'task:Task management'
    'job:Scheduled jobs'
    'init:Setup wizard'
    'install:Install plugins'
    'trust:Plugin trust'
    'uninstall:Remove plugins'
    'setup:Post-install shell integration'
    'update:Update to latest version'
    'plan:Show current billing plan and usage'
    'upgrade:Upgrade to Pro plan'
    'billing:Manage billing and subscription'
  )

  if (( CURRENT == 2 )); then
    _describe 'command' commands
  else
    _files
  fi
}

_jeriko "$@"
ZSHCOMP

ok "Bash completions → $COMPLETION_DIR/jeriko"
ok "Zsh completions  → $ZSH_COMP_DIR/_jeriko"

# ── Man page ────────────────────────────────────────────────────
info "Installing man page..."

cat > "$MAN_DIR/jeriko.1" << 'MANPAGE'
.TH JERIKO 1 "March 2026" "2.0.0" "Jeriko Manual"
.SH NAME
jeriko \- Unix-first CLI toolkit for AI agents
.SH SYNOPSIS
.B jeriko
[\fI--format\fR json|text|logfmt]
.IR command
[\fIoptions\fR]
.SH DESCRIPTION
Jeriko gives AI agents full machine control through structured Unix commands.
Every capability is a CLI command with JSON output and semantic exit codes.
Model-agnostic: any AI with exec() can use it.
.PP
The binary is self-contained \(em compiled from TypeScript via Bun.
No runtime dependencies required.
.SH COMMANDS
.SS System
.TP
.B sys
System info (CPU, RAM, disk, battery, network, processes)
.TP
.B exec
Run shell commands with timeout
.TP
.B proc
Process management (list, find, kill)
.TP
.B net
Network utilities (ping, DNS, ports, curl, download, IP)
.SS Files
.TP
.B fs
Filesystem operations (ls, cat, write, find, grep)
.TP
.B doc
Read PDF, Excel, Word, CSV documents
.SS Browser
.TP
.B browse
Browser automation (screenshot, click, navigate)
.TP
.B search
Web search via DuckDuckGo
.TP
.B screenshot
Screen capture
.SS Communication
.TP
.B email
IMAP email (read, search, send, reply)
.TP
.B msg
iMessage (send, read)
.TP
.B notify
Send OS or Telegram notifications
.TP
.B audio
TTS, microphone recording, volume control
.SS macOS / Desktop
.TP
.B notes
Apple Notes (list, search, read, create)
.TP
.B remind
Apple Reminders (list, create, complete)
.TP
.B calendar
Apple Calendar (view, create events)
.TP
.B contacts
Contacts (search, list, get)
.TP
.B music
Music playback control (play, pause, skip, status)
.TP
.B clipboard
System clipboard (get, set, clear)
.TP
.B window
Window management (list, focus, resize)
.TP
.B camera
Webcam capture
.TP
.B open
Open files, apps, and URLs
.TP
.B location
IP geolocation
.SS Integrations
.TP
.B stripe
Full Stripe API (customers, payments, invoices, subscriptions)
.TP
.B paypal
Full PayPal API (orders, payments, subscriptions, invoices)
.TP
.B github
GitHub API (repos, issues, PRs, actions, releases)
.TP
.B x
X/Twitter API (post, search, timeline, DM)
.TP
.B twilio
Twilio API (call, SMS, recordings)
.TP
.B vercel
Vercel API (deploy, domains, env)
.TP
.B gdrive
Google Drive API
.TP
.B onedrive
OneDrive API
.TP
.B gmail
Gmail API (OAuth-based email)
.TP
.B outlook
Outlook API (OAuth-based email)
.TP
.B connectors
Manage OAuth and API connectors
.SS Development
.TP
.B code
Execute Python, Node, or Bash code
.TP
.B create
Project scaffolding from templates
.TP
.B dev
Dev server management (start, stop, status, logs)
.TP
.B parallel
Concurrent AI task execution
.SS Agent
.TP
.B ask
Ask the AI agent a question
.TP
.B memory
Session persistence and KV store
.TP
.B discover
Auto-generate system prompts
.TP
.B prompt
Manage custom prompts
.TP
.B skill
Manage reusable agent skills
.TP
.B share
Share agent sessions
.SS Automation
.TP
.B init
Setup wizard (API keys, configuration)
.TP
.B server
Daemon lifecycle (start, stop, restart, status, logs)
.TP
.B task
Trigger management (cron, webhook, email, HTTP, file)
.TP
.B job
Scheduled jobs
.TP
.B setup
Post-install shell integration
.TP
.B update
Update to the latest version
.SS Plugin Management
.TP
.B install
Install plugins or self-install
.TP
.B trust
Trust a plugin
.TP
.B uninstall
Remove plugins
.SS Billing
.TP
.B plan
Show current billing plan, limits, and usage
.TP
.B upgrade
Upgrade to Pro plan
.TP
.B billing
Manage billing and subscription
.SH EXIT CODES
.TP
.B 0
Success
.TP
.B 1
General error
.TP
.B 2
Network error
.TP
.B 3
Authentication error
.TP
.B 5
Not found
.TP
.B 7
Timeout
.SH OUTPUT FORMAT
All commands output structured data. Use --format to control:
.TP
.B json
{"ok": true, "data": {...}} (default for piping)
.TP
.B text
Human-readable key-value pairs
.TP
.B logfmt
Structured key=value pairs
.SH FILES
.TP
.I ~/.config/jeriko/config.json
User configuration (JSON, merged with defaults)
.TP
.I ~/.config/jeriko/agent.md
Agent system prompt (loaded at boot)
.TP
.I ~/.jeriko/
Operational data (database, logs, projects, skills)
.TP
.I ./jeriko.json
Project-level configuration override
.SH ENVIRONMENT
.TP
.B ANTHROPIC_API_KEY
Claude API key
.TP
.B OPENAI_API_KEY
OpenAI API key
.TP
.B TELEGRAM_BOT_TOKEN
Telegram bot token
.TP
.B ADMIN_TELEGRAM_IDS
Comma-separated admin Telegram user IDs
.TP
.B NODE_AUTH_SECRET
Server authentication secret (required for daemon)
.TP
.B JERIKO_MODEL
Override default AI model
.TP
.B JERIKO_LOG_LEVEL
Override log level (debug, info, warn, error)
.SH AUTHOR
Khaleel Musleh (Etheon)
.SH SEE ALSO
.UR https://jeriko.ai
.UE
MANPAGE

ok "Man page → $MAN_DIR/jeriko.1"

# ── launchd service (macOS) ─────────────────────────────────────
if [ "$OS" = "Darwin" ]; then
  info "Creating launchd service..."
  PLIST_DIR="$HOME/Library/LaunchAgents"
  PLIST="$PLIST_DIR/ai.jeriko.server.plist"
  mkdir -p "$PLIST_DIR"

  cat > "$PLIST" << LAUNCHD
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>ai.jeriko.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>$BIN_DIR/jeriko</string>
    <string>server</string>
    <string>start</string>
    <string>--foreground</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>$HOME</string>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:$BIN_DIR</string>
  </dict>
  <key>RunAtLoad</key>
  <false/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardOutPath</key>
  <string>$DATA_DIR/data/logs/server.log</string>
  <key>StandardErrorPath</key>
  <string>$DATA_DIR/data/logs/server.err</string>
  <key>WorkingDirectory</key>
  <string>$HOME</string>
</dict>
</plist>
LAUNCHD

  ok "launchd service → $PLIST"
  echo -e "   Start:  ${BOLD}launchctl load $PLIST${NC}"
  echo -e "   Stop:   ${BOLD}launchctl unload $PLIST${NC}"
fi

# ── systemd service (Linux) ─────────────────────────────────────
if [ "$OS" = "Linux" ]; then
  info "Creating systemd service..."
  SYSTEMD_DIR="$HOME/.config/systemd/user"
  mkdir -p "$SYSTEMD_DIR"

  cat > "$SYSTEMD_DIR/jeriko.service" << SYSTEMD
[Unit]
Description=Jeriko AI Agent Daemon
After=network.target

[Service]
Type=simple
ExecStart=$BIN_DIR/jeriko server start --foreground
Environment=HOME=$HOME
WorkingDirectory=$HOME
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
SYSTEMD

  ok "systemd service → $SYSTEMD_DIR/jeriko.service"
  echo "   Enable: systemctl --user enable jeriko"
  echo "   Start:  systemctl --user start jeriko"
  echo "   Logs:   journalctl --user -u jeriko -f"
fi

# ── PATH check ──────────────────────────────────────────────────
echo ""
if echo "$PATH" | tr ':' '\n' | grep -q "^$BIN_DIR$"; then
  ok "$BIN_DIR is in PATH"
else
  warn "$BIN_DIR is not in PATH. Add it:"
  echo ""

  SHELL_NAME=$(basename "$SHELL")
  case "$SHELL_NAME" in
    zsh)  PROFILE="$HOME/.zshrc" ;;
    bash)
      if [ -f "$HOME/.bash_profile" ]; then PROFILE="$HOME/.bash_profile"
      else PROFILE="$HOME/.bashrc"; fi
      ;;
    fish) PROFILE="$HOME/.config/fish/config.fish" ;;
    *)    PROFILE="$HOME/.profile" ;;
  esac

  if [ "$SHELL_NAME" = "fish" ]; then
    echo "  fish_add_path $BIN_DIR"
  else
    echo "  # Add to $PROFILE:"
    echo "  export PATH=\"$BIN_DIR:\$PATH\""
  fi
  echo ""
fi

# ── Done ────────────────────────────────────────────────────────
echo -e "\n${GREEN}${BOLD}Jeriko installed from source.${NC}\n"
echo "  Layout:"
echo "    $(tildify "$BIN_DIR/jeriko")              ← compiled binary"
echo "    $(tildify "$CONF_DIR/config.json")        ← configuration"
echo "    $(tildify "$CONF_DIR/agent.md")           ← agent system prompt"
echo "    $(tildify "$DATA_DIR/")                   ← operational data"
echo ""
echo "  Usage:"
echo "    jeriko sys                   # system info"
echo "    jeriko fs ls .               # list files"
echo "    jeriko stripe customers list # Stripe API"
echo "    jeriko server start          # start daemon"
echo "    man jeriko                   # manual"
echo ""
echo "  Tab completion:"
echo "    jeriko <TAB>                 # list all commands"
echo "    jeriko stripe <TAB>          # list subcommands"
echo ""

# ── First launch hint ─────────────────────────────────────────────
if [ ! -f "$CONF_DIR/config.json" ]; then
  echo -e "  ${BOLD}Run 'jeriko' to start the setup wizard.${NC}"
  echo ""
fi

# ── Telemetry (opt-out: DO_NOT_TRACK=1) ────────────────────────
if [ "${DO_NOT_TRACK:-0}" != "1" ]; then
  _ph_uid="${JERIKO_USER_ID:-anonymous}"
  curl -s -o /dev/null --max-time 3 \
    -H "Content-Type: application/json" \
    -d "{\"api_key\":\"phc_tZSl9DLWFuWV7ozBohDcJM74U3OFoN9P3QLp5IsV4f1\",\"event\":\"install\",\"distinct_id\":\"$_ph_uid\",\"properties\":{\"\$os\":\"$(uname -s)\",\"method\":\"source\"}}" \
    "https://us.i.posthog.com/capture/" &
fi
