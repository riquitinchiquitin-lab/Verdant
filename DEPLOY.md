
# 🌿 Verdant: Complete Installation Guide (For Dummies)

Follow these steps exactly to get your system online.

---

## Phase 1: Proxmox Container Setup

Your Proxmox LXC container requires specific features to be enabled for Docker compatibility.

1.  **Create LXC Container**: Use the **Ubuntu 24.04** template.
2.  **Enable Docker Support**:
    -   Navigate to **Options** > **Features** in your container settings.
    -   Enable **Nesting** and **Keyctl**.

---

## Phase 2: System and Docker Preparation

Log into your Ubuntu terminal via SSH or the Proxmox console.

1.  **System Update**:
    ```bash
    apt update && apt upgrade -y
    ```
2.  **Install Docker**:
    ```bash
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    ```

---

## Phase 3: Project and Configuration Setup

1.  **Create Project Directory**:
    ```bash
    mkdir -p /opt/verdant
    cd /opt/verdant
    ```
2.  **Create `.env` Configuration File**:
    ```bash
    nano .env
    ```
    -   Paste the configuration from the "System Master Configuration" section.
    -   Save with `CTRL+O`, `Enter`, and exit with `CTRL+X`.

---

## Phase 4: Application Deployment

1.  **Deploy with Docker Compose**:
    ```bash
    docker compose up -d --build --remove-orphans
    ```
    -   This process may take several minutes to complete.
2.  **Verify Deployment**:
    ```bash
    docker ps
    ```

---

## Phase 5: Access and Network Configuration

1.  **Cloudflare Zero Trust Dashboard**:
    -   Configure public hostnames to point to the appropriate services:
        -   **Unified App**: `HTTP://verdant-app:3000`

---

## Troubleshooting

### ERROR: "lookup verdant-app: no such host"
This is a DNS failure inside your Docker network.
1.  **Check Service Name:** Ensure your `docker-compose.yml` service name is exactly `verdant-app`.
2.  **Check Container Status:** Run `docker ps`. If `verdant-app` is not listed, it crashed during startup.
3.  **Check Logs:** Run `docker compose logs verdant-app` to see why it failed.
4.  **Check Network:** Ensure both `cf-tunnel` and `verdant-app` are in the same network (`verdant-net`).

### CRITICAL: "Changes not showing up" or "Double Click Bug"
If the app behaves like the old version after an update:
1.  **Force Rebuild (Cleans Cache):**
    ```bash
    docker compose down
    docker system prune -af
    docker compose up -d --build --no-cache
    ```
2.  **Clear Browser Cache:** Open your app and press `CTRL + F5` (Windows/Linux) or `CMD + Shift + R` (Mac).

### Error: "Variable is not set" (e.g., Warning: The "j6H" variable is not set)
This happens because Docker Compose thinks any dollar sign (`$`) in your `.env` file is a variable.
*   **Fix:** Edit your `.env` file. 
*   **Escape the dollar signs:** Replace every `$` with `$$`.

### Error: "npm error Missing script: build"
*   **Fix:** Ensure you are in `/opt/verdant` and that `package.json` exists in that directory.

### "Permission Denied" in Docker
Make sure you enabled **Nesting** in Proxmox container options.

---
**Congratulations!** Your botanical archives are now secured and running on your own hardware.
