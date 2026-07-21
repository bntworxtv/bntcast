#!/bin/bash
set -e

echo "========================================="
echo "  BNTcast - Radio Management Installer"
echo "  For Ubuntu 20.04 / 22.04 / 24.04"
echo "========================================="
echo ""

if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: This script must be run as root (use sudo)"
    exit 1
fi

BNTCAST_DIR="/opt/bntcast"
MEDIA_DIR="/var/lib/bntcast/media"
CONFIG_DIR="/var/lib/bntcast/config"
DATA_DIR="/var/lib/bntcast/data"

echo "[1/10] Updating system packages..."
apt-get update -qq

echo "[2/10] Installing dependencies..."
apt-get install -y -qq curl wget git build-essential nginx ffmpeg libssl-dev

echo "[3/10] Installing Node.js 20.x..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
fi
echo "  Node.js $(node -v) installed"

echo "[4/10] Installing SHOUTcast DNAS..."
if [ ! -f /usr/local/bin/sc_serv ]; then
    mkdir -p /tmp/scinstall && cd /tmp/scinstall
    SHOUTCAST_URL="http://download.nullsoft.com/shoutcast/shoutcast-linux.tar.gz"
    wget -q "$SHOUTCAST_URL" -O shoutcast.tar.gz 2>/dev/null || true
    if [ -f shoutcast.tar.gz ]; then
        tar xzf shoutcast.tar.gz 2>/dev/null || true
        find . -name "sc_serv" -type f -exec cp {} /usr/local/bin/ \; 2>/dev/null || true
        chmod +x /usr/local/bin/sc_serv 2>/dev/null || true
        echo "  SHOUTcast DNAS installed"
    else
        echo "  WARNING: Could not download SHOUTcast. Install manually from https://www.shoutcast.com"
    fi
    cd / && rm -rf /tmp/scinstall
fi

echo "[5/10] Installing Icecast2..."
apt-get install -y -qq icecast2 || echo "  WARNING: Icecast2 install failed, will use SHOUTcast only"

echo "[6/10] Setting up BNTcast directory..."
mkdir -p "$BNTCAST_DIR" "$MEDIA_DIR" "$CONFIG_DIR" "$DATA_DIR"

if [ -d "/opt/bntcast_tmp" ]; then
    rm -rf /opt/bntcast_tmp
fi

echo "[7/10] Cloning BNTcast..."
if [ -d "$BNTCAST_DIR/.git" ]; then
    cd "$BNTCAST_DIR" && git pull --quiet
else
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
    if [ -d "$PROJECT_DIR/.git" ]; then
        cp -r "$PROJECT_DIR" "$BNTCAST_DIR"
    else
        git clone https://github.com/bntworxtv/bntcast.git "$BNTCAST_DIR" 2>/dev/null || cp -r "$PROJECT_DIR/." "$BNTCAST_DIR"
    fi
fi

echo "[8/10] Installing server dependencies..."
cd "$BNTCAST_DIR/server"
npm install --omit=dev --quiet
npx prisma generate
npx prisma db push --accept-data-loss
npx tsx src/seed.ts

echo "[9/10] Building client..."
cd "$BNTCAST_DIR/client"
npm install --quiet
npm run build

echo "[10/10] Creating systemd service..."
JWT_SECRET_VAL=$(openssl rand -hex 32)

cat > "$BNTCAST_DIR/server/.env" << EOF
DATABASE_URL=file:$DATA_DIR/dev.db
JWT_SECRET=$JWT_SECRET_VAL
PORT=3001
MEDIA_DIR=$MEDIA_DIR
NODE_ENV=production
EOF

cat > /etc/systemd/system/bntcast.service << EOF
[Unit]
Description=BNTcast Radio Management
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$BNTCAST_DIR/server
EnvironmentFile=$BNTCAST_DIR/server/.env
Restart=always
RestartSec=5
ExecStart=$(which node) dist/index.js

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable bntcast
systemctl start bntcast

echo ""
echo "========================================="
echo "  BNTcast installed successfully!"
echo "========================================="
echo ""
echo "  Web Dashboard:  http://$(hostname -I | awk '{print $1}'):3001"
echo "  Default Login:  admin@bntcast.local / admin"
echo "  Media Directory: $MEDIA_DIR"
echo "  Config Directory: $CONFIG_DIR"
echo ""
echo "  SHOUTcast ports: 8001-8100"
echo "  Icecast ports:   8001-8100"
echo ""
echo "  Service Control:"
echo "    sudo systemctl start bntcast"
echo "    sudo systemctl stop bntcast"
echo "    sudo systemctl restart bntcast"
echo "    sudo journalctl -u bntcast -f"
echo ""
