import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import cors from 'cors';
import multer from 'multer';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createServer } from 'http';

import os from 'os';
import dns from 'dns/promises';
import net from 'net';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { GoogleGenAI } from '@google/genai';
import argon2 from 'argon2';
import { validatePasswordNist, normalizeUnicode } from './services/nistPasswordValidator';
import { createAggregatorRouter } from './aggregator/api/router';
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
app.disable('x-powered-by');
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
    await hydrateApiKeysFromVault();
    await setupMiddlewareAndStart();
    console.log('[CORE] System Fully Operational');
  } catch (e) {
    console.error('[CORE] Critical Startup Failure:', e);
    process.exit(1);
  }
}

// --- DATABASE CONNECTION & STARTUP ---

let currentVaultKey: string | null = null;

let db: DatabaseSync;

const query = async (sql: string, params: any[] = []): Promise<any> => {
  const safeParams = params.map((p) => (p === undefined ? null : p));
  const stmt = db.prepare(sql);
  if (sql.trim().toUpperCase().startsWith('SELECT')) {
    const rows = stmt.all(...safeParams);
    return { rows: rows || [], lastID: undefined, changes: 0 };
  }
  const info = stmt.run(...safeParams);
  return { rows: [], lastID: Number(info.lastInsertRowid), changes: Number(info.changes) };
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

app.use(cors((req, callback) => {
  const origin = req.headers.origin;
  if (!origin) {
    return callback(null, { origin: true });
  }
  if (allowedCorsOrigins.includes(origin)) {
    return callback(null, { origin: true });
  }
  if (allowedCorsOrigins.length === 0) {
    const forwardedHost = (req.headers['x-forwarded-host'] as string || '').split(',')[0].trim();
    const host = forwardedHost || req.headers.host || '';
    const proto = ((req.headers['x-forwarded-proto'] as string) || req.protocol || 'http').split(',')[0].trim();
    if (host && (origin === `${proto}://${host}` || origin === `https://${host}` || origin === `http://${host}`)) {
      return callback(null, { origin: true });
    }
    if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
      return callback(null, { origin: true });
    }
  }
  return callback(new Error('CORS_NOT_ALLOWED'), { origin: false });
}));

const authRateBuckets = new Map<string, { count: number; resetAt: number }>();
const AUTH_RATE_MAX_BUCKETS = 10000;
app.use('/api/auth', (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  if (authRateBuckets.size >= AUTH_RATE_MAX_BUCKETS) {
    for (const [k, b] of authRateBuckets.entries()) {
      if (now > b.resetAt) authRateBuckets.delete(k);
    }
    if (authRateBuckets.size >= AUTH_RATE_MAX_BUCKETS) {
      const firstKey = authRateBuckets.keys().next().value;
      if (firstKey) authRateBuckets.delete(firstKey);
    }
  }
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
  const isProd = process.env.NODE_ENV === 'production';
  const scriptSrc = isProd
    ? "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; ";
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    scriptSrc +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: blob: https://*; " +
    "connect-src 'self' ws: wss: https://*; " +
    "frame-ancestors 'self';"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(self)');
  if (process.env.ALLOW_IFRAME !== 'true') {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  }
  next();
});

app.use(express.json({ limit: '100mb' }));

// Global AES-256-GCM Payload Decryption / Encryption Middleware (Must run immediately after express.json)
app.use(async (req, res, next) => {
  const isEncrypted = req.headers['x-payload-encryption'] === 'AES-256-GCM';
  if (isEncrypted && req.body?.vault) {
    try {
      req.body = decrypt(req.body.vault);
      (req as any).wasEncrypted = true;
    } catch (e) {
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
        console.error('[SECURITY] Encryption failed (failing closed):', e);
        res.status(500);
        return originalJson.call(this, { error: 'ENCRYPTION_PROTOCOL_FAULT' });
      }
    }
    return originalJson.call(this, data);
  };
  next();
});

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
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 32) {
    return process.env.SESSION_SECRET.trim();
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
    const sigBuf = Buffer.from(sig);
    const expectedSigBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedSigBuf.length || !crypto.timingSafeEqual(sigBuf, expectedSigBuf)) return null;
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

const checkAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.warn("[AUTH] Missing authorization header");
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  const verified = verifySessionToken(token);

  if (verified) {
    try {
      const userRes = await query(
        'SELECT id, email, role, houseId, deletedAt, caretakerStart, caretakerEnd FROM users WHERE id = ?',
        [verified.id]
      );
      const dbUser = userRes.rows[0];
      if (!dbUser || dbUser.deletedAt) {
        return res.status(401).json({ error: "UNAUTHORIZED" });
      }
      const seasonalCheck = checkSeasonalAccess(dbUser);
      if (!seasonalCheck.ok) {
        return res.status(403).json({ error: seasonalCheck.reason || "ACCESS_EXPIRED" });
      }
      (req as any).userRole = typeof dbUser.role === 'string' ? dbUser.role.toUpperCase() : undefined;
      (req as any).userHouseId = dbUser.houseId;
      (req as any).userId = dbUser.id;
      (req as any).userEmail = dbUser.email;
      return next();
    } catch (e) {
      console.error("[AUTH] DB revalidation error:", e);
      return res.status(500).json({ error: "AUTH_FAULT" });
    }
  }

  // Allow dev-token only when explicitly in non-production development mode
  if (process.env.NODE_ENV !== 'production' && (process.env.NODE_ENV === 'development' || process.env.ENABLE_DEV_AUTH === 'true') && token === 'dev-token') {
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

    // Enforce FIDO2 2FA when requested or when global 2FA policy is active and user has passkeys (and no TOTP)
    const policyRes = await query('SELECT require2faAllUsers FROM security_policy WHERE id = 1');
    const global2faRequired = Boolean(policyRes.rows[0]?.require2faAllUsers);
    const mustChallengeFido2 = (requireFido2 || (global2faRequired && !hasTotp)) && hasPasskeys;

    if (mustChallengeFido2) {
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
app.get('/api/auth/policy', checkAuth, async (req, res) => {
  try {
    const callerRole = (req as any).userRole;
    const policyRes = await query('SELECT require2faAllUsers FROM security_policy WHERE id = 1');
    const allUsersRequired = Boolean(policyRes.rows[0]?.require2faAllUsers);
    const usersRes = await query('SELECT id, name, email, totpEnabled, totpSecret FROM users WHERE deletedAt IS NULL');
    const credsRes = await query('SELECT DISTINCT userId FROM webauthn_credentials');
    const passkeyUsers = new Set(credsRes.rows.map((r: any) => r.userId));
    const totalUsers = usersRes.rows.length;
    const userCompliance = usersRes.rows.map((u: any) => {
      let displayName = u.email || u.id;
      try {
        const parsedName = typeof u.name === 'string' && u.name.startsWith('{') ? JSON.parse(u.name) : u.name;
        if (parsedName && typeof parsedName === 'object') {
          displayName = parsedName.en || parsedName.fr || Object.values(parsedName)[0] || displayName;
        } else if (parsedName) {
          displayName = String(parsedName);
        }
      } catch {
        displayName = u.name || displayName;
      }
      return {
        id: u.id,
        name: displayName,
        compliant: passkeyUsers.has(u.id) || Boolean(u.totpEnabled && u.totpSecret),
      };
    });
    const compliantUsers = userCompliance.filter((u: any) => u.compliant).length;
    const isAdmin = ['OWNER', 'CO_CEO'].includes(callerRole);
    res.json({
      allUsersRequired,
      totalUsers,
      compliantUsers,
      nonCompliantUsers: totalUsers - compliantUsers,
      ...(isAdmin ? { userCompliance } : {}),
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
app.post('/api/auth/webauthn/register/verify', checkAuth, async (req, res) => {
  try {
    const { challengeId, response, label } = req.body;
    if (!challengeId || !response) return res.status(400).json({ error: "INVALID_REQUEST" });

    const chalRes = await query('SELECT * FROM webauthn_challenges WHERE id = ? AND type = ?', [challengeId, 'registration']);
    if (chalRes.rows.length === 0) return res.status(400).json({ error: "CHALLENGE_NOT_FOUND" });

    const chalRow = chalRes.rows[0];
    if (chalRow.userId !== (req as any).userId) {
      return res.status(403).json({ error: "CHALLENGE_USER_MISMATCH" });
    }
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
      if (role === 'CO_CEO') {
        const credRes = await query(
          'SELECT u.role FROM webauthn_credentials wc JOIN users u ON wc.userId = u.id WHERE wc.id = ?',
          [id]
        );
        if (credRes.rows[0]?.role === 'OWNER') {
          return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
        }
      }
      await query('DELETE FROM webauthn_credentials WHERE id = ?', [id]);
    } else {
      await query('DELETE FROM webauthn_credentials WHERE id = ? AND userId = ?', [id, userId]);
    }
    res.json({ status: "ok" });
  } catch (e) {
    res.status(500).json({ error: "DB_FAULT" });
  }
});

app.post('/api/auth/webauthn/credentials/revoke-all', checkAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    await query('DELETE FROM webauthn_credentials WHERE userId = ?', [userId]);
    await logSystemEvent('PASSKEYS_REVOKED_ALL', `All passkeys revoked by user ${userId}`, 'WARN');
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ error: 'CREDENTIAL_REVOKE_FAULT' });
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

    const targetRes = await query('SELECT houseId, role FROM users WHERE id = ?', [id]);
    const target = targetRes.rows[0];
    if (!target) return res.status(404).json({ error: "USER_NOT_FOUND" });

    if (role === 'CO_CEO' && target.role === 'OWNER') {
      return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
    }

    if (role === 'LEAD_HAND') {
      if (target.houseId !== houseId || !['GARDENER', 'SEASONAL'].includes(target.role)) {
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

    const targetRes = await query('SELECT houseId, role FROM users WHERE id = ?', [id]);
    const target = targetRes.rows[0];
    if (!target) return res.status(404).json({ error: "USER_NOT_FOUND" });

    if (role === 'CO_CEO' && target.role === 'OWNER') {
      return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
    }

    if (role === 'LEAD_HAND') {
      if (target.houseId !== houseId || !['GARDENER', 'SEASONAL'].includes(target.role)) {
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

// ADMIN PASSWORD SET / UPDATE (Hashes with Argon2id and enforces NIST SP 800-63B)
app.post('/api/users/:id/set-password', checkAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body || {};
    const role = (req as any).userRole;
    const houseId = (req as any).userHouseId;

    if (!['OWNER', 'CO_CEO', 'LEAD_HAND'].includes(role)) {
      return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
    }

    const targetRes = await query('SELECT id, email, name, houseId, role FROM users WHERE id = ? AND deletedAt IS NULL', [id]);
    const target = targetRes.rows[0];
    if (!target) return res.status(404).json({ error: "USER_NOT_FOUND" });

    if (role === 'CO_CEO' && target.role === 'OWNER') {
      return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
    }

    if (role === 'LEAD_HAND') {
      if (target.houseId !== houseId || !['GARDENER', 'SEASONAL'].includes(target.role)) {
        return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
      }
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long." });
    }

    const nameStr = typeof target.name === 'string' ? target.name : '';
    const nist = await validatePasswordNist(String(newPassword), {
      email: target.email,
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
    await query('UPDATE users SET passwordHash = ? WHERE id = ?', [pwHash, id]);
    await logSystemEvent('ADMIN_PASSWORD_SET', `Password updated for user ${target.email} by ${(req as any).userId}`, 'WARN');
    res.json({ status: "ok", hasPassword: true });
  } catch (e) {
    console.error('[ARGON2ID] Admin set-password error:', e);
    res.status(500).json({ error: "PASSWORD_SET_FAULT" });
  }
});

// ============================================================================
// ONE-TIME SMS ONBOARDING INVITE ENGINE (NIST Password + TOTP 2FA + Passkey)
// ============================================================================
interface OnboardingInviteRecord {
  userId: string;
  userEmail: string;
  userName: string;
  role: string;
  createdAt: number;
  expiresAt: number;
  passwordSet: boolean;
}

const onboardingInvites = new Map<string, OnboardingInviteRecord>();

// Periodic sweep for expired invite links
setInterval(() => {
  const now = Date.now();
  for (const [token, rec] of onboardingInvites.entries()) {
    if (now >= rec.expiresAt) {
      onboardingInvites.delete(token);
    }
  }
}, 5 * 60 * 1000).unref();

// Admin: Create an SMS Invite Link for a User
app.post('/api/users/:id/create-invite', checkAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { ttlHours = 48 } = req.body || {};
    const role = (req as any).userRole;
    const houseId = (req as any).userHouseId;

    if (!['OWNER', 'CO_CEO', 'LEAD_HAND'].includes(role)) {
      return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
    }

    const targetRes = await query('SELECT id, email, name, houseId, role FROM users WHERE id = ? AND deletedAt IS NULL', [id]);
    const target = targetRes.rows[0];
    if (!target) return res.status(404).json({ error: "USER_NOT_FOUND" });

    if (role === 'CO_CEO' && target.role === 'OWNER') {
      return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
    }

    if (role === 'LEAD_HAND') {
      if (target.houseId !== houseId || !['GARDENER', 'SEASONAL'].includes(target.role)) {
        return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
      }
    }

    // Revoke any previous pending invites for this user
    for (const [tok, rec] of onboardingInvites.entries()) {
      if (rec.userId === id) onboardingInvites.delete(tok);
    }

    const inviteToken = crypto.randomBytes(24).toString('hex');
    const safeHours = Math.min(Math.max(Number(ttlHours) || 48, 1), 168);
    const expiresAt = Date.now() + safeHours * 3600 * 1000;

    let nameStr = target.email;
    if (typeof target.name === 'string') {
      try {
        const parsed = JSON.parse(target.name);
        nameStr = parsed?.en || Object.values(parsed || {})[0] || target.name;
      } catch {
        nameStr = target.name;
      }
    }

    onboardingInvites.set(inviteToken, {
      userId: target.id,
      userEmail: target.email,
      userName: String(nameStr || target.email),
      role: target.role,
      createdAt: Date.now(),
      expiresAt,
      passwordSet: false,
    });

    const forwardedProto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim();
    const proto = forwardedProto || req.protocol || 'https';
    const hostHeader = req.get('host') || `localhost:${port}`;
    const baseUrl = (process.env.APP_URL || `${proto}://${hostHeader}`).replace(/\/+$/, '');
    const inviteUrl = `${baseUrl}/#/invite/${inviteToken}`;

    await logSystemEvent('SMS_INVITE_CREATED', `SMS onboarding invite created for ${target.email} by ${(req as any).userId}`, 'INFO');

    res.json({
      status: 'ok',
      inviteToken,
      inviteUrl,
      userEmail: target.email,
      userName: String(nameStr || target.email),
      expiresAt: new Date(expiresAt).toISOString(),
    });
  } catch (e: any) {
    console.error('[INVITE] Create fault:', e);
    res.status(500).json({ error: 'INVITE_CREATE_FAULT' });
  }
});

// Public: Verify Invite Token (Does NOT burn the token so SMS link previews in iMessage/WhatsApp/Android Messages are safe)
app.get('/api/auth/invite/:token', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const { token } = req.params;
  const rec = onboardingInvites.get(token);

  if (!rec || Date.now() >= rec.expiresAt) {
    if (rec) onboardingInvites.delete(token);
    return res.status(410).json({ error: 'INVITE_EXPIRED_OR_USED' });
  }

  const userRes = await query(
    'SELECT id, email, name, role, houseId, totpEnabled, (SELECT COUNT(*) FROM webauthn_credentials wc WHERE wc.userId = users.id) AS passkeyCount FROM users WHERE id = ? AND deletedAt IS NULL',
    [rec.userId]
  );
  if (userRes.rows.length === 0) {
    onboardingInvites.delete(token);
    return res.status(404).json({ error: 'USER_NOT_FOUND' });
  }

  const u = parseUserRecord(userRes.rows[0]);
  res.json({
    valid: true,
    email: u.email,
    name: rec.userName,
    role: u.role,
    totpEnabled: Boolean(u.totpEnabled),
    passkeyCount: Number(u.passkeyCount || 0),
    expiresAt: new Date(rec.expiresAt).toISOString(),
  });
});

// Public: Set Password with NIST SP 800-63B verification & authenticate session for 2FA + Passkey enrollment
app.post('/api/auth/invite/:token/set-password', async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body || {};
    const rec = onboardingInvites.get(token);

    if (!rec || Date.now() >= rec.expiresAt) {
      if (rec) onboardingInvites.delete(token);
      return res.status(410).json({ error: 'INVITE_EXPIRED_OR_USED' });
    }

    const userRes = await query(
      'SELECT users.*, (SELECT COUNT(*) FROM webauthn_credentials wc WHERE wc.userId = users.id) AS passkeyCount FROM users WHERE id = ? AND deletedAt IS NULL',
      [rec.userId]
    );
    if (userRes.rows.length === 0) {
      onboardingInvites.delete(token);
      return res.status(404).json({ error: 'USER_NOT_FOUND' });
    }

    const rawUser = userRes.rows[0];
    const nist = await validatePasswordNist(String(newPassword || ''), {
      email: rawUser.email,
      name: rec.userName,
    });

    if (!nist.isValid) {
      return res.status(400).json({
        error: nist.errors[0] || 'PASSWORD_POLICY_VIOLATION',
        details: nist.errors,
        nist: {
          errors: nist.errors,
          warnings: nist.warnings,
          entropyBits: nist.entropyBits,
          isPwned: nist.isPwned,
        },
      });
    }

    const pwHash = await hashPassword(nist.normalized);
    await query('UPDATE users SET passwordHash = ? WHERE id = ?', [pwHash, rawUser.id]);

    // Consume the one-time invite token now that the password has been set
    onboardingInvites.delete(token);

    const parsedUser = parseUserRecord({ ...rawUser, passwordHash: pwHash });
    const sessionToken = createSessionToken(parsedUser);

    await logSystemEvent('INVITE_ONBOARDING_PASSWORD_SET', `User ${rawUser.email} completed NIST password onboarding via invite link`, 'INFO');

    res.json({
      status: 'ok',
      token: sessionToken,
      user: parsedUser,
    });
  } catch (e: any) {
    console.error('[INVITE] Set password fault:', e);
    res.status(500).json({ error: 'INVITE_PASSWORD_FAULT' });
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
    await query('UPDATE users SET totpEnabled = 0, totpSecret = NULL, recoveryCodes = NULL WHERE id = ?', [userId]);
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
  if (!houseId) {
    return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
  }
  const targetHouseId = req.params.houseId || req.body?.houseId || req.query.houseId;
  if (targetHouseId && targetHouseId !== houseId) {
    return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
  }
  if (!targetHouseId && req.body && typeof req.body === 'object') {
    req.body.houseId = houseId;
  }
  next();
};

// 2. CORE API ROUTES
app.get('/api/system/config', checkAuth, (req, res) => {
  const role = (req as any).userRole;
  if (role === 'OWNER' || role === 'CO_CEO') {
    const key = currentVaultKey || process.env.MASTER_KEY;
    if (!key) return res.status(500).json({ error: "VAULT_KEY_MISSING" });
    return res.json({ masterKey: key });
  }
  res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
});

function upsertEnvFile(updates: Record<string, string>) {
  const envPath = path.resolve(process.cwd(), '.env');
  let lines: string[] = [];
  if (fs.existsSync(envPath)) {
    lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
  }
  for (const [key, val] of Object.entries(updates)) {
    const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
    const sanitized = String(val ?? '').replace(/[\r\n]/g, '');
    const entry = `${key}=${sanitized}`;
    if (idx >= 0) lines[idx] = entry;
    else lines.push(entry);
  }
  fs.writeFileSync(envPath, lines.filter((l, i) => !(i === lines.length - 1 && l === '')).join('\n') + '\n', 'utf-8');
}

app.get('/api/system/hosting', checkAuth, async (req, res) => {
  const role = (req as any).userRole;
  if (!['OWNER', 'CO_CEO'].includes(role)) {
    return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
  }
  try {
    const token = process.env.CLOUDFLARE_TUNNEL_TOKEN || '';
    const maskedToken = token ? `${token.slice(0, 8)}••••••••${token.slice(-4)}` : '';
    const hostingMode =
      (process.env.HOSTING_MODE as 'cloudflare' | 'tailscale' | 'lan') ||
      (token ? 'cloudflare' : 'lan');

    res.json({
      workspaceName: process.env.WORKSPACE_NAME || 'Botanical Workspace',
      hostingMode,
      appUrl: process.env.APP_URL || '',
      tailscaleDomain: process.env.TAILSCALE_DOMAIN || '',
      cloudflareTokenConfigured: Boolean(token),
      cloudflareTokenMasked: maskedToken,
      port,
      geminiReady: Boolean(process.env.GEMINI_API_KEY),
    });
  } catch (e) {
    res.status(500).json({ error: "HOSTING_CONFIG_FAULT" });
  }
});

const MANAGED_API_KEYS = [
  'GEMINI_API_KEY',
  'PERENUAL_API_KEY',
  'TREFLE_TOKEN',
  'PLANTNET_API_KEY',
  'OPB_CLIENT_ID',
  'OPB_CLIENT_SECRET',
  'SERPER_API_KEY',
] as const;

const maskApiKey = (val: string): string => {
  if (!val) return '';
  if (val.length <= 8) return '••••••••';
  return `${val.slice(0, 4)}••••••••${val.slice(-4)}`;
};

async function hydrateApiKeysFromVault() {
  try {
    const placeholders = MANAGED_API_KEYS.map(() => '?').join(',');
    const res = await query(
      `SELECT key, value FROM system_settings WHERE key IN (${placeholders})`,
      [...MANAGED_API_KEYS]
    );
    for (const row of res.rows) {
      if (!row?.key || typeof row?.value !== 'string') continue;
      let resolved = row.value;
      if (resolved.startsWith('enc:')) {
        try {
          const dec = decrypt(resolved.slice(4));
          resolved = typeof dec === 'string' ? dec : String(dec ?? '');
        } catch {
          continue;
        }
      }
      if (resolved) {
        process.env[row.key] = resolved;
      }
    }
  } catch {}
}

app.get('/api/system/api-keys', checkAuth, async (req, res) => {
  const role = (req as any).userRole;
  if (!['OWNER', 'CO_CEO'].includes(role)) {
    return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
  }
  try {
    const placeholders = MANAGED_API_KEYS.map(() => '?').join(',');
    const dbRes = await query(
      `SELECT key, updatedAt FROM system_settings WHERE key IN (${placeholders})`,
      [...MANAGED_API_KEYS]
    );
    const dbMap = new Map<string, string>();
    for (const row of dbRes.rows) {
      if (row?.key) dbMap.set(row.key, row.updatedAt || '');
    }

    const keys = MANAGED_API_KEYS.map((key) => {
      const val = process.env[key] || '';
      const inVault = dbMap.has(key);
      return {
        key,
        configured: Boolean(val),
        masked: maskApiKey(val),
        source: inVault ? 'vault' : (val ? 'env' : 'none'),
        updatedAt: dbMap.get(key) || null,
      };
    });

    res.json({ keys });
  } catch (e) {
    res.status(500).json({ error: "API_KEYS_FETCH_FAULT" });
  }
});

app.put('/api/system/api-keys', checkAuth, async (req, res) => {
  const role = (req as any).userRole;
  if (!['OWNER', 'CO_CEO'].includes(role)) {
    return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
  }
  try {
    const { updates } = req.body || {};
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: "INVALID_PAYLOAD" });
    }

    const changedKeys: string[] = [];
    const clearedKeys: string[] = [];
    const now = new Date().toISOString();

    for (const key of MANAGED_API_KEYS) {
      if (!(key in updates)) continue;
      const rawVal = updates[key];

      if (rawVal === null || rawVal === '__CLEAR__') {
        await query('DELETE FROM system_settings WHERE key = ?', [key]);
        delete process.env[key];
        clearedKeys.push(key);
      } else if (typeof rawVal === 'string' && rawVal.trim().length > 0) {
        const cleanVal = rawVal.trim();
        const storedVal = currentVaultKey ? `enc:${encrypt(cleanVal)}` : cleanVal;
        await query(
          'INSERT OR REPLACE INTO system_settings (key, value, updatedAt) VALUES (?, ?, ?)',
          [key, storedVal, now]
        );
        process.env[key] = cleanVal;
        changedKeys.push(key);
      }
    }

    if (changedKeys.length > 0 || clearedKeys.length > 0) {
      await logSystemEvent(
        'API_KEYS_UPDATED',
        `Updated: [${changedKeys.join(', ') || 'none'}], Cleared: [${clearedKeys.join(', ') || 'none'}] by ${(req as any).userId || 'ADMIN'}`,
        'WARN'
      );
    }

    res.json({ status: 'ok', updated: changedKeys, cleared: clearedKeys });
  } catch (e) {
    res.status(500).json({ error: "API_KEYS_SAVE_FAULT" });
  }
});

app.post('/api/system/hosting', checkAuth, async (req, res) => {
  const role = (req as any).userRole;
  if (!['OWNER', 'CO_CEO'].includes(role)) {
    return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
  }
  try {
    const { workspaceName, hostingMode, appUrl, cloudflareTunnelToken, tailscaleDomain } = req.body || {};
    const updates: Record<string, string> = {};

    if (typeof workspaceName === 'string' && workspaceName.trim()) {
      const cleanName = workspaceName.trim().slice(0, 60);
      process.env.WORKSPACE_NAME = cleanName;
      updates.WORKSPACE_NAME = cleanName;
    }
    if (hostingMode && ['cloudflare', 'tailscale', 'lan'].includes(hostingMode)) {
      process.env.HOSTING_MODE = hostingMode;
      updates.HOSTING_MODE = hostingMode;
    }
    if (typeof appUrl === 'string') {
      const cleanUrl = appUrl.trim().replace(/\/+$/, '');
      process.env.APP_URL = cleanUrl;
      updates.APP_URL = cleanUrl;
    }
    if (typeof tailscaleDomain === 'string') {
      const cleanTs = tailscaleDomain.trim().replace(/\/+$/, '');
      process.env.TAILSCALE_DOMAIN = cleanTs;
      updates.TAILSCALE_DOMAIN = cleanTs;
    }
    if (typeof cloudflareTunnelToken === 'string' && cloudflareTunnelToken.trim() && !cloudflareTunnelToken.includes('••••')) {
      const cleanToken = cloudflareTunnelToken.trim();
      process.env.CLOUDFLARE_TUNNEL_TOKEN = cleanToken;
      updates.CLOUDFLARE_TUNNEL_TOKEN = cleanToken;
    }

    for (const [k, v] of Object.entries(updates)) {
      await query(
        `INSERT INTO system_settings (key, value, updatedAt) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
        [k, v, new Date().toISOString()]
      );
    }

    try {
      if (Object.keys(updates).length > 0) upsertEnvFile(updates);
    } catch (envErr) {
      console.warn('[HOSTING] Could not write .env file (non-fatal):', envErr);
    }

    await logSystemEvent('HOSTING_SETTINGS_UPDATED', `Hosting/domain settings updated by ${(req as any).userId || 'ADMIN'}`, 'INFO');
    res.json({ status: 'ok', workspaceName: process.env.WORKSPACE_NAME || 'Botanical Workspace' });
  } catch (e) {
    res.status(500).json({ error: "HOSTING_SAVE_FAULT" });
  }
});

function isPrivateOrReservedIp(ip: string): boolean {
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (net.isIPv4(normalized)) {
    const parts = normalized.split('.').map(Number);
    if (parts.length !== 4 || parts.some(n => isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true; // 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local / cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (net.isIPv6(normalized)) {
    const lower = normalized.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (/^(fc|fd)[0-9a-f]{2}:/.test(lower)) return true; // fc00::/7 ULA
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true; // fe80::/10 link-local
    if (lower.startsWith('ff')) return true; // multicast
    return false;
  }
  return true;
}

app.post('/api/system/test-endpoint', checkAuth, async (req, res) => {
  const role = (req as any).userRole;
  if (!['OWNER', 'CO_CEO'].includes(role)) {
    return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
  }
  const rawUrl = String(req.body?.url || '').trim().replace(/\/+$/, '');
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return res.status(400).json({ ok: false, error: 'INVALID_URL' });
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return res.status(400).json({ ok: false, error: 'INVALID_PROTOCOL' });
  }
  const hostname = parsedUrl.hostname.toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return res.status(400).json({ ok: false, error: 'DISALLOWED_HOST' });
  }
  if (net.isIP(hostname) && isPrivateOrReservedIp(hostname)) {
    return res.status(400).json({ ok: false, error: 'DISALLOWED_IP' });
  }
  try {
    const resolved = await dns.lookup(hostname, { all: true });
    if (!resolved.length || resolved.some(r => isPrivateOrReservedIp(r.address))) {
      return res.status(400).json({ ok: false, error: 'DISALLOWED_RESOLVED_IP' });
    }
  } catch {
    return res.status(400).json({ ok: false, error: 'DNS_RESOLUTION_FAILED' });
  }

  const startedAt = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(`${parsedUrl.origin}/api/health`, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - startedAt;
    res.json({ ok: resp.ok, status: resp.status, latencyMs });
  } catch (err: any) {
    res.json({
      ok: false,
      status: 0,
      latencyMs: Date.now() - startedAt,
      error: err?.name === 'AbortError' ? 'TIMEOUT' : 'UNREACHABLE',
    });
  }
});

app.post('/api/system/vault-key', checkAuth, async (req, res) => {
  const role = (req as any).userRole;
  if (role !== 'OWNER') {
    return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
  }
  try {
    const { key } = req.body;
    if (!key || typeof key !== 'string' || key.length < 32) return res.status(400).json({ error: "INVALID_KEY_LENGTH" });
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
  if (!currentVaultKey) {
    return res.status(500).json({ error: "VAULT_KEY_MISSING" });
  }
  try {
    const plants = await query('SELECT * FROM plants');
    const houses = await query('SELECT * FROM houses');
    const tasks = await query('SELECT * FROM tasks');
    const inventory = await query('SELECT * FROM inventory');
    const users = await query('SELECT * FROM users');
    const webauthnCredentials = await query('SELECT * FROM webauthn_credentials');
    const securityPolicy = await query('SELECT * FROM security_policy');
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
      users: users.rows.map((u: any) => ({
        ...u,
        name: safeParse(u.name),
      })),
      webauthn_credentials: webauthnCredentials.rows,
      security_policy: securityPolicy.rows,
      system_logs: logs.rows,
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };

    // Force encryption for backup
    (req as any).wasEncrypted = true;

    await logSystemEvent('DATABASE_BACKUP_DOWNLOADED', `System backup generated by ${(req as any).userId || 'ADMIN'}`, 'INFO');
    res.json(backup);
  } catch (e) {
    console.error("[ADMIN] Backup Fault:", e);
    res.status(500).json({ error: "BACKUP_FAULT" });
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
    
    if (type === 'gemini' && typeof tokens === 'number' && Number.isFinite(tokens) && tokens >= 0 && tokens <= 10_000_000) {
      updateSql = `UPDATE api_usage SET ${column} = ${column} + 1, gemini_tokens = gemini_tokens + ?, last_updated = ? WHERE id = ?`;
      params = [Math.floor(tokens), now.toISOString(), monthId];
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
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "NO_IMAGES_PROVIDED" });
    }
    const formData = new FormData();
    files.forEach(file => {
      const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype || 'application/octet-stream' });
      formData.append('images', blob, file.originalname || 'specimen.jpg');
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
    const { q, id } = req.query;
    const url = id
      ? `https://trefle.io/api/v1/plants/${encodeURIComponent(id as string)}?token=${process.env.TREFLE_TOKEN}`
      : `https://trefle.io/api/v1/plants/search?token=${process.env.TREFLE_TOKEN}&q=${encodeURIComponent((q as string) || '')}`;
    const response = await fetch(url);
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
    const { q, page, id } = req.query;
    const safePage = Math.max(1, parseInt(String(page || '1'), 10) || 1);
    const url = id
      ? `https://perenual.com/api/species/details/${encodeURIComponent(id as string)}?key=${process.env.PERENUAL_API_KEY}`
      : `https://perenual.com/api/species-list?key=${process.env.PERENUAL_API_KEY}&q=${encodeURIComponent((q as string) || '')}&page=${safePage}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "PERENUAL_PROXY_FAULT" });
  }
});

// OPEN-SOURCE BOTANICAL PROXIES (NO API KEY REQUIRED)
app.get('/api/proxy/gbif', checkAuth, async (req, res) => {
  try {
    const { q, id } = req.query;
    let speciesKey = id ? String(id) : null;
    let matchData: any = null;

    if (!speciesKey && q) {
      const matchRes = await fetch(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(String(q))}&verbose=true`);
      if (matchRes.ok) {
        matchData = await matchRes.json();
        speciesKey = matchData?.usageKey ? String(matchData.usageKey) : null;
      }
    }

    if (!speciesKey) return res.json(null);

    const [detailRes, iucnRes, vernRes] = await Promise.all([
      fetch(`https://api.gbif.org/v1/species/${encodeURIComponent(speciesKey)}`),
      fetch(`https://api.gbif.org/v1/species/${encodeURIComponent(speciesKey)}/iucnRedListCategory`),
      fetch(`https://api.gbif.org/v1/species/${encodeURIComponent(speciesKey)}/vernacularNames?limit=25`)
    ]);

    const detail = detailRes.ok ? await detailRes.json() : matchData;
    const iucn = iucnRes.ok ? await iucnRes.json() : null;
    const vernacular = vernRes.ok ? await vernRes.json() : null;

    res.json({
      gbifId: Number(speciesKey),
      species: detail,
      iucnCategory: iucn?.category || null,
      vernacularNames: vernacular?.results || []
    });
  } catch (e) {
    res.status(500).json({ error: "GBIF_PROXY_FAULT" });
  }
});

app.get('/api/proxy/powo', checkAuth, async (req, res) => {
  try {
    const { q, id } = req.query;
    let fqId = id ? String(id) : null;

    if (!fqId && q) {
      const searchRes = await fetch(`https://powo.science.kew.org/api/2/search?q=${encodeURIComponent(String(q))}&f=species_f`);
      if (searchRes.ok) {
        const searchJson = await searchRes.json();
        fqId = searchJson?.results?.[0]?.fqId || null;
      }
    }

    if (!fqId) return res.json(null);

    const detailRes = await fetch(`https://powo.science.kew.org/api/2/taxon/${encodeURIComponent(fqId)}?fields=distribution,descriptions,synonyms,lifeform,name,authors`);
    if (!detailRes.ok) return res.json(null);
    const data = await detailRes.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "POWO_PROXY_FAULT" });
  }
});

app.get('/api/proxy/inaturalist', checkAuth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json(null);
    const taxonRes = await fetch(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(String(q))}&rank=species&per_page=1`);
    if (!taxonRes.ok) return res.json(null);
    const taxonJson = await taxonRes.json();
    const taxon = taxonJson?.results?.[0];
    if (!taxon?.id) return res.json(null);

    // term_id=12 = Plant Phenology, term_value_id=13 = Flowering
    const histRes = await fetch(`https://api.inaturalist.org/v1/observations/histogram?taxon_id=${taxon.id}&date_field=observed&interval=month_of_year&term_id=12&term_value_id=13`);
    const histJson = histRes.ok ? await histRes.json() : null;

    res.json({
      inaturalistId: taxon.id,
      taxon,
      floweringHistogram: histJson?.results?.month_of_year || null
    });
  } catch (e) {
    res.status(500).json({ error: "INATURALIST_PROXY_FAULT" });
  }
});

