#!/bin/bash
#
# BNTcast - Quick Deploy (curl one-liner)
#
# Usage on a fresh Ubuntu VPS:
#   curl -sL https://raw.githubusercontent.com/YOUR_REPO/main/scripts/quick-deploy.sh | sudo bash
#
# Or download and run:
#   wget -qO- https://raw.githubusercontent.com/YOUR_REPO/main/scripts/quick-deploy.sh | sudo bash
#

set -euo pipefail

echo "╔═══════════════════════════════════════════╗"
echo "║     BNTcast - Quick Deploy                ║"
echo "║     Radio Station Management Platform     ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# Check root
if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: Must be run as root. Use: sudo bash $0"
    exit 1
fi

# Clone the repo
INSTALL_DIR="/opt/bntcast"
REPO_URL="${REPO_URL:-https://github.com/bntworxtv/bntcast.git}"

if [ -d "$INSTALL_DIR/.git" ]; then
    echo "BNTcast already installed. Updating..."
    cd "$INSTALL_DIR" && git pull
else
    echo "Cloning BNTcast..."
    git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# Run the full deploy script
bash scripts/deploy.sh "$@"

echo ""
echo "Quick deploy complete!"
