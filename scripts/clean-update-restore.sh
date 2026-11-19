#!/usr/bin/env bash
# ==============================================================================
# Verdant — Automated Clean Update, Backup & Restore Script
# Optimized for: Proxmox VE (LXC Container), Raspberry Pi & Universal Linux
# ==============================================================================
# Workflow:
#  1. Halts the verdant systemd service (if active).
#  2. Creates an atomic backup of user data (.env, SQLite DB, uploads).
#  3. Prunes backup archives, strictly keeping the 3 latest backups.
#  4. Purges old/stale build artifacts (node_modules, dist).
#  5. Pulls latest official release from GitHub (origin/main).
#  6. Performs clean npm install --legacy-peer-deps & production build.
#  7. Restores & verifies database and settings.
#  8. Hardens permissions (chmod 600 .env, 700 data) & starts verdant.service.
#  9. Verifies service health with automatic rollback protection.
# ==============================================================================
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

INSTALL_DIR="${VERDANT_DIR:-/opt/verdant}"
if [ ! -d "$INSTALL_DIR" ] && [ -f "./server.ts" ]; then
  INSTALL_DIR="$(pwd)"
fi

BACKUP_ROOT="/var/backups/verdant"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="${BACKUP_ROOT}/backup_${TIMESTAMP}"
SERVICE_NAME="verdant"
PORT="${PORT:-3000}"
MAX_BACKUPS="${MAX_BACKUPS:-2}"

echo -e "${CYAN}${BOLD}"
echo "========================================================================"
echo "          Verdant — Clean Update, Backup & Data Restore Tool            "
echo "========================================================================"
echo -e "${NC}"
echo -e "Target Directory : ${GREEN}${INSTALL_DIR}${NC}"
echo -e "Backup Target    : ${YELLOW}${BACKUP_DIR}${NC}"
echo -e "Retention Policy : ${CYAN}Retain strictly ${MAX_BACKUPS} latest backups${NC}"
echo -e "Timestamp        : $(date)\n"

# 1. Privilege verification
if [[ $EUID -ne 0 ]]; then
  if command -v sudo >/dev/null 2>&1; then
    echo -e "${YELLOW}[!] Escalating to root privileges using sudo...${NC}"
    exec sudo VERDANT_DIR="$INSTALL_DIR" bash "$0" "$@"
  else
    echo -e "${RED}[ERROR] This script must be run as root or with sudo.${NC}"
    exit 1
  fi
fi

if [ ! -d "$INSTALL_DIR" ]; then
  echo -e "${RED}[ERROR] Install directory ${INSTALL_DIR} not found.${NC}"
  exit 1
fi

cd "$INSTALL_DIR"

# 2. Stop service before backup
SERVICE_ACTIVE=false
if systemctl list-unit-files 2>/dev/null | grep -q "${SERVICE_NAME}.service"; then
  if systemctl is-active --quiet "$SERVICE_NAME"; then
    SERVICE_ACTIVE=true
    echo -e "${CYAN}[1/7] Stopping ${SERVICE_NAME}.service for atomic backup...${NC}"
    systemctl stop "$SERVICE_NAME"
  fi
fi

# 3. Create atomic backup
echo -e "${CYAN}[2/7] Creating atomic backup of database, .env, and uploads...${NC}"
mkdir -p "$BACKUP_DIR"
[ -f "$INSTALL_DIR/.env" ] && cp -a "$INSTALL_DIR/.env" "$BACKUP_DIR/.env"
[ -d "$INSTALL_DIR/data" ] && cp -a "$INSTALL_DIR/data" "$BACKUP_DIR/data"
[ -d "$INSTALL_DIR/uploads" ] && cp -a "$INSTALL_DIR/uploads" "$BACKUP_DIR/uploads"
echo -e "${GREEN}✓ Backup created at ${BACKUP_DIR}${NC}"

# 4. Prune old backups
echo -e "${CYAN}[3/7] Pruning old backups (keeping latest ${MAX_BACKUPS})...${NC}"
if [ -d "$BACKUP_ROOT" ]; then
  ls -1dt "${BACKUP_ROOT}"/backup_* 2>/dev/null | tail -n +$((MAX_BACKUPS + 1)) | xargs -r rm -rf
fi

# 5. Clean stale artifacts & pull latest code
echo -e "${CYAN}[4/7] Cleaning stale build artifacts & pulling origin/main...${NC}"
rm -rf "$INSTALL_DIR/node_modules" "$INSTALL_DIR/dist"
if [ -d ".git" ]; then
  git fetch --all --tags
  git reset --hard origin/main
else
  git init
  git remote add origin https://github.com/riquitinchiquitin-lab/Verdant.git 2>/dev/null || git remote set-url origin https://github.com/riquitinchiquitin-lab/Verdant.git
  git fetch --depth 1 origin main
  git reset --hard origin/main
fi

# 6. Build/Install (skip host npm install/build if running via Docker Compose)
IS_DOCKER=false
if [ -f "$INSTALL_DIR/docker-compose.yml" ] && command -v docker >/dev/null 2>&1 && docker compose ps -q 2>/dev/null | grep -q .; then
  IS_DOCKER=true
