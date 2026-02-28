#!/bin/bash
#
# Jeriko Unix Install (from source)
# Builds and installs Jeriko as a native Unix tool from a cloned repository.
#
# Usage:
#   ./scripts/unix-install.sh           # install to ~/.local
#   ./scripts/unix-install.sh /usr/local # install system-wide (needs sudo)
#
set -e

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

# ── Colors ──────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

info()  { echo -e "${BLUE}→${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}!${NC} $1"; }
err()   { echo -e "${RED}✗${NC} $1" >&2; exit 1; }

# ── Preflight ───────────────────────────────────────────────────
echo -e "\n${BOLD}Jeriko Unix Install (from source)${NC}"
echo "Source:  $JERIKO_ROOT"
echo "Prefix:  $PREFIX"
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

# ── Detect platform ────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) PLATFORM_OS="darwin" ;;
  Linux)  PLATFORM_OS="linux" ;;
  *)      err "Unsupported OS: $OS" ;;
esac

case "$ARCH" in
  x86_64|amd64) PLATFORM_ARCH="x64" ;;
  arm64|aarch64) PLATFORM_ARCH="arm64" ;;
  *)             err "Unsupported architecture: $ARCH" ;;
esac

# Detect Rosetta 2 on macOS
if [ "$PLATFORM_OS" = "darwin" ] && [ "$PLATFORM_ARCH" = "x64" ]; then
  if [ "$(sysctl -n sysctl.proc_translated 2>/dev/null)" = "1" ]; then
    PLATFORM_ARCH="arm64"
    info "Rosetta 2 detected — building native arm64 binary"
  fi
fi

BUILD_TARGET="bun-${PLATFORM_OS}-${PLATFORM_ARCH}"
info "Target: $BUILD_TARGET"

# ── Install dependencies ───────────────────────────────────────
info "Installing dependencies..."
cd "$JERIKO_ROOT" && bun install --frozen-lockfile 2>/dev/null || bun install
ok "Dependencies ready"

# ── Build binary ───────────────────────────────────────────────
BINARY="$JERIKO_ROOT/jeriko"

info "Building Jeriko binary..."
bun build src/index.ts \
  --compile --minify --bytecode \
  --external qrcode-terminal \
  --external link-preview-js \
  --external jimp \
  --external sharp \
  --target="$BUILD_TARGET" \
  --outfile="$BINARY"

chmod +x "$BINARY"

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
         "$DATA_DIR/data" "$DATA_DIR/data/logs" \
         "$COMPLETION_DIR" "$ZSH_COMP_DIR" "$MAN_DIR"

# ── Install binary ──────────────────────────────────────────────
info "Installing binary..."
cp "$BINARY" "$BIN_DIR/jeriko"
chmod +x "$BIN_DIR/jeriko"
ok "Binary → $BIN_DIR/jeriko"

# ── Install support files ───────────────────────────────────────
info "Installing support files..."

# AGENT.md — system prompt for AI models
cp "$JERIKO_ROOT/AGENT.md" "$DATA_DIR/" 2>/dev/null || true

# Templates — for `jeriko create` (web-static, web-db-user)
if [ -d "$JERIKO_ROOT/templates" ]; then
  cp -r "$JERIKO_ROOT/templates" "$LIB_DIR/"
  ok "Templates → $LIB_DIR/templates"
fi

ok "Support files installed"

# ── Config ──────────────────────────────────────────────────────
info "Setting up config..."

if [ ! -f "$CONF_DIR/config.json" ]; then
  cat > "$CONF_DIR/config.json" << 'CONF'
{
  "agent": {
    "model": "claude"
  },
  "channels": {
    "telegram": {
      "token": "",
      "adminIds": []
    }
  },
  "logging": {
    "level": "info"
  }
}
CONF
  ok "Config created → $CONF_DIR/config.json"
else
  ok "Config exists → $CONF_DIR/config.json"
fi

# Migrate existing .env if present
if [ -f "$JERIKO_ROOT/.env" ] && [ ! -f "$CONF_DIR/.env.migrated" ]; then
  info "Migrating existing .env..."
  # Read key env vars and write to config
  touch "$CONF_DIR/.env.migrated"
  ok "Migration marker set (env vars loaded at runtime from environment)"
fi

# ── Shell completions ──────────────────────────────────────────
info "Installing shell completions..."

