#!/usr/bin/env bash
set -e

# JerikoBot Agent Installer
# Usage: curl -sL https://yourserver.com/install | bash -s -- <proxy-url> <node-name> <node-token>

PROXY_URL="${1:?Usage: install.sh <proxy-url> <node-name> <node-token>}"
NODE_NAME="${2:?Missing node name}"
NODE_TOKEN="${3:?Missing node token}"

INSTALL_DIR="$HOME/.jerikobot"

echo "=== JerikoBot Agent Installer ==="
echo "Node: $NODE_NAME"
echo "Proxy: $PROXY_URL"
echo ""

# Check for Node.js
if ! command -v node &>/dev/null; then
  echo "Node.js not found. Installing via nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  nvm install --lts
fi

# Check for claude CLI
if ! command -v claude &>/dev/null; then
  echo "WARNING: 'claude' CLI not found. Install it: npm install -g @anthropic-ai/claude-code"
fi

# Create install directory
mkdir -p "$INSTALL_DIR"

# Download agent
echo "Downloading agent..."
if command -v git &>/dev/null; then
  if [ -d "$INSTALL_DIR/repo" ]; then
    cd "$INSTALL_DIR/repo" && git pull
  else
    git clone https://github.com/khaleel737/jerikobot.git "$INSTALL_DIR/repo"
  fi
  cd "$INSTALL_DIR/repo"
else
  # Fallback: just grab agent.js and package.json
  curl -sL "${PROXY_URL%/ws}/agent.js" -o "$INSTALL_DIR/agent.js" 2>/dev/null || true
fi

# Create .env
cat > "$INSTALL_DIR/.env" <<EOF
PROXY_URL=$PROXY_URL
NODE_NAME=$NODE_NAME
NODE_TOKEN=$NODE_TOKEN
EOF

# Install dependencies
cd "$INSTALL_DIR"
if [ -f "repo/package.json" ]; then
  cd repo && npm install --production
fi

# Create systemd service if available
if command -v systemctl &>/dev/null; then
  echo "Setting up systemd service..."
  sudo tee /etc/systemd/system/jerikobot-agent.service > /dev/null <<UNIT
[Unit]
Description=JerikoBot Agent ($NODE_NAME)
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR/repo
ExecStart=$(command -v node) agent/agent.js
Restart=always
RestartSec=10
EnvironmentFile=$INSTALL_DIR/.env

[Install]
WantedBy=multi-user.target
UNIT

  sudo systemctl daemon-reload
  sudo systemctl enable jerikobot-agent
  sudo systemctl start jerikobot-agent
  echo "Service installed and started!"
  echo "Check status: systemctl status jerikobot-agent"
else
  echo ""
  echo "No systemd found. Start manually:"
  echo "  cd $INSTALL_DIR/repo && node agent/agent.js"
  echo ""
  echo "Or use pm2:"
  echo "  pm2 start agent/agent.js --name jerikobot-$NODE_NAME"
fi

echo ""
echo "=== Installation complete ==="
