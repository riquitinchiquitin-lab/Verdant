# 🌿 Verdant: Installation & Setup Guide

Welcome to **Verdant**, the precision care platform for modern plant collectors. This guide provides comprehensive instructions for deploying and configuring your instance.

---

## 📖 Table of Contents

1. [Prerequisites](#-prerequisites)
2. [Repository Setup](#-1-repository-setup)
3. [Configuration & API Keys](#-2-configuration--api-keys)
4. [Deployment](#-3-deployment)
5. [Initial Onboarding](#-4-initial-onboarding)
6. [Advanced Configuration](#-advanced-configuration)
7. [Monitoring & Limits](#-monitoring--limits)
8. [Troubleshooting](#-troubleshooting)
9. [License](#-license)

---

## 📋 Prerequisites

Ensure your system meets the following requirements:

- **Docker & Docker Compose** (Required for deployment)
- **Git** (for version control)

### System Preparation (Ubuntu/Debian)

```bash
# Update system and install dependencies
sudo apt update && sudo apt install -y ca-certificates curl gnupg git

# Install Docker Engine (Official Repository)
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

---

## 🛠️ 1. Repository Setup

Clone the repository and navigate to the project root:

```bash
git clone https://github.com/riquitinchiquitin-lab/verdant.git
cd verdant
```

---

## 🔑 2. Configuration & API Keys

Verdant relies on several external services. Copy the example environment file and populate it with your credentials:

```bash
cp .env.example .env
nano .env
```

### A. Core AI & Search (Required)
- **Google Gemini API**: Powers AI-driven care advice. Obtain at [Google AI Studio](https://aistudio.google.com/).
  - Set `GEMINI_API_KEY`.
  - **Required Configuration**:
    1. **Enable Custom Search API**: Even with a key, the service must be enabled. Go to the [Google Cloud Library](https://console.cloud.google.com/apis/library), search for "Custom Search API", and click **Enable**.
    2. **Check API Key Restrictions**: If your key is restricted, ensure "Custom Search API" is allowed. Go to **APIs & Services > Credentials**, click your API key, and under **API restrictions**, ensure **Custom Search API** is checked in the dropdown. Save and allow 5 minutes for propagation.
- **Serper.dev**: Enables search grounding for real-time data. [Serper.dev](https://serper.dev/).
  - Set `SERPER_API_KEY`.

### B. Authentication (Required)
- **Google OAuth**: Required for secure user login.
  1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/).
  2. Configure the **OAuth Consent Screen**.
  3. Create **OAuth 2.0 Client IDs** (Web Application).
  4. Add your App URL to **Authorized JavaScript origins**.
  5. Add `[Your App URL]/auth/callback` to **Authorized redirect URIs**.
  - Set `GOOGLE_CLIENT_ID`.
- **Root Owner**: Specify the primary administrator's email.
  - Set `VITE_ROOT_OWNER_EMAIL`.

### C. Botanical Data (Required)
- **PlantNet**: Specimen identification. [my.plantnet.org](https://my.plantnet.org/).
- **Trefle**: Botanical metadata. [trefle.io](https://trefle.io/).
- **Open Plantbook**: Technical care specifications. [open.plantbook.io](https://open.plantbook.io/).
- **Perenual**: Supplemental care data. [perenual.com](https://perenual.com/).

### D. Cloudflare Setup (Required)
Verdant is designed to run behind a Cloudflare Tunnel for secure, encrypted access without opening firewall ports. This is **mandatory** for the app to function correctly with the AI engine.

1. **Create a Cloudflare Tunnel**:
   - Go to the [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/).
   - Navigate to **Networks > Tunnels** and create a new tunnel.
   - Choose **Cloudflared** as the connector.
   - Copy the **Tunnel Token** provided in the installation command.
   - Set `CF_UNIFIED_TOKEN` in your `.env` file.
2. **Configure Public Hostname**:
   - In the tunnel settings, add a **Public Hostname**.
   - Set the **Domain** (e.g., `verdant.example.com`).
   - Set the **Service Type** to `HTTP` and **URL** to `verdant-app:3000` (this matches the service name in `docker-compose.yml`).
3. **WAF & Security Settings (Critical)**:
   - **Bot Fight Mode**: Navigate to **Security > Bots** and ensure **Bot Fight Mode** is **OFF**. This is required to allow the AI engine to upload and process specimen images.
   - **WAF Skip Rules**: Navigate to **Security > WAF > Custom Rules**. Create a rule to **Skip** all security features for the following paths:
     - `/api/identify/*`
     - `/uploads/*`
   - **SSL/TLS**: Set your encryption mode to **Full (Strict)** in **Websites > [Your Domain] > SSL/TLS**.

### E. Security Keys
- **MASTER_KEY**: A unique 50-character string for encryption.
  ```bash
  openssl rand -base64 38 | tr -d '\n' | cut -c1-50
  ```

---

## 🚀 3. Deployment

### Docker Deployment (Production)

```bash
# Build and start services in detached mode
docker compose up -d --build

# Monitor logs
docker compose logs -f
```

---

## 🏁 4. Initial Onboarding

1. **First Login**: Sign in with the email specified in `VITE_ROOT_OWNER_EMAIL`. You will be automatically initialized as the **System Owner**.
2. **Define Properties**: Navigate to **Admin > Houses** to create your first property.
3. **Invite Team**: Use **Admin > Personnel** to invite staff via their Google emails.
4. **Add Specimens**: Start populating your collection using the "Add Plant" interface.

---

## ⚙️ Advanced Configuration

### Custom Domain
Set `VITE_ALLOWED_HOSTS` to your domain (e.g., `verdant.example.com`) to ensure correct CORS and redirect behavior.

---

## 🛡️ Monitoring & Limits

Verdant includes built-in telemetry to track API usage:
- **Real-time Tracking**: Monitor all API calls via the **System Telemetry** dashboard in the Admin panel.

---

## ❓ Troubleshooting

- **Login Fails**: Ensure your `GOOGLE_CLIENT_ID` is correct and the redirect URI matches exactly.
- **AI Advice Not Loading**: Check your `GEMINI_API_KEY` status and quota in Google AI Studio.
- **Images Not Uploading**: Check Cloudflare Bot Fight Mode or ensure the container has write access to the `uploads/` volume.

---

## 📄 License

This project is licensed under the **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)**.

- **Attribution**: Credit must be given to the creator (**Yan Boily**).
- **Non-Commercial**: Commercial use is strictly prohibited.

See [LICENSE.md](./LICENSE.md) for full details.

---
*Verdant: Precision Care for the Modern Collector.*
