import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import readline from 'readline';
import dotenv from 'dotenv';
import argon2 from 'argon2';
import { validatePasswordNist } from '../services/nistPasswordValidator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(rootDir, '.env') });

const dataDir = path.join(rootDir, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
}
const dbPath = path.join(dataDir, 'verdant.db');

const db = new DatabaseSync(dbPath);
const query = async (sql: string, params: any[] = []): Promise<any> => {
  const safeParams = params.map((p) => (p === undefined ? null : p));
  const stmt = db.prepare(sql);
  if (sql.trim().toUpperCase().startsWith('SELECT')) {
    return { rows: stmt.all(...safeParams) || [], lastID: undefined, changes: 0 };
  }
  const info = stmt.run(...safeParams);
  return { rows: [], lastID: Number(info.lastInsertRowid), changes: Number(info.changes) };
};

const prompt = (question: string): Promise<string> => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
};

async function main() {
  await query(
    `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, role TEXT DEFAULT 'OWNER', houseId TEXT, personalAiKey TEXT, personalAiKeyTestedAt TEXT, deletedAt TEXT, caretakerStart TEXT, caretakerEnd TEXT, passwordHash TEXT, totpSecret TEXT, totpEnabled INTEGER DEFAULT 0, recoveryCodes TEXT)`
  );

  let email = (process.env.VERDANT_ADMIN_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  let name = (process.env.VERDANT_ADMIN_NAME || process.env.ADMIN_NAME || '').trim();
  const password = process.env.VERDANT_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || '';

  if (!email) {
    const existingOwner = await query("SELECT email, name FROM users WHERE role = 'OWNER' AND deletedAt IS NULL LIMIT 1");
    const defaultEmail = existingOwner.rows[0]?.email || '';
    const input = await prompt(
      defaultEmail ? `Admin / User Email [${defaultEmail}]: ` : 'Admin / User Email: '
    );
    email = (input || defaultEmail).trim().toLowerCase();
  }

  if (!email || !email.includes('@')) {
    console.error('[ERROR] A valid email address is required.');
    process.exit(1);
  }

  if (!password) {
    console.error('[ERROR] VERDANT_ADMIN_PASSWORD is required (use scripts/change-password.sh).');
    process.exit(1);
  }

  const nist = await validatePasswordNist(password, { email, name });
  if (!nist.isValid) {
    console.error('[ERROR] Password rejected by NIST SP 800-63B policy:');
    for (const err of nist.errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  const pwHash = await argon2.hash(nist.normalized, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  const existing = await query('SELECT * FROM users WHERE LOWER(email) = ? AND deletedAt IS NULL', [email]);
  if (existing.rows.length > 0) {
    await query('UPDATE users SET passwordHash = ? WHERE id = ?', [pwHash, existing.rows[0].id]);
    console.log(`[OK] Updated Argon2id password for ${email} (role: ${existing.rows[0].role}).`);
  } else {
    const id = `u-${crypto.randomUUID()}`;
    const displayName = name || 'System Owner';
    await query(
      'INSERT INTO users (id, email, name, role, houseId, passwordHash) VALUES (?, ?, ?, ?, ?, ?)',
      [id, email, displayName, 'OWNER', null, pwHash]
    );
    console.log(`[OK] Created OWNER account ${email} with Argon2id password.`);
  }

  db.close();
}

main().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