app.get('/api/proxy/geocode', checkAuth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: "MISSING_QUERY" });

    const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(String(q))}`, {
      headers: { 'User-Agent': 'VerdantBotanicalOS/1.0' }
    });
    if (!nomRes.ok) return res.status(502).json({ error: "GEOCODE_FAILED" });
    const nomJson = await nomRes.json();
    const place = nomJson?.[0];
    if (!place) return res.status(404).json({ error: "ADDRESS_NOT_FOUND" });

    const lat = parseFloat(place.lat);
    const lon = parseFloat(place.lon);

    // Calculate USDA Hardiness Zone from 5-year annual extreme minimum temperature via Open-Meteo
    let minWinterTempC: number | null = null;
    try {
      const endYear = new Date().getFullYear() - 1;
      const startYear = endYear - 4;
      const meteoUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startYear}-01-01&end_date=${endYear}-12-31&daily=temperature_2m_min&timezone=auto`;
      const meteoRes = await fetch(meteoUrl);
      if (meteoRes.ok) {
        const meteoJson = await meteoRes.json();
        const times: string[] = meteoJson?.daily?.time || [];
        const mins: (number | null)[] = meteoJson?.daily?.temperature_2m_min || [];
        const yearlyMins: Record<string, number> = {};
        for (let i = 0; i < times.length; i++) {
          const tVal = mins[i];
          if (typeof tVal !== 'number') continue;
          const yr = times[i].slice(0, 4);
          if (yearlyMins[yr] === undefined || tVal < yearlyMins[yr]) {
            yearlyMins[yr] = tVal;
          }
        }
        const annualExtremes = Object.values(yearlyMins);
        if (annualExtremes.length > 0) {
          minWinterTempC = Number((annualExtremes.reduce((a, b) => a + b, 0) / annualExtremes.length).toFixed(1));
        }
      }
    } catch {
      // Fallback below
    }

    // Fallback latitude-based approximation if Open-Meteo archive is unavailable
    if (minWinterTempC === null) {
      const absLat = Math.abs(lat);
      minWinterTempC = Number((22 - absLat * 0.72).toFixed(1));
    }

    const minTempF = (minWinterTempC * 9) / 5 + 32;
    const rawStep = Math.max(0, Math.min(25, Math.floor((minTempF + 60) / 5)));
    const zoneInteger = Math.floor(rawStep / 2) + 1;
    const isB = rawStep % 2 === 1;
    const hardinessZone = `${zoneInteger}${isB ? 'b' : 'a'}`;
    const hardinessZoneNum = zoneInteger + (isB ? 0.5 : 0);

    res.json({
      displayName: place.display_name,
      latitude: lat,
      longitude: lon,
      minWinterTempC,
      hardinessZone,
      hardinessZoneNum
    });
  } catch (e) {
    res.status(500).json({ error: "GEOCODE_PROXY_FAULT" });
  }
});

