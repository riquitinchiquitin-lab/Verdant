#!/usr/bin/env bash
# ==============================================================================
# Verdant - Install Daily Auto-Update Timer (systemd timer or cron fallback)
# ==============================================================================
set -euo pipefail

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
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
  echo -e "${RED}Could not detect Verdant directory. Set VERDANT_DIR=/path/to/verdant.${NC}"
  exit 1
fi

chmod +x "$APP_DIR/scripts/auto-update-all.sh"

echo -e "${CYAN}========================================================================${NC}"
echo -e "${CYAN}        Verdant Daily Auto-Update Timer & Cron Installer                ${NC}"
echo -e "${CYAN}========================================================================${NC}"
echo -e "Target Application Directory: ${GREEN}${APP_DIR}${NC}\n"

# 1. Root / Sudo Mode (Systemd timer or /etc/cron.d)
if [[ $EUID -eq 0 ]]; then
  if command -v systemctl >/dev/null 2>&1 && systemctl is-system-running >/dev/null 2>&1; then
    cat >/etc/systemd/system/verdant-autoupdate.service <<EOF
[Unit]
Description=Verdant Daily OS & NPM Package Auto-Update
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=${APP_DIR}
Environment=VERDANT_DIR=${APP_DIR}
ExecStart=/usr/bin/env bash ${APP_DIR}/scripts/auto-update-all.sh
StandardOutput=journal
StandardError=journal
EOF

    cat >/etc/systemd/system/verdant-autoupdate.timer <<EOF
[Unit]
Description=Run Verdant Daily Auto-Update at 04:00 AM

[Timer]
OnCalendar=*-*-* 04:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

    systemctl daemon-reload
    systemctl enable --now verdant-autoupdate.timer
    echo -e "${GREEN}✓ Installed & enabled systemd timer: verdant-autoupdate.timer (daily at 04:00 AM)${NC}"
    systemctl list-timers verdant-autoupdate.timer --no-pager || true
  else
    cat >/etc/cron.d/verdant-autoupdate <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
0 4 * * * root VERDANT_DIR=${APP_DIR} bash ${APP_DIR}/scripts/auto-update-all.sh >> /var/log/verdant-autoupdate.log 2>&1
EOF
    chmod 644 /etc/cron.d/verdant-autoupdate
    echo -e "${GREEN}✓ Installed daily cron job at /etc/cron.d/verdant-autoupdate (daily at 04:00 AM)${NC}"
  fi
  exit 0
fi

# 2. Non-Root User Mode (crontab fallback or escalation prompt)
echo -e "${YELLOW}ℹ️  Running as non-root user (${USER:-$(whoami)}).${NC}"

if command -v crontab >/dev/null 2>&1; then
  CRON_LINE="0 4 * * * VERDANT_DIR=${APP_DIR} bash ${APP_DIR}/scripts/auto-update-all.sh >> \${HOME}/verdant-autoupdate.log 2>&1"
  ( crontab -l 2>/dev/null | grep -v "auto-update-all.sh" ; echo "$CRON_LINE" ) | crontab -
  echo -e "${GREEN}✓ Added daily update job to user crontab:${NC}"
  echo -e "  ${CYAN}${CRON_LINE}${NC}"
  echo -e "${GREEN}✓ Current crontab:${NC}"
  crontab -l | grep "auto-update-all.sh"
elif command -v sudo >/dev/null 2>&1; then
  echo -e "${YELLOW}crontab not available in this shell. Re-running with sudo to install system timer/cron...${NC}"
  exec sudo VERDANT_DIR="$APP_DIR" bash "$0"
else
  echo -e "${RED}[!] Neither root privileges nor user crontab are currently accessible in this environment.${NC}"
  echo -e "To install on your host/server:"
  echo -e "  ${CYAN}sudo bash ${APP_DIR}/scripts/install-daily-autoupdate.sh${NC}"
  echo -e "Or add this line to your crontab (crontab -e):"
  echo -e "  ${CYAN}0 4 * * * VERDANT_DIR=${APP_DIR} bash ${APP_DIR}/scripts/auto-update-all.sh >> /var/log/verdant-autoupdate.log 2>&1${NC}"
fi
