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

# Parse command line arguments
TARGET="$1"

# Validate target if provided
if [[ -n "$TARGET" ]] && [[ ! "$TARGET" =~ ^(stable|latest|[0-9]+\.[0-9]+\.[0-9]+(-[^[:space:]]+)?)$ ]]; then
    echo "Usage: $0 [stable|latest|VERSION]" >&2
    exit 1
fi

CDN_URL="${JERIKO_CDN_URL:-https://releases.jeriko.ai}"
GITHUB_REPO="etheonai/jeriko"
DOWNLOAD_DIR="$HOME/.jeriko/downloads"

# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------

DOWNLOADER=""
if command -v curl >/dev/null 2>&1; then
    DOWNLOADER="curl"
elif command -v wget >/dev/null 2>&1; then
    DOWNLOADER="wget"
else
    echo "Either curl or wget is required but neither is installed" >&2
    exit 1
fi

HAS_JQ=false
if command -v jq >/dev/null 2>&1; then
    HAS_JQ=true
fi

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

download_file() {
    local url="$1"
    local output="$2"

    if [ "$DOWNLOADER" = "curl" ]; then
        if [ -n "$output" ]; then
            curl -fsSL -o "$output" "$url"
        else
            curl -fsSL "$url"
        fi
    elif [ "$DOWNLOADER" = "wget" ]; then
        if [ -n "$output" ]; then
            wget -q -O "$output" "$url"
        else
            wget -q -O - "$url"
        fi
    else
        return 1
    fi
}

resolve_release_base() {
    local version="$1"
    local asset="$2"
    local url

    for url in \
        "$CDN_URL/releases/$version/$asset" \
        "https://github.com/$GITHUB_REPO/releases/download/v$version/$asset" \
        "https://github.com/$GITHUB_REPO/releases/download/$version/$asset"
    do
        if download_file "$url" "$DOWNLOAD_DIR/.origin-probe" >/dev/null 2>&1; then
            rm -f "$DOWNLOAD_DIR/.origin-probe"
            echo "${url%/$asset}"
            return 0
        fi
    done

    rm -f "$DOWNLOAD_DIR/.origin-probe"
    return 1
}

# Pure-bash JSON parser for extracting checksum when jq is not available.
# Users on minimal installs (no jq, no developer tools) hit this path.
get_checksum_from_manifest() {
    local json="$1"
    local platform="$2"

    json=$(echo "$json" | tr -d '\n\r\t' | sed 's/  */ /g')

    if [[ $json =~ \"$platform\"[^}]*\"checksum\"[[:space:]]*:[[:space:]]*\"([a-f0-9]{64})\" ]]; then
        echo "${BASH_REMATCH[1]}"
        return 0
    fi

    return 1
}

# ---------------------------------------------------------------------------
# Platform detection
# ---------------------------------------------------------------------------

case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux) os="linux" ;;
    MINGW*|MSYS*|CYGWIN*) echo "Windows is not supported by this script. Use WSL instead." >&2; exit 1 ;;
    *) echo "Unsupported operating system: $(uname -s)" >&2; exit 1 ;;
esac

case "$(uname -m)" in
    x86_64|amd64) arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

# Detect Rosetta 2 on macOS — download native arm64 binary
if [ "$os" = "darwin" ] && [ "$arch" = "x64" ]; then
    if [ "$(sysctl -n sysctl.proc_translated 2>/dev/null)" = "1" ]; then
        arch="arm64"
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

# ---------------------------------------------------------------------------
# Download and verify binary
# ---------------------------------------------------------------------------

mkdir -p "$DOWNLOAD_DIR"

version_target="${TARGET:-latest}"
version=$(download_file "$CDN_URL/releases/$version_target" "")

release_base=$(resolve_release_base "$version" "jeriko-$platform") || {
    echo "Download failed" >&2
    exit 1
}

manifest_json=$(download_file "$release_base/manifest.json" "")

if [ "$HAS_JQ" = true ]; then
    checksum=$(echo "$manifest_json" | jq -r ".platforms[\"$platform\"].checksum // empty")
else
    checksum=$(get_checksum_from_manifest "$manifest_json" "$platform")
fi

if [ -z "$checksum" ] || [[ ! "$checksum" =~ ^[a-f0-9]{64}$ ]]; then
    echo "Platform $platform not found in manifest" >&2
    exit 1
fi

binary_path="$DOWNLOAD_DIR/jeriko-$version-$platform"
if ! download_file "$release_base/jeriko-$platform" "$binary_path"; then
    echo "Download failed" >&2
    rm -f "$binary_path"
    exit 1
fi

if [ "$os" = "darwin" ]; then
    actual=$(shasum -a 256 "$binary_path" | cut -d' ' -f1)
elif command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$binary_path" | cut -d' ' -f1)
elif command -v openssl >/dev/null 2>&1; then
    actual=$(openssl dgst -sha256 "$binary_path" | awk '{print $NF}')
else
    echo "No SHA-256 tool found (need sha256sum or openssl)" >&2
    exit 1
fi

if [ "$actual" != "$checksum" ]; then
    echo "Checksum verification failed" >&2
    rm -f "$binary_path"
    exit 1
fi

chmod +x "$binary_path"

# ---------------------------------------------------------------------------
# Download templates (optional — non-fatal if not published to CDN yet)
# ---------------------------------------------------------------------------

templates_dir="$HOME/.local/lib/jeriko/templates"
if [ ! -d "$templates_dir" ]; then
    templates_archive="$DOWNLOAD_DIR/templates-$version.tar.gz"
    if download_file "$release_base/templates.tar.gz" "$templates_archive" 2>/dev/null; then
        # Only create the target directory if the archive is valid — an empty
        # directory would cause self-install to report "Templates already installed"
        if tar -tzf "$templates_archive" >/dev/null 2>&1; then
            mkdir -p "$templates_dir"
            tar -xzf "$templates_archive" -C "$templates_dir" 2>/dev/null
        fi
        rm -f "$templates_archive"
    fi
fi

# ---------------------------------------------------------------------------
# Run self-install — binary handles PATH, agent.md, completions, directories
# ---------------------------------------------------------------------------

echo "Setting up Jeriko..."
"$binary_path" install ${TARGET:+"$TARGET"}

rm -f "$binary_path"

# ---------------------------------------------------------------------------
# Post-install
# ---------------------------------------------------------------------------

installed_version=$("$HOME/.local/bin/jeriko" --version 2>/dev/null || echo "")
echo ""
echo "Installation complete."
if [ -n "$installed_version" ]; then
    echo "Installed: $installed_version"
fi
echo "Documentation: https://jeriko.ai/docs"

# This script runs in a child process (curl | bash), so PATH changes made by
# self-install to the user's shell profile won't take effect here. Tell the
# user exactly what to do so `jeriko` is available immediately.
echo ""
echo "  To get started, open a new terminal — or run:"
echo ""
echo "    exec \$SHELL"
echo ""
