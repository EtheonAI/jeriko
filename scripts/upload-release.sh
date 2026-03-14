#!/usr/bin/env bash
#
# Jeriko Release Upload — Uploads built artifacts to CDN and GitHub Releases.
#
# Prerequisites:
#   - `wrangler` CLI authenticated to Cloudflare (for R2)
#   - `gh` CLI authenticated to GitHub
#   - `scripts/release.sh` already ran (dist/ populated)
#
# Usage:
#   bash scripts/upload-release.sh              Upload to CDN + GitHub Release
#   bash scripts/upload-release.sh --cdn-only   Upload to CDN only
#   bash scripts/upload-release.sh --gh-only    Upload to GitHub Release only
#   bash scripts/upload-release.sh --stable     Also update the stable channel
#
set -euo pipefail

# ── Config ───────────────────────────────────────────────────────

VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"\([0-9][^"]*\)".*/\1/')
DIST_DIR="dist"
R2_BUCKET="${JERIKO_R2_BUCKET:-jeriko-releases}"
GITHUB_REPO="etheonai/jeriko"
RELEASES_URL="https://github.com/$GITHUB_REPO/releases"

# Cloudflare account — required for R2 uploads (set in CI secrets or local env)
if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
    die "CLOUDFLARE_ACCOUNT_ID is required. Set it in your environment or CI secrets."
fi
export CLOUDFLARE_ACCOUNT_ID

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'
YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'

info()  { echo -e "${BLUE}→${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}!${NC} $1"; }
err()   { echo -e "${RED}✗${NC} $1" >&2; }
die()   { err "$1"; exit 1; }

# ── Parse flags ──────────────────────────────────────────────────

DO_CDN=true
DO_GH=true
DO_STABLE=false

for arg in "$@"; do
    case "$arg" in
        --cdn-only)  DO_GH=false ;;
        --gh-only)   DO_CDN=false ;;
        --stable)    DO_STABLE=true ;;
        --help|-h)
            echo "Usage: $0 [--cdn-only] [--gh-only] [--stable]"
            echo ""
            echo "Uploads dist/ artifacts to Cloudflare R2 and/or GitHub Releases."
            echo ""
            echo "Flags:"
            echo "  --cdn-only   Upload to R2 CDN only"
            echo "  --gh-only    Create GitHub Release only"
            echo "  --stable     Also update the 'stable' channel pointer"
            exit 0
            ;;
        *)
            die "Unknown flag: $arg. Use --help for usage."
            ;;
    esac
done

# ── Validate ─────────────────────────────────────────────────────

if [ ! -d "$DIST_DIR" ]; then
    die "dist/ directory not found. Run 'bash scripts/release.sh' first."
fi

if [ ! -f "$DIST_DIR/manifest.json" ]; then
    die "dist/manifest.json not found. Run 'bash scripts/release.sh' first."
fi

echo ""
echo -e "${BOLD}Jeriko Release Upload v${VERSION}${NC}"
echo ""

# ── Platform list (derived from manifest) ────────────────────────

ALL_PLATFORMS=$(grep -oE '"[a-z]+-[a-z0-9]+(-(musl))?"' "$DIST_DIR/manifest.json" | tr -d '"' | sort -u)

# Filename for a platform (handles .exe)
binary_filename() {
    local platform="$1"
    case "$platform" in
        windows-*) echo "jeriko-${platform}.exe" ;;
        *)         echo "jeriko-${platform}" ;;
    esac
}

# ── CDN Upload (Cloudflare R2) ───────────────────────────────────

