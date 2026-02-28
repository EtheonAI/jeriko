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

# Download function — uses gh for GitHub API/assets (handles private repos),
# falls back to curl/wget for public URLs.
download() {
    local url="$1" output="$2"

    # For GitHub URLs, prefer gh CLI (handles auth for private repos)
    if [ "$HAS_GH" = true ] && [[ "$url" == *"github.com"* || "$url" == *"api.github.com"* ]]; then
        if [[ "$url" == *"api.github.com"* ]]; then
            # API call — use gh api
            local api_path="${url#https://api.github.com}"
            if [ -n "$output" ]; then
                gh api "$api_path" > "$output" 2>/dev/null
            else
                gh api "$api_path" 2>/dev/null
            fi
            return $?
        fi
        # Release asset download — use gh release download
        # (handled separately in download_asset)
    fi

    # Fallback to curl/wget
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

# Download a release asset by name
download_asset() {
    local version="$1" asset_name="$2" output="$3"

    if [ "$HAS_GH" = true ]; then
        gh release download "v${version}" \
            --repo "$GITHUB_REPO" \
            --pattern "$asset_name" \
            --output "$output" 2>/dev/null && return 0

        # Fallback: try without v prefix
        gh release download "${version}" \
            --repo "$GITHUB_REPO" \
            --pattern "$asset_name" \
            --output "$output" 2>/dev/null && return 0
    fi

    # Fallback to direct URL download
    local url="$RELEASES_URL/download/v${version}/${asset_name}"
    download "$url" "$output" 2>/dev/null && return 0

    # Try without v prefix
    url="$RELEASES_URL/download/${version}/${asset_name}"
    download "$url" "$output" 2>/dev/null && return 0

    return 1
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

    if [ "$HAS_GH" = true ]; then
        # Use gh CLI — handles private repos and prereleases
        VERSION=$(gh release list --repo "$GITHUB_REPO" --limit 1 --json tagName -q '.[0].tagName' 2>/dev/null | sed 's/^v//')
    fi

    if [ -z "$VERSION" ]; then
        # Fallback to GitHub API (public repos only)
        RELEASE_JSON=$(download "https://api.github.com/repos/$GITHUB_REPO/releases/latest" "" 2>/dev/null || echo "")

        if [ -n "$RELEASE_JSON" ] && [ "$HAS_JQ" = true ]; then
            VERSION=$(echo "$RELEASE_JSON" | jq -r '.tag_name // empty' | sed 's/^v//')
        elif [ -n "$RELEASE_JSON" ]; then
            VERSION=$(echo "$RELEASE_JSON" | grep -o '"tag_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"v\?\([^"]*\)".*/\1/')
        fi
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
    rm -f "$MANIFEST_PATH"
else
    MANIFEST_JSON=""
fi

if [ -n "$MANIFEST_JSON" ]; then
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

# ── Create directories ────────────────────────────────────────────

JERIKO_DIR="$HOME/.jeriko"
info "Creating directories..."
mkdir -p "$JERIKO_DIR/data"          # Agent logs, DB
mkdir -p "$JERIKO_DIR/logs"          # App logs
mkdir -p "$JERIKO_DIR/workspace"     # Scripts, outputs, temp data (CodeAct)
mkdir -p "$JERIKO_DIR/projects"      # Web/app dev projects
mkdir -p "$JERIKO_DIR/memory"        # Session memory, KV store
mkdir -p "$JERIKO_DIR/plugins"       # Installed plugins
mkdir -p "$JERIKO_DIR/prompts"       # Custom system prompts
mkdir -p "$JERIKO_DIR/downloads"     # Cached release assets
mkdir -p "${XDG_CONFIG_HOME:-$HOME/.config}/jeriko"  # Config
ok "Directories created"

# ── Install templates ────────────────────────────────────────────

LIB_DIR="$HOME/.local/lib/jeriko"
TEMPLATES_DIR="$LIB_DIR/templates"

info "Downloading project templates..."
TEMPLATES_ARCHIVE="$DOWNLOAD_DIR/templates-$VERSION.tar.gz"

if download_asset "$VERSION" "templates.tar.gz" "$TEMPLATES_ARCHIVE" 2>/dev/null; then
    mkdir -p "$TEMPLATES_DIR"
    tar -xzf "$TEMPLATES_ARCHIVE" -C "$TEMPLATES_DIR" 2>/dev/null
    rm -f "$TEMPLATES_ARCHIVE"

    # Count installed templates
    TMPL_COUNT=0
    for sub in webdev deploy; do
        if [ -d "$TEMPLATES_DIR/$sub" ]; then
            TMPL_COUNT=$((TMPL_COUNT + $(ls -d "$TEMPLATES_DIR/$sub"/*/ 2>/dev/null | wc -l)))
        fi
    done
    ok "$TMPL_COUNT project templates installed"
else
    warn "Templates archive not found in release — jeriko create may have limited templates"
    warn "Templates will be installed from source when running 'jeriko setup' in the repo"
fi

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
