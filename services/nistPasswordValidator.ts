import crypto from 'crypto';

/**
 * NIST SP 800-63B Compliant Password Validator & HIBP k-Anonymity Checker
 *
 * Implements:
 * 1. Unicode NFKC normalization before validation & hashing
 * 2. Length over arbitrary complexity rules (min 8, recommended 15+, max 256)
 * 3. Context-specific term screening (app terms, name, email)
 * 4. Repetitive & sequential pattern detection
 * 5. Offline breached blocklist + Have I Been Pwned (HIBP) k-Anonymity API
 */

export const NIST_CONFIG = {
  MIN_LENGTH: 8,
  RECOMMENDED_MIN_LENGTH: 15,
  MAX_LENGTH: 256,
  APP_TERMS: ['verdant', 'botanical', 'greenhouse'],
};

const OFFLINE_BREACHED_BLOCKLIST = new Set([
  'password',
  'password123',
  'password1',
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty',
  'qwertyuiop',
  'azerty',
  'asdfghjkl',
  'admin',
  'admin123',
  'admin1234',
  'administrator',
  'welcome',
  'welcome123',
  'letmein',
  'letmein123',
  'monkey',
  'dragon',
  'master',
  'sunshine',
  'princess',
  'football',
  'charlie',
  'shadow',
  'superman',
  'trustno1',
  'iloveyou',
  'passcode',
  'root123',
  'default',
  'changeme',
  'verdant123',
]);

const SEQUENCES = [
  '0123456789',
  '9876543210',
  'abcdefghijklmnopqrstuvwxyz',
  'zyxwvutsrqponmlkjihgfedcba',
  'qwertyuiopasdfghjklzxcvbnm',
  'azertyuiopqsdfghjklmwxcvbn',
];

export function normalizeUnicode(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input.normalize('NFKC');
}

export async function checkPwnedPassword(normalizedPassword: string): Promise<{
  checked: boolean;
  isPwned: boolean;
  count: number;
  error?: string;
}> {
  try {
    const sha1 = crypto
      .createHash('sha1')
      .update(normalizedPassword)
      .digest('hex')
      .toUpperCase();

    const prefix = sha1.substring(0, 5);
    const suffix = sha1.substring(5);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: {
        'User-Agent': 'Verdant-NIST-SP80063B-Validator',
        'Add-Padding': 'true',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { checked: false, isPwned: false, count: 0 };
    }

    const text = await response.text();
    const lines = text.split('\r\n');

    for (const line of lines) {
      const [hashSuffix, countStr] = line.split(':');
      if (hashSuffix && hashSuffix.trim().toUpperCase() === suffix) {
        const count = parseInt(countStr.trim(), 10) || 1;
        return { checked: true, isPwned: true, count };
      }
    }

    return { checked: true, isPwned: false, count: 0 };
  } catch (err: any) {
    return { checked: false, isPwned: false, count: 0, error: err?.message };
  }
}

export function estimateEntropy(normalizedPassword: string): number {
  if (!normalizedPassword) return 0;
  const len = normalizedPassword.length;

  const words = normalizedPassword.trim().split(/[\s\-_]+/);
  if (words.length >= 3 && words.every((w) => w.length >= 2)) {
    return Math.round(words.length * 12.9);
  }

  let poolSize = 0;
  if (/[a-z]/.test(normalizedPassword)) poolSize += 26;
  if (/[A-Z]/.test(normalizedPassword)) poolSize += 26;
  if (/[0-9]/.test(normalizedPassword)) poolSize += 10;
  if (/[^a-zA-Z0-9]/.test(normalizedPassword)) poolSize += 33;

  if (poolSize === 0) return 0;
  return Math.round(len * (Math.log(poolSize) / Math.log(2)));
}

export interface NistValidationResult {
  isValid: boolean;
  nistCompliant: boolean;
  errors: string[];
  warnings: string[];
  feedback: string[];
  entropyBits: number;
  length: number;
  isPwned: boolean;
  pwnedCount: number;
  normalized: string;
}

