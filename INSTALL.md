## 🚀 Installation & Setup

Follow these instructions to get Verdant running on your Linux system.

### 1. Prerequisites
Ensure you have the following installed on your system:
- **Docker** & **Docker Compose** (Recommended)
- **Node.js** (v18.0.0 or higher - for manual setup)
- **npm** (v9.0.0 or higher - for manual setup)
- **SQLite3** (for manual setup)
- **Git**

#### Ubuntu / Debian / Mint:
**Option A: Standard Repositories (Quickest)**
```bash
sudo apt update
sudo apt install -y docker.io docker-compose git
```

**Option B: Official Docker Repository (Recommended for Latest Version)**
```bash
# Add Docker's official GPG key:
sudo apt update
sudo apt install ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gnupg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add the repository to Apt sources:
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update

# Install Docker Engine and Docker Compose Plugin:
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin git
```

#### Fedora / RHEL / CentOS:
```bash
sudo dnf install -y dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin git
sudo systemctl start docker
```

#### Arch Linux:
```bash
sudo pacman -S docker docker-compose git
sudo systemctl start docker
```

#### Fedora / RHEL / CentOS:
```bash
sudo dnf install -y nodejs npm sqlite3 git
```

#### Arch Linux:
```bash
sudo pacman -S nodejs npm sqlite3 git
```

### 2. Obtaining API Keys
Verdant requires several API keys to function at full capacity. For a complete list of all environment variables and their descriptions, please refer to the [.env.example](.env.example) file.

#### A. Google Gemini API Key (Required for AI Care Advice)
1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Sign in with your Google account.
3. Click on **"Get API key"** in the sidebar.
4. Create a new API key in a new or existing project.
5. Copy the key to your `.env` file as `GEMINI_API_KEY`.

#### B. Google Client ID (Required for Authentication)
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project.
3. Navigate to **APIs & Services > Credentials**.
4. Click **Create Credentials > OAuth client ID**.
5. If prompted, configure the "OAuth consent screen".
6. Select **Web application** as the application type.
7. Add your App URL to **Authorized JavaScript origins**.
8. Add your App URL + `/auth/callback` to **Authorized redirect URIs**.
9. Copy the **Client ID** to your `.env` file as `GOOGLE_CLIENT_ID`.