// NC State Extension Gardener Plant Toolbox Parser
app.get('/api/proxy/ncsu', checkAuth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json(null);
    const slug = String(q).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug) return res.json(null);

    const url = `https://plants.ces.ncsu.edu/plants/${slug}/`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'VerdantBotanicalOS/1.0' }
    });
    if (!response.ok) return res.json(null);
    const html = await response.text();

    const stripTags = (s: string) =>
      s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

    const extractField = (label: string): string | null => {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`<dt[^>]*>\\s*${escaped}\\s*:?\\s*</dt>\\s*<dd[^>]*>([\\s\\S]*?)</dd>`, 'i');
      const match = html.match(regex);
      if (match?.[1]) return stripTags(match[1]);
      return null;
    };

    const cultivarMatches = [...html.matchAll(/<li[^>]*class="[^"]*cultivar[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)];
    const cultivars = cultivarMatches
      .map(m => stripTags(m[1]).split(':')[0]?.trim())
      .filter(Boolean)
      .slice(0, 8);

    res.json({
      url,
      plantType: extractField('Plant Type'),
      habit: extractField('Habit/Form'),
      light: extractField('Light'),
      soilTexture: extractField('Soil Texture'),
      soilPh: extractField('Soil pH'),
      soilDrainage: extractField('Soil Drainage'),
      hardinessZones: extractField('USDA Plant Hardiness Zone'),
      toxicPrinciple: extractField('Poison Toxic Principle'),
      poisonSeverity: extractField('Poison Severity'),
      poisonSymptoms: extractField('Poison Symptoms'),
      poisonParts: extractField('Poison Part'),
      cultivars
    });
  } catch {
    res.status(500).json({ error: "NCSU_PROXY_FAULT" });
  }
});

