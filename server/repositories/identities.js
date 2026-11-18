// SQL for sign-in identities (migration 1758000000024, docs/plans/
// auth-providers.md): the user_identities table, plus the few `users`
// queries that only make sense while resolving an Apple/Google sign-in to an
// account. Every function takes an optional `db` so services/identity/
// accounts.js can run a whole resolution inside one transaction.
const { pool } = require('../db');

async function findByProviderSub(provider, providerUserId, db = pool) {
  const result = await db.query(
    'SELECT * FROM user_identities WHERE provider = $1 AND provider_user_id = $2',
    [provider, providerUserId]
  );
  return result.rows[0] || null;
}

async function findForUser(userId, provider, db = pool) {
  const result = await db.query('SELECT * FROM user_identities WHERE user_id = $1 AND provider = $2', [userId, provider]);
  return result.rows[0] || null;
}

async function listForUser(userId, db = pool) {
  const result = await db.query(
    'SELECT provider, email, created_at FROM user_identities WHERE user_id = $1 ORDER BY created_at, id',
    [userId]
  );
  return result.rows;
}

async function insertIdentity({ userId, provider, providerUserId, email, emailVerified, clientId }, db = pool) {
  const result = await db.query(
    `INSERT INTO user_identities (user_id, provider, provider_user_id, email, email_verified, client_id, last_login_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     RETURNING *`,
    [userId, provider, providerUserId, email, emailVerified, clientId]
  );
  return result.rows[0];
}

// The provider's view of the address can change between sign-ins (a rider
// stops hiding his email, or changes it) — keep the latest.
async function recordLogin(id, { email, emailVerified }, db = pool) {
  await db.query(
    'UPDATE user_identities SET last_login_at = NOW(), email = COALESCE($2, email), email_verified = $3 WHERE id = $1',
    [id, email, emailVerified]
  );
}

async function storeRefreshToken(id, { sealedRefreshToken, clientId }, db = pool) {
  await db.query('UPDATE user_identities SET refresh_token = $2, client_id = $3 WHERE id = $1', [id, sealedRefreshToken, clientId]);
}

/** Removes one identity and returns the removed row (its refresh token is needed for the revoke), or null. */
async function deleteForUser(userId, provider, db = pool) {
  const result = await db.query('DELETE FROM user_identities WHERE user_id = $1 AND provider = $2 RETURNING *', [userId, provider]);
  return result.rows[0] || null;
}

/** Identities that hold something to revoke on the provider's side. */
async function listRevocable(userId, db = pool) {
  const result = await db.query(
    'SELECT provider, client_id, refresh_token FROM user_identities WHERE user_id = $1 AND refresh_token IS NOT NULL',
    [userId]
  );
  return result.rows;
}

// --- users, as seen from a provider sign-in -------------------------------

// `email` is already lowercased by the caller; stored addresses predate any
// normalisation, hence lower() on the column. ORDER BY id so two rows that
// differ only in case resolve the same way every time.
async function findVerifiedUserByEmail(email, db = pool) {
  const result = await db.query(
    'SELECT * FROM users WHERE lower(email) = $1 AND email_verified = TRUE ORDER BY id LIMIT 1',
    [email]
  );
  return result.rows[0] || null;
}

async function isEmailTaken(email, db = pool) {
  const result = await db.query('SELECT 1 FROM users WHERE lower(email) = $1 LIMIT 1', [email]);
  return result.rowCount > 0;
}

async function insertIdentityUser({ email, emailVerified, name, avatar, avatarSource }, db = pool) {
  const result = await db.query(
    `INSERT INTO users (email, email_verified, name, avatar, avatar_source, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING *`,
    [email, emailVerified, name, avatar, avatarSource]
  );
  return result.rows[0];
}

async function fillMissingName(userId, name, db = pool) {
  if (!name) return;
  await db.query("UPDATE users SET name = $2 WHERE id = $1 AND (name IS NULL OR name = '')", [userId, name]);
}

// Gives an account with no address the provider-verified one. The caller
// has checked that nobody else holds it.
async function fillMissingEmail(userId, email, db = pool) {
  await db.query('UPDATE users SET email = $2, email_verified = TRUE WHERE id = $1 AND email IS NULL', [userId, email]);
}

// "Can sign in with a password", not "has a hash": POST /api/login refuses
// an unverified address, so such a password does not count as a way in.
async function hasPassword(userId, db = pool) {
  const result = await db.query(
    'SELECT (password_hash IS NOT NULL AND email IS NOT NULL AND email_verified) AS has_password FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0]?.has_password === true;
}

module.exports = {
  findByProviderSub,
  findForUser,
  listForUser,
  insertIdentity,
  recordLogin,
  storeRefreshToken,
  deleteForUser,
  listRevocable,
  findVerifiedUserByEmail,
  isEmailTaken,
  insertIdentityUser,
  fillMissingName,
  fillMissingEmail,
  hasPassword,
};
