#!/bin/bash
#
# Jeriko Installer — Downloads and installs the pre-compiled binary.
#
# Usage:
#   curl -fsSL https://jeriko.ai/install.sh | bash
#   curl -fsSL https://jeriko.ai/install.sh | bash -s -- latest
#   curl -fsSL https://jeriko.ai/install.sh | bash -s -- 2.0.0
#
# For private repos, requires `gh` CLI (authenticated):
#   bash scripts/install.sh
#
set -euo pipefail

# ── Parse arguments ──────────────────────────────────────────────

TARGET="${1:-latest}"

# Validate target
if [[ -n "$TARGET" ]] && [[ ! "$TARGET" =~ ^(stable|latest|[0-9]+\.[0-9]+\.[0-9]+(-[^[:space:]]+)?)$ ]]; then
    echo "Usage: $0 [stable|latest|VERSION]" >&2
    exit 1
fi

# ── Config ───────────────────────────────────────────────────────

GITHUB_REPO="etheonai/jeriko"
RELEASES_URL="https://github.com/$GITHUB_REPO/releases"
CDN_URL="${JERIKO_CDN_URL:-https://releases.jeriko.ai}"
DOWNLOAD_DIR="$HOME/.jeriko/downloads"

# ── Colors (only when stdout is a terminal) ──────────────────────

RED=''; GREEN=''; YELLOW=''; BLUE=''; BOLD=''; DIM=''; NC=''
if [[ -t 1 ]]; then
    RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
    BLUE='\033[0;34m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'
fi

info()  { echo -e "${BLUE}→${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}!${NC} $1"; }
err()   { echo -e "${RED}✗${NC} $1" >&2; }
die()   { err "$1"; exit 1; }

# Replace $HOME prefix with ~ for clean display paths.
tildify() {
    if [[ "$1" == "$HOME"/* ]]; then
        echo "~${1#"$HOME"}"
    else
        echo "$1"
    fi
}

# ── Cleanup trap ────────────────────────────────────────────────

cleanup() {
    rm -f "${BINARY_PATH:-}" "${MANIFEST_PATH:-}" "${AGENT_MD_PATH:-}"
}
trap cleanup EXIT

# ── Dependencies ─────────────────────────────────────────────────

HAS_GH=false
if command -v gh >/dev/null 2>&1; then
    HAS_GH=true
fi

DOWNLOADER=""
if command -v curl >/dev/null 2>&1; then
    DOWNLOADER="curl"
elif command -v wget >/dev/null 2>&1; then
    DOWNLOADER="wget"
elif [ "$HAS_GH" = false ]; then
    die "curl, wget, or gh CLI is required but none are installed."
fi

HAS_JQ=false
if command -v jq >/dev/null 2>&1; then
    HAS_JQ=true
fi

# Download function — tries CDN first, falls back to GitHub.
download() {
    local url="$1" output="${2:-}"

    # For GitHub URLs, prefer gh CLI (handles auth for private repos)
    if [ "$HAS_GH" = true ] && [[ "$url" == *"github.com"* || "$url" == *"api.github.com"* ]]; then
        if [[ "$url" == *"api.github.com"* ]]; then
            local api_path="${url#https://api.github.com}"
            if [ -n "$output" ]; then
                gh api "$api_path" > "$output" 2>/dev/null
            else
                gh api "$api_path" 2>/dev/null
            fi
            return $?
        fi
    fi

    # curl/wget
    if [ "$DOWNLOADER" = "curl" ]; then
        if [ -n "$output" ]; then curl -fsSL -o "$output" "$url"
        else curl -fsSL "$url"; fi
    elif [ "$DOWNLOADER" = "wget" ]; then
        if [ -n "$output" ]; then wget -q -O "$output" "$url"
        else wget -q -O - "$url"; fi
    else
        return 1
    fi
}

# Download a release asset — tries CDN, then gh, then direct GitHub URL.
download_asset() {
    local version="$1" asset_name="$2" output="$3"

    # Try CDN first
    local cdn_url="${CDN_URL}/releases/${version}/${asset_name}"
    if download "$cdn_url" "$output" 2>/dev/null; then
        return 0
    fi

    # Try gh CLI
    if [ "$HAS_GH" = true ]; then
        gh release download "v${version}" \
            --repo "$GITHUB_REPO" \
            --pattern "$asset_name" \
            --output "$output" 2>/dev/null && return 0

        gh release download "${version}" \
            --repo "$GITHUB_REPO" \
            --pattern "$asset_name" \
            --output "$output" 2>/dev/null && return 0
    fi

    # Fallback to direct GitHub URL
    local url="$RELEASES_URL/download/v${version}/${asset_name}"
    download "$url" "$output" 2>/dev/null && return 0

    url="$RELEASES_URL/download/${version}/${asset_name}"
    download "$url" "$output" 2>/dev/null && return 0

    return 1
}

# ── JSON checksum extraction (no jq fallback) ───────────────────

get_checksum_from_manifest() {
    local json="$1" platform="$2"
    json=$(echo "$json" | tr -d '\n\r\t' | sed 's/  */ /g')
    if [[ $json =~ \"$platform\"[^}]*\"checksum\"[[:space:]]*:[[:space:]]*\"([a-f0-9]{64})\" ]]; then
        echo "${BASH_REMATCH[1]}"
        return 0
    fi
    return 1
}

# ── Detect platform ──────────────────────────────────────────────

case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux)  os="linux" ;;
    MINGW*|MSYS*|CYGWIN*)
        die "Windows detected — use the PowerShell installer instead:
  irm https://jeriko.ai/install.ps1 | iex" ;;
    *)
        die "Unsupported operating system: $(uname -s)" ;;
esac

case "$(uname -m)" in
    x86_64|amd64) arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *) die "Unsupported architecture: $(uname -m)" ;;
