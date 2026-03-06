#!/bin/bash
set -e

# ── Jeriko Linux Install Test ────────────────────────────────────
# Runs inside Docker container. /repo is mounted read-only.
# /dist contains the built binaries + manifest.json.

PASS=0
FAIL=0
TESTS=0

pass() { PASS=$((PASS + 1)); TESTS=$((TESTS + 1)); echo "  [PASS] $1"; }
fail() { FAIL=$((FAIL + 1)); TESTS=$((TESTS + 1)); echo "  [FAIL] $1"; }

echo ""
echo "  Jeriko Linux Install Test"
echo "  $(date)"
echo "  User: $(whoami), Arch: $(uname -m)"
echo ""

# ── Setup: local file server ──────────────────────────────────────

# Serve dist/ as a mock CDN
VERSION=$(grep '"version"' /repo/package.json | head -1 | sed 's/.*"\([0-9][^"]*\)".*/\1/')

if [ -d /dist ]; then
  mkdir -p "/tmp/cdn/releases/${VERSION}"
  cp /dist/jeriko-linux-* "/tmp/cdn/releases/${VERSION}/" 2>/dev/null || true
  cp /dist/manifest.json "/tmp/cdn/releases/${VERSION}/" 2>/dev/null || true
  cp /dist/agent.md "/tmp/cdn/releases/${VERSION}/" 2>/dev/null || true
  echo -n "$VERSION" > "/tmp/cdn/releases/latest"
  cd /tmp/cdn && python3 -m http.server 9876 &
  sleep 1
  export JERIKO_CDN_URL="http://127.0.0.1:9876"
fi

# ── Test 1: install.sh binary installer ───────────────────────────

echo "── Test: install.sh (binary installer) ──"

if [ -n "$JERIKO_CDN_URL" ]; then
  bash /repo/scripts/install.sh latest

  if [ -f "$HOME/.local/bin/jeriko" ]; then
    pass "Binary installed to ~/.local/bin/jeriko"
  else
    fail "Binary not found at ~/.local/bin/jeriko"
  fi

  export PATH="$HOME/.local/bin:$PATH"

  if command -v jeriko &>/dev/null; then
    pass "jeriko command is available"
  else
    fail "jeriko command not found in PATH"
  fi
else
  echo "  [SKIP] No dist/ mounted — skipping binary install test"
fi

# ── Test 2: jeriko --version ──────────────────────────────────────

echo ""
echo "── Test: jeriko --version ──"

if command -v jeriko &>/dev/null; then
  VER_OUT=$(jeriko --version 2>/dev/null || true)
  if [ -n "$VER_OUT" ]; then
    pass "jeriko --version: $VER_OUT"
  else
    fail "jeriko --version returned empty"
  fi
fi

# ── Test 3: Directory structure ───────────────────────────────────

echo ""
echo "── Test: Directory structure ──"

if [ -d "$HOME/.jeriko" ]; then
  pass "Data directory exists (~/.jeriko)"
else
  fail "Data directory missing (~/.jeriko)"
fi

if [ -d "$HOME/.config/jeriko" ]; then
  pass "Config directory exists (~/.config/jeriko)"
else
  fail "Config directory missing (~/.config/jeriko)"
fi

# ── Test 4: Shell completions ─────────────────────────────────────

echo ""
echo "── Test: Shell completions ──"

if [ -f "$HOME/.local/share/bash-completion/completions/jeriko" ]; then
  pass "Bash completion installed"
else
  fail "Bash completion missing"
fi

if [ -f "$HOME/.local/share/zsh/site-functions/_jeriko" ]; then
  pass "Zsh completion installed"
else
  fail "Zsh completion missing"
fi

# ── Test 5: User identity ────────────────────────────────────────

echo ""
echo "── Test: User identity ──"

if [ -f "$HOME/.config/jeriko/.env" ]; then
  if grep -q "JERIKO_USER_ID=" "$HOME/.config/jeriko/.env"; then
    pass "JERIKO_USER_ID generated"
  else
    fail "JERIKO_USER_ID not found in .env"
  fi
else
  fail ".env file missing"
fi

# ── Test 6: Output contract ──────────────────────────────────────

echo ""
echo "── Test: Output contract ──"

if command -v jeriko &>/dev/null; then
  HELP_OUT=$(jeriko --help 2>/dev/null || true)
  if echo "$HELP_OUT" | grep -qi "jeriko\|command\|usage"; then
    pass "jeriko --help produces meaningful output"
  else
    fail "jeriko --help output unexpected: $(echo "$HELP_OUT" | head -3)"
  fi
fi

# ── Summary ─────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Results: $PASS passed, $FAIL failed ($TESTS total)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
