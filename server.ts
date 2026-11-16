import express from 'express';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3').verbose();
import cors from 'cors';
import multer from 'multer';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createServer } from 'http';
import fetch from 'node-fetch';
import FormData from 'form-data';

import os from 'os';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { GoogleGenAI } from '@google/genai';
import argon2 from 'argon2';
import { validatePasswordNist, normalizeUnicode } from './services/nistPasswordValidator';
import { nistRateLimiter } from './services/nistRateLimiter';
import {
  generateTotpSecret,
  verifyTotpCode,
  generateOtpAuthUri,
  generateRecoveryCodes,
  hashRecoveryCode,
} from './services/totpService';

console.log('[CORE] Bootstrap sequence initiated');

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// --- GLOBAL ERROR HANDLERS ---
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CORE] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[CORE] Uncaught Exception:', err);
  process.exit(1);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const port = 3000;

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (e) {
    console.error('[CORE] Directory creation warning:', e);
  }
}

const dbPath = path.join(dataDir, 'verdant.db');
async function startApp() {
  try {
    console.log('[CORE] Starting Verdant Botanical Protocol...');
    await initializeDatabase();
    await initializeVaultKey();
    await setupMiddlewareAndStart();
    console.log('[CORE] System Fully Operational');
  } catch (e) {
    console.error('[CORE] Critical Startup Failure:', e);
    process.exit(1);
  }
}

// --- DATABASE CONNECTION & STARTUP ---

let currentVaultKey: string | null = null;

const query = (sql: string, params: any[] = []): Promise<any> => {
  return new Promise((resolve, reject) => {
    const callback = function (this: any, err: Error | null, rows: any[]) {
      if (err) reject(err);
      else resolve({ rows: rows || [], lastID: this?.lastID, changes: this?.changes });
    };
    if (sql.trim().toUpperCase().startsWith('SELECT')) db.all(sql, params, callback);
    else db.run(sql, params, callback);
  });
};

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const SALT = Buffer.from('verdant-botanical-protocol-v1');
const deriveKey = (passphrase: string) => crypto.pbkdf2Sync(passphrase, SALT, 100000, 32, 'sha256');

const decrypt = (base64Data: string) => {
  if (!currentVaultKey) throw new Error("VAULT_KEY_MISSING");
  const key = deriveKey(currentVaultKey);
  const combined = Buffer.from(base64Data, 'base64');
  if (combined.length < 28) throw new Error("INVALID_PAYLOAD_SIZE");
  const iv = combined.slice(0, 12);
  const authTag = combined.slice(combined.length - 16);
  const ciphertext = combined.slice(12, combined.length - 16);
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
};

const encrypt = (data: any) => {
  if (!currentVaultKey) throw new Error("VAULT_KEY_MISSING");
  const key = deriveKey(currentVaultKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const jsonStr = JSON.stringify(data);
  let ciphertext = cipher.update(jsonStr, 'utf8');
  ciphertext = Buffer.concat([ciphertext, cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, authTag]).toString('base64');
};

async function initializeVaultKey() {
  try {
    // 1. Check if a Master Key is provided in the environment
    const envKey = process.env.MASTER_KEY;
    
    const result = await query('SELECT encrypted_key FROM vault_key WHERE id = 1');
    
    if (result.rows.length === 0) {
      // Use env key if available, otherwise generate random
      const vaultKeyToUse = envKey || crypto.randomBytes(32).toString('hex');
      await query('INSERT INTO vault_key (id, encrypted_key) VALUES (1, ?)', [vaultKeyToUse]);
      currentVaultKey = vaultKeyToUse;
      console.log(`[SECURITY] Vault Protocol Initialized (${envKey ? 'Environment' : 'Generated'} Key)`);
    } else {
      // If we have an env key, we should update the DB to match it if they differ
      // This ensures the .env file remains the source of truth for the user
      const dbKey = result.rows[0].encrypted_key;
      if (envKey && envKey !== dbKey) {
        await query('UPDATE vault_key SET encrypted_key = ? WHERE id = 1', [envKey]);
        currentVaultKey = envKey;
        console.log('[SECURITY] Vault Protocol Re-synchronized with Environment Key');
      } else {
        currentVaultKey = dbKey;
        console.log('[SECURITY] Vault Protocol Synchronized from Database');
      }
    }
  } catch (e) { 
    console.error('[SECURITY] Vault Key Failure:', e);
    throw e;
  }
}

const logSystemEvent = async (event: string, details: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO') => {
  try {
    await query('INSERT INTO system_logs (event, details, level, created_at) VALUES (?, ?, ?, ?)', [event, details, level, new Date().toISOString()]);
  } catch (e) {
    console.error('[LOG FAULT]', e);
  }
};

const allowedCorsOrigins = [
  ...(process.env.WEBAUTHN_ORIGIN ? process.env.WEBAUTHN_ORIGIN.split(',').map(s => s.trim()) : []),
  ...(process.env.VITE_ALLOWED_HOSTS ? process.env.VITE_ALLOWED_HOSTS.split(',').map(h => `https://${h.trim()}`) : []),
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedCorsOrigins.length === 0 || allowedCorsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS_NOT_ALLOWED'));
  },
}));

const authRateBuckets = new Map<string, { count: number; resetAt: number }>();
app.use('/api/auth', (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const bucket = authRateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    authRateBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > 30) {
    return res.status(429).json({ error: 'TOO_MANY_REQUESTS' });
  }
  next();
});

app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: blob: https://*; " +
    "connect-src 'self' ws: wss: https://*;"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (process.env.STRICT_FRAME_OPTIONS === 'true') {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  }
  next();
});

app.use(express.json({ limit: '100mb' }));

// --- SESSION TOKEN, ARGON2ID & FIDO2 / WEBAUTHN HELPERS ---
const hashPassword = async (password: string): Promise<string> => {
  return argon2.hash(normalizeUnicode(password), {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MiB
    timeCost: 3,
    parallelism: 1,
  });
};

const verifyPassword = async (hash: string, password: string): Promise<boolean> => {
  try {
    return await argon2.verify(hash, normalizeUnicode(password));
  } catch {
    return false;
  }
};

let cachedFileSessionSecret: string | null = null;
const getSessionSecret = (): string => {
  if (currentVaultKey) return currentVaultKey;
  if (process.env.MASTER_KEY && process.env.MASTER_KEY.trim().length >= 16) {
    return process.env.MASTER_KEY.trim();
  }
  if (cachedFileSessionSecret) return cachedFileSessionSecret;

  const secretPath = path.join(dataDir, 'session_secret.meta');
  try {
    if (fs.existsSync(secretPath)) {
      const existing = fs.readFileSync(secretPath, 'utf8').trim();
      if (existing.length >= 32) {
        cachedFileSessionSecret = existing;
        return existing;
      }
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretPath, generated, { encoding: 'utf8', mode: 0o600 });
    cachedFileSessionSecret = generated;
    return generated;
  } catch {
    cachedFileSessionSecret = crypto.randomBytes(32).toString('hex');
    return cachedFileSessionSecret;
  }
};

const createSessionToken = (user: any): string => {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    houseId: user.houseId || null,
    iat: Date.now(),
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(data).digest('base64url');
  return `${data}.${sig}`;
};

const verifySessionToken = (token: string): any | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [data, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', getSessionSecret()).update(data).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
};

const parseUserRecord = (row: any) => {
  if (!row) return row;
  const user = { ...row };
  const hasPassword = Boolean(user.passwordHash);
  const totpEnabled = Boolean(user.totpEnabled && user.totpSecret);
  let recoveryCodesRemaining = 0;
  if (user.recoveryCodes) {
    try {
      const parsed = JSON.parse(user.recoveryCodes);
      if (Array.isArray(parsed)) recoveryCodesRemaining = parsed.length;
    } catch {}
  }
  delete user.passwordHash;
  delete user.totpSecret;
  delete user.recoveryCodes;
  user.hasPassword = hasPassword;
  user.totpEnabled = totpEnabled;
  user.recoveryCodesRemaining = recoveryCodesRemaining;
  if (user.name && typeof user.name === 'string' && (user.name.startsWith('{') || user.name.startsWith('['))) {
    try { user.name = JSON.parse(user.name); } catch (e) {}
  }
  return user;
};

const checkSeasonalAccess = (user: any): { ok: boolean; reason?: string } => {
  if (user.role !== 'SEASONAL') return { ok: true };
  const now = new Date();
  const start = user.caretakerStart ? new Date(user.caretakerStart) : null;
  const end = user.caretakerEnd ? new Date(user.caretakerEnd) : null;
  if (start) start.setHours(0, 0, 0, 0);
  if (end) end.setHours(23, 59, 59, 999);
  if ((start && now < start) || (end && now > end)) {
    return { ok: false, reason: 'ACCESS_EXPIRED' };
  }
  return { ok: true };
};