esac

# Detect Rosetta 2 on macOS — prefer native arm64
if [ "$os" = "darwin" ] && [ "$arch" = "x64" ]; then
    if [ "$(sysctl -n sysctl.proc_translated 2>/dev/null)" = "1" ]; then
        arch="arm64"
        info "Rosetta 2 detected — downloading native arm64 binary"
    fi
fi

# Detect musl on Linux
if [ "$os" = "linux" ]; then
    if [ -f /lib/libc.musl-x86_64.so.1 ] || [ -f /lib/libc.musl-aarch64.so.1 ] || ldd /bin/ls 2>&1 | grep -q musl; then
        platform="linux-${arch}-musl"
    else
        platform="linux-${arch}"
    fi
else
    platform="${os}-${arch}"
fi

BINARY_NAME="jeriko-${platform}"

# ── Header ───────────────────────────────────────────────────────

echo ""
echo -e "  ${DIM}▄▄       ▄▄${NC}"
echo -e "  ${DIM}█▀▀▀▀▀▀▀▀▀▀▀█${NC}"
echo -e "  ${DIM}█  ▀     ▀  █${NC}   ${BOLD}jeriko${NC}"
echo -e "  ${DIM}█     ▄     █${NC}   ${DIM}CLI toolkit for AI agents${NC}"
echo -e "  ${DIM}▀▀▀▀▀▀▀▀▀▀▀▀▀${NC}"
echo ""

# ── Check for existing installation ─────────────────────────────

