// Encrypts a secret for storage in Postgres (AES-256-GCM, key from
// IDENTITY_TOKEN_ENC_KEY). One user today: the Apple refresh token in
// user_identities.refresh_token, which exists only so an account deletion
// can revoke the grant. Without the key nothing is stored — `seal` returns
// null and callers skip the write.
const crypto = require('crypto');
const config = require('../config');

const VERSION = 'v1';
const IV_BYTES = 12;

function key() {
  return config.IDENTITY_TOKEN_ENC_KEY ? Buffer.from(config.IDENTITY_TOKEN_ENC_KEY, 'hex') : null;
}

function isConfigured() {
  return key() !== null;
}

function seal(plaintext) {
  const k = key();
  if (!k || !plaintext) return null;
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

// null for anything that cannot be opened (no key, rotated key, tampered
// value): the only reader is a best-effort revoke, which then has nothing
// to send.
function open(sealed) {
  const k = key();
  if (!k || !sealed) return null;
  const [version, iv, tag, ciphertext] = String(sealed).split('.');
  if (version !== VERSION || !iv || !tag || !ciphertext) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

module.exports = { isConfigured, seal, open };