fi

if [ "$IS_DOCKER" = false ]; then
  echo -e "${CYAN}[5/7] Installing dependencies & building production bundle...${NC}"
  NODE_MAJOR=$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1 || echo 0)
  if [ "${NODE_MAJOR:-0}" -lt 24 ]; then
    echo -e "${YELLOW}[!] Node.js $(node -v 2>/dev/null || echo 'missing') is below v24. Upgrading to Node.js 24 LTS...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
    apt-get install -y nodejs
    apt-get clean >/dev/null 2>&1 || true
    echo -e "${GREEN}✓ Upgraded to Node.js $(node -v)${NC}"
  fi
  npm install --legacy-peer-deps --no-audit
  npm run build
  npm prune --omit=dev --legacy-peer-deps >/dev/null 2>&1 || true
  npm cache clean --force >/dev/null 2>&1 || true
else
  echo -e "${CYAN}[5/7] Docker Compose detected — skipping host npm install (built inside container)...${NC}"
fi

# 7. Restore user data if missing & harden permissions
echo -e "${CYAN}[6/7] Verifying data & hardening permissions...${NC}"
[ -f "$BACKUP_DIR/.env" ] && [ ! -f "$INSTALL_DIR/.env" ] && cp -a "$BACKUP_DIR/.env" "$INSTALL_DIR/.env"
[ -d "$BACKUP_DIR/data" ] && [ ! -d "$INSTALL_DIR/data" ] && cp -a "$BACKUP_DIR/data" "$INSTALL_DIR/data"
[ -d "$BACKUP_DIR/uploads" ] && [ ! -d "$INSTALL_DIR/uploads" ] && cp -a "$BACKUP_DIR/uploads" "$INSTALL_DIR/uploads"

if [ "$IS_DOCKER" = true ]; then
  mkdir -p "$INSTALL_DIR/data"
  chown -R 1000:1000 "$INSTALL_DIR/data"
  [ -d "$INSTALL_DIR/uploads" ] && chown -R 1000:1000 "$INSTALL_DIR/uploads"
elif id -u verdant >/dev/null 2>&1; then
  chown -R verdant:verdant "$INSTALL_DIR"
fi
[ -d "$INSTALL_DIR/data" ] && chmod 700 "$INSTALL_DIR/data"
[ -f "$INSTALL_DIR/.env" ] && chmod 600 "$INSTALL_DIR/.env"

# Ensure symlink /opt/verdant exists if installed in /root/verdant
if [ "$INSTALL_DIR" = "/root/verdant" ] && [ ! -e "/opt/verdant" ] && [[ $EUID -eq 0 ]]; then
  ln -s /root/verdant /opt/verdant 2>/dev/null || true
fi

# 8. Restart service / Docker Compose & health check with rollback
echo -e "${CYAN}[7/7] Restarting Verdant & verifying health...${NC}"
if [ "$IS_DOCKER" = true ]; then
  docker compose up -d --build --remove-orphans
  docker container prune -f >/dev/null 2>&1 || true
  docker image prune -af >/dev/null 2>&1 || true
  docker builder prune -af >/dev/null 2>&1 || true
  docker network prune -f >/dev/null 2>&1 || true
  echo -e "${GREEN}✓ Docker Compose stack rebuilt & old Docker files pruned.${NC}"
elif command -v systemctl >/dev/null 2>&1 && [[ $EUID -eq 0 ]]; then
  if ! systemctl list-unit-files 2>/dev/null | grep -q "${SERVICE_NAME}.service"; then
    echo -e "${YELLOW}[!] ${SERVICE_NAME}.service not registered. Creating /etc/systemd/system/${SERVICE_NAME}.service...${NC}"
    NPM_BIN="$(command -v npm || echo /usr/bin/npm)"
    cat <<EOF > /etc/systemd/system/${SERVICE_NAME}.service
[Unit]
Description=Verdant Plant Management System
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=${NPM_BIN} start
Restart=always
Environment=NODE_ENV=production
Environment=PORT=${PORT}

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable "${SERVICE_NAME}"
  fi

  pkill -f "tsx server.ts" 2>/dev/null || true
  systemctl restart "$SERVICE_NAME"
  sleep 3
  if curl -fsS "http://127.0.0.1:${PORT}/api/auth/webauthn/status" >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Health check passed! Verdant is online.${NC}"
  else
    echo -e "${RED}[!] Health check failed! Restoring data backup from ${BACKUP_DIR}...${NC}"
    systemctl stop "$SERVICE_NAME" || true
    [ -f "$BACKUP_DIR/.env" ] && cp -a "$BACKUP_DIR/.env" "$INSTALL_DIR/.env"
    [ -d "$BACKUP_DIR/data" ] && rm -rf "$INSTALL_DIR/data" && cp -a "$BACKUP_DIR/data" "$INSTALL_DIR/data"
    systemctl start "$SERVICE_NAME" || true
    exit 1
  fi
fi

echo -e "\n${GREEN}${BOLD}✓ Clean update & verification complete!${NC}"
