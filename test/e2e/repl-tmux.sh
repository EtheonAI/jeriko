#!/usr/bin/env bash
#
# E2E test for Jeriko REPL using tmux.
#
# tmux send-keys properly separates keystrokes from Enter,
# solving the stdin batching problem that breaks expect/pty approaches.
#
# Usage: bash test/e2e/repl-tmux.sh [binary]

set -euo pipefail

BINARY="${1:-./jeriko}"
SESSION="jeriko-e2e-$$"
PASS=0
FAIL=0

cleanup() {
    tmux kill-session -t "$SESSION" 2>/dev/null || true
}
trap cleanup EXIT

# Strip ANSI escape codes
strip_ansi() {
    sed 's/\x1b\[[0-9;?]*[a-zA-Z]//g' | sed 's/\x1b\][^\x07]*\x07//g'
}

# Capture current pane content (stripped of ANSI)
capture() {
    tmux capture-pane -t "$SESSION" -p -S -50 2>/dev/null | strip_ansi
}

# Assert pattern exists in pane content
assert() {
    local label="$1"
    shift
    local content
    content=$(capture)

    for pattern in "$@"; do
        if echo "$content" | grep -qi "$pattern"; then
            PASS=$((PASS + 1))
            echo "  PASS  $label"
            return 0
        fi
    done

    FAIL=$((FAIL + 1))
    # Show last 3 lines for debugging
    local snippet
    snippet=$(echo "$content" | tail -3 | tr '\n' ' ')
    echo "  FAIL  $label (content: ...${snippet:0:120})"
    return 0
}

# Send a slash command: type text, then press Enter separately
send_cmd() {
    local cmd="$1"
    # Type the command text + trailing space (suppresses autocomplete)
    tmux send-keys -t "$SESSION" "${cmd} " 2>/dev/null
    sleep 0.3
    # Press Enter as a separate key event
    tmux send-keys -t "$SESSION" Enter 2>/dev/null
    # Wait for command to process
    sleep 2
}

echo ""
echo "=== Jeriko REPL E2E Tests (tmux) ==="
echo ""

# Create a detached tmux session running jeriko
tmux new-session -d -s "$SESSION" -x 80 -y 30 "$BINARY"
sleep 4

assert "startup" ">" "Jeriko" "jeriko"

# /help
send_cmd "/help"
assert "/help" "/new" "/session" "/clear" "Commands"

# /sys
send_cmd "/sys"
assert "/sys" "version" "platform" "darwin" "runtime"

# /session
send_cmd "/session"
assert "/session" "session" "slug" "model" "Session"

# /model
send_cmd "/model"
assert "/model" "model" "claude"

# /cost
send_cmd "/cost"
assert "/cost" "cost" "token" "0"

# /theme (list)
send_cmd "/theme"
assert "/theme list" "theme" "nord" "dracula" "gruvbox"

# /theme nord
send_cmd "/theme nord"
assert "/theme nord" "switch" "Nord"

# /theme jeriko (reset)
send_cmd "/theme jeriko"
assert "/theme reset" "switch" "Jeriko"

# /skills
send_cmd "/skills"
assert "/skills" "skill" "Skills"

# /new
send_cmd "/new"
assert "/new" "session" "new" "Session"

# /clear
send_cmd "/clear"
assert "/clear" "clear" "Clear"

# /models
send_cmd "/models"
assert "/models" "claude" "model"

# /config
send_cmd "/config"
assert "/config" "agent" "model" "config"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
echo ""

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
