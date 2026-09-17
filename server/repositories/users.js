// SQL for the auth + Strava/Oura-OAuth domain (T-4.1 domain extraction).
// Moved verbatim from server.js — same query text, same param order, same
// result shape callers rely on (several call sites did `SELECT *` and read
// arbitrary columns off the row further down in the original code, so those
// stay `SELECT *` here rather than being narrowed).
const { pool } = require('../db');

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
};
