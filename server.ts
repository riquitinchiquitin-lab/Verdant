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

// 1. IMMEDIATE HEALTH CHECK (Must be before other middleware)
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: "ok", uptime: process.uptime() });
});

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
    const callback = function(this: any, err: Error | null, rows: any[]) {
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
    } catch (e) { console.error('[SECURITY] Vault Key Failure:', e); }
}

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
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

app.use(express.json({ limit: '50mb' }));

const checkAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.headers.authorization) return res.status(401).json({ error: "UNAUTHORIZED" });
    (req as any).userRole = req.headers['x-user-role'];
    (req as any).userHouseId = req.headers['x-user-house-id'];
    next();
};

app.get('/api/system/config', checkAuth, (req, res) => {
    const role = req.headers['x-user-role'];
    if (role === 'OWNER' || role === 'CO_CEO') {
        return res.json({ masterKey: currentVaultKey || process.env.MASTER_KEY || 'demo-key' });
    }
    res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
});

app.get('/env-config.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`window._ENV_ = ${JSON.stringify({ 
    GOOGLE_CLIENT_ID: (process.env.GOOGLE_CLIENT_ID || '').trim(),
    API_KEY: (process.env.GEMINI_API_KEY || '').trim()
  })};`);
});

async function setupMiddlewareAndStart() {
  const isProd = process.env.NODE_ENV === 'production';
  
  if (!isProd) {
    const vite = await import('vite').then(m => m.createServer({ server: { middlewareMode: true } }));
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(port, '0.0.0.0', () => {
    console.log(`[CORE] Listening on 0.0.0.0:${port}`);
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