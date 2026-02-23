#!/bin/bash
set -e

# ── JerikoBot Installer ──────────────────────────────────────────────
# curl -fsSL https://jeriko.ai/install.sh | bash

REPO="https://github.com/khaleel737/jerikobot.git"
INSTALL_DIR="$HOME/.jerikobot"
BIN_NAME="jeriko"

# Colors
CYAN='\033[36m'
BLUE='\033[34m'
DIM='\033[2m'
BOLD='\033[1m'
GREEN='\033[32m'
RED='\033[31m'
RESET='\033[0m'

info()  { echo -e "  ${CYAN}$1${RESET}"; }
ok()    { echo -e "  ${GREEN}[ok]${RESET} $1"; }
err()   { echo -e "  ${RED}[!!]${RESET} $1"; }

echo ""
echo -e "  ${BOLD}${CYAN}JerikoBot Installer${RESET}"
echo -e "  ${DIM}Unix-first AI toolkit${RESET}"
echo ""

# ── Step 1: Check Node.js 18+ ────────────────────────────────────────

if command -v node &>/dev/null; then
  NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VERSION" -lt 18 ]; then
    err "Node.js 18+ required (found $(node -v))"
    info "Installing Node.js via nvm..."
    install_nvm=1
  else
    ok "Node.js $(node -v)"
  fi
else
  info "Node.js not found. Installing via nvm..."
  install_nvm=1
fi

if [ "${install_nvm:-0}" = "1" ]; then
  if ! command -v nvm &>/dev/null; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  fi
  nvm install --lts
  nvm use --lts
  ok "Node.js $(node -v) installed via nvm"
fi

# ── Step 2: Clone or update repo ─────────────────────────────────────

if [ -d "$INSTALL_DIR/.git" ]; then
  info "Updating existing installation..."
  cd "$INSTALL_DIR" && git pull --ff-only
  ok "Updated $INSTALL_DIR"
else
  if [ -d "$INSTALL_DIR" ]; then
    # Directory exists but isn't a git repo — back it up
    mv "$INSTALL_DIR" "$INSTALL_DIR.bak.$(date +%s)"
    info "Backed up existing $INSTALL_DIR"
  fi
  info "Cloning JerikoBot..."
  git clone "$REPO" "$INSTALL_DIR"
  ok "Cloned to $INSTALL_DIR"
fi

# ── Step 3: Install dependencies ──────────────────────────────────────

info "Installing dependencies..."
cd "$INSTALL_DIR" && npm install --production --silent 2>/dev/null
ok "Dependencies installed"

# ── Step 4: Symlink jeriko to PATH ────────────────────────────────────

JERIKO_BIN="$INSTALL_DIR/bin/$BIN_NAME"
chmod +x "$JERIKO_BIN"

# Try /usr/local/bin first, fall back to ~/.local/bin
LINK_DIR="/usr/local/bin"
if [ ! -w "$LINK_DIR" ] && ! sudo -n true 2>/dev/null; then
  LINK_DIR="$HOME/.local/bin"
  mkdir -p "$LINK_DIR"
fi

if [ "$LINK_DIR" = "/usr/local/bin" ] && [ ! -w "$LINK_DIR" ]; then
  info "Creating symlink (requires sudo)..."
  sudo ln -sf "$JERIKO_BIN" "$LINK_DIR/$BIN_NAME"
else
  ln -sf "$JERIKO_BIN" "$LINK_DIR/$BIN_NAME"
fi

# Ensure ~/.local/bin is in PATH
if [ "$LINK_DIR" = "$HOME/.local/bin" ]; then
  case ":$PATH:" in
    *":$LINK_DIR:"*) ;;
    *)
      # Add to shell profile
      SHELL_RC=""
      if [ -f "$HOME/.zshrc" ]; then
        SHELL_RC="$HOME/.zshrc"
      elif [ -f "$HOME/.bashrc" ]; then
        SHELL_RC="$HOME/.bashrc"
      elif [ -f "$HOME/.profile" ]; then
        SHELL_RC="$HOME/.profile"
      fi
      if [ -n "$SHELL_RC" ]; then
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
        info "Added ~/.local/bin to PATH in $(basename "$SHELL_RC")"
      fi
      export PATH="$LINK_DIR:$PATH"
      ;;
  esac
fi

ok "Linked: $BIN_NAME -> $JERIKO_BIN"

# ── Step 5: Hand off to jeriko init ───────────────────────────────────

echo ""
info "Launching setup wizard..."
echo ""

# stdin is the curl pipe, so we redirect to /dev/tty for interactive prompts.
# If no TTY available (e.g. Docker), run non-interactive with defaults.
if [ -t 0 ] || [ -e /dev/tty ]; then
  exec "$JERIKO_BIN" init < /dev/tty
else
  info "No TTY detected — running non-interactive setup"
  exec "$JERIKO_BIN" init --yes
fi
