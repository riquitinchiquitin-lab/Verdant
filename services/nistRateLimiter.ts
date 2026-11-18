/**
 * NIST SP 800-63B Compliant Rate Limiter & Progressive Delay Throttler
 *
 * Uses progressive delays after repeated failures instead of permanent account
 * lockouts (preventing DoS account-lockout attacks).
 */

interface ThrottleEntry {
  count: number;
  lastAttempt: number;
  history: number[];
}

class NistProgressiveThrottler {
  private attempts = new Map<string, ThrottleEntry>();
  private readonly WINDOW_MS = 15 * 60 * 1000; // 15 minutes

  private getKey(ip: string, identifier?: string): string {
    const cleanUser = (identifier || 'anonymous').trim().toLowerCase();
    const cleanIp = (ip || 'local').trim();
    return `${cleanIp}:${cleanUser}`;
  }

  private cleanupOldAttempts(entry: ThrottleEntry): void {
    const now = Date.now();
    entry.history = entry.history.filter((ts) => now - ts < this.WINDOW_MS);
    entry.count = entry.history.length;
  }

  getDelayMs(failedCount: number): number {
    if (failedCount <= 1) return 0;
    if (failedCount === 2) return 500;
    if (failedCount === 3) return 1500;
    if (failedCount === 4) return 3000;
    if (failedCount >= 5) return Math.min(10000, 4000 + (failedCount - 4) * 1500);
    return 0;
  }

  check(ip: string, identifier?: string): {
    throttled: boolean;
    delayMs: number;
    failedCount: number;
    message?: string;
  } {
    const key = this.getKey(ip, identifier);
    const entry = this.attempts.get(key);

    if (!entry) {
      return { throttled: false, delayMs: 0, failedCount: 0 };
    }

    this.cleanupOldAttempts(entry);
    if (entry.count === 0) {
      this.attempts.delete(key);
      return { throttled: false, delayMs: 0, failedCount: 0 };
    }

    const delayMs = this.getDelayMs(entry.count);
    const timeSinceLast = Date.now() - entry.lastAttempt;

    if (timeSinceLast < delayMs) {
      const waitRemainingMs = delayMs - timeSinceLast;
      return {
        throttled: true,
        delayMs: waitRemainingMs,
        failedCount: entry.count,
        message: `Rate limited due to repeated failed attempts. Please wait ${(waitRemainingMs / 1000).toFixed(1)}s before retrying.`,
      };
    }

    return { throttled: false, delayMs, failedCount: entry.count };
  }

  private readonly MAX_ENTRIES = 10000;

  private pruneExpired(): void {
    const now = Date.now();
    for (const [k, entry] of this.attempts.entries()) {
      if (now - entry.lastAttempt >= this.WINDOW_MS) {
        this.attempts.delete(k);
      }
    }
    if (this.attempts.size > this.MAX_ENTRIES) {
      const overflow = this.attempts.size - this.MAX_ENTRIES;
      let removed = 0;
      for (const k of this.attempts.keys()) {
        this.attempts.delete(k);
        if (++removed >= overflow) break;
      }
    }
  }

  recordFailure(ip: string, identifier?: string): { failedCount: number; delayMs: number } {
    if (this.attempts.size >= this.MAX_ENTRIES) {
      this.pruneExpired();
    }
    const key = this.getKey(ip, identifier);
    const now = Date.now();
    let entry = this.attempts.get(key);

    if (!entry) {
      entry = { count: 0, lastAttempt: now, history: [] };
      this.attempts.set(key, entry);
    }

    entry.history.push(now);
    entry.lastAttempt = now;
    this.cleanupOldAttempts(entry);

    return {
      failedCount: entry.count,
      delayMs: this.getDelayMs(entry.count),
    };
  }

  recordSuccess(ip: string, identifier?: string): void {
    const key = this.getKey(ip, identifier);
    this.attempts.delete(key);
  }
}

export const nistRateLimiter = new NistProgressiveThrottler();
