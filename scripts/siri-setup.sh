#!/bin/bash
#
# Jeriko Siri Integration
#
# Creates a macOS Shortcut that lets you say:
#   "Hey Siri, Jeriko send an invoice to John"
#   "Hey Siri, Jeriko check my revenue"
#   "Hey Siri, Jeriko what's on my calendar"
#
# How it works:
#   Siri → Shortcut "Jeriko" → shell: j "your words" → daemon → Claude → spoken result
#

set -e

NODE_PATH=$(which node)
J_PATH="${1:-$HOME/.local/bin/j}"
JERIKO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Ensure j exists
if [ ! -f "$J_PATH" ]; then
  echo "Error: j not found at $J_PATH"
  echo "Run: ./scripts/unix-install.sh first"
  exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║          Jeriko + Siri Integration               ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "Siri can trigger Jeriko through Apple Shortcuts."
echo ""
echo "Setup (takes 30 seconds):"
echo ""
echo "  1. Open the Shortcuts app"
echo "  2. Tap  +  to create a new shortcut"
echo "  3. Name it: Jeriko"
echo "  4. Add action: 'Ask for Input' → Type: Text → Prompt: 'What should I do?'"
echo "  5. Add action: 'Run Shell Script'"
echo "  6. Paste this script:"
echo ""
echo "  ┌─────────────────────────────────────────────────────┐"
echo "  │ export PATH=\"$HOME/.local/bin:/usr/local/bin:\$PATH\" │"
echo "  │ export JERIKO_ROOT=\"$JERIKO_ROOT\"                   │"
echo "  │ $NODE_PATH $J_PATH \"\$1\" 2>/dev/null                │"
echo "  └─────────────────────────────────────────────────────┘"
echo ""
echo "  7. Set 'Input' to 'Shortcut Input'"
echo "  8. Set 'Shell' to '/bin/bash'"
echo "  9. Add action: 'Speak Text' → use the shell output"
echo " 10. Done!"
echo ""
echo "Now say: 'Hey Siri, Jeriko'"
echo "  → Siri asks: 'What should I do?'"
echo "  → You say: 'Send John an invoice for 500'"
echo "  → Jeriko does it, Siri speaks the result"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Alternative: Direct voice commands (no prompt)"
echo ""
echo "  Create separate shortcuts for common tasks:"
echo ""
echo "  Shortcut: 'Invoice'"
echo "  Script:   $NODE_PATH $J_PATH \"send an invoice for \$1\" 2>/dev/null"
echo "  Say:      'Hey Siri, Invoice 500 euros to John'"
echo ""
echo "  Shortcut: 'Revenue'"
echo "  Script:   $NODE_PATH $J_PATH \"how much revenue this week\" 2>/dev/null"
echo "  Say:      'Hey Siri, Revenue'"
echo ""
echo "  Shortcut: 'Deploy'"
echo "  Script:   $NODE_PATH $J_PATH \"deploy to production\" 2>/dev/null"
echo "  Say:      'Hey Siri, Deploy'"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "The key lines for any Shortcut are:"
echo ""
echo "  export PATH=\"$HOME/.local/bin:/usr/local/bin:\$PATH\""
echo "  $NODE_PATH $J_PATH \"\$1\" 2>/dev/null"
echo ""
