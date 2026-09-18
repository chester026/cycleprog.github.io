// SQL for bike gear labels/component resets/onboarding (T-4.1 domain
// extraction). Moved verbatim from server.js — see routes/bikes.js and
// services/bikes.js for the routes/computation that use these.
const { pool } = require('../db');

/** Rider weight (kg) from user_profiles, or null if not set. */
async function getRiderWeight(userId) {
  const result = await pool.query('SELECT weight FROM user_profiles WHERE user_id = $1', [userId]);
  return result.rows[0]?.weight ? parseFloat(result.rows[0].weight) : null;
}

/** Latest skills_history row (all 6 scales) for a user, or null. */
async function getLatestSkills(userId) {
  const result = await pool.query(
    `SELECT climbing, sprint, endurance, tempo, power, consistency FROM skills_history
     WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

/** `{ [component]: { resetAt, resetKm } }` — latest reset per component for a bike. */
async function getComponentResets(userId, bikeId) {
  const result = await pool.query(
    `SELECT DISTINCT ON (component) component, reset_at, reset_km
     FROM bike_component_resets
     WHERE user_id = $1 AND bike_id = $2
     ORDER BY component, reset_at DESC`,
    [userId, bikeId]
  );
  const resets = {};
  result.rows.forEach((r) => {
    resets[r.component] = { resetAt: r.reset_at, resetKm: parseFloat(r.reset_km) || 0 };
  });
  return { resets, hasAny: result.rows.length > 0 };
}

/** `{ groupLabels, componentLabels }` custom gear labels for a bike. */
async function getComponentLabels(userId, bikeId) {
  const result = await pool
    .query(
      `SELECT target_type, target_key, custom_name FROM bike_component_labels
       WHERE user_id = $1 AND bike_id = $2`,
      [userId, bikeId]
    )
    .catch(() => ({ rows: [] }));
  const groupLabels = {};
  const componentLabels = {};
  result.rows.forEach((r) => {
    if (r.target_type === 'group') groupLabels[r.target_key] = r.custom_name;
    else if (r.target_type === 'component') componentLabels[r.target_key] = r.custom_name;
  });
  return { groupLabels, componentLabels };
}

// Batch-upserts every label in one UNNEST round-trip instead of N single
// upserts (S-28). `db` defaults to the shared pool but accepts a
// `withTransaction` client — routes/bikes.js's PUT /:bikeId/labels wraps
// this so a mid-batch failure leaves the previously-saved labels untouched
// rather than half-applying the new set. `labels` is `[{target_type,
// target_key, custom_name}, ...]`, already validated by the caller.
async function upsertComponentLabelsBatch(userId, bikeId, labels, db = pool) {
  if (!labels || labels.length === 0) return 0;
  const result = await db.query(
    `INSERT INTO bike_component_labels (user_id, bike_id, target_type, target_key, custom_name, updated_at)
     SELECT $1, $2, t.target_type, t.target_key, t.custom_name, NOW()
     FROM UNNEST($3::text[], $4::text[], $5::text[]) AS t(target_type, target_key, custom_name)
     ON CONFLICT (user_id, bike_id, target_type, target_key)
     DO UPDATE SET custom_name = EXCLUDED.custom_name, updated_at = NOW()`,
    [
      userId,
      bikeId,
      labels.map((l) => l.target_type),
      labels.map((l) => l.target_key),
      labels.map((l) => l.custom_name),
    ]
  );
  return result.rowCount;
}

async function insertComponentReset(userId, bikeId, component, resetKm) {
  await pool.query(
    'INSERT INTO bike_component_resets (user_id, bike_id, component, reset_km) VALUES ($1, $2, $3, $4)',
    [userId, bikeId, component, resetKm]
  );
}

/** `resets` is `[{ component, resetKm }, ...]`, already validated by the caller. */
async function insertOnboardingResets(userId, bikeId, resets) {
  const values = [];
  const params = [];
  let idx = 1;

  for (const r of resets) {
    values.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, 'onboarding')`);
    params.push(userId, bikeId, r.component, r.resetKm ?? 0);
    idx += 4;
  }

  await pool.query(
    `INSERT INTO bike_component_resets (user_id, bike_id, component, reset_km, source)
     VALUES ${values.join(', ')}`,
    params
  );
  return values.length;
}

module.exports = {
  getRiderWeight,
  getLatestSkills,
  getComponentResets,
  getComponentLabels,
  upsertComponentLabelsBatch,
  insertComponentReset,
  insertOnboardingResets,
};
