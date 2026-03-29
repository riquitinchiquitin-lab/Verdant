/**
 * VERDANT NEURAL ENCRYPTION SERVICE
 * Implements AES-256-GCM Payload Encryption for Frontend-Backend Communication
 */

const ENCRYPTION_ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const SALT = new TextEncoder().encode('verdant-botanical-protocol-v1');

/**
 * Derives a cryptographic key from a plain-text passphrase
 */
async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: SALT,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: ENCRYPTION_ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a JSON object into a base64-encoded encrypted string
 */
export async function encryptPayload(data: any, passphrase: string): Promise<string> {
  try {
    const key = await deriveKey(passphrase);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(JSON.stringify(data));

    const ciphertext = await window.crypto.subtle.encrypt(
      { name: ENCRYPTION_ALGORITHM, iv },
      key,
      encodedData
    );

    // Combine IV and Ciphertext for transport
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);

    // Robust base64 conversion for large payloads
    const bytes = new Uint8Array(combined);
    let binary = '';
    const chunk_size = 8192;
    for (let i = 0; i < bytes.length; i += chunk_size) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk_size) as any);
    }
    return btoa(binary);
  } catch (err) {
    console.error("Encryption Failure:", err);
    throw new Error("SEC_AUTH_ENCRYPT_FAILED");
  }
}

/**
 * Decrypts a base64-encoded string back into a JSON object
 */
export async function decryptPayload(base64Data: string, passphrase: string): Promise<any> {
  try {
    const key = await deriveKey(passphrase);
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const combined = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      combined[i] = binaryString.charCodeAt(i);
    }

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decrypted = await window.crypto.subtle.decrypt(
      { name: ENCRYPTION_ALGORITHM, iv },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decrypted));
  } catch (err) {
    console.error("Decryption Failure:", err);
    throw new Error("SEC_AUTH_DECRYPT_FAILED");
  }
}

/**
 * Generates a unique ID using crypto.randomUUID with a fallback for non-secure contexts or older browsers.
 */
export function generateUUID(): string {
  if (typeof window !== 'undefined' && window.crypto && (window.crypto as any).randomUUID) {
    return (window.crypto as any).randomUUID();
  }
  
  // Fallback for older browsers or non-secure contexts
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