const getRpConfig = (req: express.Request) => {
  const forwardedHost = (req.headers['x-forwarded-host'] as string || '').split(',')[0].trim();
  const rawHost = forwardedHost || req.get('host') || 'localhost';
  const hostname = rawHost.split(':')[0];
  const proto = ((req.headers['x-forwarded-proto'] as string) || req.protocol || 'http').split(',')[0].trim();

  const rpID = (process.env.WEBAUTHN_RP_ID || hostname).trim();
  const rpName = (process.env.WEBAUTHN_RP_NAME || 'Verdant Botanical Systems').trim();
  const envOrigin = (process.env.WEBAUTHN_ORIGIN || '').trim();
  const expectedOrigin = envOrigin
    ? envOrigin.split(',').map(o => o.trim()).filter(Boolean)
    : [`${proto}://${rawHost}`];

  return { rpID, rpName, expectedOrigin };
};

// 1. HEALTH CHECK ENDPOINT
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

// PUBLIC AUTH STATUS (Argon2id + FIDO2)
app.get('/api/auth/webauthn/status', async (req, res) => {
  try {
    const usersCount = await query('SELECT COUNT(*) as count FROM users WHERE deletedAt IS NULL');
    const credsCount = await query('SELECT COUNT(*) as count FROM webauthn_credentials');
    const pwCount = await query("SELECT COUNT(*) as count FROM users WHERE deletedAt IS NULL AND passwordHash IS NOT NULL AND passwordHash != ''");
    const { rpID, rpName } = getRpConfig(req);
    res.json({
      hasUsers: (usersCount.rows[0]?.count || 0) > 0,
      hasCredentials: (credsCount.rows[0]?.count || 0) > 0,
      hasPasswords: (pwCount.rows[0]?.count || 0) > 0,
      rpID,
      rpName,
    });
  } catch (e) {
    res.status(500).json({ error: "AUTH_STATUS_FAULT" });
  }
});

// NIST SP 800-63B REAL-TIME PASSWORD VALIDATION ENDPOINT
app.post('/api/auth/password/validate', async (req, res) => {
  try {
    const { password, email, name } = req.body || {};
    const result = await validatePasswordNist(String(password || ''), { email, name });
    const { normalized: _n, ...safeResult } = result;
    res.json(safeResult);
  } catch (e) {
    res.status(500).json({ error: 'NIST_VALIDATION_FAULT' });
  }
});

// Note: Initial admin setup & password resets are performed on the Linux/Proxmox host
// via scripts/change-password.sh or ADMIN_EMAIL/ADMIN_PASSWORD in .env (no public setup).

// ARGON2ID PASSWORD LOGIN (With NIST progressive throttling, optional FIDO2, TOTP & Recovery Code 2FA)
app.post('/api/auth/password/login', async (req, res) => {
  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    const password = req.body?.password || '';
    const requireFido2 = Boolean(req.body?.requireFido2);
    const totpCode = (req.body?.totpCode || '').trim();
    const recoveryCode = (req.body?.recoveryCode || '').trim();
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    if (!email || !password) return res.status(400).json({ error: "CREDENTIALS_REQUIRED" });

    // NIST SP 800-63B Progressive Delay Throttler
    const throttle = nistRateLimiter.check(clientIp, email);
    if (throttle.throttled) {
      return res.status(429).json({
        error: "RATE_LIMITED",
        message: throttle.message,
        retryAfterMs: throttle.delayMs,
      });
    }

    const userRes = await query('SELECT * FROM users WHERE LOWER(email) = ? AND deletedAt IS NULL', [email]);
    if (userRes.rows.length === 0) {
      nistRateLimiter.recordFailure(clientIp, email);
      return res.status(401).json({ error: "INVALID_CREDENTIALS" });
    }

    const rawUser = userRes.rows[0];
    if (!rawUser.passwordHash) {
      return res.status(404).json({ error: "PASSWORD_NOT_SET" });
    }

    const valid = await verifyPassword(rawUser.passwordHash, password);
    if (!valid) {
      const failState = nistRateLimiter.recordFailure(clientIp, email);
      await logSystemEvent('ARGON2ID_LOGIN_FAILED', `Invalid password attempt #${failState.failedCount} for ${email}`, 'WARN');
      return res.status(401).json({ error: "INVALID_CREDENTIALS" });
    }

    const seasonalCheck = checkSeasonalAccess(rawUser);
    if (!seasonalCheck.ok) {
      return res.status(403).json({ error: seasonalCheck.reason });
    }

    const credsRes = await query('SELECT * FROM webauthn_credentials WHERE userId = ?', [rawUser.id]);
    const hasPasskeys = credsRes.rows.length > 0;
    const hasTotp = Boolean(rawUser.totpEnabled && rawUser.totpSecret);

    // If recovery code is supplied, verify and consume it
    if (recoveryCode) {
      let storedCodes: string[] = [];
      try { storedCodes = JSON.parse(rawUser.recoveryCodes || '[]'); } catch {}
      const hashedInput = hashRecoveryCode(recoveryCode);
      const matchIdx = storedCodes.findIndex((c) => c === hashedInput);
      if (matchIdx === -1) {
        nistRateLimiter.recordFailure(clientIp, email);
        return res.status(401).json({ error: "INVALID_RECOVERY_CODE" });
      }
      storedCodes.splice(matchIdx, 1);
      await query('UPDATE users SET recoveryCodes = ? WHERE id = ?', [JSON.stringify(storedCodes), rawUser.id]);
      rawUser.recoveryCodes = JSON.stringify(storedCodes);
      nistRateLimiter.recordSuccess(clientIp, email);
      const user = parseUserRecord(rawUser);
      const token = createSessionToken(user);
      await logSystemEvent('RECOVERY_CODE_LOGIN', `User ${user.email} authenticated with one-time recovery code`, 'WARN');
      return res.json({ verified: true, token, user, recoveryCodesRemaining: storedCodes.length });
    }

    // If FIDO2 2FA step is requested and user has passkeys, return WebAuthn challenge
    if (requireFido2 && hasPasskeys) {
      const { rpID } = getRpConfig(req);
      const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials: credsRes.rows.map((c: any) => ({
          id: c.id,
          transports: c.transports ? JSON.parse(c.transports) : undefined,
        })),
        userVerification: 'preferred',
      });
      const challengeId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      await query('DELETE FROM webauthn_challenges WHERE expiresAt < ?', [new Date().toISOString()]);
      await query(
        'INSERT INTO webauthn_challenges (id, challenge, userId, email, type, expiresAt) VALUES (?, ?, ?, ?, ?, ?)',
        [challengeId, options.challenge, rawUser.id, rawUser.email, 'authentication', expiresAt]
      );
      nistRateLimiter.recordSuccess(clientIp, email);
      return res.json({ mfaRequired: true, challengeId, options });
    }

    // If TOTP is enabled on this account, require 6-digit TOTP code
    if (hasTotp) {
      if (!totpCode) {
        return res.json({
          totpRequired: true,
          hasPasskeys,
          message: 'Enter your 6-digit authenticator code or a one-time recovery code.',
        });
      }
      if (!verifyTotpCode(rawUser.totpSecret, totpCode)) {
        nistRateLimiter.recordFailure(clientIp, email);
        return res.status(401).json({ error: "INVALID_TOTP_CODE" });
      }
    }

    nistRateLimiter.recordSuccess(clientIp, email);
    const user = parseUserRecord(rawUser);
    const token = createSessionToken(user);
    await logSystemEvent('ARGON2ID_LOGIN', `User ${user.email} authenticated via Argon2id`, 'INFO');
    res.json({ verified: true, token, user });
  } catch (e: any) {
    console.error('[ARGON2ID] Login error:', e);
    res.status(500).json({ error: "PASSWORD_LOGIN_FAULT" });
  }
});

// GLOBAL 2FA / FIDO2 SECURITY POLICY
app.get('/api/auth/policy', async (req, res) => {
  try {
    const policyRes = await query('SELECT require2faAllUsers FROM security_policy WHERE id = 1');
    const allUsersRequired = Boolean(policyRes.rows[0]?.require2faAllUsers);
    const usersRes = await query('SELECT id, totpEnabled, totpSecret FROM users WHERE deletedAt IS NULL');
    const credsRes = await query('SELECT DISTINCT userId FROM webauthn_credentials');
    const passkeyUsers = new Set(credsRes.rows.map((r: any) => r.userId));
    const totalUsers = usersRes.rows.length;
    const compliantUsers = usersRes.rows.filter(
      (u: any) => passkeyUsers.has(u.id) || Boolean(u.totpEnabled && u.totpSecret)
    ).length;
    res.json({
      allUsersRequired,
      totalUsers,
      compliantUsers,
      nonCompliantUsers: totalUsers - compliantUsers,
    });
  } catch (e) {
    res.status(500).json({ error: "POLICY_FAULT" });
  }
});

