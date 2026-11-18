import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { MunicipalTreeRecord } from '../models/BotanicalSpecies';

export class CacheStore {
  private db: DatabaseSync | null = null;
  private memoryCache = new Map<string, { value: any; expiresAt: number }>();
  private municipalTrees: MunicipalTreeRecord[] = [];
  private readyPromise: Promise<void>;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || path.join(process.cwd(), 'aggregator-cache.sqlite');
    this.readyPromise = this.init(resolvedPath);
  }

  private async init(dbPath: string): Promise<void> {
    try {
      this.db = new DatabaseSync(dbPath);
      this.db.exec(
        `CREATE TABLE IF NOT EXISTS api_cache (
          cache_key TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        )`
      );
      this.db.exec(
        `CREATE TABLE IF NOT EXISTS municipal_trees (
          id TEXT PRIMARY KEY,
          species TEXT NOT NULL,
          genus TEXT,
          common_name TEXT,
          dbh_cm REAL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          municipality TEXT NOT NULL,
          neighborhood TEXT
        )`
      );
    } catch {
      this.db = null;
    }
  }

  async get<T = any>(key: string): Promise<T | null> {
    await this.readyPromise;
    const now = Date.now();
    const mem = this.memoryCache.get(key);
    if (mem) {
      if (mem.expiresAt > now) return mem.value as T;
      this.memoryCache.delete(key);
    }

    if (!this.db) return null;
    try {
      const row = this.db
        .prepare('SELECT payload, expires_at FROM api_cache WHERE cache_key = ?')
        .get(key) as any;
      if (!row) return null;
      if (row.expires_at <= now) {
        this.db.prepare('DELETE FROM api_cache WHERE cache_key = ?').run(key);
        return null;
      }
      const parsed = JSON.parse(row.payload);
      this.memoryCache.set(key, { value: parsed, expiresAt: row.expires_at });
      return parsed as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: any, ttlMs: number = 1000 * 60 * 60 * 24): Promise<void> {
    await this.readyPromise;
    const expiresAt = Date.now() + ttlMs;
    this.memoryCache.set(key, { value, expiresAt });

    if (!this.db) return;
    try {
      this.db
        .prepare('INSERT OR REPLACE INTO api_cache (cache_key, payload, expires_at) VALUES (?, ?, ?)')
        .run(key, JSON.stringify(value), expiresAt);
    } catch {
      // Ignore transient cache write errors
    }
  }

  async addMunicipalTrees(records: MunicipalTreeRecord[]): Promise<number> {
    await this.readyPromise;
    this.municipalTrees.push(...records);
    if (!this.db) return records.length;

    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO municipal_trees
       (id, species, genus, common_name, dbh_cm, latitude, longitude, municipality, neighborhood)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const r of records) {
      const id = r.id || `${r.municipality}:${r.species}:${r.latitude}:${r.longitude}`;
      stmt.run(
        id,
        r.species,
        r.genus ?? null,
        r.commonName ?? null,
        r.dbhCm ?? null,
        r.latitude,
        r.longitude,
        r.municipality,
        r.neighborhood ?? null
      );
    }
    return records.length;
  }

  async findMunicipalTreesBySpecies(speciesName: string): Promise<MunicipalTreeRecord[]> {
    await this.readyPromise;
    const norm = speciesName.trim().toLowerCase();
    if (!this.db) {
      return this.municipalTrees.filter(t => t.species.toLowerCase().includes(norm));
    }

    try {
      const rows = this.db
        .prepare(
          `SELECT id, species, genus, common_name as commonName, dbh_cm as dbhCm, latitude, longitude, municipality, neighborhood
           FROM municipal_trees WHERE LOWER(species) LIKE ? LIMIT 500`
        )
        .all(`%${norm}%`) as unknown as MunicipalTreeRecord[];
      return rows || [];
    } catch {
      return this.municipalTrees.filter(t => t.species.toLowerCase().includes(norm));
    }
  }

  async stats(): Promise<{ memoryEntries: number; sqliteEnabled: boolean }> {
    await this.readyPromise;
    return {
      memoryEntries: this.memoryCache.size,
      sqliteEnabled: Boolean(this.db),
    };
  }
}
