#!/usr/bin/env bash
# ==============================================================================
# Verdant - Install Daily Auto-Update Timer (systemd timer or cron fallback)
# ==============================================================================
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root (or with sudo) to install the daily auto-update timer."
  exit 1
fi

if [ -n "${VERDANT_DIR:-}" ]; then
  APP_DIR="$VERDANT_DIR"
elif [ -f "$(pwd)/server.ts" ]; then
  APP_DIR="$(pwd)"
elif [ -d "/opt/verdant" ]; then
  APP_DIR="/opt/verdant"
elif [ -d "/root/verdant" ]; then
  APP_DIR="/root/verdant"
else
  echo "Could not detect Verdant directory. Set VERDANT_DIR=/path/to/verdant."
  exit 1
fi

chmod +x "$APP_DIR/scripts/auto-update-all.sh"

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
Description=Run Verdant Daily Auto-Update at 03:30

[Timer]
OnCalendar=*-*-* 03:30:00
RandomizedDelaySec=15m
Persistent=true

[Install]
WantedBy=timers.target
EOF

  systemctl daemon-reload
  systemctl enable --now verdant-autoupdate.timer
  echo "✓ Installed & enabled systemd timer: verdant-autoupdate.timer (daily at 03:30)"
  systemctl list-timers verdant-autoupdate.timer --no-pager || true
else
  cat >/etc/cron.d/verdant-autoupdate <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
30 3 * * * root VERDANT_DIR=${APP_DIR} bash ${APP_DIR}/scripts/auto-update-all.sh >> /var/log/verdant-autoupdate.log 2>&1
EOF
  chmod 644 /etc/cron.d/verdant-autoupdate
  echo "✓ Installed daily cron job at /etc/cron.d/verdant-autoupdate (daily at 03:30)"
fi
