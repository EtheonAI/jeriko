#!/bin/bash
set -e

# ── JerikoBot Installer ──────────────────────────────────────────────
# curl -fsSL https://jerikobot.vercel.app/install.sh | bash
#
# Flags:
#   --install-method npm|git   (default: npm)
#   --version <version>        (default: latest)
#   --no-onboard               skip jeriko init
#   --git-dir <path>           git clone target (default: ~/.jerikobot)
#   --dry-run                  show what would happen
#   --verbose                  detailed output

REPO="https://github.com/khaleel737/jerikobot.git"
INSTALL_DIR="$HOME/.jerikobot"
BIN_NAME="jeriko"
INSTALL_METHOD="npm"
VERSION="latest"
NO_ONBOARD=0
DRY_RUN=0
VERBOSE=0

# ── Colors ──────────────────────────────────────────────────────────

CYAN='\033[36m'
BLUE='\033[34m'
DIM='\033[2m'
BOLD='\033[1m'
GREEN='\033[32m'
RED='\033[31m'
YELLOW='\033[33m'
RESET='\033[0m'

info()  { echo -e "  ${CYAN}$1${RESET}"; }
ok()    { echo -e "  ${GREEN}[ok]${RESET} $1"; }
err()   { echo -e "  ${RED}[!!]${RESET} $1"; }
warn()  { echo -e "  ${YELLOW}[--]${RESET} $1"; }
debug() { [ "$VERBOSE" = "1" ] && echo -e "  ${DIM}$1${RESET}" || true; }
dry()   { echo -e "  ${BLUE}[dry-run]${RESET} $1"; }

# ── Parse flags ─────────────────────────────────────────────────────

while [ $# -gt 0 ]; do
  case "$1" in
    --install-method)
      INSTALL_METHOD="$2"
      if [ "$INSTALL_METHOD" != "npm" ] && [ "$INSTALL_METHOD" != "git" ]; then
        err "Invalid install method: $INSTALL_METHOD (use npm or git)"
        exit 1
      fi
      shift 2
      ;;
    --version)
      VERSION="$2"
      shift 2
      ;;
    --no-onboard)
      NO_ONBOARD=1
      shift
      ;;
    --git-dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --verbose)
      VERBOSE=1
      shift
      ;;
    --help|-h)
      echo "Usage: install.sh [flags]"
      echo ""
      echo "Flags:"
      echo "  --install-method npm|git   Install method (default: npm)"
      echo "  --version <version>        Package version (default: latest)"
      echo "  --no-onboard               Skip jeriko init after install"
      echo "  --git-dir <path>           Git clone directory (default: ~/.jerikobot)"
      echo "  --dry-run                  Show what would happen without doing it"
      echo "  --verbose                  Detailed output"
      echo "  --help                     Show this help"
      exit 0
      ;;
    *)
      err "Unknown flag: $1"
      exit 1
      ;;
  esac
done

# ── Banner ──────────────────────────────────────────────────────────

echo ""
echo -e "  ${BOLD}${CYAN}JerikoBot Installer${RESET}"
echo -e "  ${DIM}Unix-first AI toolkit${RESET}"
echo ""
debug "Method: $INSTALL_METHOD | Version: $VERSION | Dir: $INSTALL_DIR"

# ── Detect OS ───────────────────────────────────────────────────────

OS="unknown"
UNAME_S="$(uname -s)"
case "$UNAME_S" in
  Darwin*)  OS="macos" ;;
  Linux*)
    if grep -qi microsoft /proc/version 2>/dev/null; then
      OS="wsl"
    else
      OS="linux"
    fi
    ;;
  MINGW*|MSYS*|CYGWIN*)
    OS="windows"
    ;;
esac

debug "Detected OS: $OS ($UNAME_S)"

if [ "$OS" = "unknown" ]; then
  err "Unsupported OS: $UNAME_S"
  exit 1
fi

if [ "$OS" = "windows" ]; then
  warn "For native Windows, use install.ps1 or install.cmd instead"
  warn "Continuing with MSYS/Git Bash install..."
fi

# ── Helper: install system package ──────────────────────────────────

install_pkg() {
  local pkg="$1"
  if [ "$OS" = "macos" ]; then
    if command -v brew &>/dev/null; then
      info "Installing $pkg via Homebrew..."
      [ "$DRY_RUN" = "1" ] && { dry "brew install $pkg"; return 0; }
      brew install "$pkg"
    else
      err "Homebrew not found. Install $pkg manually or install Homebrew first:"
      err "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
      exit 1
    fi
  elif [ "$OS" = "linux" ] || [ "$OS" = "wsl" ]; then
    if command -v apt-get &>/dev/null; then
      info "Installing $pkg via apt..."
      [ "$DRY_RUN" = "1" ] && { dry "sudo apt-get install -y $pkg"; return 0; }
      sudo apt-get update -qq && sudo apt-get install -y "$pkg"
    elif command -v dnf &>/dev/null; then
      info "Installing $pkg via dnf..."
      [ "$DRY_RUN" = "1" ] && { dry "sudo dnf install -y $pkg"; return 0; }
      sudo dnf install -y "$pkg"
    elif command -v yum &>/dev/null; then
      info "Installing $pkg via yum..."
      [ "$DRY_RUN" = "1" ] && { dry "sudo yum install -y $pkg"; return 0; }
      sudo yum install -y "$pkg"
    elif command -v pacman &>/dev/null; then
      info "Installing $pkg via pacman..."
      [ "$DRY_RUN" = "1" ] && { dry "sudo pacman -S --noconfirm $pkg"; return 0; }
      sudo pacman -S --noconfirm "$pkg"
    else
      err "No package manager found. Install $pkg manually."
      exit 1
    fi
  fi
}

