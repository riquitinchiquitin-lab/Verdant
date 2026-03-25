#!/usr/bin/env bash

# Verdant Proxmox Helper Script
# This script is intended to be run on a Proxmox host.

set -e

# --- Configuration ---
LXC_ID=${1:-100}
LXC_NAME=${2:-"verdant-lxc"}
LXC_STORAGE=${3:-"local-lvm"}
LXC_BRIDGE=${4:-"vmbr0"}
LXC_PASSWORD=${5:-"verdant-pass"}

# --- Check if LXC ID already exists ---
if pct status ${LXC_ID} >/dev/null 2>&1; then
    echo "LXC ID ${LXC_ID} already exists. Please choose a different ID."
    exit 1
fi

# --- Create LXC ---
echo "Creating LXC ${LXC_ID} (${LXC_NAME})..."
pct create ${LXC_ID} \
    local:vztmpl/debian-12-standard_12.0-1_amd64.tar.zst \
    --hostname ${LXC_NAME} \
    --storage ${LXC_STORAGE} \
    --password ${LXC_PASSWORD} \
    --net0 name=eth0,bridge=${LXC_BRIDGE},ip=dhcp \
    --rootfs ${LXC_STORAGE}:8 \
    --cores 2 \
    --memory 2048 \
    --swap 512 \
    --unprivileged 1 \
    --features nesting=1

# --- Start LXC ---
echo "Starting LXC ${LXC_ID}..."
pct start ${LXC_ID}

# --- Wait for LXC to start ---
echo "Waiting for LXC to initialize..."
sleep 10

# --- Copy Installation Script ---
echo "Copying installation script to LXC..."
# Note: In a real scenario, we'd fetch the script from a URL.
# For this project, we'll assume the script is available locally or we'll fetch it.
# Let's assume we're fetching it from the project's repo.
# For now, let's just use a placeholder for the fetch command.
# curl -sSL https://raw.githubusercontent.com/your-repo/verdant/main/scripts/proxmox/install.sh | pct exec ${LXC_ID} -- bash

# --- Run Installation Script ---
echo "Running installation script inside LXC..."
pct exec ${LXC_ID} -- bash -c "curl -sSL https://raw.githubusercontent.com/riquitinchiquitin-lab/verdant/main/scripts/proxmox/install.sh | bash"

echo "LXC ${LXC_ID} created and installation script triggered."

echo "Access the LXC via: pct enter ${LXC_ID}"
echo "The application will be available at the LXC's IP on port 3000."
