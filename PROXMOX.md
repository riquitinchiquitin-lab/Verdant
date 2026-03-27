# Proxmox Installation Guide

This guide explains how to install the Verdant Plant Management System on a Proxmox host using a Linux Container (LXC).

## Prerequisites

*   A Proxmox VE host.
*   A network bridge (e.g., `vmbr0`) with internet access.
*   A storage pool (e.g., `local-lvm`) for the LXC.

## Installation Steps

### 1. Create the LXC

Run the following command on your Proxmox host's shell to create the LXC and trigger the installation:

```bash
# Fetch and run the helper script
curl -sSL https://raw.githubusercontent.com/riquitinchiquitin-lab/verdant/main/scripts/proxmox/proxmox_helper.sh | bash
```

*Note: Replace the URL with the actual URL of the script in your repository.*

### 2. Configure the Application

Once the LXC is created, enter it:

```bash
pct enter <LXC_ID>
```

Navigate to the application directory:

```bash
cd /opt/verdant
```

Copy the example environment file and configure it:

```bash
cp .env.example .env
nano .env
```

**Important:** Make sure to set `VITE_ALLOWED_HOSTS` to your domain (e.g., `VITE_ALLOWED_HOSTS=verdant.yknet.org`) to allow access from the public web.

### 3. Start the Service

Start the systemd service:

```bash
systemctl start verdant
```

The application will be available at the LXC's IP address on port 3000.

## Maintenance

*   **Check Logs:** `journalctl -u verdant -f`
*   **Restart Service:** `systemctl restart verdant`
*   **Update Application:**
    ```bash
    cd /opt/verdant
    git pull
    npm install
    npm run build
    systemctl restart verdant
    ```
