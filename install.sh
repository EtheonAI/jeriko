#!/bin/bash
set -e

echo ""
echo "  Installing JerikoBot..."
echo "  Unix-first AI toolkit"
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "  Node.js not found."
  echo "  Install it: https://nodejs.org"
  echo "  Or via nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "  Node.js 18+ required. Current: $(node -v)"
  exit 1
fi

echo "  Node.js $(node -v) detected"

# Install globally
echo "  Installing via npm..."
npm install -g jerikobot

# Verify
if ! command -v jeriko &>/dev/null; then
  echo ""
  echo "  Installation succeeded but 'jeriko' not found in PATH."
  echo "  Your npm global bin directory may not be in PATH."
  echo "  Run: npm bin -g"
  echo "  Then add that directory to your PATH."
  exit 1
fi

echo ""
echo "  JerikoBot installed successfully!"
echo ""

# Run verify
echo "  Verifying installation..."
jeriko sys --format text >/dev/null 2>&1 && echo "  [ok] jeriko sys" || echo "  [!!] jeriko sys failed"
jeriko discover --list >/dev/null 2>&1 && echo "  [ok] jeriko discover" || echo "  [!!] jeriko discover failed"
jeriko exec echo "ready" >/dev/null 2>&1 && echo "  [ok] jeriko exec" || echo "  [!!] jeriko exec failed"

echo ""
echo "  Next steps:"
echo "    jeriko init                    # configure AI + Telegram"
echo "    jeriko sys                     # test system info"
echo "    jeriko search \"hello world\"    # test web search"
echo "    jeriko --help                  # see all commands"
echo ""