EXISTING_VERSION=""
if command -v jeriko >/dev/null 2>&1; then
    EXISTING_VERSION=$(jeriko --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+(-[^\s]+)?' || true)
fi

# ── Resolve version ──────────────────────────────────────────────

info "Platform: ${platform}"

if [ "$TARGET" = "latest" ] || [ "$TARGET" = "stable" ]; then
    info "Fetching ${TARGET} version..."

    # Try CDN version file first
    VERSION=$(download "${CDN_URL}/releases/${TARGET}" "" 2>/dev/null | tr -d '[:space:]') || true

    # Fallback to gh CLI
    if [ -z "${VERSION:-}" ] && [ "$HAS_GH" = true ]; then
        VERSION=$(gh release list --repo "$GITHUB_REPO" --limit 1 --json tagName -q '.[0].tagName' 2>/dev/null | sed 's/^v//') || true
    fi

    # Fallback to GitHub API
    if [ -z "${VERSION:-}" ]; then
        RELEASE_JSON=$(download "https://api.github.com/repos/$GITHUB_REPO/releases/latest" "" 2>/dev/null || echo "")

        if [ -n "$RELEASE_JSON" ] && [ "$HAS_JQ" = true ]; then
            VERSION=$(echo "$RELEASE_JSON" | jq -r '.tag_name // empty' | sed 's/^v//')
        elif [ -n "$RELEASE_JSON" ]; then
            VERSION=$(echo "$RELEASE_JSON" | grep -o '"tag_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"v\?\([^"]*\)".*/\1/')
        fi
    fi

    if [ -z "${VERSION:-}" ]; then
        die "Could not detect latest version. Check: $RELEASES_URL"
    fi
else
    VERSION="$TARGET"
fi

info "Version: ${VERSION}"

# Check if already up-to-date
if [ -n "$EXISTING_VERSION" ] && [ "$EXISTING_VERSION" = "$VERSION" ]; then
    ok "Already up-to-date (${VERSION})"
    exit 0
elif [ -n "$EXISTING_VERSION" ]; then
    info "Upgrading ${EXISTING_VERSION} → ${VERSION}"
fi

# ── Download ─────────────────────────────────────────────────────

mkdir -p "$DOWNLOAD_DIR"
BINARY_PATH="$DOWNLOAD_DIR/jeriko-$VERSION-$platform"

info "Downloading ${BINARY_NAME}..."
if ! download_asset "$VERSION" "$BINARY_NAME" "$BINARY_PATH"; then
    die "Download failed. Check: $RELEASES_URL"
fi

# ── Checksum verification ────────────────────────────────────────

MANIFEST_PATH="$DOWNLOAD_DIR/manifest-$VERSION.json"
info "Verifying checksum..."

if download_asset "$VERSION" "manifest.json" "$MANIFEST_PATH" 2>/dev/null; then
    MANIFEST_JSON=$(cat "$MANIFEST_PATH" 2>/dev/null)
else
    MANIFEST_JSON=""
fi

if [ -n "$MANIFEST_JSON" ]; then
    if [ "$HAS_JQ" = true ]; then
        expected=$(echo "$MANIFEST_JSON" | jq -r ".platforms[\"$platform\"].checksum // empty")
    else
        expected=$(get_checksum_from_manifest "$MANIFEST_JSON" "$platform")
    fi

    if [ -z "${expected:-}" ] || [[ ! "$expected" =~ ^[a-f0-9]{64}$ ]]; then
        die "Platform $platform not found in manifest"
    fi

    if [ "$os" = "darwin" ]; then
        actual=$(shasum -a 256 "$BINARY_PATH" | cut -d' ' -f1)
    else
        actual=$(sha256sum "$BINARY_PATH" | cut -d' ' -f1)
    fi

    if [ "$actual" != "$expected" ]; then
        die "Checksum verification failed (expected $expected, got $actual)"
    fi
    ok "Checksum verified"
else
    die "No manifest found — cannot verify binary integrity"
fi

chmod +x "$BINARY_PATH"

# ── Download agent system prompt ─────────────────────────────────

AGENT_MD_PATH="$DOWNLOAD_DIR/agent.md"
info "Downloading agent system prompt..."
if download_asset "$VERSION" "agent.md" "$AGENT_MD_PATH" 2>/dev/null; then
    CONF_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/jeriko"
    mkdir -p "$CONF_DIR"
    cp "$AGENT_MD_PATH" "$CONF_DIR/agent.md"
    ok "Agent prompt → $(tildify "$CONF_DIR/agent.md")"
else
    warn "Could not download agent.md — run 'jeriko init' to configure"
fi

# ── Self-install via binary ──────────────────────────────────────

info "Running self-install..."
"$BINARY_PATH" install "$VERSION"

# Cleanup handled by trap

echo ""
echo -e "${GREEN}${BOLD}  Installation complete!${NC}"
echo ""
if [ -n "$EXISTING_VERSION" ]; then
    echo -e "  ${DIM}Upgraded:${NC} ${EXISTING_VERSION} → ${VERSION}"
else
    echo -e "  ${DIM}Installed:${NC} ${VERSION}"
fi
echo -e "  ${DIM}Documentation:${NC} ${BLUE}https://jeriko.ai/docs${NC}"
echo ""

# ── Run onboarding wizard (first install only) ──────────────────
if [ -z "$EXISTING_VERSION" ] && [ -t 0 ]; then
    # Only run onboarding on fresh installs with an interactive terminal
    info "Starting setup wizard..."
    "$BINARY_PATH" onboard || true
fi
