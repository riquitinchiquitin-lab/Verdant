#!/usr/bin/env bash

# Verdant Proxmox LXC Installation Script
# This script is intended to be run inside a Debian/Ubuntu LXC.

set -e

# --- Configuration ---
APP_DIR="/opt/verdant"
NODE_VERSION="22"

# --- System Update ---
echo "Updating system..."
apt-get update
apt-get upgrade -y

# --- Install Dependencies ---
echo "Installing dependencies..."
apt-get install -y curl git build-essential python3

# --- Install Node.js ---
echo "Installing Node.js v${NODE_VERSION}..."
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
apt-get install -y nodejs

# --- Setup Application ---
echo "Setting up Verdant application in ${APP_DIR}..."
mkdir -p ${APP_DIR}
git clone https://github.com/riquitinchiquitin-lab/verdant.git ${APP_DIR}

# --- Install NPM Packages ---
cd ${APP_DIR}
cp .env.example .env
echo "Installing NPM dependencies..."
npm install
echo "Building the application..."
npm run build


# --- Setup Systemd Service ---
echo "Creating systemd service..."
cat <<EOF > /etc/systemd/system/verdant.service
[Unit]
Description=Verdant Plant Management System
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/npm start
Restart=always
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable verdant
# systemctl start verdant # Don't start yet, might need env vars

echo "Installation complete!"
echo "Please configure your .env file in ${APP_DIR} and then run: systemctl start verdant"