#### C. PlantNet API Key (Optional for Plant Identification)
1. Register at [PlantNet API](https://my.plantnet.org/).
2. Navigate to your dashboard to find your API key.
3. Copy the key to your `.env` file as `PLANTNET_API_KEY`.

#### D. Trefle API Token (Botanical Data)
1. Sign up at [Trefle.io](https://trefle.io/).
2. Verify your email address.
3. Access your token from the user dashboard.
4. Copy the token to your `.env` file as `TREFLE_TOKEN`.

#### E. Perenual API Key (Plant Care Data)
1. Register at [Perenual](https://perenual.com/docs/api).
2. Choose a plan (Free tier available).
3. Retrieve your API key from your profile.
4. Copy the key to your `.env` file as `PERENUAL_API_KEY`.

#### F. Serper.dev API Key (Search Grounding)
1. Sign up at [Serper.dev](https://serper.dev/).
2. You will receive free credits upon registration.
3. Copy the API key from the dashboard to your `.env` file as `SERPER_API_KEY`.

#### G. System Security Keys
- **MASTER_KEY**: This must be a random 50-character string. You can generate one using:
  ```bash
  openssl rand -base64 38 | tr -d '\n' | cut -c1-50
  ```
- **DB_PASSWORD**: Set a strong, unique password for your PostgreSQL database.

#### H. Cloudflare Tunnel & Domain Name (For Public Access)
To expose your local Verdant instance to the public web (e.g., via `yknet.org`):
1. Create a [Cloudflare account](https://dash.cloudflare.com/).
2. Navigate to **Zero Trust > Networks > Tunnels**.
3. Create a new tunnel and follow the instructions to install `cloudflared` on your host.
4. Add a **Public Hostname** (e.g., `verdant.yourdomain.com`) pointing to `http://localhost:3000`.
5. Copy your **Tunnel Token** to your `.env` file as `CF_UNIFIED_TOKEN`.

#### I. Advanced Cloudflare Configuration (WAF & Bot Protection)
To ensure Google Auth and API uploads work correctly through Cloudflare, you must adjust the following security settings:

**1. Deactivate Bot Fight Mode:**
- Go to **Security > Bots**.
- Ensure **Bot Fight Mode** is set to **Off**.

**2. Create WAF Custom Rules (Skip Rules):**
- Go to **Security > WAF > Custom rules**.
- Click **Create rule**.
- **Rule 1: Allow Verdant Production API**
  - **Field**: Custom filter expression.
  - **Expression**: 
    ```
    (http.request.uri.path contains "/api/identify" and http.request.uri.path contains "/uploads") and (http.host contains "verdant.yourdomain.com") or (http.request.uri.path wildcard r"/cdn-cgi/challenge-platform/") or (http.request.uri.path wildcard r"/api/identify") or (http.host contains "verdant-api.yourdomain.com")
    ```
  - **Action**: Choose **Skip**.
  - **WAF components to skip**: Check **all boxes** (All remaining custom rules, All rate limiting rules, All managed rules, All Super Bot Fight Mode Rules, etc.).
- **Rule 2: Allow Verdant Test API**
  - **Field**: Custom filter expression.
  - **Expression**: 
    ```
    (http.host contains "verdant.yourdomain.com") or (http.request.uri.path wildcard r"/cdn-cgi/challenge-platform/") or (http.request.uri.path wildcard r"/api/identify") or (http.host contains "verdant-api.yourdomain.com")
    ```
  - **Action**: Choose **Skip**.
  - **WAF components to skip**: Check **all boxes**.

#### J. Root Owner Setup (Required for Initial Access)
The Root Owner is the primary administrator who has full control over the system and is the only one who can invite other users initially.
1. Decide which Google account will be the Root Owner.
2. Copy the email address of that account to your `.env` file as `VITE_ROOT_OWNER_EMAIL`.
   ```env
   VITE_ROOT_OWNER_EMAIL=your_username@gmail.com
   ```
3. The first time you sign in with this email, the system will automatically recognize you as the **Founder/Owner**.

### 3. Clone the Repository
```bash
git clone https://github.com/riquitinchiquitin-lab/verdant.git
cd verdant
```

### 3. Build & Initialize
#### Using Docker (Recommended):
```bash
docker-compose build
```

#### Manual Setup (Alternative):
```bash
npm install
```

### 4. Environment Configuration
Create a `.env` file in the root directory and add your API keys. You can find a template with all available options in [.env.example](.env.example):
```bash
cp .env.example .env
# Edit .env with your preferred editor
nano .env
```
### 5. Build & Start
#### Using Docker (Recommended):
```bash
# Start the entire stack in the background
docker-compose up -d

# View logs
docker-compose logs -f
```

#### Manual Setup (Alternative):
**Development Mode:**
```bash
npm run dev
```

**Production Mode:**
```bash
npm run build
npm start
```

## 🚀 Getting Started
1. **Initial Authentication**: Sign in using the Google account specified in `VITE_ROOT_OWNER_EMAIL`. You will be granted the **Owner** role automatically.
2. **Setup Property**: Create your first house or property via the **Admin > Houses** tab.
3. **Invite Personnel**: Go to **Admin > Personnel** to invite gardeners or other staff by adding their Google email addresses.
4. **Add Specimens**: Use the "Add Plant" interface or QR sync to populate your jungle.
5. **Follow Protocol**: Complete automated tasks to maintain optimal specimen health.

## 📄 License
This project is licensed under the **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** license.

- **Attribution**: You must give appropriate credit (Creator: Yan Boily), provide a link to the license, and indicate if changes were made.
- **Non-Commercial**: You may not use the material for commercial purposes.

For more details, please refer to the [LICENSE.md](./LICENSE.md) file.

---
*Verdant: Precision Care for the Modern Collector.*
