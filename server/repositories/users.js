// SQL for the auth + Strava/Oura-OAuth domain (T-4.1 domain extraction).
// Moved verbatim from server.js — same query text, same param order, same
// result shape callers rely on (several call sites did `SELECT *` and read
// arbitrary columns off the row further down in the original code, so those
// stay `SELECT *` here rather than being narrowed).
const { pool } = require('../db');

// --- T-4.5 auth hardening: token revocation / password reset / refresh
// tokens / email-change (S-13, S-14, S-27, A-05) --------------------------

// --- register / verify / resend / login -----------------------------------

async function findIdByEmail(email) {
  const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  return result.rows[0] || null;
}

async function insertUser({ email, passwordHash, name }) {
  const result = await pool.query(
    'INSERT INTO users (email, password_hash, name, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id, email, name',
    [email, passwordHash, name]
  );
  return result.rows[0];
}

async function setVerificationToken(userId, token) {
  await pool.query(
    'UPDATE users SET verification_token = $1, verification_token_expires = NOW() + INTERVAL \'24 hours\' WHERE id = $2',
    [token, userId]
  );
}

async function findByVerificationToken(token) {
  const result = await pool.query(
    'SELECT id, email, verification_token_expires FROM users WHERE verification_token = $1',
    [token]
  );
  return result.rows[0] || null;
}

async function markEmailVerified(userId) {
  await pool.query(
    'UPDATE users SET email_verified = TRUE, verification_token = NULL, verification_token_expires = NULL WHERE id = $1',
    [userId]
  );
}

async function findVerificationStatusByEmail(email) {
  const result = await pool.query('SELECT id, email_verified FROM users WHERE email = $1', [email]);
  return result.rows[0] || null;
}

async function setVerificationTokenWithExpiry(userId, token, expires) {
  await pool.query(
    'UPDATE users SET verification_token = $1, verification_token_expires = $2 WHERE id = $3',
    [token, expires, userId]
  );
}

async function findByEmailFull(email) {
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0] || null;
}

async function findById(userId) {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  return result.rows[0] || null;
}

// --- Strava login (/exchange_token) ----------------------------------------

async function findByStravaId(stravaId) {
  const result = await pool.query('SELECT * FROM users WHERE strava_id = $1', [stravaId]);
  return result.rows[0] || null;
}

async function updateStravaLoginFields(userId, { accessToken, refreshToken, expiresAt, name, email, avatar }) {
  await pool.query(
    'UPDATE users SET strava_access_token = $1, strava_refresh_token = $2, strava_expires_at = $3, name = $4, email = COALESCE($5, email), avatar = $6, strava_athlete_id = COALESCE(strava_athlete_id, strava_id) WHERE id = $7',
    [accessToken, refreshToken, expiresAt, name, email, avatar, userId]
  );
}

async function findByStravaAthleteId(stravaId) {
  const result = await pool.query('SELECT * FROM users WHERE strava_athlete_id = $1', [stravaId]);
  return result.rows[0] || null;
}

async function reuniteStravaAccount(userId, { stravaId, accessToken, refreshToken, expiresAt, name, avatar }) {
  await pool.query(
    'UPDATE users SET strava_id = $1, strava_access_token = $2, strava_refresh_token = $3, strava_expires_at = $4, name = $5, avatar = $6 WHERE id = $7',
    [stravaId, accessToken, refreshToken, expiresAt, name, avatar, userId]
  );
}

async function insertStravaUser({ stravaId, accessToken, refreshToken, expiresAt, name, email, avatar }) {
  const result = await pool.query(
    'INSERT INTO users (strava_id, strava_athlete_id, strava_access_token, strava_refresh_token, strava_expires_at, name, email, avatar) VALUES ($1, $1, $2, $3, $4, $5, $6, $7) RETURNING *',
    [stravaId, accessToken, refreshToken, expiresAt, name, email, avatar]
  );
  return result.rows[0];
}

// --- Oura callback (/oura/exchange_token) ----------------------------------

async function updateOuraTokens(userId, { accessToken, refreshToken, expiresAt, ouraUserId }) {
  await pool.query(
    'UPDATE users SET oura_access_token = $1, oura_refresh_token = $2, oura_expires_at = $3, oura_user_id = $4 WHERE id = $5',
    [accessToken, refreshToken, expiresAt, ouraUserId, userId]
  );
}

// --- Strava link/unlink (/link_strava, /api/unlink_strava) ------------------

async function findConflictingStravaUser(stravaId, excludeUserId) {
  const result = await pool.query(
    'SELECT id FROM users WHERE (strava_id = $1 OR strava_athlete_id = $1) AND id != $2',
    [stravaId, excludeUserId]
  );
  return result.rows[0] || null;
}

