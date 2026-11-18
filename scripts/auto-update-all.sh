#!/usr/bin/env bash
# ==============================================================================
# Verdant - Unified Dual-Scope Automated Daily Update Script
# ==============================================================================
# 1. Updates Debian Linux OS system packages (apt & unattended-upgrades)
# 2. Updates Node.js/npm dependencies (npm update --legacy-peer-deps)
# 3. Applies automated security patches (npm audit fix)
# 4. Verifies TypeScript compilation & Vite production build (npm run lint && npm run build)
# 5. Restarts verdant.service or Docker Compose stack if active
# ==============================================================================
set -eo pipefail

SILENT=false
if [[ "${1:-}" == "--silent" || "${1:-}" == "-s" || "${SILENT_UPDATE:-}" == "true" ]]; then
  SILENT=true
fi

if [ "$SILENT" = true ]; then
  LOG_FILE="${VERDANT_UPDATE_LOG:-/var/log/verdant-autoupdate.log}"
  if [ -w "$(dirname "$LOG_FILE")" ] || [ -w "$LOG_FILE" ]; then
    if [ -f "$LOG_FILE" ] && [ "$(wc -l < "$LOG_FILE" 2>/dev/null || echo 0)" -gt 1000 ]; then
      tail -n 500 "$LOG_FILE" > "${LOG_FILE}.tmp" 2>/dev/null && mv "${LOG_FILE}.tmp" "$LOG_FILE" 2>/dev/null || true
    fi
    exec >> "$LOG_FILE" 2>&1
  else
    exec >/dev/null 2>&1
  fi
fi

GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}========================================================================${NC}"
echo -e "${CYAN}      Verdant Dual-Scope Automated Package & OS Update Engine           ${NC}"
echo -e "${CYAN}========================================================================${NC}"

if [ -n "${VERDANT_DIR:-}" ]; then
  APP_DIR="$VERDANT_DIR"
elif [ -f "$(pwd)/package.json" ] && [ -f "$(pwd)/server.ts" ]; then
  APP_DIR="$(pwd)"
elif [ -f "/opt/verdant/package.json" ]; then
  APP_DIR="/opt/verdant"
elif [ -f "/root/verdant/package.json" ]; then
  APP_DIR="/root/verdant"
else
  APP_DIR="$(pwd)"
fi

cd "$APP_DIR"

# ------------------------------------------------------------------------------
# 1. Debian Linux OS System Packages Update
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[1/3] Updating Debian OS System Packages & Security Patches...${NC}"
if command -v apt-get >/dev/null 2>&1; then
  if [[ $EUID -eq 0 ]]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -q -y 2>&1 || true
    apt-get upgrade -y --no-install-recommends -q 2>&1 || true
    apt-get autoremove -y -q 2>&1 || true
    apt-get clean 2>&1 || true
    if command -v unattended-upgrade >/dev/null 2>&1; then
      unattended-upgrade 2>&1 || true
    fi
    echo -e "  ${GREEN}✓ Debian system packages up to date.${NC}"
  else
    echo -e "  ${YELLOW}ℹ️  Non-root execution: skipping OS apt-get upgrade.${NC}"
  fi
fi

# ------------------------------------------------------------------------------
# 2. Node.js & npm Application Dependencies Update
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[2/3] Updating npm Application Dependencies...${NC}"
NODE_MAJOR=$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1 || echo 0)
if [ "${NODE_MAJOR:-0}" -lt 24 ] && [[ $EUID -eq 0 ]] && command -v apt-get >/dev/null 2>&1; then
  echo -e "  ${YELLOW}Upgrading Node.js $(node -v 2>/dev/null || echo '') -> 24 LTS...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null 2>&1 || true
  apt-get install -y nodejs >/dev/null 2>&1 || true
fi
npm update --legacy-peer-deps --include=dev --no-audit --no-fund
npm audit fix --legacy-peer-deps --include=dev 2>/dev/null || true
npm cache clean --force >/dev/null 2>&1 || true

# ------------------------------------------------------------------------------
# 3. Verify Build & Restart Service / Docker Stack
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[3/3] Verifying TypeScript & Production Build...${NC}"
npm run lint
npm run build

if [ -f "$APP_DIR/docker-compose.yml" ] && command -v docker >/dev/null 2>&1 && docker compose ps -q 2>/dev/null | grep -q .; then
  docker compose up -d --build --remove-orphans
  docker container prune -f >/dev/null 2>&1 || true
  docker image prune -af >/dev/null 2>&1 || true
  docker builder prune -af >/dev/null 2>&1 || true
  echo -e "  ${GREEN}✓ Docker Compose stack rebuilt & old Docker files pruned.${NC}"
elif systemctl list-unit-files 2>/dev/null | grep -q "verdant.service"; then
  systemctl restart verdant
  echo -e "  ${GREEN}✓ verdant.service restarted.${NC}"
fi
[[ $EUID -eq 0 ]] && command -v journalctl >/dev/null 2>&1 && journalctl --vacuum-size=50M >/dev/null 2>&1 || true

echo -e "\n${GREEN}========================================================================${NC}"
echo -e "${GREEN}✓ Daily package & OS update complete ($(date))${NC}"
echo -e "${GREEN}========================================================================${NC}\n"
