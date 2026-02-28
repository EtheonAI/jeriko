#!/bin/bash
set -e

# ── Jeriko Linux Install Test ────────────────────────────────────
# Runs inside Docker container with repo mounted at /repo

PASS=0
FAIL=0
TESTS=0

pass() { PASS=$((PASS + 1)); TESTS=$((TESTS + 1)); echo "  [PASS] $1"; }
fail() { FAIL=$((FAIL + 1)); TESTS=$((TESTS + 1)); echo "  [FAIL] $1"; }

echo ""
echo "  Jeriko Linux Install Test"
echo "  $(date)"
echo ""

# ── Test 1: Git install method ──────────────────────────────────────

echo "── Test: install.sh --install-method git ──"

bash /repo/install.sh --no-onboard --install-method git --git-dir /tmp/Jeriko-test

if command -v jeriko &>/dev/null; then
  pass "jeriko command available after git install"
else
  # Try direct path
  if [ -x /tmp/Jeriko-test/bin/jeriko ]; then
    export PATH="/tmp/Jeriko-test/bin:$HOME/.local/bin:$PATH"
    pass "jeriko binary exists (PATH needed refresh)"
  else
    fail "jeriko not found after git install"
  fi
fi

# ── Test 2: discover --list ─────────────────────────────────────────

echo ""
echo "── Test: jeriko discover --list ──"

CMD_COUNT=$(jeriko discover --list 2>/dev/null | wc -l || echo "0")
CMD_COUNT=$(echo "$CMD_COUNT" | tr -d ' ')

if [ "$CMD_COUNT" -ge 10 ]; then
  pass "discover --list found $CMD_COUNT commands"
else
  fail "discover --list found only $CMD_COUNT commands (expected 10+)"
fi

# ── Test 3: jeriko sys ──────────────────────────────────────────────

echo ""
echo "── Test: jeriko sys ──"

SYS_OUT=$(jeriko sys --info --format json 2>/dev/null || echo "")

if echo "$SYS_OUT" | grep -q '"ok":true'; then
  pass "jeriko sys --info returns ok:true"
else
  # sys may fail in Docker due to limited access, check if it at least runs
  if jeriko sys --info 2>/dev/null; then
    pass "jeriko sys --info ran successfully"
  else
    fail "jeriko sys --info failed"
  fi
fi

# ── Test 4: jeriko exec ────────────────────────────────────────────

echo ""
echo "── Test: jeriko exec ──"

EXEC_OUT=$(jeriko exec echo hello 2>/dev/null || echo "")

if echo "$EXEC_OUT" | grep -q "hello"; then
  pass "jeriko exec echo hello"
else
  fail "jeriko exec echo hello (got: $EXEC_OUT)"
fi

# ── Test 5: jeriko fs ──────────────────────────────────────────────

echo ""
echo "── Test: jeriko fs ──"

FS_OUT=$(jeriko fs --ls / 2>/dev/null || echo "")

if [ -n "$FS_OUT" ]; then
  pass "jeriko fs --ls /"
else
  fail "jeriko fs --ls / returned empty"
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
