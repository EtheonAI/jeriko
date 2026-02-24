#!/bin/bash
set -e

# ── Bundle JerikoBot for website distribution ───────────────────────
# Creates jerikobot.tar.gz and jerikobot.zip in website/public/
# Run before deploying the website.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="$PROJECT_DIR/website/public"

echo "Bundling JerikoBot for distribution..."

# Create temp staging directory
STAGE=$(mktemp -d)
STAGE_DIR="$STAGE/jerikobot"
mkdir -p "$STAGE_DIR"

# Copy distribution files
cp -r "$PROJECT_DIR/bin"       "$STAGE_DIR/"
cp -r "$PROJECT_DIR/lib"       "$STAGE_DIR/"
cp -r "$PROJECT_DIR/tools"     "$STAGE_DIR/"
cp -r "$PROJECT_DIR/server"    "$STAGE_DIR/"
cp -r "$PROJECT_DIR/templates" "$STAGE_DIR/"
cp    "$PROJECT_DIR/package.json"  "$STAGE_DIR/"
cp    "$PROJECT_DIR/package-lock.json" "$STAGE_DIR/" 2>/dev/null || true
cp    "$PROJECT_DIR/CLAUDE.md"     "$STAGE_DIR/" 2>/dev/null || true
cp    "$PROJECT_DIR/.env.example"  "$STAGE_DIR/" 2>/dev/null || true

# Copy Go runtime source (not binary)
mkdir -p "$STAGE_DIR/runtime"
cp "$PROJECT_DIR/runtime/main.go"   "$STAGE_DIR/runtime/" 2>/dev/null || true
cp "$PROJECT_DIR/runtime/go.mod"    "$STAGE_DIR/runtime/" 2>/dev/null || true
cp "$PROJECT_DIR/runtime/build.sh"  "$STAGE_DIR/runtime/" 2>/dev/null || true

# Remove node_modules from server/triggers if copied
rm -rf "$STAGE_DIR/server/node_modules" 2>/dev/null || true

# Make bin scripts executable
chmod +x "$STAGE_DIR/bin/"* 2>/dev/null || true

# Create tarball
mkdir -p "$OUT_DIR"
tar -czf "$OUT_DIR/jerikobot.tar.gz" -C "$STAGE" jerikobot
echo "[ok] Created $OUT_DIR/jerikobot.tar.gz ($(du -h "$OUT_DIR/jerikobot.tar.gz" | cut -f1))"

# Create zip
(cd "$STAGE" && zip -qr "$OUT_DIR/jerikobot.zip" jerikobot)
echo "[ok] Created $OUT_DIR/jerikobot.zip ($(du -h "$OUT_DIR/jerikobot.zip" | cut -f1))"

# Cleanup
rm -rf "$STAGE"

echo "Done. Files ready in website/public/"
