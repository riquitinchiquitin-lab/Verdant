# 🛡️ Verdant Security Protocol

Verdant is built with a "Zero-Knowledge" philosophy regarding your botanical data. This document outlines the multi-layered security architecture that protects your collection.

---

## 🔐 1. Neural Encryption Protocol (AES-256-GCM)

Verdant implements **Payload-Level Encryption** using the AES-256-GCM standard. This ensures that your data is encrypted *before* it leaves your browser and remains encrypted while stored in the database.

### How it Works:
1. **Client-Side Encryption**: When you save a plant, house, or task, the data is encrypted in your browser using your unique `MASTER_KEY`.
2. **Secure Transport**: The encrypted payload (ciphertext) is sent over an HTTPS (TLS 1.3) connection to your server.
3. **Database Privacy**: The server stores the encrypted "vault" in the database. Even if the database file is compromised, your plant nicknames, species, logs, and notes remain unreadable without the key.
4. **Automatic Decryption**: When you view your data, the server (or client) decrypts the vault using the synchronized key, presenting it back to you seamlessly.

---

## 🔑 2. Master Key Management

The `MASTER_KEY` is the heart of your system's security.

- **Entropy**: It is a high-entropy, 50-character string generated using cryptographically secure random number generators (`window.crypto`).
- **Rotation**: Admins can rotate the Master Key at any time from the **Admin > Security** panel.
- **Export**: It is **CRITICAL** that you export your Master Key and store it in a secure location (like a password manager). If you lose this key and the server's vault is cleared, your data cannot be recovered.

---

## 💾 3. Backup & Data Integrity

### Is my backup file encrypted?
**Yes.** If you have a Master Key active, your system backups are doubly protected:
1. **Data Encryption**: The individual records within the backup (plants, logs, etc.) are already stored as ciphertext.
2. **Vault Wrapping**: The entire backup file is wrapped in an encrypted "Vault" payload during the download process.

### Restoring Data:
- To restore a backup, you must provide the same `MASTER_KEY` that was active when the backup was created.
- For `.enc` files (manually encrypted backups), the system will prompt for a **32-character Backup Key** to verify the integrity of the archive before processing.

---

## 🌐 4. Network Security

### Cloudflare Tunnel (Mandatory)
Verdant is designed to operate behind a **Cloudflare Tunnel**. This provides several security benefits:
- **No Open Ports**: Your server does not need any inbound ports open to the internet.
- **DDoS Protection**: Cloudflare's global network absorbs attacks before they reach your instance.
- **WAF (Web Application Firewall)**: Protects against common web vulnerabilities (SQLi, XSS).

### Content Security Policy (CSP)
The system enforces a strict CSP to prevent unauthorized script execution and data exfiltration:
- `default-src 'self'`
- `img-src 'self' data: blob: https://*` (Allows botanical images from trusted sources)
- `connect-src 'self' wss: https://*` (Restricts API communication)

---

## 🛡️ 5. Access Control (RBAC)

Verdant uses a strict **Role-Based Access Control** system:
- **OWNER**: Full system control, including security and personnel management.
- **CO_CEO**: High-level management, excluding system-destructive actions.
- **LEAD_HAND**: Property-specific management and staff oversight.
- **GARDENER**: Daily care operations and logging.
- **SEASONAL**: Limited access for temporary staff.

---

## 🚨 Reporting Vulnerabilities

If you discover a security vulnerability, please do not open a public issue. Instead, contact the maintainer directly at the email specified in your `VITE_ROOT_OWNER_EMAIL` configuration.

---
*Verdant: Precision Care. Military-Grade Privacy.*
