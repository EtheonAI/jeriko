#!/bin/bash
#
# Jeriko Installer — Downloads and installs the pre-compiled binary.
#
# Usage:
#   curl -fsSL https://jeriko.ai/install.sh | bash
#   curl -fsSL https://jeriko.ai/install.sh | bash -s -- latest
#   curl -fsSL https://jeriko.ai/install.sh | bash -s -- 2.0.0
#
set -e

# ── Parse arguments ──────────────────────────────────────────────

TARGET="${1:-latest}"

# Validate target
if [[ -n "$TARGET" ]] && [[ ! "$TARGET" =~ ^(stable|latest|[0-9]+\.[0-9]+\.[0-9]+(-[^[:space:]]+)?)$ ]]; then
    echo "Usage: $0 [stable|latest|VERSION]" >&2
    exit 1
fi

# ── Config ───────────────────────────────────────────────────────

GITHUB_REPO="khaleel737/jeriko"
RELEASES_URL="https://github.com/$GITHUB_REPO/releases"
INSTALL_DIR="${JERIKO_INSTALL_DIR:-$HOME/.local/bin}"
DOWNLOAD_DIR="$HOME/.jeriko/downloads"

# ── Colors ───────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

info()  { echo -e "${BLUE}→${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}!${NC} $1"; }
err()   { echo -e "${RED}✗${NC} $1" >&2; }
die()   { err "$1"; exit 1; }

# ── Dependencies ─────────────────────────────────────────────────

DOWNLOADER=""
if command -v curl >/dev/null 2>&1; then
    DOWNLOADER="curl"
elif command -v wget >/dev/null 2>&1; then
    DOWNLOADER="wget"
else
    die "Either curl or wget is required but neither is installed."
fi

HAS_JQ=false
if command -v jq >/dev/null 2>&1; then
    HAS_JQ=true
fi

download() {
    local url="$1" output="$2"
    if [ "$DOWNLOADER" = "curl" ]; then
        if [ -n "$output" ]; then curl -fsSL -o "$output" "$url"
        else curl -fsSL "$url"; fi
    else
        if [ -n "$output" ]; then wget -q -O "$output" "$url"
        else wget -q -O - "$url"; fi
    fi
}

# ── JSON checksum extraction (no jq fallback) ───────────────────

get_checksum_from_manifest() {
    local json="$1" platform="$2"
    json=$(echo "$json" | tr -d '\n\r\t' | sed 's/ \+/ /g')
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
        die "Windows is not supported by this script. See https://jeriko.ai/docs" ;;
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
echo -e "${BOLD}  ╦╔═╗╦═╗╦╦╔═╔═╗${NC}"
echo -e "${BOLD}  ║║╣ ╠╦╝║╠╩╗║ ║${NC}"
echo -e "${BOLD}  ╩╚═╝╩╚═╩╩ ╩╚═╝${NC}"
echo -e "  ${DIM}Unix-first CLI toolkit for AI agents${NC}"
echo ""

# ── Resolve version ──────────────────────────────────────────────

info "Platform: ${platform}"

if [ "$TARGET" = "latest" ] || [ "$TARGET" = "stable" ]; then
    info "Fetching latest release..."

    RELEASE_JSON=$(download "https://api.github.com/repos/$GITHUB_REPO/releases/latest" "" 2>/dev/null || echo "")

    if [ -n "$RELEASE_JSON" ] && [ "$HAS_JQ" = true ]; then
        VERSION=$(echo "$RELEASE_JSON" | jq -r '.tag_name // empty' | sed 's/^v//')
    elif [ -n "$RELEASE_JSON" ]; then
        VERSION=$(echo "$RELEASE_JSON" | grep -o '"tag_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"v\?\([^"]*\)".*/\1/')
    fi

    if [ -z "$VERSION" ]; then
        die "Could not detect latest version. Check: $RELEASES_URL"
    fi
else
    VERSION="$TARGET"
fi

info "Version: ${VERSION}"

# ── Download ─────────────────────────────────────────────────────

mkdir -p "$DOWNLOAD_DIR"
DOWNLOAD_URL="$RELEASES_URL/download/v${VERSION}/${BINARY_NAME}"
BINARY_PATH="$DOWNLOAD_DIR/jeriko-$VERSION-$platform"

info "Downloading binary..."
if ! download "$DOWNLOAD_URL" "$BINARY_PATH" 2>/dev/null; then
    # Fallback: try without v prefix
    DOWNLOAD_URL="$RELEASES_URL/download/${VERSION}/${BINARY_NAME}"
    if ! download "$DOWNLOAD_URL" "$BINARY_PATH" 2>/dev/null; then
        die "Download failed. Check: $RELEASES_URL"
    fi
fi

# ── Checksum verification ────────────────────────────────────────

MANIFEST_URL="$RELEASES_URL/download/v${VERSION}/manifest.json"
MANIFEST_JSON=$(download "$MANIFEST_URL" "" 2>/dev/null || echo "")

if [ -n "$MANIFEST_JSON" ]; then
    info "Verifying checksum..."

    if [ "$HAS_JQ" = true ]; then
        expected=$(echo "$MANIFEST_JSON" | jq -r ".platforms[\"$platform\"].checksum // empty")
    else
        expected=$(get_checksum_from_manifest "$MANIFEST_JSON" "$platform")
    fi

    if [ -z "$expected" ] || [[ ! "$expected" =~ ^[a-f0-9]{64}$ ]]; then
        rm -f "$BINARY_PATH"
        die "Platform $platform not found in manifest"
    fi

    if [ "$os" = "darwin" ]; then
        actual=$(shasum -a 256 "$BINARY_PATH" | cut -d' ' -f1)
    else
        actual=$(sha256sum "$BINARY_PATH" | cut -d' ' -f1)
    fi

    if [ "$actual" != "$expected" ]; then
        rm -f "$BINARY_PATH"
        die "Checksum verification failed (expected $expected, got $actual)"
    fi
    ok "Checksum verified"
else
    rm -f "$BINARY_PATH"
    die "No manifest found — cannot verify binary integrity"
fi

chmod +x "$BINARY_PATH"

# ── Install binary ───────────────────────────────────────────────

mkdir -p "$INSTALL_DIR"
cp "$BINARY_PATH" "$INSTALL_DIR/jeriko"
chmod +x "$INSTALL_DIR/jeriko"
ok "Binary installed to $INSTALL_DIR/jeriko"

# ── Run setup ────────────────────────────────────────────────────

info "Running post-install setup..."
"$INSTALL_DIR/jeriko" setup ${TARGET:+"$TARGET"}

# ── Cleanup ──────────────────────────────────────────────────────

rm -f "$BINARY_PATH"

echo ""
echo -e "${GREEN}${BOLD}  Installation complete!${NC}"
echo ""
echo -e "  ${DIM}Documentation:${NC} ${BLUE}https://jeriko.ai/docs${NC}"
echo ""
