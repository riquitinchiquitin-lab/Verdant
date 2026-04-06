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

app.use(cors());
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://www.gstatic.com https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: blob: https://*; " +
    "connect-src 'self' ws: wss: https://*; " +
    "frame-src https://accounts.google.com;"
  );
  // FIX: Allow Google Login Popups
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
});

app.use(express.json({ limit: '100mb' }));

// 1. HEALTH CHECK ENDPOINT
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

// PUBLIC AUTH VERIFICATION
app.post('/api/auth/verify', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "EMAIL_REQUIRED" });
    const result = await query('SELECT * FROM users WHERE LOWER(email) = ? AND deletedAt IS NULL', [email.toLowerCase()]);
    if (result.rows.length === 0) return res.status(404).json({ error: "USER_NOT_FOUND" });
    const user = result.rows[0];
    // Parse name if it's JSON
    if (user.name && (user.name.startsWith('{') || user.name.startsWith('['))) {
      try { user.name = JSON.parse(user.name); } catch(e) {}
    }
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: "AUTH_FAULT" });
  }
});

const checkAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.headers.authorization) {
    console.warn("[AUTH] Missing authorization header");
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }
  const role = req.headers['x-user-role'];
  (req as any).userRole = typeof role === 'string' ? role.toUpperCase() : undefined;
  (req as any).userHouseId = req.headers['x-user-house-id'];
  (req as any).userId = req.headers['x-user-id'];
  (req as any).userEmail = req.headers['x-user-email'];
  next();
};

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
  const role = req.headers['x-user-role'];
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
      users: users.rows,
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

const upload = multer({ storage: multer.memoryStorage() });

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
    await query('INSERT OR REPLACE INTO plants (id, houseId, species, nickname, images, logs, lastWatered, updatedAt, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [p.id, p.houseId, p.species, JSON.stringify(p.nickname), JSON.stringify(p.images), JSON.stringify(p.logs), p.lastWatered, new Date().toISOString(), JSON.stringify(p)]);
    await logSystemEvent('PLANT_UPDATED', `Plant ${p.id} updated by ${(req as any).userId || 'ADMIN'}`, 'INFO');
    res.json({ status: "ok" });
  } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.delete('/api/plants/:id', checkAuth, async (req, res) => {
  try {
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
    console.log(`[API] POST /api/houses - User: ${email}, Role: ${role}`);

    // SECURITY: Only OWNER and CO_CEO can create/update houses globally
    if (!['OWNER', 'CO_CEO'].includes(role)) {
      console.warn(`[API] Unauthorized house creation attempt by ${email} (Role: ${role})`);
      return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
    }

    const h = req.body;
    console.log(`[API] House Data:`, h);

    if (!h.id || !h.name) {
      console.warn(`[API] Invalid house data provided:`, h);
      return res.status(400).json({ error: "INVALID_HOUSE_DATA" });
    }

    await query('INSERT OR REPLACE INTO houses (id, name, createdAt, data) VALUES (?, ?, ?, ?)',
      [h.id, JSON.stringify(h.name), h.createdAt, JSON.stringify(h)]);
    
    console.log(`[API] House ${h.id} successfully saved to DB.`);
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
    await query('INSERT OR REPLACE INTO tasks (id, houseId, plantIds, type, title, description, date, completed, completedAt, recurrence, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [t.id, t.houseId, JSON.stringify(t.plantIds), t.type, JSON.stringify(t.title), JSON.stringify(t.description), t.date, t.completed ? 1 : 0, t.completedAt, JSON.stringify(t.recurrence), JSON.stringify(t)]);
    await logSystemEvent('TASK_UPDATED', `Task ${t.id} updated by ${(req as any).userId || 'ADMIN'}`, 'INFO');
    res.json({ status: "ok" });
  } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.delete('/api/tasks/:id', checkAuth, async (req, res) => {
  try {
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
    let sql = 'SELECT * FROM users WHERE deletedAt IS NULL';
    let params: any[] = [];
    if (role === 'LEAD_HAND') {
      sql += ' AND houseId = ? AND role IN ("GARDENER", "SEASONAL")';
      params.push(houseId);
    } else if (!['OWNER', 'CO_CEO'].includes(role)) {
      sql += ' AND id = ?';
      params.push(req.headers['x-user-id'] || '');
    }
    const result = await query(sql, params);
    res.json(result.rows.map((r: any) => ({ ...r, name: r.name && (r.name.startsWith('{') || r.name.startsWith('[')) ? JSON.parse(r.name) : r.name })));
  } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.post('/api/users', checkAuth, async (req, res) => {
  try {
    const u = req.body;
    const email = u.email?.trim().toLowerCase();
    await query('INSERT OR REPLACE INTO users (id, email, name, role, houseId, personalAiKey, personalAiKeyTestedAt, deletedAt, caretakerStart, caretakerEnd) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [u.id, email, typeof u.name === 'object' ? JSON.stringify(u.name) : u.name, u.role, u.houseId, u.personalAiKey, u.personalAiKeyTestedAt, u.deletedAt, u.caretakerStart, u.caretakerEnd]);
    await logSystemEvent('USER_UPDATED', `User ${u.id} updated by ${(req as any).userId || 'ADMIN'}`, 'INFO');
    res.json({ status: "ok" });
  } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.get('/env-config.js', async (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  
  res.send(`window._ENV_ = ${JSON.stringify({
    GOOGLE_CLIENT_ID: (process.env.GOOGLE_CLIENT_ID || '').trim(),
    API_KEY: (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim()
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
    `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, role TEXT DEFAULT 'OWNER', houseId TEXT, personalAiKey TEXT, personalAiKeyTestedAt TEXT, deletedAt TEXT, caretakerStart TEXT, caretakerEnd TEXT)`,
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
  try { await query(`ALTER TABLE api_usage ADD COLUMN gemini_tokens INTEGER DEFAULT 0`); } catch(e) {}

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
