#!/usr/bin/env bash
# ==============================================================================
# Verdant — Proxmox LXC & Docker Disk Space Reclaim Script
# ==============================================================================
set -euo pipefail

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ -n "${VERDANT_DIR:-}" ]; then
  APP_DIR="$VERDANT_DIR"
elif [ -f "$(pwd)/server.ts" ] && [ -f "$(pwd)/package.json" ]; then
  APP_DIR="$(pwd)"
elif [ -d "/opt/verdant" ]; then
  APP_DIR="/opt/verdant"
elif [ -d "/root/verdant" ]; then
  APP_DIR="/root/verdant"
else
  APP_DIR="$(pwd)"
fi

echo -e "${CYAN}=== Disk usage BEFORE cleanup ===${NC}"
df -h /

# 1. Docker cleanup (if installed)
if command -v docker >/dev/null 2>&1; then
  echo -e "\n${CYAN}[1/6] Pruning unused Docker containers, images, build cache & networks...${NC}"
  docker container prune -f >/dev/null 2>&1 || true
  docker image prune -af >/dev/null 2>&1 || true
  docker builder prune -af >/dev/null 2>&1 || true
  docker network prune -f >/dev/null 2>&1 || true
  # Remove host node_modules/dist if running inside Docker Compose
  if [ -f "$APP_DIR/docker-compose.yml" ] && docker compose -f "$APP_DIR/docker-compose.yml" ps -q 2>/dev/null | grep -q .; then
    echo -e "${CYAN}  Removing redundant host node_modules/ and dist/ (running via Docker)...${NC}"
    rm -rf "$APP_DIR/node_modules" "$APP_DIR/dist"
  fi
fi

# 2. Bare-metal node_modules prune (keep runtime deps only)
if [ -d "$APP_DIR/node_modules" ] && [ -d "$APP_DIR/dist" ] && command -v npm >/dev/null 2>&1; then
  echo -e "\n${CYAN}[2/6] Pruning devDependencies from host node_modules...${NC}"
  (cd "$APP_DIR" && npm prune --omit=dev --legacy-peer-deps >/dev/null 2>&1 || true)
fi

# 3. npm cache & temp files
echo -e "\n${CYAN}[3/6] Clearing npm caches & temporary files...${NC}"
command -v npm >/dev/null 2>&1 && npm cache clean --force >/dev/null 2>&1 || true
rm -rf /root/.npm /home/*/.npm/_cacache /tmp/npm-* /tmp/tsx-* 2>/dev/null || true

# 4. APT & systemd journal logs (root only)
if [[ $EUID -eq 0 ]]; then
  echo -e "\n${CYAN}[4/6] Cleaning APT cache & vacuuming systemd journal (max 50M)...${NC}"
  apt-get autoremove --purge -y -qq >/dev/null 2>&1 || true
  apt-get clean >/dev/null 2>&1 || true
  rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*.deb 2>/dev/null || true
  if command -v journalctl >/dev/null 2>&1; then
    journalctl --vacuum-size=50M >/dev/null 2>&1 || true
  fi
  # Truncate rotated logs older than 7 days
  find /var/log -type f \( -name "*.gz" -o -name "*.1" -o -name "*.old" \) -delete 2>/dev/null || true
fi

# 5. Git garbage collection
if [ -d "$APP_DIR/.git" ] && command -v git >/dev/null 2>&1; then
  echo -e "\n${CYAN}[5/6] Compacting .git repository...${NC}"
  git -C "$APP_DIR" gc --prune=now >/dev/null 2>&1 || true
fi

# 6. Prune old Verdant backups (keep latest 2)
if [ -d "/var/backups/verdant" ]; then
  echo -e "\n${CYAN}[6/6] Pruning old backups in /var/backups/verdant (keeping latest 2)...${NC}"
  ls -1dt /var/backups/verdant/backup_* 2>/dev/null | tail -n +3 | xargs -r rm -rf
fi

echo -e "\n${GREEN}=== Disk usage AFTER cleanup ===${NC}"
df -h /

echo -e "\n${YELLOW}Top directories using space on /:${NC}"
du -xhd 2 / 2>/dev/null | sort -hr | head -n 12 || true