# ── Step 1: Check Node.js 18+ ──────────────────────────────────────

install_nvm=0
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

if [ "$install_nvm" = "1" ]; then
  if [ "$DRY_RUN" = "1" ]; then
    dry "Install nvm + Node.js LTS"
  else
    if ! command -v nvm &>/dev/null; then
      curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
      export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
      [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    fi
    nvm install --lts
    nvm use --lts
    ok "Node.js $(node -v) installed via nvm"
  fi
fi

# ── Step 2: Check git ──────────────────────────────────────────────

if ! command -v git &>/dev/null; then
  if [ "$INSTALL_METHOD" = "git" ]; then
    install_pkg git
    ok "git installed"
  else
    debug "git not found (not required for npm method)"
  fi
else
  ok "git $(git --version | cut -d' ' -f3)"
fi

# ── Step 3: Install ────────────────────────────────────────────────

if [ "$INSTALL_METHOD" = "npm" ]; then
  # ── npm install ──
  info "Installing JerikoBot via npm..."

  NPM_PKG="jerikobot"
  if [ "$VERSION" != "latest" ]; then
    NPM_PKG="jerikobot@$VERSION"
  fi

  if [ "$DRY_RUN" = "1" ]; then
    dry "npm install -g $NPM_PKG"
  else
    npm install -g "$NPM_PKG"
    ok "Installed jerikobot@$(jeriko --version 2>/dev/null || echo "$VERSION") globally"
  fi

  # Ensure npm global bin is in PATH
  NPM_BIN="$(npm config get prefix)/bin"
  case ":$PATH:" in
    *":$NPM_BIN:"*) ;;
    *)
      debug "npm global bin ($NPM_BIN) not in PATH, adding..."
      SHELL_RC=""
      if [ -f "$HOME/.zshrc" ]; then
        SHELL_RC="$HOME/.zshrc"
      elif [ -f "$HOME/.bashrc" ]; then
        SHELL_RC="$HOME/.bashrc"
      elif [ -f "$HOME/.profile" ]; then
        SHELL_RC="$HOME/.profile"
      fi
      if [ -n "$SHELL_RC" ] && ! grep -q "$NPM_BIN" "$SHELL_RC" 2>/dev/null; then
        echo "export PATH=\"$NPM_BIN:\$PATH\"" >> "$SHELL_RC"
        info "Added npm bin to PATH in $(basename "$SHELL_RC")"
      fi
      export PATH="$NPM_BIN:$PATH"
      ;;
  esac

else
  # ── git install ──
  info "Installing JerikoBot via git clone..."

  if [ "$DRY_RUN" = "1" ]; then
    dry "git clone $REPO $INSTALL_DIR"
    dry "cd $INSTALL_DIR && npm install --production"
    dry "Symlink $INSTALL_DIR/bin/$BIN_NAME to PATH"
  else
    if [ -d "$INSTALL_DIR/.git" ]; then
      info "Updating existing installation..."
      cd "$INSTALL_DIR" && git pull --ff-only
      ok "Updated $INSTALL_DIR"
    else
      if [ -d "$INSTALL_DIR" ]; then
        mv "$INSTALL_DIR" "$INSTALL_DIR.bak.$(date +%s)"
        info "Backed up existing $INSTALL_DIR"
      fi
      if [ "$VERSION" != "latest" ]; then
        git clone --branch "v$VERSION" --depth 1 "$REPO" "$INSTALL_DIR"
      else
        git clone --depth 1 "$REPO" "$INSTALL_DIR"
      fi
      ok "Cloned to $INSTALL_DIR"
    fi

    info "Installing dependencies..."
    cd "$INSTALL_DIR" && npm install --production --silent 2>/dev/null
    ok "Dependencies installed"

    # Symlink jeriko to PATH
    JERIKO_BIN="$INSTALL_DIR/bin/$BIN_NAME"
    chmod +x "$JERIKO_BIN"

    # Make all bin/ scripts executable
    chmod +x "$INSTALL_DIR"/bin/jeriko-* 2>/dev/null || true

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
  fi
fi

# ── Step 4: Verify ─────────────────────────────────────────────────

if [ "$DRY_RUN" = "0" ]; then
  if command -v jeriko &>/dev/null; then
    CMDS=$(jeriko discover --list 2>/dev/null | head -3 || true)
    if [ -n "$CMDS" ]; then
      ok "Verified — jeriko is working"
      debug "Sample commands: $CMDS"
    else
      warn "jeriko installed but discover --list returned empty"
      warn "You may need to restart your shell: exec \$SHELL"
    fi
  else
    warn "jeriko not found in PATH — restart your shell: exec \$SHELL"
  fi
fi

# ── Step 5: Onboarding ─────────────────────────────────────────────

if [ "$NO_ONBOARD" = "1" ]; then
  echo ""
  ok "Installation complete (onboarding skipped)"
  echo -e "  ${DIM}Run 'jeriko init' when you're ready to set up${RESET}"
  echo ""
  exit 0
fi

if [ "$DRY_RUN" = "1" ]; then
  dry "jeriko init"
  echo ""
  ok "Dry run complete — no changes made"
  echo ""
  exit 0
fi

echo ""
info "Launching setup wizard..."
echo ""

# stdin is the curl pipe, so redirect to /dev/tty for interactive prompts
if [ -t 0 ] || [ -e /dev/tty ]; then
  exec jeriko init < /dev/tty
else
  info "No TTY detected — running non-interactive setup"
  exec jeriko init --yes
fi
