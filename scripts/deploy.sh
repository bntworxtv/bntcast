#!/bin/bash
#
# BNTcast - One-Command VPS Deployment Script
# Works on: Ubuntu 20.04 / 22.04 / 24.04, Debian 11/12
#
# Usage:
#   curl -sL https://raw.githubusercontent.com/YOUR_REPO/deploy.sh | sudo bash
#   -- OR --
#   sudo bash deploy.sh
#
# Options (set before running):
#   DOMAIN=yourdomain.com bash deploy.sh     # Auto SSL with Let's Encrypt
#   PORT=80 bash deploy.sh                    # Custom port (default: 80)
#

set -euo pipefail

# ============================================================
#  Configuration
# ============================================================
APP_NAME="bntcast"
INSTALL_DIR="/opt/${APP_NAME}"
MEDIA_DIR="/var/lib/${APP_NAME}/media"
DATA_DIR="/var/lib/${APP_NAME}/data"
LOG_DIR="/var/log/${APP_NAME}"
NODE_VERSION="20"
APP_PORT="${PORT:-80}"
DOMAIN="${DOMAIN:-}"
SSL_EMAIL="${SSL_EMAIL:-admin@${DOMAIN:-localhost}}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()   { echo -e "${YELLOW}[!]${NC} $1"; }
error()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info()   { echo -e "${BLUE}[i]${NC} $1"; }
header() { echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"; }

# ============================================================
#  Pre-flight checks
# ============================================================
check_root() {
    if [ "$(id -u)" -ne 0 ]; then
        error "This script must be run as root. Use: sudo bash deploy.sh"
    fi
}

check_system() {
    if [ ! -f /etc/os-release ]; then
        error "Cannot detect OS. This script supports Ubuntu/Debian only."
    fi
    . /etc/os-release
    case "$ID" in
        ubuntu|debian) log "Detected $PRETTY_NAME" ;;
        *) warn "Untested OS: $ID. Proceeding anyway..." ;;
    esac
}

# ============================================================
#  Step 1: System dependencies
# ============================================================
install_system_deps() {
    header "Step 1/8: Installing system dependencies"

    apt-get update -qq
    apt-get install -y -qq \
        curl wget git build-essential \
        ffmpeg libssl-dev \
        nginx certbot python3-certbot-nginx \
        sqlite3 \
        2>/dev/null

    log "System packages installed"
}

# ============================================================
#  Step 2: Node.js
# ============================================================
install_nodejs() {
    header "Step 2/8: Installing Node.js ${NODE_VERSION}"

    if command -v node &>/dev/null; then
        local current_version
        current_version=$(node -v | sed 's/v//' | cut -d. -f1)
        if [ "$current_version" -ge "$NODE_VERSION" ]; then
            log "Node.js $(node -v) already installed"
            return
        fi
    fi

    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y -qq nodejs

    log "Node.js $(node -v) installed"
    log "npm $(npm -v) installed"
}

# ============================================================
#  Step 3: SHOUTcast DNAS v2
# ============================================================
install_shoutcast() {
    header "Step 3/8: Installing SHOUTcast DNAS"

    if command -v sc_serv &>/dev/null; then
        log "SHOUTcast DNAS already installed"
        return
    fi

    local tmpdir
    tmpdir=$(mktemp -d)

    info "Downloading SHOUTcast DNAS v2..."
    # Try multiple download sources
    local downloaded=false
    local urls=(
        "https://download.nullsoft.com/shoutcast/shoutcast-linux.tar.gz"
        "http://download.nullsoft.com/shoutcast/shoutcast-linux.tar.gz"
    )

    for url in "${urls[@]}"; do
        if wget -q --timeout=15 "$url" -O "$tmpdir/sc.tar.gz" 2>/dev/null; then
            downloaded=true
            break
        fi
    done

    if [ "$downloaded" = true ] && [ -s "$tmpdir/sc.tar.gz" ]; then
        tar xzf "$tmpdir/sc.tar.gz" -C "$tmpdir" 2>/dev/null || true
        local sc_binary
        sc_binary=$(find "$tmpdir" -name "sc_serv" -type f 2>/dev/null | head -1)
        if [ -n "$sc_binary" ]; then
            cp "$sc_binary" /usr/local/bin/sc_serv
            chmod +x /usr/local/bin/sc_serv
            log "SHOUTcast DNAS installed to /usr/local/bin/sc_serv"
        else
            warn "Could not find sc_serv binary in download"
            install_shoutcast_fallback
        fi
    else
        warn "Could not download SHOUTcast from official sources"
        install_shoutcast_fallback
    fi

    rm -rf "$tmpdir"
}

install_shoutcast_fallback() {
    info "Creating SHOUTcast placeholder..."
    cat > /usr/local/bin/sc_serv << 'PLACEHOLDER'
#!/bin/bash
echo "ERROR: SHOUTcast DNAS v2 not installed."
echo "Download from https://www.shoutcast.com and place sc_serv in /usr/local/bin/"
echo "Or use Icecast2 as the streaming engine instead."
exit 1
PLACEHOLDER
    chmod +x /usr/local/bin/sc_serv
    warn "SHOUTcast placeholder created - download real binary from shoutcast.com"
}

