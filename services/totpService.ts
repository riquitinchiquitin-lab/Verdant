import crypto from 'crypto';

/**
 * Standard RFC 6238 TOTP (Time-Based One-Time Password) & Recovery Codes
 * Zero external dependencies — uses native Node.js crypto.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(length = 20): string {
  const randomBytes = crypto.randomBytes(length);
  let base32 = '';
  let bits = 0;
  let value = 0;

  for (let i = 0; i < randomBytes.length; i++) {
    value = (value << 8) | randomBytes[i];
    bits += 8;

    while (bits >= 5) {
      base32 += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    base32 += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return base32;
}

function base32ToBuffer(base32: string): Buffer {
  const clean = base32.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateTotpCode(
  secret: string,
  timeStepOffset = 0,
  timestampMs = Date.now()
): string {
  const key = base32ToBuffer(secret);
  const timeStep = 30;
  const counter = Math.floor(timestampMs / 1000 / timeStep) + timeStepOffset;

  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter), 0);

  const hmac = crypto.createHmac('sha1', key);
  hmac.update(counterBuffer);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

export function verifyTotpCode(secret: string, token: string, window = 1): boolean {
  if (!secret || !token) return false;
  const normalizedToken = String(token).trim().replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalizedToken)) return false;

  for (let offset = -window; offset <= window; offset++) {
    const expected = generateTotpCode(secret, offset);
    if (crypto.timingSafeEqual(Buffer.from(normalizedToken), Buffer.from(expected))) {
      return true;
    }
  }
  return false;
}

export function generateOtpAuthUri(accountName: string, issuer: string, secret: string): string {
  const cleanIssuer = encodeURIComponent(issuer || 'Verdant');
  const cleanAccount = encodeURIComponent(accountName || 'User');
  return `otpauth://totp/${cleanIssuer}:${cleanAccount}?secret=${secret}&issuer=${cleanIssuer}&algorithm=SHA1&digits=6&period=30`;
}

export function generateRecoveryCodes(count = 8): { plain: string[]; hashed: string[] } {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
    const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    plain.push(formatted);
    hashed.push(hashRecoveryCode(formatted));
  }
  return { plain, hashed };
}

export function hashRecoveryCode(code: string): string {
  const clean = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return crypto.createHash('sha256').update(clean).digest('hex');
}
