#!/usr/bin/env bash
# ==============================================================================
# Verdant - 1-Click Update Script for Proxmox VE LXC, Docker & Linux Installs
# ==============================================================================
set -euo pipefail

# Auto-detect install directory if run from inside repo, otherwise default to /opt/verdant
if [ -n "${VERDANT_DIR:-}" ]; then
  INSTALL_DIR="$VERDANT_DIR"
elif [ -f "$(pwd)/server.ts" ] && [ -f "$(pwd)/package.json" ]; then
  INSTALL_DIR="$(pwd)"
elif [ -d "/opt/verdant" ]; then
  INSTALL_DIR="/opt/verdant"
elif [ -d "/root/verdant" ]; then
  INSTALL_DIR="/root/verdant"
else
  INSTALL_DIR="/opt/verdant"
fi

# Delegate to clean backup & restore script if requested
if [[ "${1:-}" =~ ^(--clean|--fresh|-c|-f|--backup-restore)$ ]]; then
  SCRIPT_PATH="$(dirname "$0")/scripts/clean-update-restore.sh"
  if [ -f "$SCRIPT_PATH" ]; then
    exec bash "$SCRIPT_PATH" "${@:2}"
  fi
fi

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}========================================================================${NC}"
echo -e "${CYAN}             Updating Verdant in ${INSTALL_DIR}                        ${NC}"
echo -e "${CYAN}========================================================================${NC}"

if [ ! -d "$INSTALL_DIR" ]; then
  echo -e "${RED}[ERROR] Directory ${INSTALL_DIR} does not exist.${NC}"
  exit 1
fi

cd "$INSTALL_DIR"

# 1. Fetch latest code
if [ -d ".git" ]; then
  echo -e "\n${CYAN}1/4: Pulling latest changes from git...${NC}"
  git fetch --all --tags
  git reset --hard origin/main || git pull --rebase
else
  echo -e "\n${CYAN}1/4: Initializing git repository link...${NC}"
  git init
  git remote add origin https://github.com/riquitinchiquitin-lab/Verdant.git 2>/dev/null || git remote set-url origin https://github.com/riquitinchiquitin-lab/Verdant.git
  if git fetch --depth 1 origin main 2>/dev/null; then
    git reset --hard origin/main
    echo -e "${GREEN}✓ Git repository connected and updated to origin/main.${NC}"
  else
    echo -e "${YELLOW}Git remote fetch failed, falling back to release tarball...${NC}"
    curl -fsSL https://github.com/riquitinchiquitin-lab/Verdant/archive/refs/heads/main.tar.gz | tar -xz --strip-components=1 -C "$INSTALL_DIR"
  fi
fi

# Check if running via Docker Compose
if [ -f "$INSTALL_DIR/docker-compose.yml" ] && command -v docker >/dev/null 2>&1 && docker compose ps -q 2>/dev/null | grep -q .; then
  echo -e "\n${CYAN}2/4: Rebuilding & restarting Docker Compose stack...${NC}"
  docker compose up -d --build
  echo -e "\n${GREEN}========================================================================${NC}"
  echo -e "${GREEN}✓ Verdant Docker stack has been successfully updated!${NC}"
  echo -e "Check status: ${YELLOW}docker compose ps${NC}"
  echo -e "Live logs:    ${YELLOW}docker compose logs -f --tail=50${NC}"
  echo -e "${GREEN}========================================================================${NC}"
  exit 0
fi

# 2. Install dependencies
echo -e "\n${CYAN}2/4: Installing NPM dependencies...${NC}"
npm install --legacy-peer-deps --no-audit

# 3. Build production bundle (Vite)
echo -e "\n${CYAN}3/4: Building production bundle (npm run build)...${NC}"
npm run build

# 4. Enforce strict permissions for data security & restart service
echo -e "\n${CYAN}4/4: Hardening permissions & restarting service...${NC}"
if id -u verdant >/dev/null 2>&1; then
  chown -R verdant:verdant "$INSTALL_DIR"
fi
[ -d "$INSTALL_DIR/data" ] && chmod 700 "$INSTALL_DIR/data"
[ -f "$INSTALL_DIR/.env" ] && chmod 600 "$INSTALL_DIR/.env"

# Restart systemd service if present
if systemctl list-unit-files 2>/dev/null | grep -q "verdant.service"; then
  systemctl restart verdant
  echo -e "${GREEN}✓ verdant.service restarted successfully.${NC}"
fi

echo -e "\n${GREEN}========================================================================${NC}"
echo -e "${GREEN}✓ Verdant has been successfully updated!${NC}"
echo -e "Check status: ${YELLOW}systemctl status verdant${NC}"
echo -e "Live logs:    ${YELLOW}journalctl -u verdant -f -n 30${NC}"
echo -e "${GREEN}========================================================================${NC}"