// FIDO2 REGISTRATION OPTIONS (Requires authenticated session — add passkey from Security settings)
app.post('/api/auth/webauthn/register/options', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const tokenStr = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const sessionUser = tokenStr ? verifySessionToken(tokenStr) : null;
    if (!sessionUser) {
      return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    }

    const userRes = await query('SELECT * FROM users WHERE id = ? AND deletedAt IS NULL', [sessionUser.id]);
    const user = userRes.rows[0] ? parseUserRecord(userRes.rows[0]) : null;
    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND" });
    }

    const seasonalCheck = checkSeasonalAccess(user);
    if (!seasonalCheck.ok) {
      return res.status(403).json({ error: seasonalCheck.reason });
    }

    const existingCredsRes = await query('SELECT * FROM webauthn_credentials WHERE userId = ?', [user.id]);
    const existingCreds = existingCredsRes.rows;

    const { rpID, rpName } = getRpConfig(req);
    const userNameStr = typeof user.name === 'object' ? (user.name?.en || user.email) : (user.name || user.email);

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: user.email,
      userID: new TextEncoder().encode(user.id),
      userDisplayName: userNameStr,
      attestationType: 'none',
      excludeCredentials: existingCreds.map((c: any) => ({
        id: c.id,
        transports: c.transports ? JSON.parse(c.transports) : undefined,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    const challengeId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await query('DELETE FROM webauthn_challenges WHERE expiresAt < ?', [new Date().toISOString()]);
    await query(
      'INSERT INTO webauthn_challenges (id, challenge, userId, email, type, expiresAt) VALUES (?, ?, ?, ?, ?, ?)',
      [challengeId, options.challenge, user.id, user.email, 'registration', expiresAt]
    );

    res.json({ options, challengeId });
  } catch (e: any) {
    console.error('[WEBAUTHN] Register options error:', e);
    res.status(500).json({ error: "WEBAUTHN_REGISTER_OPTIONS_FAULT" });
  }
});