if [ "$DO_CDN" = true ]; then
    info "Uploading to Cloudflare R2 (bucket: $R2_BUCKET)..."

    # Resolve wrangler: global install, local install, or npx
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
    LOCAL_WRANGLER="$ROOT_DIR/apps/relay-worker/node_modules/.bin/wrangler"

    if command -v wrangler >/dev/null 2>&1; then
        WRANGLER="wrangler"
    elif [ -x "$LOCAL_WRANGLER" ]; then
        WRANGLER="$LOCAL_WRANGLER"
    elif command -v npx >/dev/null 2>&1; then
        WRANGLER="npx wrangler"
    else
        die "wrangler CLI is required for CDN upload. Install: npm i -g wrangler"
    fi

    # Upload each binary
    for platform in $ALL_PLATFORMS; do
        filename=$(binary_filename "$platform")
        local_path="$DIST_DIR/$filename"

        if [ ! -f "$local_path" ]; then
            warn "Skipping $platform — $local_path not found"
            continue
        fi

        r2_key="releases/${VERSION}/${filename}"
        info "  Uploading $filename → $r2_key"
        $WRANGLER r2 object put "${R2_BUCKET}/${r2_key}" --file "$local_path" --ct "application/octet-stream" --remote
        ok "  $platform uploaded"
    done

    # Upload manifest
    info "  Uploading manifest.json"
    $WRANGLER r2 object put "${R2_BUCKET}/releases/${VERSION}/manifest.json" \
        --file "$DIST_DIR/manifest.json" \
        --ct "application/json" --remote
    ok "  manifest.json uploaded"

    # Upload templates archive if present
    if [ -f "$DIST_DIR/templates.tar.gz" ]; then
        info "  Uploading templates.tar.gz"
        $WRANGLER r2 object put "${R2_BUCKET}/releases/${VERSION}/templates.tar.gz" \
            --file "$DIST_DIR/templates.tar.gz" \
            --ct "application/gzip" --remote
        ok "  templates.tar.gz uploaded"
    fi

    # Upload agent system prompt
    if [ -f "$DIST_DIR/agent.md" ]; then
        info "  Uploading agent.md"
        $WRANGLER r2 object put "${R2_BUCKET}/releases/${VERSION}/agent.md" \
            --file "$DIST_DIR/agent.md" \
            --ct "text/markdown" --remote
        ok "  agent.md uploaded"
    fi

    # Update "latest" pointer
    echo -n "$VERSION" > "$DIST_DIR/latest"
    $WRANGLER r2 object put "${R2_BUCKET}/releases/latest" \
        --file "$DIST_DIR/latest" \
        --ct "text/plain" --remote
    ok "  'latest' pointer → $VERSION"

    # Optionally update "stable" pointer
    if [ "$DO_STABLE" = true ]; then
        echo -n "$VERSION" > "$DIST_DIR/stable"
        $WRANGLER r2 object put "${R2_BUCKET}/releases/stable" \
            --file "$DIST_DIR/stable" \
            --ct "text/plain" --remote
        ok "  'stable' pointer → $VERSION"
    fi

    # Cleanup temp files
    rm -f "$DIST_DIR/latest" "$DIST_DIR/stable"

    ok "CDN upload complete"
    echo ""
fi

# ── GitHub Release ───────────────────────────────────────────────

if [ "$DO_GH" = true ]; then
    info "Creating GitHub Release v${VERSION}..."

    if ! command -v gh >/dev/null 2>&1; then
        die "gh CLI is required for GitHub Release. Install: https://cli.github.com"
    fi

    # Collect release assets
    ASSETS=""
    for platform in $ALL_PLATFORMS; do
        filename=$(binary_filename "$platform")
        local_path="$DIST_DIR/$filename"
        [ -f "$local_path" ] && ASSETS="$ASSETS $local_path"
    done

    # Include manifest, templates, and agent prompt
    ASSETS="$ASSETS $DIST_DIR/manifest.json"
    [ -f "$DIST_DIR/templates.tar.gz" ] && ASSETS="$ASSETS $DIST_DIR/templates.tar.gz"
    [ -f "$DIST_DIR/agent.md" ] && ASSETS="$ASSETS $DIST_DIR/agent.md"

    # Determine if prerelease
    PRERELEASE_FLAG=""
    case "$VERSION" in
        *-alpha*|*-beta*|*-rc*) PRERELEASE_FLAG="--prerelease" ;;
    esac

    # Create release (or update if it exists)
    if gh release view "v${VERSION}" --repo "$GITHUB_REPO" >/dev/null 2>&1; then
        info "Release v${VERSION} already exists — uploading assets..."
        # shellcheck disable=SC2086
        gh release upload "v${VERSION}" --repo "$GITHUB_REPO" --clobber $ASSETS
    else
        # shellcheck disable=SC2086
        gh release create "v${VERSION}" \
            --repo "$GITHUB_REPO" \
            --title "Jeriko v${VERSION}" \
            --generate-notes \
            $PRERELEASE_FLAG \
            $ASSETS
    fi

    ok "GitHub Release v${VERSION} published"
    echo ""
fi

# ── Summary ──────────────────────────────────────────────────────

echo -e "${BOLD}Upload complete!${NC}"
echo ""
echo "  Version:  $VERSION"
[ "$DO_CDN" = true ]  && echo "  CDN:      https://releases.jeriko.ai/releases/${VERSION}/"
[ "$DO_GH" = true ]   && echo "  GitHub:   $RELEASES_URL/tag/v${VERSION}"
[ "$DO_STABLE" = true ] && echo "  Channel:  stable → $VERSION"
echo ""
echo "  Install command:"
echo "    curl -fsSL https://jeriko.ai/install.sh | bash"
echo ""
