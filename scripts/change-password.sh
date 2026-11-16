#!/usr/bin/env bash
# ==============================================================================
# Verdant - Proxmox / Linux Admin Setup & Password Change Script
# ==============================================================================
# Usage:
#   ./scripts/change-password.sh [email] [--generate]
# Works on both bare-metal Proxmox LXC (/opt/verdant) and Docker (/root/verdant).
# ==============================================================================
set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

if [ -n "${VERDANT_DIR:-}" ]; then
  APP_DIR="$VERDANT_DIR"
elif [ -f "$(pwd)/server.ts" ]; then
  APP_DIR="$(pwd)"
elif [ -d "/opt/verdant" ]; then
  APP_DIR="/opt/verdant"
elif [ -d "/root/verdant" ]; then
  APP_DIR="/root/verdant"
else
  echo -e "${RED}[ERROR] Could not locate Verdant directory.${NC}"
  exit 1
fi

cd "$APP_DIR"

AUTO_GENERATE=false
TARGET_EMAIL=""
for arg in "$@"; do
  if [[ "$arg" == "--generate" || "$arg" == "-g" ]]; then
    AUTO_GENERATE=true
  elif [ -z "$TARGET_EMAIL" ]; then
    TARGET_EMAIL="$arg"
  fi
done

echo -e "${CYAN}========================================================================${NC}"
echo -e "${CYAN}       Verdant — Proxmox / Linux Admin & Password Configuration         ${NC}"
echo -e "${CYAN}========================================================================${NC}"

if [ -z "$TARGET_EMAIL" ]; then
  read -rp "Administrator / User Email: " TARGET_EMAIL
fi
TARGET_EMAIL="$(echo "$TARGET_EMAIL" | tr '[:upper:]' '[:lower:]' | xargs)"

if [ -z "$TARGET_EMAIL" ]; then
  echo -e "${RED}[ERROR] Email cannot be empty.${NC}"
  exit 1
fi

read -rp "Display Name (leave blank if updating existing user): " TARGET_NAME || true

generate_secure_password() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 24 | tr -dc 'a-zA-Z0-9!@#%^&*' | head -c 20
  else
    tr -dc 'a-zA-Z0-9!@#%^&*' </dev/urandom | head -c 20
  fi
}

IS_AUTOGEN=false
if [ "$AUTO_GENERATE" = true ]; then
  PW1="$(generate_secure_password)"
  IS_AUTOGEN=true
else
  while true; do
    echo -ne "${BOLD}New Password [${GREEN}Press Enter to auto-generate 20-char password${NC}${BOLD}]: ${NC}"
    read -rs PW1
    echo ""
    if [ -z "$PW1" ]; then
      PW1="$(generate_secure_password)"
      IS_AUTOGEN=true
      break
    fi
    if [ ${#PW1} -lt 8 ]; then
      echo -e "${RED}Password must be at least 8 characters.${NC}"
      continue
    fi
    echo -ne "Confirm New Password: "
    read -rs PW2
    echo ""
    if [ "$PW1" != "$PW2" ]; then
      echo -e "${RED}Passwords do not match. Try again.${NC}"
      continue
    fi
    break
  done
fi

# Run inside Docker container if Docker Compose stack is active, otherwise run locally
if [ -f "$APP_DIR/docker-compose.yml" ] && command -v docker >/dev/null 2>&1 && docker compose ps -q verdant-app 2>/dev/null | grep -q .; then
  echo -e "${YELLOW}Applying password inside Docker container (verdant-app)...${NC}"
  docker compose exec -T \
    -e VERDANT_ADMIN_EMAIL="$TARGET_EMAIL" \
    -e VERDANT_ADMIN_NAME="$TARGET_NAME" \
    -e VERDANT_ADMIN_PASSWORD="$PW1" \
    verdant-app npx tsx scripts/setup-admin.ts
else
  VERDANT_ADMIN_EMAIL="$TARGET_EMAIL" \
  VERDANT_ADMIN_NAME="$TARGET_NAME" \
  VERDANT_ADMIN_PASSWORD="$PW1" \
  npx tsx scripts/setup-admin.ts
fi

if [ "$IS_AUTOGEN" = true ]; then
  echo -e "\n${GREEN}${BOLD}========================================================================${NC}"
  echo -e "${GREEN}${BOLD}  Generated Verdant Credentials (save in Bitwarden / 1Password)       ${NC}"
  echo -e "${GREEN}${BOLD}========================================================================${NC}"
  echo -e "  Email:    ${CYAN}${BOLD}${TARGET_EMAIL}${NC}"
  echo -e "  Password: ${YELLOW}${BOLD}${PW1}${NC}"
  echo -e "${GREEN}${BOLD}========================================================================${NC}\n"
fi

echo -e "${GREEN}✓ Done! You can now sign in on Verdant with ${TARGET_EMAIL}.${NC}"