// FIDO2 REGISTRATION VERIFY
app.post('/api/auth/webauthn/register/verify', async (req, res) => {
  try {
    const { challengeId, response, label } = req.body;
    if (!challengeId || !response) return res.status(400).json({ error: "INVALID_REQUEST" });

    const chalRes = await query('SELECT * FROM webauthn_challenges WHERE id = ? AND type = ?', [challengeId, 'registration']);
    if (chalRes.rows.length === 0) return res.status(400).json({ error: "CHALLENGE_NOT_FOUND" });

    const chalRow = chalRes.rows[0];
    await query('DELETE FROM webauthn_challenges WHERE id = ?', [challengeId]);

    if (new Date(chalRow.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({ error: "CHALLENGE_EXPIRED" });
    }

    const { rpID, expectedOrigin } = getRpConfig(req);
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: chalRow.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: "VERIFICATION_FAILED" });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    const publicKeyBase64 = Buffer.from(credential.publicKey).toString('base64');
    const transportsJson = JSON.stringify(credential.transports || response.response?.transports || []);
    const now = new Date().toISOString();

    await query(
      `INSERT OR REPLACE INTO webauthn_credentials (id, userId, publicKey, counter, transports, deviceType, backedUp, label, createdAt, lastUsedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        credential.id,
        chalRow.userId,
        publicKeyBase64,
        credential.counter,
        transportsJson,
        credentialDeviceType,
        credentialBackedUp ? 1 : 0,
        label || 'Passkey / Security Key',
        now,
        now,
      ]
    );

    const userRes = await query('SELECT * FROM users WHERE id = ? AND deletedAt IS NULL', [chalRow.userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "USER_NOT_FOUND" });
    const user = parseUserRecord(userRes.rows[0]);
    const token = createSessionToken(user);

    await logSystemEvent('WEBAUTHN_REGISTERED', `FIDO2 credential registered for ${user.email}`, 'INFO');
    res.json({ verified: true, token, user });
  } catch (e: any) {
    console.error('[WEBAUTHN] Register verify error:', e);
    res.status(400).json({ error: "WEBAUTHN_REGISTER_VERIFY_FAULT", details: e?.message });
  }
});

// FIDO2 LOGIN OPTIONS (Supports both discoverable passkeys & email-targeted login)
app.post('/api/auth/webauthn/login/options', async (req, res) => {
  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    const { rpID } = getRpConfig(req);

    let allowCredentials: any[] | undefined = undefined;
    let userId: string | null = null;

    if (email) {
      const userRes = await query('SELECT * FROM users WHERE LOWER(email) = ? AND deletedAt IS NULL', [email]);
      if (userRes.rows.length === 0) return res.status(404).json({ error: "USER_NOT_FOUND" });
      const user = parseUserRecord(userRes.rows[0]);

      const seasonalCheck = checkSeasonalAccess(user);
      if (!seasonalCheck.ok) {
        return res.status(403).json({ error: seasonalCheck.reason });
      }

      const credsRes = await query('SELECT * FROM webauthn_credentials WHERE userId = ?', [user.id]);
      if (credsRes.rows.length === 0) {
        return res.status(404).json({ error: "NO_PASSKEY_REGISTERED" });
      }
      userId = user.id;
      allowCredentials = credsRes.rows.map((c: any) => ({
        id: c.id,
        transports: c.transports ? JSON.parse(c.transports) : undefined,
      }));
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: 'preferred',
    });

    const challengeId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await query('DELETE FROM webauthn_challenges WHERE expiresAt < ?', [new Date().toISOString()]);
    await query(
      'INSERT INTO webauthn_challenges (id, challenge, userId, email, type, expiresAt) VALUES (?, ?, ?, ?, ?, ?)',
      [challengeId, options.challenge, userId, email || null, 'authentication', expiresAt]
    );

    res.json({ options, challengeId });
  } catch (e: any) {
    console.error('[WEBAUTHN] Login options error:', e);
    res.status(500).json({ error: "WEBAUTHN_LOGIN_OPTIONS_FAULT" });
  }
});

// FIDO2 LOGIN VERIFY
app.post('/api/auth/webauthn/login/verify', async (req, res) => {
  try {
    const { challengeId, response } = req.body;
    if (!challengeId || !response) return res.status(400).json({ error: "INVALID_REQUEST" });

    const chalRes = await query('SELECT * FROM webauthn_challenges WHERE id = ? AND type = ?', [challengeId, 'authentication']);
    if (chalRes.rows.length === 0) return res.status(400).json({ error: "CHALLENGE_NOT_FOUND" });

    const chalRow = chalRes.rows[0];
    await query('DELETE FROM webauthn_challenges WHERE id = ?', [challengeId]);

    if (new Date(chalRow.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({ error: "CHALLENGE_EXPIRED" });
    }

    const credRes = await query('SELECT * FROM webauthn_credentials WHERE id = ?', [response.id]);
    if (credRes.rows.length === 0) {
      return res.status(404).json({ error: "CREDENTIAL_NOT_FOUND" });
    }
    const storedCred = credRes.rows[0];

    if (chalRow.userId && storedCred.userId !== chalRow.userId) {
      return res.status(403).json({ error: "CREDENTIAL_USER_MISMATCH" });
    }

    const userRes = await query('SELECT * FROM users WHERE id = ? AND deletedAt IS NULL', [storedCred.userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "USER_NOT_FOUND" });
    const user = parseUserRecord(userRes.rows[0]);

    const seasonalCheck = checkSeasonalAccess(user);
    if (!seasonalCheck.ok) {
      return res.status(403).json({ error: seasonalCheck.reason });
    }

    const { rpID, expectedOrigin } = getRpConfig(req);
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: chalRow.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: storedCred.id,
        publicKey: new Uint8Array(Buffer.from(storedCred.publicKey, 'base64')),
        counter: storedCred.counter || 0,
        transports: storedCred.transports ? JSON.parse(storedCred.transports) : undefined,
      },
    });

    if (!verification.verified) {
      return res.status(401).json({ error: "VERIFICATION_FAILED" });
    }

    await query(
      'UPDATE webauthn_credentials SET counter = ?, lastUsedAt = ? WHERE id = ?',
      [verification.authenticationInfo.newCounter, new Date().toISOString(), storedCred.id]
    );

    const token = createSessionToken(user);
    await logSystemEvent('WEBAUTHN_LOGIN', `User ${user.email} authenticated via FIDO2`, 'INFO');
    res.json({ verified: true, token, user });
  } catch (e: any) {
    console.error('[WEBAUTHN] Login verify error:', e);
    res.status(401).json({ error: "WEBAUTHN_LOGIN_VERIFY_FAULT", details: e?.message });
  }
});

const checkAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.warn("[AUTH] Missing authorization header");
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  const verified = verifySessionToken(token);

  if (verified) {
    (req as any).userRole = typeof verified.role === 'string' ? verified.role.toUpperCase() : undefined;
    (req as any).userHouseId = verified.houseId;
    (req as any).userId = verified.id;
    (req as any).userEmail = verified.email;
    return next();
  }

  // Allow dev-token in development mode only
  if (process.env.NODE_ENV !== 'production' && token === 'dev-token') {
    const role = req.headers['x-user-role'];
    (req as any).userRole = typeof role === 'string' ? role.toUpperCase() : undefined;
    (req as any).userHouseId = req.headers['x-user-house-id'];
    (req as any).userId = req.headers['x-user-id'];
    (req as any).userEmail = req.headers['x-user-email'];
    return next();
  }

  console.warn("[AUTH] Invalid or expired session token");
  return res.status(401).json({ error: "UNAUTHORIZED" });
};

// AUTHENTICATED PASSKEY MANAGEMENT
app.get('/api/auth/webauthn/credentials', checkAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const result = await query(
      'SELECT id, label, deviceType, backedUp, createdAt, lastUsedAt FROM webauthn_credentials WHERE userId = ? ORDER BY createdAt DESC',
      [userId]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: "DB_FAULT" });
  }
});

app.delete('/api/auth/webauthn/credentials/:id', checkAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).userId;
    const role = (req as any).userRole;
    if (['OWNER', 'CO_CEO'].includes(role)) {
      await query('DELETE FROM webauthn_credentials WHERE id = ?', [id]);
    } else {
      await query('DELETE FROM webauthn_credentials WHERE id = ? AND userId = ?', [id, userId]);
    }
    res.json({ status: "ok" });
  } catch (e) {
    res.status(500).json({ error: "DB_FAULT" });
  }
});

app.post('/api/users/:id/reset-passkeys', checkAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const role = (req as any).userRole;
    const houseId = (req as any).userHouseId;

    if (!['OWNER', 'CO_CEO', 'LEAD_HAND'].includes(role)) {
      return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
    }

    if (role === 'LEAD_HAND') {
      const targetRes = await query('SELECT houseId, role FROM users WHERE id = ?', [id]);
      const target = targetRes.rows[0];
      if (!target || target.houseId !== houseId || !['GARDENER', 'SEASONAL'].includes(target.role)) {
        return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
      }
    }

    await query('DELETE FROM webauthn_credentials WHERE userId = ?', [id]);
    await logSystemEvent('WEBAUTHN_RESET', `Passkeys reset for user ${id} by ${(req as any).userId}`, 'WARN');
    res.json({ status: "ok" });
  } catch (e) {
    res.status(500).json({ error: "DB_FAULT" });
  }
});

// AUTHENTICATED PASSWORD SET / CHANGE (NIST SP 800-63B + Argon2id)
app.post('/api/auth/password/change', checkAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { currentPassword, newPassword } = req.body || {};

    const userRes = await query('SELECT * FROM users WHERE id = ? AND deletedAt IS NULL', [userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "USER_NOT_FOUND" });
    const rawUser = userRes.rows[0];

    if (rawUser.passwordHash) {
      if (!currentPassword) return res.status(400).json({ error: "CURRENT_PASSWORD_REQUIRED" });
      const valid = await verifyPassword(rawUser.passwordHash, String(currentPassword));
      if (!valid) return res.status(401).json({ error: "INVALID_CURRENT_PASSWORD" });
    }

    const nameStr = typeof rawUser.name === 'string' ? rawUser.name : '';
    const nist = await validatePasswordNist(String(newPassword || ''), {
      email: rawUser.email,
      name: nameStr,
    });
    if (!nist.isValid) {
      return res.status(400).json({
        error: nist.errors[0] || "PASSWORD_POLICY_VIOLATION",
        details: nist.errors,
        nist: { errors: nist.errors, warnings: nist.warnings, entropyBits: nist.entropyBits, isPwned: nist.isPwned },
      });
    }

    const pwHash = await hashPassword(nist.normalized);
    await query('UPDATE users SET passwordHash = ? WHERE id = ?', [pwHash, userId]);
    await logSystemEvent('ARGON2ID_PASSWORD_CHANGED', `Password updated for ${rawUser.email}`, 'INFO');
    res.json({ status: "ok", hasPassword: true });
  } catch (e) {
    console.error('[ARGON2ID] Password change error:', e);
    res.status(500).json({ error: "PASSWORD_CHANGE_FAULT" });
  }
});

// ADMIN PASSWORD RESET (Clears passwordHash so user can re-enroll)
app.post('/api/users/:id/reset-password', checkAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const role = (req as any).userRole;
    const houseId = (req as any).userHouseId;

    if (!['OWNER', 'CO_CEO', 'LEAD_HAND'].includes(role)) {
      return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
    }

    if (role === 'LEAD_HAND') {
      const targetRes = await query('SELECT houseId, role FROM users WHERE id = ?', [id]);
      const target = targetRes.rows[0];
      if (!target || target.houseId !== houseId || !['GARDENER', 'SEASONAL'].includes(target.role)) {
        return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
      }
    }

    await query('UPDATE users SET passwordHash = NULL WHERE id = ?', [id]);
    await logSystemEvent('PASSWORD_RESET', `Password cleared for user ${id} by ${(req as any).userId}`, 'WARN');
    res.json({ status: "ok" });
  } catch (e) {
    res.status(500).json({ error: "DB_FAULT" });
  }
});

// ADMIN: UPDATE GLOBAL 2FA / FIDO2 POLICY
app.post('/api/auth/policy', checkAuth, async (req, res) => {
  try {
    const role = (req as any).userRole;
    if (!['OWNER', 'CO_CEO'].includes(role)) {
      return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
    }
    const requireAll = req.body?.allUsersRequired ? 1 : 0;
    await query(
      'INSERT OR REPLACE INTO security_policy (id, require2faAllUsers, updatedAt) VALUES (1, ?, ?)',
      [requireAll, new Date().toISOString()]
    );
    await logSystemEvent('SECURITY_POLICY_UPDATED', `Global 2FA/FIDO2 requirement set to ${Boolean(requireAll)} by ${(req as any).userId}`, 'WARN');
    res.json({ status: "ok", allUsersRequired: Boolean(requireAll) });
  } catch (e) {
    res.status(500).json({ error: "POLICY_UPDATE_FAULT" });
  }
});

// TOTP (RFC 6238 AUTHENTICATOR APP) SETUP
app.post('/api/auth/totp/setup', checkAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const userRes = await query('SELECT email FROM users WHERE id = ? AND deletedAt IS NULL', [userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "USER_NOT_FOUND" });

    const secret = generateTotpSecret();
    const otpauthUri = generateOtpAuthUri(userRes.rows[0].email, 'Verdant', secret);
    await query('UPDATE users SET totpSecret = ?, totpEnabled = 0 WHERE id = ?', [secret, userId]);

    res.json({ secret, otpauthUri });
  } catch (e) {
    res.status(500).json({ error: "TOTP_SETUP_FAULT" });
  }
});

// TOTP VERIFY & ENABLE + GENERATE RECOVERY CODES
app.post('/api/auth/totp/verify', checkAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const code = String(req.body?.code || '').trim();
    const userRes = await query('SELECT email, totpSecret FROM users WHERE id = ? AND deletedAt IS NULL', [userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "USER_NOT_FOUND" });

    const secret = userRes.rows[0].totpSecret;
    if (!secret || !verifyTotpCode(secret, code)) {
      return res.status(400).json({ error: "INVALID_TOTP_CODE" });
    }

    const { plain, hashed } = generateRecoveryCodes(8);
    await query('UPDATE users SET totpEnabled = 1, recoveryCodes = ? WHERE id = ?', [JSON.stringify(hashed), userId]);
    await logSystemEvent('TOTP_ENABLED', `TOTP 2FA enabled for ${userRes.rows[0].email}`, 'INFO');
    res.json({ verified: true, totpEnabled: true, recoveryCodes: plain });
  } catch (e) {
    res.status(500).json({ error: "TOTP_VERIFY_FAULT" });
  }
});

// TOTP DISABLE
app.post('/api/auth/totp/disable', checkAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    await query('UPDATE users SET totpEnabled = 0, totpSecret = NULL WHERE id = ?', [userId]);
    await logSystemEvent('TOTP_DISABLED', `TOTP 2FA disabled for user ${userId}`, 'WARN');
    res.json({ status: "ok", totpEnabled: false });
  } catch (e) {
    res.status(500).json({ error: "TOTP_DISABLE_FAULT" });
  }
});

// REGENERATE ONE-TIME RECOVERY CODES
app.post('/api/auth/recovery/regenerate', checkAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { plain, hashed } = generateRecoveryCodes(8);
    await query('UPDATE users SET recoveryCodes = ? WHERE id = ?', [JSON.stringify(hashed), userId]);
    await logSystemEvent('RECOVERY_CODES_REGENERATED', `Recovery codes regenerated for user ${userId}`, 'INFO');
    res.json({ recoveryCodes: plain });
  } catch (e) {
    res.status(500).json({ error: "RECOVERY_FAULT" });
  }
});

const checkHouseAccess = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const role = (req as any).userRole;
  const houseId = (req as any).userHouseId;
  if (['OWNER', 'CO_CEO'].includes(role)) return next();
  const targetHouseId = req.params.houseId || req.body.houseId || req.query.houseId;
  if (targetHouseId && targetHouseId !== houseId) {
    return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
  }
  next();
};

app.use(async (req, res, next) => {
  const isEncrypted = req.headers['x-payload-encryption'] === 'AES-256-GCM';
  if (isEncrypted && req.body?.vault) {
    try {
      req.body = decrypt(req.body.vault);
      (req as any).wasEncrypted = true;
    }
    catch (e) { 
      console.error('[SECURITY] Decryption Protocol Fault:', e);
      return res.status(400).json({ error: "DECRYPTION_PROTOCOL_FAULT" }); 
    }
  }
  const originalJson = res.json;
  res.json = function (data) {
    const isVaultKeyPost = (req.path === '/api/system/vault-key' || req.url.startsWith('/api/system/vault-key')) && req.method === 'POST';
    if (isVaultKeyPost) return originalJson.call(this, data);
    if ((req as any).wasEncrypted && currentVaultKey) {
      try {
        const encrypted = encrypt(data);
        res.setHeader('X-Payload-Encryption', 'AES-256-GCM');
        return originalJson.call(this, { vault: encrypted, secure: true });
      } catch (e) { 
        console.error('[SECURITY] Encryption failed, falling back to plaintext:', e);
        return originalJson.call(this, data); 
      }
    }
    return originalJson.call(this, data);
  };
  next();
});

// 2. CORE API ROUTES
app.get('/api/system/config', checkAuth, (req, res) => {
  const role = (req as any).userRole;
  if (role === 'OWNER' || role === 'CO_CEO') {
    return res.json({ masterKey: currentVaultKey || process.env.MASTER_KEY || 'demo-key' });
  }
  res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
});

app.post('/api/system/vault-key', checkAuth, async (req, res) => {
  const role = (req as any).userRole;
  if (!['OWNER', 'CO_CEO'].includes(role)) {
    return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
  }
  try {
    const { key } = req.body;
    if (!key || key.length < 32) return res.status(400).json({ error: "INVALID_KEY_LENGTH" });
    await query('UPDATE vault_key SET encrypted_key = ? WHERE id = 1', [key]);
    currentVaultKey = key;
    await logSystemEvent('SECURITY_KEY_ROTATED', `Master key rotated by ${(req as any).userId || 'ADMIN'}`, 'WARN');
    res.json({ status: "ok" });
  } catch (e) {
    res.status(500).json({ error: "VAULT_FAULT" });
  }
});

app.get('/api/system/backup', checkAuth, async (req, res) => {
  const role = (req as any).userRole;
  if (!['OWNER', 'CO_CEO'].includes(role)) {
    return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
  }
  try {
    const plants = await query('SELECT * FROM plants');
    const houses = await query('SELECT * FROM houses');
    const tasks = await query('SELECT * FROM tasks');
    const inventory = await query('SELECT * FROM inventory');
    const users = await query('SELECT * FROM users');
    const logs = await query('SELECT * FROM system_logs');

    const safeParse = (data: any) => {
      if (!data) return {};
      try { return JSON.parse(data); }
      catch(e) { return {}; }
    };

    const backup = {
      plants: plants.rows.map((r: any) => ({ ...safeParse(r.data), id: r.id, houseId: r.houseId })),
      houses: houses.rows.map((r: any) => ({ ...safeParse(r.data), id: r.id })),
      tasks: tasks.rows.map((r: any) => ({ ...safeParse(r.data), id: r.id })),
      inventory: inventory.rows.map((r: any) => ({ ...safeParse(r.data), id: r.id })),
      users: users.rows.map((u: any) => {
        const safe = parseUserRecord(u);
        delete safe.personalAiKey;
        return safe;
      }),
      system_logs: logs.rows,
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };

    // Force encryption for backup if vault key is active
    if (currentVaultKey) {
      (req as any).wasEncrypted = true;
    }

    await logSystemEvent('DATABASE_BACKUP_DOWNLOADED', `System backup generated by ${(req as any).userId || 'ADMIN'}`, 'INFO');
    res.json(backup);
  } catch (e) {
    console.error("[ADMIN] Backup Fault:", e);
    res.status(500).json({ error: "BACKUP_FAULT", details: e instanceof Error ? e.message : String(e) });
  }
});

app.get('/api/system/logs', checkAuth, async (req, res) => {
  const role = (req as any).userRole;
  if (!['OWNER', 'CO_CEO'].includes(role)) {
    return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
  }
  try {
    const result = await query('SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 500');
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: "LOGS_FAULT" });
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
});

app.post('/api/system/track-usage', checkAuth, async (req, res) => {
  const { type, tokens } = req.body;
  const validTypes = ['gemini', 'plantnet', 'trefle', 'perenual', 'serper', 'opb'];
  if (!validTypes.includes(type)) return res.status(400).json({ error: "INVALID_TYPE" });

  const now = new Date();
  const monthId = `${now.getFullYear()}-${now.getMonth() + 1}`;
  const column = `${type}_count`;
  
  try {
    const result = await query('SELECT * FROM api_usage WHERE id = ?', [monthId]);
    if (result.rows.length === 0) {
      // Initialize all columns to 0
      await query(`INSERT INTO api_usage (id, gemini_count, gemini_tokens, plantnet_count, trefle_count, perenual_count, serper_count, opb_count, last_updated) VALUES (?, 0, 0, 0, 0, 0, 0, 0, ?)`, [monthId, now.toISOString()]);
    }
    
    let updateSql = `UPDATE api_usage SET ${column} = ${column} + 1, last_updated = ?`;
    let params = [now.toISOString(), monthId];
    
    if (type === 'gemini' && typeof tokens === 'number') {
      updateSql = `UPDATE api_usage SET ${column} = ${column} + 1, gemini_tokens = gemini_tokens + ?, last_updated = ? WHERE id = ?`;
      params = [tokens, now.toISOString(), monthId];
    } else {
      updateSql = `UPDATE api_usage SET ${column} = ${column} + 1, last_updated = ? WHERE id = ?`;
    }
    
    await query(updateSql, params);
    res.json({ status: "ok" });
  } catch (e) {
    res.status(500).json({ error: "USAGE_TRACK_FAULT" });
  }
});

// BOTANICAL PROXY CLUSTER
app.post('/api/proxy/identify', checkAuth, upload.array('images'), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    const formData = new FormData();
    files.forEach(file => {
      formData.append('images', file.buffer, { filename: file.originalname, contentType: file.mimetype });
    });
    const response = await fetch(`https://my-api.plantnet.org/v2/identify/all?api-key=${process.env.PLANTNET_API_KEY}`, {
      method: 'POST',
      body: formData
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "PLANTNET_PROXY_FAULT" });
  }
});