# ============================================================
#  Step 4: Icecast2
# ============================================================
install_icecast() {
    header "Step 4/8: Installing Icecast2"

    if command -v icecast2 &>/dev/null; then
        log "Icecast2 already installed"
        return
    fi

    apt-get install -y -qq icecast2 2>/dev/null || {
        warn "Icecast2 installation failed. Stations using Icecast may not work."
    }

    # Stop and disable default icecast (BNTcast manages its own instances)
    systemctl stop icecast2 2>/dev/null || true
    systemctl disable icecast2 2>/dev/null || true

    log "Icecast2 installed"
}

# ============================================================
#  Step 5: Clone / Update project
# ============================================================
setup_project() {
    header "Step 5/8: Setting up BNTcast project"

    mkdir -p "$INSTALL_DIR" "$MEDIA_DIR" "$DATA_DIR" "$LOG_DIR"

    # Check if we're running from within the project
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local project_dir
    project_dir="$(dirname "$script_dir")"

    if [ -f "$project_dir/package.json" ] || [ -f "$project_dir/server/package.json" ]; then
        info "Copying project from $project_dir..."
        if command -v rsync &>/dev/null; then
            rsync -a --exclude='node_modules' --exclude='.git' --exclude='dist' \
                "$project_dir/" "$INSTALL_DIR/"
        else
            cp -r "$project_dir/." "$INSTALL_DIR/"
            rm -rf "$INSTALL_DIR/node_modules" "$INSTALL_DIR/.git" "$INSTALL_DIR/server/dist" "$INSTALL_DIR/client/dist"
        fi
    elif [ -d "$INSTALL_DIR/.git" ]; then
        info "Updating existing installation..."
        cd "$INSTALL_DIR" && git pull --quiet 2>/dev/null || true
    else
        error "Please run this script from within the BNTcast project directory."
    fi

    log "Project files ready at $INSTALL_DIR"
}

# ============================================================
#  Step 6: Build server + client
# ============================================================
build_app() {
    header "Step 6/8: Building application"

    local JWT_SECRET
    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -d '\n/+=' | head -c 64)

    # Write server .env
    cat > "$INSTALL_DIR/server/.env" << EOF
DATABASE_URL=file:$DATA_DIR/dev.db
JWT_SECRET=${JWT_SECRET}
PORT=${APP_PORT}
MEDIA_DIR=${MEDIA_DIR}
NODE_ENV=production
SHOUTCAST_PORT_START=8001
SHOUTCAST_PORT_END=8100
EOF

    # Build server
    info "Installing server dependencies..."
    cd "$INSTALL_DIR/server"
    npm install --quiet 2>/dev/null

    info "Generating Prisma client..."
    npx prisma generate

    info "Pushing database schema..."
    DATABASE_URL="file:$DATA_DIR/dev.db" npx prisma db push --accept-data-loss 2>/dev/null

    info "Seeding database..."
    DATABASE_URL="file:$DATA_DIR/dev.db" npx tsx src/seed.ts 2>/dev/null

    info "Compiling TypeScript..."
    npx tsc

    info "Pruning dev dependencies..."
    npm prune --omit=dev 2>/dev/null

    log "Server built successfully"

    # Build client
    info "Installing client dependencies..."
    cd "$INSTALL_DIR/client"
    npm install --quiet

    info "Building client..."
    npm run build

    if [ ! -d "$INSTALL_DIR/client/dist" ]; then
        error "Client build failed - dist/ directory not found"
    fi

    log "Client built successfully"
    log "Application build complete!"
}

# ============================================================
#  Step 7: Nginx configuration
# ============================================================
setup_nginx() {
    header "Step 7/8: Configuring Nginx"

    local server_name="_"
    if [ -n "$DOMAIN" ]; then
        server_name="$DOMAIN"
    fi

    cat > /etc/nginx/sites-available/bntcast << NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${server_name};

    client_max_body_size 200M;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Proxy API requests
    location /api/ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # WebSocket
    location /ws {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 86400;
    }

    # Media files (served by Node.js)
    location /media/ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    # Static files (client build)
    location / {
        root ${INSTALL_DIR}/client/dist;
        try_files \$uri \$uri/ /index.html;

        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
    }
}
NGINX

    # Enable site
    ln -sf /etc/nginx/sites-available/bntcast /etc/nginx/sites-enabled/bntcast
    rm -f /etc/nginx/sites-enabled/default

    # Test nginx config
    if nginx -t 2>/dev/null; then
        systemctl reload nginx
        log "Nginx configured and reloaded"
    else
        warn "Nginx config test failed. Check /etc/nginx/sites-available/bntcast"
    fi
}

