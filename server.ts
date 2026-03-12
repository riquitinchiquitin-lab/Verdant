import express from 'express';
import sqlite3 from 'sqlite3';
import cors from 'cors';
import multer from 'multer';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import webpush from 'web-push';
import readline from 'readline';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const port = 3000;

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new sqlite3.Database(path.join(dataDir, 'verdant.db'), async (err) => {
  if (err) {
    console.error('[DB ERROR]', err.message);
    process.exit(1);
  } else {
    console.log('[DB] Connected to SQLite');
    try {
      await initializeDatabase();
      await initializeVaultKey();
      await setupMiddlewareAndStart();
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
            // Store the vault key directly for bootstrapping
            await query('INSERT INTO vault_key (id, encrypted_key) VALUES (1, ?)', [newVaultKey]);
            currentVaultKey = newVaultKey;
        } else {
            currentVaultKey = result.rows[0].encrypted_key;
        }
        console.log('[SECURITY] Vault Protocol Synchronized');
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
    
    // Extract role and houseId for server-side enforcement
    (req as any).userRole = req.headers['x-user-role'];
    (req as any).userHouseId = req.headers['x-user-house-id'];
    
    next();
};

const checkHouseAccess = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const role = (req as any).userRole;
    const houseId = (req as any).userHouseId;
    
    if (['OWNER', 'CO_CEO'].includes(role)) return next();
    
    // For other roles, if a houseId is provided in the request (params or body), it must match the user's houseId
    const targetHouseId = req.params.houseId || req.body.houseId || req.query.houseId;
    if (targetHouseId && targetHouseId !== houseId) {
        return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE", message: "Property Isolation Violation" });
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
    res.json = function(data) {
        if ((req as any).wasEncrypted && currentVaultKey) {
            try { res.setHeader('X-Payload-Encryption', 'AES-256-GCM'); return originalJson.call(this, { vault: encrypt(data), secure: true }); } 
            catch (e) { return originalJson.call(this, data); }
        }
        return originalJson.call(this, data);
    };
    next();
});

app.get('/api/system/config', checkAuth, (req, res) => {
    const role = req.headers['x-user-role'];
    if (role === 'OWNER' || role === 'CO_CEO') {
        return res.json({ masterKey: currentVaultKey || process.env.MASTER_KEY || 'demo-key' });
    }
    res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
});

app.post('/api/system/vault-key', checkAuth, async (req, res) => {
    const role = req.headers['x-user-role'];
    if (role !== 'OWNER' && role !== 'CO_CEO') return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
    
    const { key } = req.body;
    if (!key || key.length < 32) return res.status(400).json({ error: "INVALID_KEY" });
    
    try {
        await query('UPDATE vault_key SET encrypted_key = ? WHERE id = 1', [key]);
        currentVaultKey = key;
        console.log('[SECURITY] Vault Key Rotated via Admin');
        res.json({ status: "ok" });
    } catch (e) { 
        console.error('[SECURITY] Vault Key Update Fault:', e);
        res.status(500).json({ error: "DB_FAULT" }); 
    }
});

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
        res.json(result.rows.map((r: any) => {
            const data = r.data ? JSON.parse(r.data) : {};
            return { 
                ...data,
                id: r.id,
                houseId: r.houseId,
                species: r.species,
                nickname: JSON.parse(r.nickname),
                images: JSON.parse(r.images),
                logs: JSON.parse(r.logs),
                lastWatered: r.lastWatered,
                updatedAt: r.updatedAt
            };
        }));
    } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.post('/api/plants', checkAuth, checkHouseAccess, async (req, res) => {
    try {
        const p = req.body;
        const role = (req as any).userRole;
        
        if (role === 'SEASONAL') return res.status(403).json({ error: "READ_ONLY_ACCESS" });
        
        await query('INSERT OR REPLACE INTO plants (id, houseId, species, nickname, images, logs, lastWatered, updatedAt, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
            [p.id, p.houseId, p.species, JSON.stringify(p.nickname), JSON.stringify(p.images), JSON.stringify(p.logs), p.lastWatered, new Date().toISOString(), JSON.stringify(p)]);
        res.json({ status: "ok" });
    } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.delete('/api/plants/:id', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const role = (req as any).userRole;
        const houseId = (req as any).userHouseId;
        
        if (!['OWNER', 'CO_CEO', 'LEAD_HAND'].includes(role)) return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
        
        if (['LEAD_HAND'].includes(role)) {
            const check = await query('SELECT houseId FROM plants WHERE id = ?', [id]);
            if (check.rows.length > 0 && check.rows[0].houseId !== houseId) {
                return res.status(403).json({ error: "PROPERTY_ISOLATION_FAULT" });
            }
        }
        
        await query('DELETE FROM plants WHERE id = ?', [id]);
        res.json({ status: "ok" });
    } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.get('/api/houses', checkAuth, async (req, res) => {
    try {
        const role = (req as any).userRole;
        const houseId = (req as any).userHouseId;
        
        let sql = 'SELECT * FROM houses';
        let params: any[] = [];
        
        if (!['OWNER', 'CO_CEO'].includes(role)) {
            // LEAD_HAND, GARDENER, SEASONAL can only see their own house
            if (!houseId) return res.json([]); // No house assigned
            sql += ' WHERE id = ?';
            params.push(houseId);
        }
        
        const result = await query(sql, params);
        res.json(result.rows.map((r: any) => {
            const data = r.data ? JSON.parse(r.data) : {};
            return { 
                ...data,
                id: r.id,
                name: JSON.parse(r.name),
                googleApiKey: r.googleApiKey,
                createdAt: r.createdAt
            };
        }));
    } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.post('/api/houses', checkAuth, async (req, res) => {
    try {
        const h = req.body;
        const role = (req as any).userRole;
        const userHouseId = (req as any).userHouseId;

        // Only OWNER and CO_CEO can create new houses or update any house
        // LEAD_HAND can only update their own house
        if (!['OWNER', 'CO_CEO', 'LEAD_HAND'].includes(role)) {
            return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
        }

        if (role === 'LEAD_HAND' && h.id !== userHouseId) {
            return res.status(403).json({ error: "PROPERTY_ISOLATION_FAULT" });
        }

        await query('INSERT OR REPLACE INTO houses (id, name, googleApiKey, createdAt, data) VALUES (?, ?, ?, ?, ?)', 
            [h.id, JSON.stringify(h.name), h.googleApiKey, h.createdAt, JSON.stringify(h)]);
        res.json({ status: "ok" });
    } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.delete('/api/houses/:id', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const role = (req as any).userRole;

        // Only OWNER and CO_CEO can delete houses
        if (!['OWNER', 'CO_CEO'].includes(role)) {
            return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
        }

        await query('DELETE FROM houses WHERE id = ?', [id]);
        res.json({ status: "ok" });
    } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

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
        res.json(result.rows.map((r: any) => {
            const data = r.data ? JSON.parse(r.data) : {};
            return { 
                ...data,
                id: r.id,
                houseId: r.houseId,
                plantIds: JSON.parse(r.plantIds),
                type: r.type,
                title: JSON.parse(r.title),
                description: JSON.parse(r.description),
                date: r.date,
                completed: r.completed === 1,
                completedAt: r.completedAt,
                recurrence: JSON.parse(r.recurrence)
            };
        }));
    } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.post('/api/tasks', checkAuth, checkHouseAccess, async (req, res) => {
    try {
        const t = req.body;
        const role = (req as any).userRole;
        if (role === 'SEASONAL') return res.status(403).json({ error: "READ_ONLY_ACCESS" });
        
        await query('INSERT OR REPLACE INTO tasks (id, houseId, plantIds, type, title, description, date, completed, completedAt, recurrence, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 
            [t.id, t.houseId, JSON.stringify(t.plantIds), t.type, JSON.stringify(t.title), JSON.stringify(t.description), t.date, t.completed ? 1 : 0, t.completedAt, JSON.stringify(t.recurrence), JSON.stringify(t)]);
        res.json({ status: "ok" });
    } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.delete('/api/tasks/:id', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const role = (req as any).userRole;
        const houseId = (req as any).userHouseId;
        
        if (!['OWNER', 'CO_CEO', 'LEAD_HAND', 'GARDENER'].includes(role)) return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
        
        if (['LEAD_HAND', 'GARDENER'].includes(role)) {
            const check = await query('SELECT houseId FROM tasks WHERE id = ?', [id]);
            if (check.rows.length > 0 && check.rows[0].houseId !== houseId) {
                return res.status(403).json({ error: "PROPERTY_ISOLATION_FAULT" });
            }
        }
        
        await query('DELETE FROM tasks WHERE id = ?', [id]);
        res.json({ status: "ok" });
    } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

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
        res.json(result.rows.map((r: any) => {
            const data = r.data ? JSON.parse(r.data) : {};
            return { 
                ...data,
                id: r.id,
                houseId: r.houseId,
                name: JSON.parse(r.name)
            };
        }));
    } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.post('/api/inventory', checkAuth, checkHouseAccess, async (req, res) => {
    try {
        const i = req.body;
        const role = (req as any).userRole;
        if (role === 'SEASONAL') return res.status(403).json({ error: "READ_ONLY_ACCESS" });
        
        await query('INSERT OR REPLACE INTO inventory (id, houseId, name, data) VALUES (?, ?, ?, ?)', 
            [i.id, i.houseId, JSON.stringify(i.name), JSON.stringify(i)]);
        res.json({ status: "ok" });
    } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.delete('/api/inventory', checkAuth, async (req, res) => {
    try {
        const id = req.query.id as string;
        const role = (req as any).userRole;
        const houseId = (req as any).userHouseId;
        
        if (!id) return res.status(400).json({ error: "ID_REQUIRED" });
        if (!['OWNER', 'CO_CEO', 'LEAD_HAND', 'GARDENER'].includes(role)) return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
        
        if (['LEAD_HAND', 'GARDENER'].includes(role)) {
            const check = await query('SELECT houseId FROM inventory WHERE id = ?', [id]);
            if (check.rows.length > 0 && check.rows[0].houseId !== houseId) {
                return res.status(403).json({ error: "PROPERTY_ISOLATION_FAULT" });
            }
        }
        
        await query('DELETE FROM inventory WHERE id = ?', [id]);
        res.json({ status: "ok" });
    } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.get('/api/system/backup', checkAuth, async (req, res) => {
    try {
        console.log('[BACKUP] Starting system backup...');
        const [plants, houses, tasks, users, inventory] = await Promise.all([
            query('SELECT * FROM plants'),
            query('SELECT * FROM houses'),
            query('SELECT * FROM tasks'),
            query('SELECT * FROM users'),
            query('SELECT * FROM inventory')
        ]);
        
        const buildJsonArray = (rows: any[], jsonFields: string[]) => {
            return '[' + rows.map(r => {
                const parts = [];
                for (const key in r) {
                    if (jsonFields.includes(key) && typeof r[key] === 'string' && (r[key].startsWith('{') || r[key].startsWith('[')) && r[key] !== '[object Object]') {
                        parts.push(`${JSON.stringify(key)}:${r[key]}`);
                    } else {
                        parts.push(`${JSON.stringify(key)}:${JSON.stringify(r[key])}`);
                    }
                }
                return '{' + parts.join(',') + '}';
            }).join(',') + ']';
        };

        const backupStr = '{' +
            '"plants":' + buildJsonArray(plants.rows, ['nickname', 'images', 'logs', 'data']) + ',' +
            '"houses":' + buildJsonArray(houses.rows, ['name', 'data']) + ',' +
            '"tasks":' + buildJsonArray(tasks.rows, ['title', 'description', 'plantIds', 'recurrence', 'data']) + ',' +
            '"users":' + buildJsonArray(users.rows, ['name']) + ',' +
            '"inventory":' + buildJsonArray(inventory.rows, ['name', 'data']) +
        '}';
        
        console.log('[BACKUP] Backup generated successfully');
        res.setHeader('Content-Type', 'application/json');
        res.send(backupStr);
    } catch (e) { 
        console.error('[BACKUP] Backup Fault:', e);
        res.status(500).json({ error: "BACKUP_FAULT" }); 
    }
});

app.post('/api/system/restore', checkAuth, async (req, res) => {
    try {
        const { data, backupKey } = req.body;
        console.log('[ADMIN] Restore request received. Encrypted:', !!backupKey);
        
        let decoded: any;
        if (backupKey) {
            // Decrypt with backup key if provided
            try {
                const key = deriveKey(backupKey);
                const combined = Buffer.from(data, 'base64');
                const iv = combined.slice(0, 12);
                const authTag = combined.slice(combined.length - 16);
                const ciphertext = combined.slice(12, combined.length - 16);
                const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
                decipher.setAuthTag(authTag);
                let decrypted = decipher.update(ciphertext);
                decrypted = Buffer.concat([decrypted, decipher.final()]);
                decoded = JSON.parse(decrypted.toString('utf8'));
            } catch (e) {
                console.error('[ADMIN] Decryption failed with backup key:', e);
                return res.status(400).json({ error: "INVALID_BACKUP_KEY" });
            }
        } else {
            decoded = typeof data === 'string' ? JSON.parse(data) : data;
        }
        
        if (!decoded || (!decoded.plants && !decoded.houses && !decoded.tasks && !decoded.users && !decoded.inventory)) {
            console.error('[ADMIN] Invalid backup format:', decoded);
            return res.status(400).json({ error: "INVALID_BACKUP_FORMAT" });
        }

        await query('DELETE FROM plants');
        await query('DELETE FROM houses');
        await query('DELETE FROM tasks');
        await query('DELETE FROM inventory');
        
        // Only delete users if the backup contains users, to avoid locking out the admin
        if (decoded.users && decoded.users.length > 0) {
            await query('DELETE FROM users');
            for (const u of decoded.users) {
                const nameStr = typeof u.name === 'object' ? JSON.stringify(u.name) : u.name;
                await query('INSERT INTO users (id, email, name, role, houseId, personalAiKey, personalAiKeyTestedAt, deletedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
                    [u.id, u.email, nameStr, u.role, u.houseId, u.personalAiKey, u.personalAiKeyTestedAt, u.deletedAt]);
            }
        }
        
        if (decoded.plants) {
            for (const p of decoded.plants) {
                const dataStr = typeof p.data === 'object' ? JSON.stringify(p.data) : (p.data || JSON.stringify(p));
                await query('INSERT INTO plants (id, houseId, species, nickname, images, logs, lastWatered, updatedAt, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
                    [p.id, p.houseId, p.species, JSON.stringify(p.nickname), JSON.stringify(p.images), JSON.stringify(p.logs), p.lastWatered, p.updatedAt, dataStr]);
            }
        }
        if (decoded.houses) {
            for (const h of decoded.houses) {
                const dataStr = typeof h.data === 'object' ? JSON.stringify(h.data) : (h.data || JSON.stringify(h));
                await query('INSERT INTO houses (id, name, googleApiKey, createdAt, data) VALUES (?, ?, ?, ?, ?)', 
                    [h.id, JSON.stringify(h.name), h.googleApiKey, h.createdAt, dataStr]);
            }
        }
        if (decoded.tasks) {
            for (const t of decoded.tasks) {
                const dataStr = typeof t.data === 'object' ? JSON.stringify(t.data) : (t.data || JSON.stringify(t));
                await query('INSERT INTO tasks (id, houseId, plantIds, type, title, description, date, completed, completedAt, recurrence, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 
                    [t.id, t.houseId, JSON.stringify(t.plantIds), t.type, JSON.stringify(t.title), JSON.stringify(t.description), t.date, t.completed ? 1 : 0, t.completedAt, JSON.stringify(t.recurrence), dataStr]);
            }
        }
        if (decoded.inventory) {
            for (const i of decoded.inventory) {
                const dataStr = typeof i.data === 'object' ? JSON.stringify(i.data) : (i.data || JSON.stringify(i));
                await query('INSERT INTO inventory (id, houseId, name, data) VALUES (?, ?, ?, ?)', 
                    [i.id, i.houseId, JSON.stringify(i.name), dataStr]);
            }
        }
        
        console.log('[ADMIN] System Restore Successful');
        res.json({ status: "ok" });
    } catch (e) { 
        console.error('[ADMIN] Restore Fault:', e);
        res.status(500).json({ error: "RESTORE_FAULT" }); 
    }
});

app.get('/api/system/logs', checkAuth, async (req, res) => {
    res.json([
        { id: '1', event: 'SYSTEM_BOOT', details: 'Verdant Core initialized', level: 'INFO', created_at: new Date().toISOString() },
        { id: '2', event: 'DB_SYNC', details: 'Proxmox node synchronized', level: 'INFO', created_at: new Date().toISOString() }
    ]);
});

app.get('/api/users', checkAuth, async (req, res) => {
    try {
        const role = (req as any).userRole;
        const houseId = (req as any).userHouseId;

        let sql = 'SELECT * FROM users WHERE deletedAt IS NULL';
        let params: any[] = [];

        if (role === 'LEAD_HAND') {
            // LEAD_HAND can only see GARDENER and SEASONAL in their house
            sql += ' AND houseId = ? AND role IN ("GARDENER", "SEASONAL")';
            params.push(houseId);
        } else if (!['OWNER', 'CO_CEO'].includes(role)) {
            // Others can only see themselves? Or maybe just restricted
            sql += ' AND id = ?';
            params.push(req.headers['x-user-id'] || ''); // Assuming we pass user id
        }

        const result = await query(sql, params);
        res.json(result.rows.map((r: any) => ({ 
            ...r, 
            name: r.name && (r.name.startsWith('{') || r.name.startsWith('[')) ? JSON.parse(r.name) : r.name 
        })));
    } catch (e) { res.status(500).json({ error: "DB_FAULT" }); }
});

app.post('/api/users', checkAuth, async (req, res) => {
    try {
        const u = req.body;
        const role = (req as any).userRole;
        const userHouseId = (req as any).userHouseId;

        // LEAD_HAND restrictions
        if (role === 'LEAD_HAND') {
            // Can only create GARDENER or SEASONAL
            if (!['GARDENER', 'SEASONAL'].includes(u.role)) {
                return res.status(403).json({ error: "UNAUTHORIZED_ROLE_CREATION" });
            }
            // Must be assigned to their house
            u.houseId = userHouseId;
        } else if (!['OWNER', 'CO_CEO'].includes(role)) {
            // Others cannot create users
            return res.status(403).json({ error: "INSUFFICIENT_CLEARANCE" });
        }

        await query('INSERT OR REPLACE INTO users (id, email, name, role, houseId, personalAiKey, personalAiKeyTestedAt, deletedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
            [u.id, u.email, typeof u.name === 'object' ? JSON.stringify(u.name) : u.name, u.role, u.houseId, u.personalAiKey, u.personalAiKeyTestedAt, u.deletedAt]);
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

async function setupMiddlewareAndStart() {
  process.env.NODE_ENV = 'development';
  console.log('[CORE] NODE_ENV:', process.env.NODE_ENV);
  
  const vitePromise = process.env.NODE_ENV !== 'production' 
    ? import('vite').then(m => m.createServer({ server: { middlewareMode: true } }))
    : Promise.resolve(null);

  server.listen(port, '0.0.0.0', async () => {
    console.log(`Verdant Core Active on ${port}`);
    const vite = await vitePromise;
    if (vite) {
      app.use(vite.middlewares);
      console.log('[CORE] Vite Middleware Ready');
    } else {
      // Correctly serve both public and dist directories
      app.use(express.static(path.join(__dirname, 'public')));
      app.use(express.static(path.join(__dirname, 'dist')));
      app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
    }
  });
}

async function initializeDatabase() {
  return new Promise<void>((resolve, reject) => {
    db.serialize(() => {
      try {
        db.run(`CREATE TABLE IF NOT EXISTS vault_key (id INTEGER PRIMARY KEY CHECK (id = 1), encrypted_key TEXT NOT NULL)`);
        db.run(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, role TEXT DEFAULT 'OWNER', houseId TEXT, personalAiKey TEXT, personalAiKeyTestedAt TEXT, deletedAt TEXT, caretakerStart TEXT, caretakerEnd TEXT)`);
        
        // Migration: Add missing columns
        const migrations = [
          { table: 'users', columns: [['houseId', 'TEXT'], ['personalAiKey', 'TEXT'], ['personalAiKeyTestedAt', 'TEXT'], ['deletedAt', 'TEXT'], ['caretakerStart', 'TEXT'], ['caretakerEnd', 'TEXT']] },
          { table: 'plants', columns: [['houseId', 'TEXT'], ['species', 'TEXT'], ['nickname', 'TEXT'], ['images', 'TEXT'], ['logs', 'TEXT'], ['lastWatered', 'TEXT'], ['updatedAt', 'TEXT'], ['data', 'TEXT']] },
          { table: 'tasks', columns: [['houseId', 'TEXT'], ['plantIds', 'TEXT'], ['type', 'TEXT'], ['title', 'TEXT'], ['description', 'TEXT'], ['date', 'TEXT'], ['completed', 'INTEGER'], ['completedAt', 'TEXT'], ['recurrence', 'TEXT'], ['data', 'TEXT']] },
          { table: 'houses', columns: [['googleApiKey', 'TEXT'], ['createdAt', 'TEXT'], ['data', 'TEXT']] },
          { table: 'inventory', columns: [['houseId', 'TEXT'], ['name', 'TEXT'], ['data', 'TEXT']] }
        ];

        migrations.forEach(m => {
          m.columns.forEach(([col, type]) => {
            db.run(`ALTER TABLE ${m.table} ADD COLUMN ${col} ${type}`, (err) => {
              if (err && !err.message.includes('duplicate column name')) {
                console.error(`[DB] Migration Error (${m.table}.${col}):`, err.message);
              }
            });
          });
        });

        db.run(`CREATE TABLE IF NOT EXISTS plants (id TEXT PRIMARY KEY, houseId TEXT, species TEXT, nickname TEXT, images TEXT, logs TEXT, lastWatered TEXT, updatedAt TEXT, data TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS houses (id TEXT PRIMARY KEY, name TEXT, googleApiKey TEXT, createdAt TEXT, data TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, houseId TEXT, plantIds TEXT, type TEXT, title TEXT, description TEXT, date TEXT, completed INTEGER, completedAt TEXT, recurrence TEXT, data TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS inventory (id TEXT PRIMARY KEY, houseId TEXT, name TEXT, data TEXT)`, () => {
          console.log('[DB] Schema Verified');
          resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}