app.post('/api/proxy/opb/token', checkAuth, async (req, res) => {
  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', process.env.OPB_CLIENT_ID || '');
    params.append('client_secret', process.env.OPB_CLIENT_SECRET || '');
    
    const response = await fetch('https://openplantbook.io/api/v1/token/', {
      method: 'POST',
      body: params
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "OPB_TOKEN_PROXY_FAULT" });
  }
});

app.get('/api/proxy/trefle', checkAuth, async (req, res) => {
  try {
    const q = req.query.q;
    const response = await fetch(`https://trefle.io/api/v1/plants/search?token=${process.env.TREFLE_TOKEN}&q=${encodeURIComponent(q as string)}`);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "TREFLE_PROXY_FAULT" });
  }
});

app.post('/api/proxy/serper', checkAuth, async (req, res) => {
  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY || '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "SERPER_PROXY_FAULT" });
  }
});

app.get('/api/proxy/perenual', checkAuth, async (req, res) => {
  try {
    const { q, page } = req.query;
    const response = await fetch(`https://perenual.com/api/species-list?key=${process.env.PERENUAL_API_KEY}&q=${encodeURIComponent(q as string)}&page=${page || 1}`);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "PERENUAL_PROXY_FAULT" });
  }
});

app.post('/api/proxy/gemini', checkAuth, async (req, res) => {
  try {
    const { model, contents, config, personalApiKey } = req.body;
    const apiKey = (personalApiKey || process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
    if (!apiKey) {
      return res.status(400).json({ error: "GEMINI_API_KEY_MISSING" });
    }
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: model || 'gemini-2.5-flash',
      contents,
      config,
    });
    res.json({
      text: response.text,
      usageMetadata: response.usageMetadata,
    });
  } catch (e: any) {
    console.error('[GEMINI PROXY] Fault:', e?.message || e);
    res.status(500).json({ error: "GEMINI_PROXY_FAULT", details: e?.message });
  }
});

