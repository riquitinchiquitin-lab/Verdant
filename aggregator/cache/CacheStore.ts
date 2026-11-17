import sqlite3 from 'sqlite3';
import path from 'path';
import { MunicipalTreeRecord } from '../models/BotanicalSpecies';

export class CacheStore {
  private db: sqlite3.Database | null = null;
  private memoryCache = new Map<string, { value: any; expiresAt: number }>();
  private municipalTrees: MunicipalTreeRecord[] = [];
  private readyPromise: Promise<void>;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || path.join(process.cwd(), 'aggregator-cache.sqlite');
    this.readyPromise = this.init(resolvedPath);
  }

  private init(dbPath: string): Promise<void> {
    return new Promise((resolve) => {
      try {
        this.db = new sqlite3.Database(dbPath, (err) => {
          if (err) {
            this.db = null;
            return resolve();
          }
          this.db!.serialize(() => {
            this.db!.run(
              `CREATE TABLE IF NOT EXISTS api_cache (
                cache_key TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                expires_at INTEGER NOT NULL
              )`
            );
            this.db!.run(
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
              )`,
              () => resolve()
            );
          });
        });
      } catch {
        this.db = null;
        resolve();
      }
    });
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
    return new Promise((resolve) => {
      this.db!.get(
        'SELECT payload, expires_at FROM api_cache WHERE cache_key = ?',
        [key],
        (err, row: any) => {
          if (err || !row) return resolve(null);
          if (row.expires_at <= now) {
            this.db!.run('DELETE FROM api_cache WHERE cache_key = ?', [key]);
            return resolve(null);
          }
          try {
            const parsed = JSON.parse(row.payload);
            this.memoryCache.set(key, { value: parsed, expiresAt: row.expires_at });
            resolve(parsed as T);
          } catch {
            resolve(null);
          }
        }
      );
    });
  }

  async set(key: string, value: any, ttlMs: number = 1000 * 60 * 60 * 24): Promise<void> {
    await this.readyPromise;
    const expiresAt = Date.now() + ttlMs;
    this.memoryCache.set(key, { value, expiresAt });

    if (!this.db) return;
    return new Promise((resolve) => {
      this.db!.run(
        'INSERT OR REPLACE INTO api_cache (cache_key, payload, expires_at) VALUES (?, ?, ?)',
        [key, JSON.stringify(value), expiresAt],
        () => resolve()
      );
    });
  }

  async addMunicipalTrees(records: MunicipalTreeRecord[]): Promise<number> {
    await this.readyPromise;
    this.municipalTrees.push(...records);
    if (!this.db) return records.length;

    return new Promise((resolve) => {
      const stmt = this.db!.prepare(
        `INSERT OR REPLACE INTO municipal_trees
         (id, species, genus, common_name, dbh_cm, latitude, longitude, municipality, neighborhood)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const r of records) {
        const id = r.id || `${r.municipality}:${r.species}:${r.latitude}:${r.longitude}`;
        stmt.run([
          id,
          r.species,
          r.genus || null,
          r.commonName || null,
          r.dbhCm ?? null,
          r.latitude,
          r.longitude,
          r.municipality,
          r.neighborhood || null,
        ]);
      }
      stmt.finalize(() => resolve(records.length));
    });
  }

  async findMunicipalTreesBySpecies(speciesName: string): Promise<MunicipalTreeRecord[]> {
    await this.readyPromise;
    const norm = speciesName.trim().toLowerCase();
    if (!this.db) {
      return this.municipalTrees.filter(t => t.species.toLowerCase().includes(norm));
    }

    return new Promise((resolve) => {
      this.db!.all(
        `SELECT id, species, genus, common_name as commonName, dbh_cm as dbhCm, latitude, longitude, municipality, neighborhood
         FROM municipal_trees WHERE LOWER(species) LIKE ? LIMIT 500`,
        [`%${norm}%`],
        (err, rows: any[]) => {
          if (err || !rows) {
            return resolve(this.municipalTrees.filter(t => t.species.toLowerCase().includes(norm)));
          }
          resolve(rows as MunicipalTreeRecord[]);
        }
      );
    });
  }

  async stats(): Promise<{ memoryEntries: number; sqliteEnabled: boolean }> {
    await this.readyPromise;
    return {
      memoryEntries: this.memoryCache.size,
      sqliteEnabled: Boolean(this.db),
    };
  }
}
