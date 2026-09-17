// SQL for the `users` table fields the user-profile/account domain reads and
// writes directly (T-4.1 domain extraction). The `user_profiles` table
// itself (getUserProfile/updateUserProfile/completeOnboarding) stays owned
// by `../recommendations` — these are just the small `users`-row lookups
// that the profile/onboarding/email routes layer on top of that.
const { pool } = require('../db');

/** `{id, name, avatar, strava_id, email, is_admin}` for GET /api/user-profile, or undefined. */
async function getProfileUserFields(userId) {
  const result = await pool.query(
    'SELECT id, name, avatar, strava_id, email, is_admin FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0];
}

/** `{strava_id, email}` (both null if the user row is missing either). */
async function getStravaIdAndEmail(userId) {
  const result = await pool.query('SELECT strava_id, email FROM users WHERE id = $1', [userId]);
  return { strava_id: result.rows[0]?.strava_id || null, email: result.rows[0]?.email || null };
}

/** `strava_id` alone, or null. */
async function getStravaId(userId) {
  const result = await pool.query('SELECT strava_id FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.strava_id || null;
}

async function setEmail(userId, email) {
  await pool.query('UPDATE users SET email = $1 WHERE id = $2', [email, userId]);
}

/** Id of another user already using this email, if any. */
async function findOtherUserByEmail(email, excludingUserId) {
  const result = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, excludingUserId]);
  return result.rows[0] || null;
}

/** Full `users` row, for re-issuing a session token after an email change. */
async function getUserById(userId) {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  return result.rows[0];
}

module.exports = {
  getProfileUserFields,
  getStravaIdAndEmail,
  getStravaId,
  setEmail,
  findOtherUserByEmail,
  getUserById,
};
