import express from 'express';
import sqlite3 from 'sqlite3';
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

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

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
const db = new sqlite3.Database(dbPath, async (err) => {
  if (err) {
    console.error('[DB ERROR]', err.message);
    process.exit(1);
  } else {
    console.log('[DB] Connected to SQLite');
    try {
      db.serialize(async () => {
        await initializeDatabase();
        await initializeVaultKey();
        await setupMiddlewareAndStart();
      });
    } catch (e) {
      console.error('[CORE] Initialization Failed:', e);
      process.exit(1);
    }
  }
});

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
    const result = await query('SELECT encrypted_key FROM vault_key WHERE id = 1');
    if (result.rows.length === 0) {
      const newVaultKey = crypto.randomBytes(32).toString('hex');
      await query('INSERT INTO vault_key (id, encrypted_key) VALUES (1, ?)', [newVaultKey]);
      currentVaultKey = newVaultKey;
    } else {
      currentVaultKey = result.rows[0].encrypted_key;
    }
    console.log('[SECURITY] Vault Protocol Synchronized');
  } catch (e) { console.error('[SECURITY] Vault Key Failure:', e); }
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

app.use(express.json({ limit: '50mb' }));

// 1. HEALTH CHECK ENDPOINT
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

const checkAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.headers.authorization) return res.status(401).json({ error: "UNAUTHORIZED" });
  (req as any).userRole = req.headers['x-user-role'];
  (req as any).userHouseId = req.headers['x-user-house-id'];
  (req as any).userId = req.headers['x-user-id'];
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
    catch (e) { return res.status(400).json({ error: "DECRYPTION_FAULT" }); }
  }
  const originalJson = res.json;
  res.json = function (data) {
    if (req.url === '/api/system/vault-key' && req.method === 'POST') return originalJson.call(this, data);
    if ((req as any).wasEncrypted && currentVaultKey) {
      try {
        res.setHeader('X-Payload-Encryption', 'AES-256-GCM');
        return originalJson.call(this, { vault: encrypt(data), secure: true });
      } catch (e) { return originalJson.call(this, data); }
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

    const backup = {
      plants: plants.rows.map((r: any) => ({ ...JSON.parse(r.data), id: r.id, houseId: r.houseId })),
      houses: houses.rows.map((r: any) => ({ ...JSON.parse(r.data), id: r.id })),
      tasks: tasks.rows.map((r: any) => ({ ...JSON.parse(r.data), id: r.id })),
      inventory: inventory.rows.map((r: any) => ({ ...JSON.parse(r.data), id: r.id })),
      users: users.rows,
      system_logs: logs.rows,
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };

    await logSystemEvent('DATABASE_BACKUP_DOWNLOADED', `System backup generated by ${(req as any).userId || 'ADMIN'}`, 'INFO');
    res.json(backup);
  } catch (e) {
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

// SYSTEM RESTORE 
app.post('/api/system/restore', checkAuth, async (req, res) => {
  const role = (req as any).userRole;
  if (!['OWNER', 'CO_CEO'].includes(role)) {
    return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
  }
  try {
    const { data } = req.body;
    const decoded = typeof data === 'string' ? JSON.parse(data) : data;
    await query('DELETE FROM plants');
    await query('DELETE FROM houses');
    await query('DELETE FROM tasks');
    await query('DELETE FROM inventory');
    if (decoded.plants) {
      for (const p of decoded.plants) {
        await query('INSERT INTO plants (id, houseId, species, data) VALUES (?, ?, ?, ?)', [p.id, p.houseId, p.species, JSON.stringify(p)]);
      }
    }
    if (decoded.houses) {
      for (const h of decoded.houses) {
        await query('INSERT INTO houses (id, name, data) VALUES (?, ?, ?)', [h.id, JSON.stringify(h.name), JSON.stringify(h)]);
      }
    }
    await logSystemEvent('DATABASE_RESTORED', `System restored by ${(req as any).userId || 'ADMIN'}`, 'WARN');
    res.json({ status: "ok" });
  } catch (e) { res.status(500).json({ error: "RESTORE_FAULT" }); }
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
    const h = req.body;
    await query('INSERT OR REPLACE INTO houses (id, name, googleApiKey, createdAt, data) VALUES (?, ?, ?, ?, ?)',
      [h.id, JSON.stringify(h.name), h.googleApiKey, h.createdAt, JSON.stringify(h)]);
    await logSystemEvent('HOUSE_UPDATED', `House ${h.id} updated by ${(req as any).userId || 'ADMIN'}`, 'INFO');
    res.json({ status: "ok" });
  } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
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
    await query('INSERT OR REPLACE INTO users (id, email, name, role, houseId, personalAiKey, personalAiKeyTestedAt, deletedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [u.id, u.email, typeof u.name === 'object' ? JSON.stringify(u.name) : u.name, u.role, u.houseId, u.personalAiKey, u.personalAiKeyTestedAt, u.deletedAt]);
    await logSystemEvent('USER_UPDATED', `User ${u.id} updated by ${(req as any).userId || 'ADMIN'}`, 'INFO');
    res.json({ status: "ok" });
  } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.get('/env-config.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`window._ENV_ = ${JSON.stringify({
    GOOGLE_CLIENT_ID: (process.env.GOOGLE_CLIENT_ID || '').trim(),
    API_KEY: (process.env.GEMINI_API_KEY || '').trim()
  })};`);
});

// 3. STATIC SERVING & CATCH-ALL
async function setupMiddlewareAndStart() {
  const isProd = process.env.NODE_ENV === 'production';
  const distPath = path.join(__dirname, 'dist');

  if (!isProd) {
    const vite = await import('vite').then(m => m.createServer({ server: { middlewareMode: true } }));
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: "API_ENDPOINT_NOT_FOUND" });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(port, '0.0.0.0', () => {
    console.log(`[CORE] Verdant Active on 0.0.0.0:${port}`);
  });
}

async function initializeDatabase() {
  return new Promise<void>((resolve) => {
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS vault_key (id INTEGER PRIMARY KEY CHECK (id = 1), encrypted_key TEXT NOT NULL)`);
      db.run(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, role TEXT DEFAULT 'OWNER', houseId TEXT, personalAiKey TEXT, personalAiKeyTestedAt TEXT, deletedAt TEXT, caretakerStart TEXT, caretakerEnd TEXT)`);
      db.run(`CREATE TABLE IF NOT EXISTS plants (id TEXT PRIMARY KEY, houseId TEXT, species TEXT, nickname TEXT, images TEXT, logs TEXT, lastWatered TEXT, updatedAt TEXT, data TEXT)`);
      db.run(`CREATE TABLE IF NOT EXISTS houses (id TEXT PRIMARY KEY, name TEXT, googleApiKey TEXT, createdAt TEXT, data TEXT)`);
      db.run(`CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, houseId TEXT, plantIds TEXT, type TEXT, title TEXT, description TEXT, date TEXT, completed INTEGER, completedAt TEXT, recurrence TEXT, data TEXT)`);
      db.run(`CREATE TABLE IF NOT EXISTS inventory (id TEXT PRIMARY KEY, houseId TEXT, name TEXT, data TEXT)`);
      db.run(`CREATE TABLE IF NOT EXISTS system_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT, details TEXT, level TEXT, created_at TEXT)`);
      resolve();
    });
  });
}
