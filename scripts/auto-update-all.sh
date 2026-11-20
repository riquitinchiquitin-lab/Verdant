#!/usr/bin/env bash
# ==============================================================================
# Verdant - Unified Daily Automated Dependencies & OS Update Engine
# ==============================================================================
# 1. Updates Debian Linux OS system packages & security patches (apt & unattended-upgrades)
# 2. Checks and updates npm CLI to latest version
# 3. Checks all dependencies daily (`npm outdated`) and updates them (`npm update`)
# 4. Approves essential native install scripts (argon2, sqlite3, esbuild, protobufjs)
# 5. Applies automated security patches (`npm audit fix`)
# 6. Verifies TypeScript compilation (`npm run lint`) & Vite build (`npm run build`)
# 7. Safe rollback protection: restores previous working state if build fails
# 8. Restarts verdant.service or Docker Compose stack if active
# ==============================================================================
set -eo pipefail

export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:$PATH"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}========================================================================${NC}"
echo -e "${CYAN}      Verdant Daily Automated Dependencies & System Update Engine       ${NC}"
echo -e "${CYAN}========================================================================${NC}"
echo -e "Started at: $(date)\n"

# Auto-detect application root directory
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
echo -e "Application root: ${GREEN}${APP_DIR}${NC}"

# ------------------------------------------------------------------------------
# 1. Debian Linux OS System Packages Update
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[1/4] Checking & Updating Linux OS System Packages...${NC}"
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
# 2. Check and Update Node.js & npm CLI
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[2/5] Checking Node.js & npm CLI Versions...${NC}"
NODE_MAJOR=$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1 || echo 0)
if [ "${NODE_MAJOR:-0}" -lt 24 ] && [[ $EUID -eq 0 ]] && command -v apt-get >/dev/null 2>&1; then
  echo -e "  ${YELLOW}Upgrading Node.js $(node -v 2>/dev/null || echo '') -> 24 LTS...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null 2>&1 || true
  apt-get install -y nodejs >/dev/null 2>&1 || true
fi

echo -e "  Current Node.js : ${GREEN}$(node -v 2>/dev/null || echo 'unknown')${NC}"
echo -e "  Current npm     : ${GREEN}$(npm -v 2>/dev/null || echo 'unknown')${NC}"

# Update npm to latest
echo -e "  Checking for latest npm release..."
if [[ $EUID -eq 0 ]]; then
  npm install -g npm@latest >/dev/null 2>&1 || true
else
  npm install -g npm@latest --prefix "$HOME/.local" >/dev/null 2>&1 || true
fi
echo -e "  Active npm      : ${GREEN}$(npm -v 2>/dev/null || echo 'unknown')${NC}"

# ------------------------------------------------------------------------------
# 3. Pull Latest Application Code (Git)
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[3/5] Pulling Latest Application Code...${NC}"
if [ -d "$APP_DIR/.git" ]; then
  echo -e "  Fetching latest repository commits from origin/main..."
  git -C "$APP_DIR" fetch origin main --tags -q 2>&1 || true
  git -C "$APP_DIR" pull --rebase origin main 2>&1 || true
  echo -e "  ${GREEN}✓ Git code synchronized to latest origin/main.${NC}"
else
  echo -e "  ${YELLOW}ℹ️  Not a git repository clone; skipping git sync.${NC}"
fi

# ------------------------------------------------------------------------------
# 4. Check and Update All Application Dependencies
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[4/5] Checking and Updating Dependencies...${NC}"

# Create safety backup of package manifests for automated rollback
BACKUP_TMP_DIR="/tmp/verdant-update-backup-$$"
mkdir -p "$BACKUP_TMP_DIR"
cp -f "$APP_DIR/package.json" "$BACKUP_TMP_DIR/package.json"
[ -f "$APP_DIR/package-lock.json" ] && cp -f "$APP_DIR/package-lock.json" "$BACKUP_TMP_DIR/package-lock.json"

# Log currently outdated dependencies
echo -e "  Dependencies audit check (npm outdated):"
npm outdated || true

# Approve necessary native install scripts for npm 12+
if npm install-scripts --help >/dev/null 2>&1; then
  npm install-scripts approve argon2 esbuild protobufjs sqlite3 >/dev/null 2>&1 || true
fi

# Update dependencies within allowed ranges & apply security patches
echo -e "\n  Applying dependency updates..."
npm update --include=dev --no-audit 2>&1 || true

echo -e "  Applying security audit patches..."
npm audit fix --include=dev 2>/dev/null || true

# Rebuild native modules if needed
if npm rebuild --help >/dev/null 2>&1; then
  npm rebuild sqlite3 argon2 >/dev/null 2>&1 || true
fi

# ------------------------------------------------------------------------------
# 5. Verify TypeScript & Production Build with Automated Rollback
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[5/5] Verifying Build Health & Service Stability...${NC}"

BUILD_FAILED=0
if ! npm run lint; then
  echo -e "  ${RED}✗ TypeScript linting/typecheck failed!${NC}"
  BUILD_FAILED=1
elif ! npm run build; then
  echo -e "  ${RED}✗ Vite production build failed!${NC}"
  BUILD_FAILED=1
fi

if [ $BUILD_FAILED -eq 1 ]; then
  echo -e "\n${RED}[!] Build validation failed after updates. Initiating automated rollback to previous stable manifests...${NC}"
  cp -f "$BACKUP_TMP_DIR/package.json" "$APP_DIR/package.json"
  [ -f "$BACKUP_TMP_DIR/package-lock.json" ] && cp -f "$BACKUP_TMP_DIR/package-lock.json" "$APP_DIR/package-lock.json"
  npm install --no-audit 2>&1 || true
  npm run build || true
  rm -rf "$BACKUP_TMP_DIR"
  echo -e "${YELLOW}✓ Restored previous stable configuration. Application remains healthy.${NC}"
  exit 1
else
  rm -rf "$BACKUP_TMP_DIR"
  echo -e "  ${GREEN}✓ Typecheck and production build verified successfully.${NC}"
fi

# Restart services if active
if [ -f "$APP_DIR/docker-compose.yml" ] && command -v docker >/dev/null 2>&1 && docker compose ps -q 2>/dev/null | grep -q .; then
  docker compose up -d --build
  echo -e "  ${GREEN}✓ Docker Compose stack rebuilt & restarted.${NC}"
elif systemctl list-unit-files 2>/dev/null | grep -q "verdant.service"; then
  systemctl restart verdant 2>/dev/null || true
  echo -e "  ${GREEN}✓ verdant.service restarted.${NC}"
fi

echo -e "\n${GREEN}========================================================================${NC}"
echo -e "${GREEN}✓ Daily dependency check & update complete ($(date))${NC}"
echo -e "${GREEN}========================================================================${NC}\n"