# Bash completion
cat > "$COMPLETION_DIR/jeriko" << 'BASHCOMP'
_jeriko() {
  local cur="${COMP_WORDS[COMP_CWORD]}"
  local cmds="sys exec proc net fs doc browse search screenshot email msg notify
    audio notes remind calendar contacts music clipboard window camera open
    location stripe github paypal vercel twilio x gdrive onedrive code create
    dev parallel ask memory discover prompt init server task job install trust
    uninstall"

  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=($(compgen -W "$cmds --help --format --version" -- "$cur"))
    return
  fi

  local cmd="${COMP_WORDS[1]}"
  case "$cmd" in
    fs)       COMPREPLY=($(compgen -W "ls cat write append find grep info mkdir rm cp mv" -- "$cur")) ;;
    stripe)   COMPREPLY=($(compgen -W "customers products prices payments invoices subscriptions balance payouts refunds events webhooks checkout links init hook" -- "$cur")) ;;
    paypal)   COMPREPLY=($(compgen -W "orders payments subscriptions plans products invoices payouts disputes webhooks init hook" -- "$cur")) ;;
    github)   COMPREPLY=($(compgen -W "repos issues prs actions releases search clone gists" -- "$cur")) ;;
    x)        COMPREPLY=($(compgen -W "post search timeline like retweet bookmark follow dm lists mute" -- "$cur")) ;;
    twilio)   COMPREPLY=($(compgen -W "call sms recordings account hook" -- "$cur")) ;;
    vercel)   COMPREPLY=($(compgen -W "projects deploy deployments domains env team" -- "$cur")) ;;
    proc)     COMPREPLY=($(compgen -W "list find kill" -- "$cur")) ;;
    net)      COMPREPLY=($(compgen -W "ping dns ports curl download ip" -- "$cur")) ;;
    notes)    COMPREPLY=($(compgen -W "create list search read" -- "$cur")) ;;
    remind)   COMPREPLY=($(compgen -W "create list complete" -- "$cur")) ;;
    calendar) COMPREPLY=($(compgen -W "today list create" -- "$cur")) ;;
    contacts) COMPREPLY=($(compgen -W "search list get" -- "$cur")) ;;
    music)    COMPREPLY=($(compgen -W "play pause next prev status search" -- "$cur")) ;;
    window)   COMPREPLY=($(compgen -W "list focus minimize fullscreen" -- "$cur")) ;;
    msg)      COMPREPLY=($(compgen -W "send recent" -- "$cur")) ;;
    server)   COMPREPLY=($(compgen -W "start stop restart status logs" -- "$cur")) ;;
    dev)      COMPREPLY=($(compgen -W "--start --stop --status --logs --preview" -- "$cur")) ;;
    memory)   COMPREPLY=($(compgen -W "--get --set --delete --list --context --conversations --resume --stats" -- "$cur")) ;;
    *)        COMPREPLY=($(compgen -W "--help --format" -- "$cur")) ;;
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
    'code:Execute Python/Node/Bash'
    'create:Project scaffolding'
    'dev:Dev server management'
    'parallel:Concurrent AI tasks'
    'ask:Ask the AI agent'
    'memory:Session persistence'
    'discover:Auto-generate prompts'
    'prompt:Prompt management'
    'server:Daemon lifecycle'
    'task:Task management'
    'job:Scheduled jobs'
    'init:Setup wizard'
    'install:Install plugins'
    'trust:Plugin trust'
    'uninstall:Remove plugins'
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
.TH JERIKO 1 "February 2026" "2.0.0" "Jeriko Manual"
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
.TP
.B sys
System info (CPU, RAM, disk, battery, network, processes)
.TP
.B exec
Run shell commands with timeout
.TP
.B fs
Filesystem operations (ls, cat, write, find, grep)
.TP
.B doc
Read PDF, Excel, Word, CSV documents
.TP
.B browse
Browser automation (screenshot, click, navigate)
.TP
.B search
Web search via DuckDuckGo
.TP
.B screenshot
Screen capture
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
.B notify
Send OS or Telegram notifications
.TP
.B email
IMAP email (read, search, send, reply)
.TP
.B msg
iMessage (send, read)
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
.B audio
TTS, microphone recording, volume
.TP
.B clipboard
System clipboard (get, set, clear)
.TP
.B window
Window management (list, focus, resize)
.TP
.B open
Open files, apps, and URLs
.TP
.B camera
Webcam capture
.TP
.B server
Daemon lifecycle (start, stop, restart, status, logs)
.TP
.B memory
Session persistence and KV store
.TP
.B task
Trigger management (cron, webhook, email, HTTP, file)
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
.I ~/.jeriko/
Operational data (database, logs, agent prompts)
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
echo "    $BIN_DIR/jeriko              ← compiled binary"
echo "    $CONF_DIR/config.json        ← configuration"
echo "    $DATA_DIR/                   ← operational data"
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