// VASCAN (Database of Vascular Plants of Canada - Canadensys CC0 API)
app.get('/api/proxy/vascan', checkAuth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json(null);

    const url = `https://data.canadensys.net/vascan/api/0.1/search.json?q=${encodeURIComponent(String(q))}`;
    const response = await fetch(url);
    if (!response.ok) return res.json(null);
    const json = await response.json();
    const match = json?.results?.[0]?.matches?.[0];
    if (!match) return res.json(null);

    const distribution = (match.distribution || [])
      .filter((d: any) => ['native', 'introduced'].includes((d.occurrenceStatus || '').toLowerCase()))
      .map((d: any) => `${d.locationID?.replace(/^CA-/, '') || d.locality || ''} (${d.occurrenceStatus})`)
      .filter((s: string) => s.trim().length > 2)
      .slice(0, 14);

    res.json({
      vascanId: match.taxonID || null,
      habit: match.habit || null,
      scientificName: match.scientificName || null,
      vernacularNames: (match.vernacularNames || []).slice(0, 10),
      distribution
    });
  } catch {
    res.status(500).json({ error: "VASCAN_PROXY_FAULT" });
  }
});

app.use('/api/aggregator', checkAuth, createAggregatorRouter());

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
  if (role !== 'OWNER') {
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
          await query(
            'INSERT OR REPLACE INTO users (id, email, name, role, houseId, personalAiKey, personalAiKeyTestedAt, deletedAt, caretakerStart, caretakerEnd, passwordHash, totpSecret, totpEnabled, recoveryCodes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              u.id,
              u.email,
              typeof u.name === 'object' ? JSON.stringify(u.name) : u.name,
              u.role,
              u.houseId,
              u.personalAiKey || null,
              u.personalAiKeyTestedAt || null,
              u.deletedAt || null,
              u.caretakerStart || null,
              u.caretakerEnd || null,
              u.passwordHash || null,
              u.totpSecret || null,
              u.totpEnabled ? 1 : 0,
              typeof u.recoveryCodes === 'object' && u.recoveryCodes !== null ? JSON.stringify(u.recoveryCodes) : (u.recoveryCodes || null)
            ]
          );
        }
      }

      if (decoded.webauthn_credentials && Array.isArray(decoded.webauthn_credentials)) {
        console.log(`[RESTORE] Restoring ${decoded.webauthn_credentials.length} passkeys...`);
        for (const wc of decoded.webauthn_credentials) {
          await query(
            'INSERT OR REPLACE INTO webauthn_credentials (id, userId, publicKey, counter, transports, deviceType, backedUp, label, createdAt, lastUsedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [wc.id, wc.userId, wc.publicKey, wc.counter ?? 0, wc.transports || null, wc.deviceType || null, wc.backedUp ? 1 : 0, wc.label || null, wc.createdAt || null, wc.lastUsedAt || null]
          );
        }
      }

      if (decoded.security_policy && Array.isArray(decoded.security_policy)) {
        for (const sp of decoded.security_policy) {
          await query(
            'INSERT OR REPLACE INTO security_policy (id, require2faAllUsers, updatedAt) VALUES (?, ?, ?)',
            [sp.id ?? 1, sp.require2faAllUsers ? 1 : 0, sp.updatedAt || new Date().toISOString()]
          );
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
  if (!id || typeof id !== 'string') return { allowed: false, status: 400, error: 'ID_REQUIRED' };
  if (['OWNER', 'CO_CEO'].includes(role)) return { allowed: true };
  const existing = await query(`SELECT houseId FROM ${table} WHERE id = ?`, [id]);
  if (existing.rows.length > 0 && existing.rows[0].houseId !== userHouseId) {
    return { allowed: false, status: 403, error: 'INSUFFICIENT_CLEARANCE' };
  }
  return { allowed: true };
};

const safeRowParse = (data: any) => {
  if (!data) return {};
  try {
    return typeof data === 'string' ? JSON.parse(data) : data;
  } catch {
    return {};
  }
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
    res.json(result.rows.map((r: any) => ({ ...safeRowParse(r.data), id: r.id, houseId: r.houseId })));
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

// LOGS BULK CLEAR
app.post('/api/logs/clear', checkAuth, async (req, res) => {
  try {
    const role = (req as any).userRole;
    const houseId = (req as any).userHouseId;
    if (!['OWNER', 'CO_CEO', 'LEAD_HAND'].includes(role)) {
      return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
    }
    let sql = 'SELECT * FROM plants';
    const params: any[] = [];
    if (!['OWNER', 'CO_CEO'].includes(role)) {
      sql += ' WHERE houseId = ?';
      params.push(houseId);
    }
    const result = await query(sql, params);
    const now = new Date().toISOString();
    for (const r of result.rows) {
      const plantData = { ...safeRowParse(r.data), id: r.id, houseId: r.houseId, logs: [], lastModified: now };
      await query(
        'UPDATE plants SET logs = ?, updatedAt = ?, data = ? WHERE id = ?',
        [JSON.stringify([]), now, JSON.stringify(plantData), r.id]
      );
    }
    await logSystemEvent('LOGS_CLEARED', `All logs cleared by ${(req as any).userId || 'ADMIN'}`, 'WARN');
    res.json({ status: "ok" });
  } catch (e) {
    res.status(500).json({ error: "DB_FAULT" });
  }
});

app.post('/api/logs/clear-day', checkAuth, async (req, res) => {
  try {
    const role = (req as any).userRole;
    const houseId = (req as any).userHouseId;
    if (!['OWNER', 'CO_CEO', 'LEAD_HAND'].includes(role)) {
      return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
    }
    const date = typeof req.body?.date === 'string' ? req.body.date.trim() : '';
    if (!date) return res.status(400).json({ error: "DATE_REQUIRED" });

    let sql = 'SELECT * FROM plants';
    const params: any[] = [];
    if (!['OWNER', 'CO_CEO'].includes(role)) {
      sql += ' WHERE houseId = ?';
      params.push(houseId);
    }
    const result = await query(sql, params);
    const now = new Date().toISOString();
    for (const r of result.rows) {
      const parsed = safeRowParse(r.data);
      const existingLogs = Array.isArray(parsed.logs) ? parsed.logs : [];
      const filteredLogs = existingLogs.filter((l: any) => !(typeof l?.date === 'string' && l.date.startsWith(date)));
      if (filteredLogs.length !== existingLogs.length) {
        const plantData = { ...parsed, id: r.id, houseId: r.houseId, logs: filteredLogs, lastModified: now };
        await query(
          'UPDATE plants SET logs = ?, updatedAt = ?, data = ? WHERE id = ?',
          [JSON.stringify(filteredLogs), now, JSON.stringify(plantData), r.id]
        );
      }
    }
    await logSystemEvent('LOGS_CLEARED_DAY', `Logs for ${date} cleared by ${(req as any).userId || 'ADMIN'}`, 'WARN');
    res.json({ status: "ok" });
  } catch (e) {
    res.status(500).json({ error: "DB_FAULT" });
  }
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
    res.json(result.rows.map((r: any) => ({ ...safeRowParse(r.data), id: r.id })));
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
    res.json(result.rows.map((r: any) => ({ ...safeRowParse(r.data), id: r.id })));
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
    res.json(result.rows.map((r: any) => ({ ...safeRowParse(r.data), id: r.id })));
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
    const callerId = (req as any).userId;
    
    // Only OWNER and CO_CEO can permanently delete users
    if (!['OWNER', 'CO_CEO'].includes(role)) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    if (id === callerId) {
      return res.status(400).json({ error: "CANNOT_DELETE_SELF" });
    }

    const targetRes = await query('SELECT role FROM users WHERE id = ?', [id]);
    const targetRole = targetRes.rows[0]?.role;

    if (role === 'CO_CEO' && targetRole === 'OWNER') {
      return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
    }

    if (targetRole === 'OWNER') {
      const ownersRes = await query("SELECT COUNT(*) as count FROM users WHERE role = 'OWNER' AND deletedAt IS NULL");
      if ((ownersRes.rows[0]?.count || 0) <= 1) {
        return res.status(400).json({ error: "CANNOT_DELETE_LAST_OWNER" });
      }
    }

    await query('DELETE FROM webauthn_credentials WHERE userId = ?', [id]);
    await query('DELETE FROM users WHERE id = ?', [id]);
    await logSystemEvent('USER_DELETED', `User ${id} permanently deleted by ${callerId || 'ADMIN'}`, 'WARN');
    res.json({ status: "ok" });
  } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

// USERS
app.get('/api/users', checkAuth, async (req, res) => {
  try {
    const role = (req as any).userRole;
    const houseId = (req as any).userHouseId;
    const callerId = (req as any).userId;
    let sql = 'SELECT users.*, (SELECT COUNT(*) FROM webauthn_credentials wc WHERE wc.userId = users.id) AS passkeyCount FROM users WHERE deletedAt IS NULL';
    let params: any[] = [];
    if (role === 'LEAD_HAND') {
      sql += ' AND houseId = ? AND role IN ("GARDENER", "SEASONAL")';
      params.push(houseId);
    } else if (!['OWNER', 'CO_CEO'].includes(role)) {
      sql += ' AND id = ?';
      params.push(callerId || '');
    }
    const result = await query(sql, params);
    res.json(result.rows.map((r: any) => {
      const parsed = parseUserRecord(r);
      if (parsed.id !== callerId) {
        parsed.hasPersonalAiKey = Boolean(parsed.personalAiKey);
        delete parsed.personalAiKey;
      }
      return parsed;
    }));
  } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

const VALID_ROLES = new Set(['OWNER', 'CO_CEO', 'LEAD_HAND', 'GARDENER', 'SEASONAL']);

app.post('/api/users', checkAuth, async (req, res) => {
  try {
    const callerRole = (req as any).userRole;
    const callerId = (req as any).userId;
    const callerHouseId = (req as any).userHouseId;
    const u = req.body;
    const email = u.email?.trim().toLowerCase();
    const targetRole = typeof u.role === 'string' ? u.role.toUpperCase() : '';

    if (!u.id || typeof u.id !== 'string' || !email) {
      return res.status(400).json({ error: "INVALID_USER_DATA" });
    }

    if (['OWNER', 'CO_CEO', 'LEAD_HAND'].includes(callerRole) && !VALID_ROLES.has(targetRole)) {
      return res.status(400).json({ error: "INVALID_ROLE" });
    }

    if (callerRole === 'OWNER') {
      // OWNER has full user management rights
    } else if (callerRole === 'CO_CEO') {
      // CO_CEO cannot create or modify OWNER accounts
      if (targetRole === 'OWNER') return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
      const existing = await query('SELECT role FROM users WHERE id = ?', [u.id]);
      if (existing.rows[0]?.role === 'OWNER') return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
    } else if (callerRole === 'LEAD_HAND') {
      // LEAD_HAND can only manage GARDENER/SEASONAL within their own house
      if (!['GARDENER', 'SEASONAL'].includes(targetRole) || u.houseId !== callerHouseId) {
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

    // Only allow updating personalAiKey for self (or if explicitly provided by OWNER/CO_CEO)
    const canSetPersonalKey = u.id === callerId;
    const personalAiKeyVal = canSetPersonalKey && u.personalAiKey !== undefined ? u.personalAiKey : undefined;
    const personalAiKeyTestedAtVal = canSetPersonalKey && u.personalAiKeyTestedAt !== undefined ? u.personalAiKeyTestedAt : undefined;

    await query(
      `INSERT INTO users (id, email, name, role, houseId, personalAiKey, personalAiKeyTestedAt, deletedAt, caretakerStart, caretakerEnd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         email = excluded.email,
         name = excluded.name,
         role = excluded.role,
         houseId = excluded.houseId,
         personalAiKey = COALESCE(?, users.personalAiKey),
         personalAiKeyTestedAt = COALESCE(?, users.personalAiKeyTestedAt),
         deletedAt = excluded.deletedAt,
         caretakerStart = excluded.caretakerStart,
         caretakerEnd = excluded.caretakerEnd`,
      [
        u.id,
        email,
        typeof u.name === 'object' ? JSON.stringify(u.name) : u.name,
        targetRole,
        u.houseId,
        personalAiKeyVal ?? null,
        personalAiKeyTestedAtVal ?? null,
        u.deletedAt ?? null,
        u.caretakerStart ?? null,
        u.caretakerEnd ?? null,
        personalAiKeyVal !== undefined ? personalAiKeyVal : null,
        personalAiKeyTestedAtVal !== undefined ? personalAiKeyTestedAtVal : null,
      ]
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
    WORKSPACE_NAME: (process.env.WORKSPACE_NAME || 'Botanical Workspace').trim(),
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
    `CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT, updatedAt TEXT)`,
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

  // Hydrate persisted hosting, SMTP & workspace settings (decrypting enc: values with AES-256-GCM)
  try {
    const savedSettings = await query('SELECT key, value FROM system_settings');
    for (const row of savedSettings.rows) {
      if (!row.key || typeof row.value !== 'string') continue;
      let resolved = row.value;
      if (resolved.startsWith('enc:')) {
        try {
          const dec = decrypt(resolved.slice(4));
          resolved = typeof dec === 'string' ? dec : String(dec ?? '');
        } catch {
          continue;
        }
      }
      if (!process.env[row.key] || ['WORKSPACE_NAME', 'HOSTING_MODE', 'APP_URL', 'TAILSCALE_DOMAIN', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'].includes(row.key)) {
        process.env[row.key] = resolved;
      }
    }
  } catch (e) {}

  console.log('[DB] Schema Synchronized');
}

// --- DATABASE CONNECTION & STARTUP ---
console.log('[DB] Connecting to SQLite at:', dbPath);
try {
  db = new DatabaseSync(dbPath);
  console.log('[DB] Connected to SQLite successfully');
  startApp();
} catch (err: any) {
  console.error('[DB ERROR] Failed to connect to SQLite:', err?.message || err);
  process.exit(1);
}
