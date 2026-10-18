/**
 * Password hashing with scrypt (from Node's built-in crypto module).
 *
 * Stored format: scrypt$<salt-hex>$<derived-key-hex>
 * A fresh random salt is generated per password; verification uses
 * timingSafeEqual to avoid leaking information through timing differences.
 */
import crypto from 'node:crypto';

const KEY_LENGTH = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, KEY_LENGTH);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  const expected = Buffer.from(expectedHex, 'hex');
  const candidate = crypto.scryptSync(String(password), salt, KEY_LENGTH);
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}
