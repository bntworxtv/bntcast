#!/bin/bash
#
# BNTcast - Legacy installer (use deploy.sh for new installations)
#
# This is the original install script. For the improved version, use:
#   sudo bash scripts/deploy.sh
#
# For Docker deployment:
#   docker-compose up -d
#

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
HTTP_PORT=80
SERVER_PORT=3001

echo "[1/10] Updating system packages..."
apt-get update -qq

echo "[2/10] Installing dependencies..."
apt-get install -y -qq curl wget git build-essential ffmpeg libssl-dev sqlite3

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
    if wget -q --timeout=15 "$SHOUTCAST_URL" -O shoutcast.tar.gz 2>/dev/null && [ -s shoutcast.tar.gz ]; then
        tar xzf shoutcast.tar.gz 2>/dev/null || true
        SC_BINARY=$(find . -name "sc_serv" -type f 2>/dev/null | head -1)
        if [ -n "$SC_BINARY" ]; then
            cp "$SC_BINARY" /usr/local/bin/sc_serv
            chmod +x /usr/local/bin/sc_serv
            echo "  SHOUTcast DNAS installed"
        else
            echo "  WARNING: sc_serv binary not found in archive"
        fi
    else
        echo "  WARNING: Could not download SHOUTcast. Install from https://www.shoutcast.com"
        echo "  Creating placeholder..."
        cat > /usr/local/bin/sc_serv << 'EOF'
#!/bin/bash
echo "ERROR: SHOUTcast DNAS not installed. Download from https://www.shoutcast.com"
exit 1
EOF
        chmod +x /usr/local/bin/sc_serv
    fi
    cd / && rm -rf /tmp/scinstall
fi

echo "[5/10] Installing Icecast2..."
apt-get install -y -qq icecast2 2>/dev/null || echo "  WARNING: Icecast2 install failed"
systemctl stop icecast2 2>/dev/null || true
systemctl disable icecast2 2>/dev/null || true

echo "[6/10] Installing Nginx..."
apt-get install -y -qq nginx

echo "[7/10] Setting up BNTcast directory..."
mkdir -p "$BNTCAST_DIR" "$MEDIA_DIR" "$CONFIG_DIR" "$DATA_DIR"

echo "[8/10] Setting up BNTcast..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [ -d "$BNTCAST_DIR/.git" ]; then
    cd "$BNTCAST_DIR" && git pull --quiet 2>/dev/null || true
elif [ -d "$PROJECT_DIR/server/package.json" ]; then
    rsync -a --exclude='node_modules' --exclude='.git' --exclude='dist' "$PROJECT_DIR/" "$BNTCAST_DIR/"
else
    git clone https://github.com/bntworxtv/bntcast.git "$BNTCAST_DIR" 2>/dev/null || true
fi

echo "[9/10] Installing and building..."
cd "$BNTCAST_DIR/server"
npm install --quiet

JWT_SECRET_VAL=$(openssl rand -hex 32)
cat > "$BNTCAST_DIR/server/.env" << EOF
DATABASE_URL=file:$DATA_DIR/dev.db
JWT_SECRET=$JWT_SECRET_VAL
PORT=$SERVER_PORT
MEDIA_DIR=$MEDIA_DIR
NODE_ENV=production
EOF

npx prisma generate
DATABASE_URL="file:$DATA_DIR/dev.db" npx prisma db push --accept-data-loss 2>/dev/null
DATABASE_URL="file:$DATA_DIR/dev.db" npx tsx src/seed.ts 2>/dev/null
npx tsc
npm prune --omit=dev 2>/dev/null

echo "  Building client..."
cd "$BNTCAST_DIR/client"
npm install --quiet
npm run build 2>/dev/null

echo "[10/10] Configuring services..."

# Nginx config
cat > /etc/nginx/sites-available/bntcast << NGINX
server {
    listen ${HTTP_PORT};
    listen [::]:${HTTP_PORT};
    server_name _;
    client_max_body_size 200M;

    location /api/ {
        proxy_pass http://127.0.0.1:${SERVER_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /ws {
        proxy_pass http://127.0.0.1:${SERVER_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }

    location /media/ {
        proxy_pass http://127.0.0.1:${SERVER_PORT};
    }

    location / {
        root ${BNTCAST_DIR}/client/dist;
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/bntcast /etc/nginx/sites-enabled/bntcast
rm -f /etc/nginx/sites-enabled/default
systemctl restart nginx

# Systemd service
cat > /etc/systemd/system/bntcast.service << EOF
[Unit]
Description=BNTcast Radio Management
After=network.target nginx.service

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

# Firewall
if command -v ufw &>/dev/null; then
    ufw allow 22/tcp 2>/dev/null || true
    ufw allow ${HTTP_PORT}/tcp 2>/dev/null || true
    ufw allow 443/tcp 2>/dev/null || true
    ufw allow "8001:8100/tcp" 2>/dev/null || true
    ufw --force enable 2>/dev/null || true
fi

echo ""
echo "========================================="
echo "  BNTcast installed successfully!"
echo "========================================="
echo ""
IP=$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null \
  || curl -s --max-time 5 https://ifconfig.me 2>/dev/null \
  || hostname -I | awk '{print $1}' \
  || echo "YOUR_SERVER_IP")
echo "  Web Dashboard:  http://${IP}"
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
