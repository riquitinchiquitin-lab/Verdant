import { BotanicalProvider, BotanicalSpecies } from '../models/BotanicalSpecies';
import { CacheStore } from '../cache/CacheStore';

export abstract class BaseProvider implements BotanicalProvider {
  abstract readonly name: string;
  abstract readonly authorityRank: number;
  protected cache: CacheStore;

  constructor(cache: CacheStore) {
    this.cache = cache;
  }

  abstract searchByName(query: string): Promise<Partial<BotanicalSpecies> | null>;
  abstract getById(id: string | number): Promise<Partial<BotanicalSpecies> | null>;

  async syncBulk(_input?: unknown): Promise<number> {
    return 0;
  }

  protected async fetchJsonWithRetry<T = any>(
    url: string,
    options: RequestInit = {},
    maxRetries: number = 2,
    timeoutMs: number = 7000
  ): Promise<T | null> {
    const cacheKey = `${this.name}:url:${url}`;
    const cached = await this.cache.get<T>(cacheKey);
    if (cached !== null) return cached;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            'User-Agent': 'VerdantBotanicalAggregator/1.0',
            Accept: 'application/json',
            ...(options.headers || {}),
          },
        });
        clearTimeout(timer);

        if (res.status === 429 || res.status >= 500) {
          if (attempt < maxRetries) {
            const backoff = Math.pow(2, attempt) * 350 + Math.random() * 150;
            await new Promise((r) => setTimeout(r, backoff));
            continue;
          }
          return null;
        }

        if (!res.ok) return null;
        const json = (await res.json()) as T;
        await this.cache.set(cacheKey, json);
        return json;
      } catch {
        clearTimeout(timer);
        if (attempt < maxRetries) {
          const backoff = Math.pow(2, attempt) * 350 + Math.random() * 150;
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        return null;
      }
    }
    return null;
  }
}