# ============================================================
#  Step 7b: SSL with Let's Encrypt (optional)
# ============================================================
setup_ssl() {
    if [ -z "$DOMAIN" ]; then
        info "No domain specified. Skipping SSL. Access via http://YOUR_IP"
        return
    fi

    header "Step 7b: Setting up SSL certificate"

    if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
        log "SSL certificate already exists for $DOMAIN"
        return
    fi

    info "Obtaining SSL certificate for $DOMAIN..."
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
        --email "$SSL_EMAIL" --redirect 2>/dev/null || {
        warn "SSL setup failed. You can retry with: certbot --nginx -d $DOMAIN"
    }

    log "SSL configured"
}

# ============================================================
#  Step 8: Systemd service
# ============================================================
setup_service() {
    header "Step 8/8: Creating systemd service"

    cat > /etc/systemd/system/${APP_NAME}.service << EOF
[Unit]
Description=BNTcast Radio Station Management
Documentation=https://github.com/bntworxtv/bntcast
After=network.target nginx.service
Wants=nginx.service

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}/server
EnvironmentFile=${INSTALL_DIR}/server/.env
Restart=always
RestartSec=5

ExecStart=$(which node) dist/index.js
ExecReload=/bin/kill -HUP \$MAINPID

TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable ${APP_NAME}
    systemctl restart ${APP_NAME}

    log "Systemd service created and started"
}

# ============================================================
#  Firewall setup
# ============================================================
setup_firewall() {
    info "Configuring firewall..."

    if command -v ufw &>/dev/null; then
        ufw allow 22/tcp 2>/dev/null || true
        ufw allow 80/tcp 2>/dev/null || true
        ufw allow 443/tcp 2>/dev/null || true
        ufw allow "${APP_PORT}/tcp" 2>/dev/null || true
        ufw allow "8001:8100/tcp" 2>/dev/null || true
        ufw --force enable 2>/dev/null || true
        log "Firewall configured (UFW)"
    else
        warn "UFW not found. Ensure ports 80, 443, ${APP_PORT}, and 8001-8100 are open."
    fi
}

# ============================================================
#  Print summary
# ============================================================
print_summary() {
    local ip
    ip=$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null \
      || curl -s --max-time 5 https://ifconfig.me 2>/dev/null \
      || curl -s --max-time 5 https://icanhazip.com 2>/dev/null \
      || hostname -I 2>/dev/null | awk '{print $1}' \
      || echo "YOUR_SERVER_IP")

    header "Installation Complete!"

    echo -e "  ${GREEN}Web Dashboard:${NC}    http://${ip}"
    if [ -n "$DOMAIN" ]; then
        echo -e "  ${GREEN}HTTPS:${NC}            https://${DOMAIN}"
    fi
    echo -e "  ${GREEN}Default Login:${NC}    admin@bntcast.local"
    echo -e "  ${GREEN}Default Password:${NC} admin"
    echo ""
    echo -e "  ${YELLOW}Directories:${NC}"
    echo -e "    Install:   ${INSTALL_DIR}"
    echo -e "    Media:     ${MEDIA_DIR}"
    echo -e "    Database:  ${DATA_DIR}/dev.db"
    echo -e "    Logs:      journalctl -u ${APP_NAME} -f"
    echo ""
    echo -e "  ${YELLOW}Service Commands:${NC}"
    echo -e "    sudo systemctl start ${APP_NAME}"
    echo -e "    sudo systemctl stop ${APP_NAME}"
    echo -e "    sudo systemctl restart ${APP_NAME}"
    echo -e "    sudo journalctl -u ${APP_NAME} -f"
    echo ""
    echo -e "  ${YELLOW}Streaming Ports:${NC}   8001-8100"
    echo ""
    echo -e "  ${RED}IMPORTANT:${NC} Change the default password after first login!"
    echo ""
}

# ============================================================
#  Main
# ============================================================
main() {
    clear
    echo -e "${CYAN}"
    echo "  ╔═══════════════════════════════════════════╗"
    echo "  ║     BNTcast - VPS Deployment Script       ║"
    echo "  ║     Radio Station Management Platform     ║"
    echo "  ╚═══════════════════════════════════════════╝"
    echo -e "${NC}"

    check_root
    check_system

    install_system_deps
    install_nodejs
    install_shoutcast
    install_icecast
    setup_project
    build_app
    setup_nginx
    setup_ssl
    setup_firewall
    setup_service

    print_summary
}

# Allow running individual steps
case "${1:-all}" in
    deps)     check_root; check_system; install_system_deps ;;
    node)     check_root; install_nodejs ;;
    shoutcast) check_root; install_shoutcast ;;
    icecast)  check_root; install_icecast ;;
    project)  check_root; setup_project ;;
    build)    check_root; build_app ;;
    nginx)    check_root; setup_nginx ;;
    ssl)      check_root; setup_ssl ;;
    service)  check_root; setup_service ;;
    firewall) check_root; setup_firewall ;;
    all)      main ;;
    *)        echo "Usage: $0 [all|deps|node|shoutcast|icecast|project|build|nginx|ssl|service|firewall]" ;;
esac
