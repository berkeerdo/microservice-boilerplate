/**
 * Encryption Utility
 *
 * Uses AES-256-GCM for secure encryption of sensitive data.
 * - AES-256: Strong symmetric encryption
 * - GCM mode: Provides both confidentiality and authenticity
 * - Random IV per encryption: Prevents pattern analysis
 *
 * Use cases:
 * - Encrypting OAuth tokens
 * - Encrypting sensitive user data
 * - Encrypting API keys
 */
import * as crypto from 'node:crypto';
import config from '../../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits authentication tag
const ENCODING = 'base64' as const;

/**
 * Get encryption key from config (must be 32 bytes for AES-256)
 */
function getEncryptionKey(): Buffer {
  const key = config.ENCRYPTION_KEY || config.JWT_SECRET;

  if (!key) {
    throw new Error('Encryption key not configured');
  }

  // Hash the key to ensure it's exactly 32 bytes
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypt a string value
 * Returns base64 encoded string: IV + AuthTag + Ciphertext
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) {
    return '';
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  const authTag = cipher.getAuthTag();

  // Combine: IV (16) + AuthTag (16) + Encrypted data
  const combined = Buffer.concat([iv, authTag, encrypted]);

  return combined.toString(ENCODING);
}

/**
 * Decrypt a base64 encoded encrypted string
 * Expects format: IV + AuthTag + Ciphertext
 */
export function decrypt(encryptedData: string): string {
  if (!encryptedData) {
    return '';
  }

  try {
    const key = getEncryptionKey();
    const combined = Buffer.from(encryptedData, ENCODING);

    // Extract components
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  } catch {
    throw new Error('Failed to decrypt data - invalid or corrupted');
  }
}

/**
 * Generate a cryptographically secure random string
 * Useful for state tokens, CSRF protection, etc.
 *
 * @param length - Number of random bytes (output will be 2x in hex)
 */
export function generateSecureToken(length = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate PKCE code verifier (43-128 characters)
 * Used for OAuth PKCE flow
 */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(64).toString('base64url').slice(0, 128);
}

/**
 * Generate PKCE code challenge from verifier (SHA256 + base64url)
 * Used for OAuth PKCE flow
 */
export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Hash a string with SHA256
 * Useful for comparing values without storing plaintext
 */
export function hashSHA256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