async function linkStravaToUser(userId, { stravaId, accessToken, refreshToken, expiresAt, name, email, avatar }) {
  await pool.query(
    'UPDATE users SET strava_id = $1, strava_athlete_id = $1, strava_access_token = $2, strava_refresh_token = $3, strava_expires_at = $4, name = $5, email = COALESCE($6, email), avatar = $7 WHERE id = $8',
    [stravaId, accessToken, refreshToken, expiresAt, name, email, avatar, userId]
  );
}

async function getStravaAccessToken(userId) {
  const result = await pool.query('SELECT strava_access_token FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.strava_access_token || null;
}

async function clearStravaLink(userId) {
  await pool.query(
    'UPDATE users SET strava_id = NULL, strava_access_token = NULL, strava_refresh_token = NULL, strava_expires_at = NULL, avatar = NULL WHERE id = $1',
    [userId]
  );
}

async function deleteSyncedActivities(userId) {
  await pool.query('DELETE FROM synced_activities WHERE user_id = $1', [userId]);
}

async function deleteSyncedBikes(userId) {
  await pool.query('DELETE FROM synced_bikes WHERE user_id = $1', [userId]);
}

// --- token revocation (migrations/1758000000007_auth-hardening.sql) -------

// Invalidates every session JWT and refresh token issued before this call —
// see middleware/auth.js's per-request check against this column. `db`
// defaults to the shared pool but accepts a transaction client (e.g.
// resetPassword also revoking refresh tokens in the same round-trip isn't
// currently transactional, but the parameter is here so a future caller that
// needs it to be can pass one in without this function changing shape).
async function bumpTokenVersion(userId, db = pool) {
  await db.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [userId]);
}

// --- password reset (POST /api/forgot-password, /api/reset-password) -----

async function setPasswordResetToken(userId, tokenHash, expiresAt, db = pool) {
  await db.query(
    'UPDATE users SET password_reset_token_hash = $1, password_reset_expires = $2 WHERE id = $3',
    [tokenHash, expiresAt, userId]
  );
}

/** Full user row for a still-unconsumed reset token hash, or null. Expiry is
 * checked by the caller (services/auth.js) so it can distinguish "no such
 * token" from "expired" if it ever needs to. */
async function findByPasswordResetTokenHash(tokenHash) {
  const result = await pool.query('SELECT * FROM users WHERE password_reset_token_hash = $1', [tokenHash]);
  return result.rows[0] || null;
}

async function clearPasswordReset(userId, db = pool) {
  await db.query(
    'UPDATE users SET password_reset_token_hash = NULL, password_reset_expires = NULL WHERE id = $1',
    [userId]
  );
}

async function updatePasswordHash(userId, passwordHash, db = pool) {
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
}

// --- email change (POST /api/user-profile/email) --------------------------

// Sets the new (already normalised) email and flips email_verified back to
// false in one statement — see services/auth.js's changeEmail for why: an
// address the account owner hasn't proven they control must not stay marked
// verified just because the OLD address was.
async function setEmailUnverified(userId, email) {
  await pool.query('UPDATE users SET email = $1, email_verified = FALSE WHERE id = $2', [email, userId]);
}

// --- refresh tokens (opt-in, additive — S-14) ------------------------------

async function createRefreshToken({ userId, tokenHash, familyId, expiresAt, userAgent }, db = pool) {
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, tokenHash, familyId, expiresAt, userAgent || null]
  );
}

async function findRefreshTokenByHash(tokenHash) {
  const result = await pool.query('SELECT * FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
  return result.rows[0] || null;
}

async function revokeRefreshToken(id, db = pool) {
  await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL', [id]);
}

// Reuse-detected revocation (rotateRefreshToken presenting an already-
// revoked token) — nukes every token descended from the same login, not
// just the one reused, since reuse means the chain is suspect.
async function revokeRefreshTokenFamily(familyId, db = pool) {
  await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL', [familyId]);
}

// logout-all / password reset: revoke every still-live token for this user,
// regardless of family.
async function revokeAllRefreshTokensForUser(userId, db = pool) {
  await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
}

module.exports = {
  findIdByEmail,
  insertUser,
  setVerificationToken,
  findByVerificationToken,
  markEmailVerified,
  findVerificationStatusByEmail,
  setVerificationTokenWithExpiry,
  findByEmailFull,
  findById,
  findByStravaId,
  updateStravaLoginFields,
  findByStravaAthleteId,
  reuniteStravaAccount,
  insertStravaUser,
  updateOuraTokens,
  findConflictingStravaUser,
  linkStravaToUser,
  getStravaAccessToken,
  clearStravaLink,
  deleteSyncedActivities,
  deleteSyncedBikes,
  bumpTokenVersion,
  setPasswordResetToken,
  findByPasswordResetTokenHash,
  clearPasswordReset,
  updatePasswordHash,
  setEmailUnverified,
  createRefreshToken,
  findRefreshTokenByHash,
  revokeRefreshToken,
  revokeRefreshTokenFamily,
  revokeAllRefreshTokensForUser,
};