app.get('/api/system/usage', checkAuth, async (req, res) => {
  console.log(`[API] Fetching usage for user: ${(req as any).userId}`);
  const now = new Date();
  const monthId = `${now.getFullYear()}-${now.getMonth() + 1}`;
  
  // Calculate CPU Load (1 min average as percentage of total cores)
  const cpus = os.cpus();
  const loadAvg = os.loadavg()[0];
  let cpuUsage = Math.min(100, (loadAvg / cpus.length) * 100);
  
  // Add some jitter for "live" feel if load is very low
  if (cpuUsage < 5) {
    cpuUsage += Math.random() * 2.5;
  }
  const cpuUsageStr = cpuUsage.toFixed(1);

  try {
    const result = await query('SELECT * FROM api_usage WHERE id = ?', [monthId]);
    const logsResult = await query('SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 5');
    
    const usageData = result.rows[0] || { 
      id: monthId, 
      gemini_count: 0, 
      plantnet_count: 0, 
      trefle_count: 0, 
      perenual_count: 0,
      serper_count: 0,
      opb_count: 0
    };

    res.json({
      ...usageData,
      system_load: cpuUsageStr,
      recent_logs: logsResult.rows
    });
  } catch (e) {
    res.status(500).json({ error: "USAGE_FETCH_FAULT" });
  }
});

