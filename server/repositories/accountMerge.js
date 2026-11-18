// SQL for folding a fresh account into the one that owns a Strava athlete
// (services/accountMerge.js, docs/plans/auth-providers.md §3.5). Every
// function runs on the caller's transaction client.

// Tables a rider fills by using the app. A row in any of them means the
// account is somebody's, not a minutes-old shell — it is never merged away.
// Two things onboarding writes before a new rider ever reaches "Connect
// Strava" are deliberately not counted: the user_profiles row, and the
// default goals (`goals` is checked separately in hasRiderData).
const RIDER_DATA_TABLES = [
  'meta_goals',
  'coach_conversations',
  'coach_notes',
  'calendar_events',
  'events',
  'rides',
  'checklist',
  'user_images',
  'custom_training_plans',
  'race_courses',
  'garmin_connections',
  'garmin_devices',
];

/** Both rows, locked for the transaction, lowest id first so two merges cannot deadlock. */
async function lockUsers(db, userIds) {
  const result = await db.query('SELECT * FROM users WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE', [userIds]);
  return new Map(result.rows.map((row) => [row.id, row]));
}

// `defaultGoalTitles`: the goals onboarding creates for everyone
// (services/userProfile.js). Standalone goals under those titles are not the
// rider's work; any other goal, or one tied to a meta-goal, is.
async function hasRiderData(db, userId, defaultGoalTitles) {
  const checks = RIDER_DATA_TABLES.map((table) => `EXISTS (SELECT 1 FROM ${table} WHERE user_id = $1)`);
  checks.push(
    `EXISTS (SELECT 1 FROM goals WHERE user_id = $1
              AND (meta_goal_id IS NOT NULL OR NOT (title = ANY($2::text[]))))`
  );
  const result = await db.query(`SELECT (${checks.join(' OR ')}) AS has_data`, [userId, defaultGoalTitles]);
  return result.rows[0].has_data === true;
}

/** True when the two accounts each hold an identity of the same provider — they cannot share one. */
async function identitiesCollide(db, userIdA, userIdB) {
  const result = await db.query(
    `SELECT 1 FROM user_identities a JOIN user_identities b ON a.provider = b.provider
      WHERE a.user_id = $1 AND b.user_id = $2 LIMIT 1`,
    [userIdA, userIdB]
  );
  return result.rowCount > 0;
}

async function moveIdentities(db, fromUserId, toUserId) {
  await db.query('UPDATE user_identities SET user_id = $2 WHERE user_id = $1', [fromUserId, toUserId]);
}

// The fresh account's address (and the password that goes with it) fill an
// empty slot only — the caller has checked the target has no address.
async function adoptLogin(db, userId, { email, emailVerified, passwordHash }) {
  await db.query(
    `UPDATE users SET email = $2, email_verified = $3, password_hash = COALESCE(password_hash, $4)
      WHERE id = $1 AND email IS NULL`,
    [userId, email, emailVerified, passwordHash]
  );
}

module.exports = { lockUsers, hasRiderData, identitiesCollide, moveIdentities, adoptLogin };
