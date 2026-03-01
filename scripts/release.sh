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

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'
BOLD='\033[1m'; NC='\033[0m'

info()  { echo -e "${BLUE}→${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
err()   { echo -e "${RED}✗${NC} $1" >&2; }

# Returns .exe for Windows platforms, empty string otherwise
get_ext() {
    case "$1" in
        windows-*) echo ".exe" ;;
        *) echo "" ;;
    esac
}

ALL_PLATFORMS="darwin-arm64 darwin-x64 linux-arm64 linux-x64 linux-arm64-musl linux-x64-musl windows-x64 windows-arm64"

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

# Build using build.ts (handles Solid plugin, externals, minification)
# --all builds every target into dist/; single platform uses --target
if [ "$PLATFORMS" = "$ALL_PLATFORMS" ]; then
    info "Building all platforms via build.ts..."
    if ! bun run scripts/build.ts --all 2>&1; then
        err "Build failed"
        exit 1
    fi
else
    for platform in $PLATFORMS; do
        info "Building ${platform} via build.ts..."
        if ! bun run scripts/build.ts --target "$platform" 2>&1; then
            err "Failed to build ${platform}"
        fi
    done
    # build.ts with --target puts output in dist/ automatically (no override needed,
    # its resolveTargets for a single target outputs to dist/)
fi

# Collect successfully built platforms
BUILT=""
for platform in $PLATFORMS; do
    ext=$(get_ext "$platform")
    outfile="$DIST_DIR/jeriko-${platform}${ext}"
    if [ -f "$outfile" ]; then
        size=$(ls -lh "$outfile" | awk '{print $5}')
        ok "Built ${platform} (${size})"
        BUILT="$BUILT $platform"
    fi
done

BUILT=$(echo "$BUILT" | xargs)  # trim whitespace
if [ -z "$BUILT" ]; then
    err "No platforms built successfully"
    exit 1
fi

# Package templates archive
info "Packaging project templates..."
TEMPLATES_ARCHIVE="$DIST_DIR/templates.tar.gz"
if [ -d "templates" ]; then
    tar -czf "$TEMPLATES_ARCHIVE" -C templates . 2>/dev/null
    tmpl_size=$(ls -lh "$TEMPLATES_ARCHIVE" | awk '{print $5}')
    ok "Templates archive created (${tmpl_size})"
else
    err "templates/ directory not found — templates will not be included in release"
fi

# Generate manifest.json with checksums
info "Generating manifest.json..."

MANIFEST="$DIST_DIR/manifest.json"
echo "{" > "$MANIFEST"
echo "  \"version\": \"${VERSION}\"," >> "$MANIFEST"
echo "  \"platforms\": {" >> "$MANIFEST"

first=true
for platform in $BUILT; do
    ext=$(get_ext "$platform")
    binary="$DIST_DIR/jeriko-${platform}${ext}"
    [ ! -f "$binary" ] && continue

    checksum=$(shasum -a 256 "$binary" 2>/dev/null || sha256sum "$binary" 2>/dev/null)
    checksum=$(echo "$checksum" | cut -d' ' -f1)
    size=$(stat -f%z "$binary" 2>/dev/null || stat -c%s "$binary" 2>/dev/null)

    if [ "$first" = true ]; then first=false; else echo "," >> "$MANIFEST"; fi
    printf "    \"%s\": { \"checksum\": \"%s\", \"size\": %s, \"filename\": \"%s\" }" "$platform" "$checksum" "$size" "jeriko-${platform}${ext}" >> "$MANIFEST"
done

echo "" >> "$MANIFEST"
echo "  }" >> "$MANIFEST"
echo "}" >> "$MANIFEST"

ok "Manifest written to $MANIFEST"

# Summary
echo ""
echo -e "${BOLD}Release artifacts:${NC}"
for platform in $BUILT; do
    ext=$(get_ext "$platform")
    binary="$DIST_DIR/jeriko-${platform}${ext}"
    size=$(ls -lh "$binary" | awk '{print $5}')
    echo "  $binary  ($size)"
done
echo "  $MANIFEST"
if [ -f "$TEMPLATES_ARCHIVE" ]; then
    echo "  $TEMPLATES_ARCHIVE  ($tmpl_size)"
fi
echo ""
echo -e "To publish: ${BOLD}gh release create v${VERSION} dist/*${NC}"
echo ""