// SYSTEM RESTORE 
app.post('/api/system/restore', checkAuth, async (req, res) => {
  const role = (req as any).userRole;
  if (!['OWNER', 'CO_CEO'].includes(role)) {
    return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
  }
  
  try {
    let { data, backupKey } = req.body;
    if (!data) return res.status(400).json({ error: "MISSING_DATA" });

    let decoded: any;
    
    // 1. Handle Decryption if backupKey is provided
    if (backupKey) {
      console.log("[RESTORE] Decrypting backup with provided key...");
      try {
        const key = deriveKey(backupKey);
        const combined = Buffer.from(data, 'base64');
        if (combined.length < 28) throw new Error("INVALID_PAYLOAD_SIZE");
        const iv = combined.slice(0, 12);
        const authTag = combined.slice(combined.length - 16);
        const ciphertext = combined.slice(12, combined.length - 16);
        const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(ciphertext);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        decoded = JSON.parse(decrypted.toString('utf8'));
      } catch (err) {
        console.error("[RESTORE] Decryption failed:", err);
        return res.status(400).json({ error: "INVALID_BACKUP_KEY" });
      }
    } else {
      decoded = typeof data === 'string' ? JSON.parse(data) : data;
    }

    console.log("[RESTORE] Initiating system restore. Version:", decoded.version || 'unknown');

    // 2. Perform Restore in a Transaction
    try {
      await query('BEGIN TRANSACTION');
      
      console.log("[RESTORE] Clearing existing data...");
      await query('DELETE FROM plants');
      await query('DELETE FROM houses');
      await query('DELETE FROM tasks');
      await query('DELETE FROM inventory');
      await query('DELETE FROM users');
      await query('DELETE FROM webauthn_credentials');
      await query('DELETE FROM webauthn_challenges');
      await query('DELETE FROM system_logs');

      if (decoded.plants && Array.isArray(decoded.plants)) {
        console.log(`[RESTORE] Restoring ${decoded.plants.length} plants...`);
        for (const p of decoded.plants) {
          await query('INSERT OR REPLACE INTO plants (id, houseId, species, nickname, images, logs, lastWatered, updatedAt, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [p.id, p.houseId, p.species, JSON.stringify(p.nickname), JSON.stringify(p.images), JSON.stringify(p.logs), p.lastWatered, p.updatedAt, JSON.stringify(p)]);
        }
      }

      if (decoded.houses && Array.isArray(decoded.houses)) {
        console.log(`[RESTORE] Restoring ${decoded.houses.length} houses...`);
        for (const h of decoded.houses) {
          await query('INSERT OR REPLACE INTO houses (id, name, createdAt, data) VALUES (?, ?, ?, ?)',
            [h.id, JSON.stringify(h.name), h.createdAt, JSON.stringify(h)]);
        }
      }

      if (decoded.tasks && Array.isArray(decoded.tasks)) {
        console.log(`[RESTORE] Restoring ${decoded.tasks.length} tasks...`);
        for (const t of decoded.tasks) {
          await query('INSERT OR REPLACE INTO tasks (id, houseId, plantIds, type, title, description, date, completed, completedAt, recurrence, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [t.id, t.houseId, JSON.stringify(t.plantIds), t.type, JSON.stringify(t.title), JSON.stringify(t.description), t.date, t.completed ? 1 : 0, t.completedAt, JSON.stringify(t.recurrence), JSON.stringify(t)]);
        }
      }

      if (decoded.inventory && Array.isArray(decoded.inventory)) {
        console.log(`[RESTORE] Restoring ${decoded.inventory.length} inventory items...`);
        for (const i of decoded.inventory) {
          await query('INSERT OR REPLACE INTO inventory (id, houseId, name, data) VALUES (?, ?, ?, ?)',
            [i.id, i.houseId, JSON.stringify(i.name), JSON.stringify(i)]);
        }
      }

      if (decoded.users && Array.isArray(decoded.users)) {
        console.log(`[RESTORE] Restoring ${decoded.users.length} users...`);
        for (const u of decoded.users) {
          await query('INSERT OR REPLACE INTO users (id, email, name, role, houseId, personalAiKey, personalAiKeyTestedAt, deletedAt, caretakerStart, caretakerEnd) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [u.id, u.email, typeof u.name === 'object' ? JSON.stringify(u.name) : u.name, u.role, u.houseId, u.personalAiKey, u.personalAiKeyTestedAt, u.deletedAt, u.caretakerStart || null, u.caretakerEnd || null]);
        }
      }

      if (decoded.system_logs && Array.isArray(decoded.system_logs)) {
        console.log(`[RESTORE] Restoring ${decoded.system_logs.length} system logs...`);
        for (const l of decoded.system_logs) {
          await query('INSERT INTO system_logs (id, event, details, level, created_at) VALUES (?, ?, ?, ?, ?)',
            [l.id, l.event, l.details, l.level, l.created_at]);
        }
      }

      await query('COMMIT');
      await logSystemEvent('DATABASE_RESTORED', `System restored by ${(req as any).userId || 'ADMIN'}`, 'WARN');
      console.log("[RESTORE] System restore completed successfully");
      res.json({ status: "ok" });
    } catch (err) {
      await query('ROLLBACK');
      console.error("[RESTORE] Transaction failed:", err);
      res.status(500).json({ error: "RESTORE_FAULT", details: (err as Error).message });
    }
  } catch (e) { 
    console.error("[RESTORE] Critical failure:", e);
    res.status(500).json({ error: "RESTORE_FAULT" }); 
  }
});

const assertRecordHouseOwnership = async (
  table: 'plants' | 'tasks' | 'inventory',
  id: string,
  role: string,
  userHouseId: string
): Promise<{ allowed: boolean; status?: number; error?: string }> => {
  if (['OWNER', 'CO_CEO'].includes(role)) return { allowed: true };
  if (!id) return { allowed: false, status: 400, error: 'ID_REQUIRED' };
  const existing = await query(`SELECT houseId FROM ${table} WHERE id = ?`, [id]);
  if (existing.rows.length > 0 && existing.rows[0].houseId !== userHouseId) {
    return { allowed: false, status: 403, error: 'INSUFFICIENT_CLEARANCE' };
  }
  return { allowed: true };
};

// PLANTS
app.get('/api/plants', checkAuth, async (req, res) => {
  try {
    const role = (req as any).userRole;
    const houseId = (req as any).userHouseId;
    let sql = 'SELECT * FROM plants';
    let params: any[] = [];
    if (!['OWNER', 'CO_CEO'].includes(role)) {
      sql += ' WHERE houseId = ?';
      params.push(houseId);
    }
    const result = await query(sql, params);
    res.json(result.rows.map((r: any) => ({ ...JSON.parse(r.data), id: r.id, houseId: r.houseId })));
  } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.post('/api/plants', checkAuth, checkHouseAccess, async (req, res) => {
  try {
    const p = req.body;
    const ownership = await assertRecordHouseOwnership('plants', p.id, (req as any).userRole, (req as any).userHouseId);
    if (!ownership.allowed) return res.status(ownership.status || 403).json({ error: ownership.error });

    await query('INSERT OR REPLACE INTO plants (id, houseId, species, nickname, images, logs, lastWatered, updatedAt, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [p.id, p.houseId, p.species, JSON.stringify(p.nickname), JSON.stringify(p.images), JSON.stringify(p.logs), p.lastWatered, new Date().toISOString(), JSON.stringify(p)]);
    await logSystemEvent('PLANT_UPDATED', `Plant ${p.id} updated by ${(req as any).userId || 'ADMIN'}`, 'INFO');
    res.json({ status: "ok" });
  } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.delete('/api/plants/:id', checkAuth, async (req, res) => {
  try {
    const role = (req as any).userRole;
    if (!['OWNER', 'CO_CEO', 'LEAD_HAND'].includes(role)) {
      return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
    }
    const ownership = await assertRecordHouseOwnership('plants', req.params.id, role, (req as any).userHouseId);
    if (!ownership.allowed) return res.status(ownership.status || 403).json({ error: ownership.error });

    await query('DELETE FROM plants WHERE id = ?', [req.params.id]);
    await logSystemEvent('PLANT_DELETED', `Plant ${req.params.id} deleted by ${(req as any).userId || 'ADMIN'}`, 'WARN');
    res.json({ status: "ok" });
  } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

// HOUSES
app.get('/api/houses', checkAuth, async (req, res) => {
  try {
    const role = (req as any).userRole;
    const houseId = (req as any).userHouseId;
    let sql = 'SELECT * FROM houses';
    let params: any[] = [];
    if (!['OWNER', 'CO_CEO'].includes(role)) {
      if (!houseId) return res.json([]);
      sql += ' WHERE id = ?';
      params.push(houseId);
    }
    const result = await query(sql, params);
    res.json(result.rows.map((r: any) => ({ ...JSON.parse(r.data), id: r.id })));
  } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.post('/api/houses', checkAuth, async (req, res) => {
  try {
    const role = (req as any).userRole;
    const email = (req as any).userEmail;

    // SECURITY: Only OWNER and CO_CEO can create/update houses globally
    if (!['OWNER', 'CO_CEO'].includes(role)) {
      console.warn(`[API] Unauthorized house creation attempt by ${email} (Role: ${role})`);
      return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
    }

    const h = req.body;
    if (!h.id || !h.name) {
      return res.status(400).json({ error: "INVALID_HOUSE_DATA" });
    }

    await query('INSERT OR REPLACE INTO houses (id, name, createdAt, data) VALUES (?, ?, ?, ?)',
      [h.id, JSON.stringify(h.name), h.createdAt, JSON.stringify(h)]);
    
    await logSystemEvent('HOUSE_UPDATED', `House ${h.id} updated by ${email}`, 'INFO');
    res.json({ status: "ok" });
  } catch (e) { 
    console.error(`[API] House Creation Error:`, e);
    res.status(500).json({ error: "DB_FAULT" }); 
  }
});

// EXPLICIT DELETE ROUTE
app.delete('/api/houses/:id', checkAuth, async (req, res) => {
  try {
    const role = (req as any).userRole;
    if (!['OWNER', 'CO_CEO'].includes(role)) {
      return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
    }
    const { id } = req.params;
    await query('DELETE FROM houses WHERE id = ?', [id]);
    await logSystemEvent('HOUSE_DELETED', `House ${id} deleted by ${(req as any).userId || 'ADMIN'}`, 'WARN');
    res.json({ status: "ok" });
  } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

// TASKS
app.get('/api/tasks', checkAuth, async (req, res) => {
  try {
    const role = (req as any).userRole;
    const houseId = (req as any).userHouseId;
    let sql = 'SELECT * FROM tasks';
    let params: any[] = [];
    if (!['OWNER', 'CO_CEO'].includes(role)) {
      sql += ' WHERE houseId = ?';
      params.push(houseId);
    }
    const result = await query(sql, params);
    res.json(result.rows.map((r: any) => ({ ...JSON.parse(r.data), id: r.id })));
  } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.post('/api/tasks', checkAuth, checkHouseAccess, async (req, res) => {
  try {
    const t = req.body;
    const ownership = await assertRecordHouseOwnership('tasks', t.id, (req as any).userRole, (req as any).userHouseId);
    if (!ownership.allowed) return res.status(ownership.status || 403).json({ error: ownership.error });

    await query('INSERT OR REPLACE INTO tasks (id, houseId, plantIds, type, title, description, date, completed, completedAt, recurrence, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [t.id, t.houseId, JSON.stringify(t.plantIds), t.type, JSON.stringify(t.title), JSON.stringify(t.description), t.date, t.completed ? 1 : 0, t.completedAt, JSON.stringify(t.recurrence), JSON.stringify(t)]);
    await logSystemEvent('TASK_UPDATED', `Task ${t.id} updated by ${(req as any).userId || 'ADMIN'}`, 'INFO');
    res.json({ status: "ok" });
  } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.delete('/api/tasks/:id', checkAuth, async (req, res) => {
  try {
    const role = (req as any).userRole;
    if (role === 'SEASONAL') {
      return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
    }
    const ownership = await assertRecordHouseOwnership('tasks', req.params.id, role, (req as any).userHouseId);
    if (!ownership.allowed) return res.status(ownership.status || 403).json({ error: ownership.error });

    await query('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    await logSystemEvent('TASK_DELETED', `Task ${req.params.id} deleted by ${(req as any).userId || 'ADMIN'}`, 'WARN');
    res.json({ status: "ok" });
  } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

// INVENTORY
app.get('/api/inventory', checkAuth, async (req, res) => {
  try {
    const role = (req as any).userRole;
    const houseId = (req as any).userHouseId;
    let sql = 'SELECT * FROM inventory';
    let params: any[] = [];
    if (!['OWNER', 'CO_CEO'].includes(role)) {
      sql += ' WHERE houseId = ?';
      params.push(houseId);
    }
    const result = await query(sql, params);
    res.json(result.rows.map((r: any) => ({ ...JSON.parse(r.data), id: r.id })));
  } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.post('/api/inventory', checkAuth, checkHouseAccess, async (req, res) => {
  try {
    const i = req.body;
    const ownership = await assertRecordHouseOwnership('inventory', i.id, (req as any).userRole, (req as any).userHouseId);
    if (!ownership.allowed) return res.status(ownership.status || 403).json({ error: ownership.error });

    await query('INSERT OR REPLACE INTO inventory (id, houseId, name, data) VALUES (?, ?, ?, ?)',
      [i.id, i.houseId, JSON.stringify(i.name), JSON.stringify(i)]);
    await logSystemEvent('INVENTORY_UPDATED', `Inventory item ${i.id} updated by ${(req as any).userId || 'ADMIN'}`, 'INFO');
    res.json({ status: "ok" });
  } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.delete('/api/inventory', checkAuth, async (req, res) => {
  try {
    const id = req.query.id as string;
    if (!id) return res.status(400).json({ error: "ID_REQUIRED" });
    const role = (req as any).userRole;
    if (role === 'SEASONAL') {
      return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
    }
    const ownership = await assertRecordHouseOwnership('inventory', id, role, (req as any).userHouseId);
    if (!ownership.allowed) return res.status(ownership.status || 403).json({ error: ownership.error });

    await query('DELETE FROM inventory WHERE id = ?', [id]);
    await logSystemEvent('INVENTORY_DELETED', `Inventory item ${id} deleted by ${(req as any).userId || 'ADMIN'}`, 'WARN');
    res.json({ status: "ok" });
  } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.delete('/api/users/:id', checkAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const role = (req as any).userRole;
    
    // Only OWNER and CO_CEO can permanently delete users
    if (!['OWNER', 'CO_CEO'].includes(role)) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    await query('DELETE FROM webauthn_credentials WHERE userId = ?', [id]);
    await query('DELETE FROM users WHERE id = ?', [id]);
    await logSystemEvent('USER_DELETED', `User ${id} permanently deleted by ${(req as any).userId || 'ADMIN'}`, 'WARN');
    res.json({ status: "ok" });
  } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

// USERS
app.get('/api/users', checkAuth, async (req, res) => {
  try {
    const role = (req as any).userRole;
    const houseId = (req as any).userHouseId;
    let sql = 'SELECT users.*, (SELECT COUNT(*) FROM webauthn_credentials wc WHERE wc.userId = users.id) AS passkeyCount FROM users WHERE deletedAt IS NULL';
    let params: any[] = [];
    if (role === 'LEAD_HAND') {
      sql += ' AND houseId = ? AND role IN ("GARDENER", "SEASONAL")';
      params.push(houseId);
    } else if (!['OWNER', 'CO_CEO'].includes(role)) {
      sql += ' AND id = ?';
      params.push((req as any).userId || req.headers['x-user-id'] || '');
    }
    const result = await query(sql, params);
    res.json(result.rows.map((r: any) => parseUserRecord(r)));
  } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.post('/api/users', checkAuth, async (req, res) => {
  try {
    const callerRole = (req as any).userRole;
    const callerId = (req as any).userId;
    const callerHouseId = (req as any).userHouseId;
    const u = req.body;
    const email = u.email?.trim().toLowerCase();

    if (!u.id || !email) {
      return res.status(400).json({ error: "INVALID_USER_DATA" });
    }

    if (callerRole === 'OWNER') {
      // OWNER has full user management rights
    } else if (callerRole === 'CO_CEO') {
      // CO_CEO cannot create or modify OWNER accounts
      if (u.role === 'OWNER') return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
      const existing = await query('SELECT role FROM users WHERE id = ?', [u.id]);
      if (existing.rows[0]?.role === 'OWNER') return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
    } else if (callerRole === 'LEAD_HAND') {
      // LEAD_HAND can only manage GARDENER/SEASONAL within their own house
      if (!['GARDENER', 'SEASONAL'].includes(u.role) || u.houseId !== callerHouseId) {
        return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
      }
      const existing = await query('SELECT houseId, role FROM users WHERE id = ?', [u.id]);
      if (existing.rows[0] && (existing.rows[0].houseId !== callerHouseId || !['GARDENER', 'SEASONAL'].includes(existing.rows[0].role))) {
        return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
      }
    } else {
      // GARDENER / SEASONAL can only update their own personalAiKey fields
      if (u.id !== callerId) {
        return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
      }
      await query(
        'UPDATE users SET personalAiKey = ?, personalAiKeyTestedAt = ? WHERE id = ?',
        [u.personalAiKey ?? null, u.personalAiKeyTestedAt ?? null, callerId]
      );
      return res.json({ status: "ok" });
    }

    await query(
      `INSERT INTO users (id, email, name, role, houseId, personalAiKey, personalAiKeyTestedAt, deletedAt, caretakerStart, caretakerEnd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         email = excluded.email,
         name = excluded.name,
         role = excluded.role,
         houseId = excluded.houseId,
         personalAiKey = excluded.personalAiKey,
         personalAiKeyTestedAt = excluded.personalAiKeyTestedAt,
         deletedAt = excluded.deletedAt,
         caretakerStart = excluded.caretakerStart,
         caretakerEnd = excluded.caretakerEnd`,
      [u.id, email, typeof u.name === 'object' ? JSON.stringify(u.name) : u.name, u.role, u.houseId, u.personalAiKey, u.personalAiKeyTestedAt, u.deletedAt, u.caretakerStart, u.caretakerEnd]
    );
    await logSystemEvent('USER_UPDATED', `User ${u.id} updated by ${callerId || 'ADMIN'}`, 'INFO');
    res.json({ status: "ok" });
  } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.get('/env-config.js', async (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  
  res.send(`window._ENV_ = ${JSON.stringify({
    AUTH_MODE: 'ARGON2ID_FIDO2',
    ROOT_OWNER_EMAIL: (process.env.VITE_ROOT_OWNER_EMAIL || process.env.ROOT_OWNER_EMAIL || '').trim(),
  })};`);
});

// 3. STATIC SERVING & CATCH-ALL
async function setupMiddlewareAndStart() {
  const isProd = process.env.NODE_ENV === 'production';
  const distPath = path.join(__dirname, 'dist');

  if (!isProd) {
    const vite = await import('vite').then(m => m.createServer({ server: { middlewareMode: true } }));
    // Explicitly serve public folder BEFORE Vite middleware in dev
    app.use(express.static(path.join(__dirname, 'public')));
    app.use(vite.middlewares);
  } else {
    if (!fs.existsSync(distPath)) {
      console.warn('[CORE] Production build (dist/) not found. Static serving may fail.');
    }
    app.use(express.static(distPath));
    app.use(express.static(path.join(__dirname, 'public'))); // Fallback to public folder
    app.get('*all', (req, res) => {
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: "API_ENDPOINT_NOT_FOUND" });
      }
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Production build not found. Please run npm run build.');
      }
    });
  }

  return new Promise<void>((resolve, reject) => {
    server.listen(port, '0.0.0.0', () => {
      console.log(`[CORE] Verdant Active on 0.0.0.0:${port}`);
      resolve();
    }).on('error', (err) => {
      console.error('[CORE] Server Listen Error:', err);
      reject(err);
    });
  });
}

async function initializeDatabase() {
  console.log('[DB] Initializing Schema...');
  const tables = [
    `CREATE TABLE IF NOT EXISTS vault_key (id INTEGER PRIMARY KEY CHECK (id = 1), encrypted_key TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, role TEXT DEFAULT 'OWNER', houseId TEXT, personalAiKey TEXT, personalAiKeyTestedAt TEXT, deletedAt TEXT, caretakerStart TEXT, caretakerEnd TEXT, passwordHash TEXT, totpSecret TEXT, totpEnabled INTEGER DEFAULT 0, recoveryCodes TEXT)`,
    `CREATE TABLE IF NOT EXISTS security_policy (id INTEGER PRIMARY KEY CHECK (id = 1), require2faAllUsers INTEGER DEFAULT 0, updatedAt TEXT)`,
    `CREATE TABLE IF NOT EXISTS webauthn_credentials (id TEXT PRIMARY KEY, userId TEXT NOT NULL, publicKey TEXT NOT NULL, counter INTEGER DEFAULT 0, transports TEXT, deviceType TEXT, backedUp INTEGER DEFAULT 0, label TEXT, createdAt TEXT, lastUsedAt TEXT)`,
    `CREATE TABLE IF NOT EXISTS webauthn_challenges (id TEXT PRIMARY KEY, challenge TEXT NOT NULL, userId TEXT, email TEXT, type TEXT NOT NULL, expiresAt TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS plants (id TEXT PRIMARY KEY, houseId TEXT, species TEXT, nickname TEXT, images TEXT, logs TEXT, lastWatered TEXT, updatedAt TEXT, data TEXT)`,
    `CREATE TABLE IF NOT EXISTS houses (id TEXT PRIMARY KEY, name TEXT, createdAt TEXT, data TEXT)`,
    `CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, houseId TEXT, plantIds TEXT, type TEXT, title TEXT, description TEXT, date TEXT, completed INTEGER, completedAt TEXT, recurrence TEXT, data TEXT)`,
    `CREATE TABLE IF NOT EXISTS inventory (id TEXT PRIMARY KEY, houseId TEXT, name TEXT, data TEXT)`,
    `CREATE TABLE IF NOT EXISTS system_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT, details TEXT, level TEXT, created_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS api_usage (
      id TEXT PRIMARY KEY, 
      gemini_count INTEGER DEFAULT 0,
      gemini_tokens INTEGER DEFAULT 0,
      plantnet_count INTEGER DEFAULT 0,
      trefle_count INTEGER DEFAULT 0,
      perenual_count INTEGER DEFAULT 0,
      serper_count INTEGER DEFAULT 0,
      opb_count INTEGER DEFAULT 0,
      last_updated TEXT
    )`
  ];

  for (const sql of tables) {
    await query(sql);
  }

  // Migrations
  try { await query(`ALTER TABLE users ADD COLUMN caretakerStart TEXT`); } catch(e) {}
  try { await query(`ALTER TABLE users ADD COLUMN caretakerEnd TEXT`); } catch(e) {}
  try { await query(`ALTER TABLE users ADD COLUMN passwordHash TEXT`); } catch(e) {}
  try { await query(`ALTER TABLE users ADD COLUMN totpSecret TEXT`); } catch(e) {}
  try { await query(`ALTER TABLE users ADD COLUMN totpEnabled INTEGER DEFAULT 0`); } catch(e) {}
  try { await query(`ALTER TABLE users ADD COLUMN recoveryCodes TEXT`); } catch(e) {}
  try { await query(`ALTER TABLE api_usage ADD COLUMN gemini_tokens INTEGER DEFAULT 0`); } catch(e) {}

  // Seed initial OWNER from .env if no users exist yet (Proxmox / Docker preset)
  const existingUsers = await query('SELECT COUNT(*) as count FROM users WHERE deletedAt IS NULL');
  if ((existingUsers.rows[0]?.count || 0) === 0) {
    const seedEmail = (process.env.VERDANT_ADMIN_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const seedPw = process.env.VERDANT_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || '';
    const seedName = (process.env.VERDANT_ADMIN_NAME || process.env.ADMIN_NAME || 'System Owner').trim();
    if (seedEmail && seedPw.length >= 8) {
      const pwHash = await hashPassword(seedPw);
      await query(
        'INSERT INTO users (id, email, name, role, houseId, passwordHash) VALUES (?, ?, ?, ?, ?, ?)',
        [`u-${crypto.randomUUID()}`, seedEmail, seedName, 'OWNER', null, pwHash]
      );
      console.log(`[AUTH] Pre-seeded OWNER account from environment: ${seedEmail}`);
    }
  }

  console.log('[DB] Schema Synchronized');
}

// --- DATABASE CONNECTION & STARTUP ---
console.log('[DB] Connecting to SQLite at:', dbPath);
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('[DB ERROR] Failed to connect to SQLite:', err.message);
    process.exit(1);
  }
  console.log('[DB] Connected to SQLite successfully');
  startApp();
});