export async function validatePasswordNist(
  password: string,
  context: { name?: string; email?: string } = {}
): Promise<NistValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const feedback: string[] = [];

  const normalized = normalizeUnicode(password);

  if (!normalized || normalized.length < NIST_CONFIG.MIN_LENGTH) {
    errors.push(
      `Password must be at least ${NIST_CONFIG.MIN_LENGTH} characters long (NIST SP 800-63B requirement).`
    );
  }

  if (normalized.length > NIST_CONFIG.MAX_LENGTH) {
    errors.push(
      `Password exceeds maximum allowable length of ${NIST_CONFIG.MAX_LENGTH} characters.`
    );
  }

  if (
    normalized.length >= NIST_CONFIG.MIN_LENGTH &&
    normalized.length < NIST_CONFIG.RECOMMENDED_MIN_LENGTH
  ) {
    warnings.push(
      'NIST recommends 15+ characters or a multi-word passphrase when passwords act as a primary authentication factor.'
    );
  }

  const lower = normalized.toLowerCase();
  const contextTerms = [
    ...NIST_CONFIG.APP_TERMS,
    context.name ? context.name.toLowerCase() : null,
    context.email ? context.email.toLowerCase() : null,
    context.email && context.email.includes('@')
      ? context.email.split('@')[0].toLowerCase()
      : null,
  ].filter((t): t is string => Boolean(t));

  for (const term of contextTerms) {
    if (term.length >= 3 && lower.includes(term)) {
      if (normalized.length >= 15) {
        warnings.push(
          `NIST advisory: Password contains term ("${term}"). Consider avoiding application or account names in passphrases.`
        );
      } else {
        errors.push(
          `Password must not contain context-specific terms such as your name, email, or application name ("${term}").`
        );
        break;
      }
    }
  }

  if (/(.)\1{3,}/.test(normalized)) {
    errors.push(
      'Password contains repetitive character patterns (e.g. 4+ repeated characters).'
    );
  }

  for (const seq of SEQUENCES) {
    for (let i = 0; i <= seq.length - 5; i++) {
      const slice = seq.substring(i, i + 5);
      if (lower.includes(slice)) {
        errors.push(
          `Password contains predictable sequential characters ("${slice}"). Choose non-sequential phrases.`
        );
        break;
      }
    }
    if (errors.length > 3) break;
  }

  if (OFFLINE_BREACHED_BLOCKLIST.has(lower)) {
    errors.push(
      'This password is a known compromised password found on common breach blocklists. Choose a unique passphrase.'
    );
  }

  let isPwned = false;
  let pwnedCount = 0;
  if (errors.length === 0 && normalized.length >= NIST_CONFIG.MIN_LENGTH) {
    const pwnedResult = await checkPwnedPassword(normalized);
    if (pwnedResult.isPwned) {
      isPwned = true;
      pwnedCount = pwnedResult.count;
      errors.push(
        `Compromised credential alert: This password has appeared in ${pwnedResult.count.toLocaleString()} known data breaches according to Have I Been Pwned. Choose a unique passphrase.`
      );
    }
  }

  const entropyBits = estimateEntropy(normalized);

  if (normalized.length >= 15) {
    feedback.push(
      'Excellent length meeting NIST SP 800-63B high-entropy guidance (15+ characters).'
    );
  }
  if (normalized.includes(' ') || normalized.includes('-')) {
    feedback.push(
      'Multi-word passphrase structure detected, providing high entropy with memorability.'
    );
  }
  if (entropyBits >= 64) {
    feedback.push(`High estimated cryptographic entropy (${entropyBits} bits).`);
  }

  return {
    isValid: errors.length === 0,
    nistCompliant: errors.length === 0 && normalized.length >= NIST_CONFIG.MIN_LENGTH,
    errors,
    warnings,
    feedback,
    entropyBits,
    length: normalized.length,
    isPwned,
    pwnedCount,
    normalized,
  };
}
