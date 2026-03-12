/**
 * VERDANT SECURITY PROTOCOL - TIER 0
 * Handlers for Master Key derivation and encrypted system operations.
 * Optimized for Ubuntu 24.04 Proxmox LXC Deployment.
 */

// Cloudflare Tunnel Token - REMOVED FROM SOURCE
// Use environment variable CF_UNIFIED_TOKEN in docker-compose.yml
const CF_UNIFIED_TOKEN = "EXTERNAL_MANAGED";

/**
 * Generates a strictly 50-character high-entropy random key for AES-GCM.
 */
export const generateSecure50CharKey = (): string => {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#%^&*()_+=-";
  let result = "";
  const array = new Uint32Array(50); 
  window.crypto.getRandomValues(array);
  for (let i = 0; i < array.length; i++) {
    result += charset[array[i] % charset.length];
  }
  return result;
};

export const verifyMasterKey = async (inputKey: string): Promise<boolean> => {
  return inputKey.length === 50;
};

export const getEncryptionCommands = (passphrase: string) => {
  return [
    `# 1. Encrypt .env config for transmission`,
    `openssl enc -aes-256-cbc -salt -in .env -out .env.enc -k "${passphrase}" -pbkdf2`,
    `# 2. Securely purge unencrypted file`,
    `shred -u .env`,
    `# 3. Restrict permissions`,
    `chmod 600 .env.enc`
  ].join('\n');
};

export const getDockerSnippet = (passphrase: string) => {
  return `
# --- VERDANT HARDENED CLOUD ORCHESTRATION ---
services:
  # 1. Unified Application (Node/Express/Vite)
  verdant-app:
    image: verdant-app:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - MASTER_KEY=${passphrase}
      - NODE_ENV=production
    volumes:
      - ./data:/app/data

  # 2. Cloudflare Tunnel (Unified Egress)
  cf-tunnel:
    image: cloudflare/cloudflared:latest
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=\${CF_UNIFIED_TOKEN}
    restart: always
  `.trim();
};