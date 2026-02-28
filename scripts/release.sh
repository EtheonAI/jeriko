#!/usr/bin/env bash
#
# Jeriko Release — Builds binaries for all platforms and generates manifest.json.
#
# Usage:
#   bash scripts/release.sh              Build all platforms
#   bash scripts/release.sh darwin-x64   Build one platform
#
# Output: dist/ directory with binaries + manifest.json
#
set -e

VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"\([0-9][^"]*\)".*/\1/')
DIST_DIR="dist"
BUILD_FLAGS="--compile --minify --bytecode --external qrcode-terminal --external link-preview-js --external jimp --external sharp"
ENTRY="src/index.ts"

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'
BOLD='\033[1m'; NC='\033[0m'

info()  { echo -e "${BLUE}→${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
err()   { echo -e "${RED}✗${NC} $1" >&2; }

# Platform → Bun target mapping
get_target() {
    case "$1" in
        darwin-arm64) echo "bun-darwin-arm64" ;;
        darwin-x64)   echo "bun-darwin-x64" ;;
        linux-arm64)  echo "bun-linux-arm64" ;;
        linux-x64)    echo "bun-linux-x64" ;;
        *) echo "" ;;
    esac
}

ALL_PLATFORMS="darwin-arm64 darwin-x64 linux-arm64 linux-x64"

echo ""
echo -e "${BOLD}Jeriko Release Builder v${VERSION}${NC}"
echo ""

mkdir -p "$DIST_DIR"

# Determine which platforms to build
if [ -n "$1" ]; then
    PLATFORMS="$1"
else
    PLATFORMS="$ALL_PLATFORMS"
fi

# Build each platform
BUILT=""
for platform in $PLATFORMS; do
    target=$(get_target "$platform")
    if [ -z "$target" ]; then
        err "Unknown platform: $platform"
        echo "  Available: $ALL_PLATFORMS"
        exit 1
    fi

    outfile="$DIST_DIR/jeriko-${platform}"
    info "Building ${platform}..."

    if bun build "$ENTRY" $BUILD_FLAGS --target="$target" --outfile="$outfile" 2>&1; then
        size=$(ls -lh "$outfile" | awk '{print $5}')
        ok "Built ${platform} (${size})"
        BUILT="$BUILT $platform"
    else
        err "Failed to build ${platform}"
    fi
done

BUILT=$(echo "$BUILT" | xargs)  # trim whitespace
if [ -z "$BUILT" ]; then
    err "No platforms built successfully"
    exit 1
fi

# Generate manifest.json with checksums
info "Generating manifest.json..."

MANIFEST="$DIST_DIR/manifest.json"
echo "{" > "$MANIFEST"
echo "  \"version\": \"${VERSION}\"," >> "$MANIFEST"
echo "  \"platforms\": {" >> "$MANIFEST"

first=true
for platform in $BUILT; do
    binary="$DIST_DIR/jeriko-${platform}"
    [ ! -f "$binary" ] && continue

    checksum=$(shasum -a 256 "$binary" 2>/dev/null || sha256sum "$binary" 2>/dev/null)
    checksum=$(echo "$checksum" | cut -d' ' -f1)
    size=$(stat -f%z "$binary" 2>/dev/null || stat -c%s "$binary" 2>/dev/null)

    if [ "$first" = true ]; then first=false; else echo "," >> "$MANIFEST"; fi
    printf "    \"%s\": { \"checksum\": \"%s\", \"size\": %s }" "$platform" "$checksum" "$size" >> "$MANIFEST"
done

echo "" >> "$MANIFEST"
echo "  }" >> "$MANIFEST"
echo "}" >> "$MANIFEST"

ok "Manifest written to $MANIFEST"

# Summary
echo ""
echo -e "${BOLD}Release artifacts:${NC}"
for platform in $BUILT; do
    binary="$DIST_DIR/jeriko-${platform}"
    size=$(ls -lh "$binary" | awk '{print $5}')
    echo "  $binary  ($size)"
done
echo "  $MANIFEST"
echo ""
echo -e "To publish: ${BOLD}gh release create v${VERSION} dist/*${NC}"
echo ""
