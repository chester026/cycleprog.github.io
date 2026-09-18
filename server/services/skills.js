// Server-side skills (radar chart) computation + snapshotting (T-3.3,
// docs/audit/00-AUDIT-AND-PLAN.md T-3.3, docs/audit/layers/04-cross-layer.md
// §4.1, docs/audit/layers/02-bikelabapp.md A-07,
// docs/audit/layers/03-react-spa.md W-44).
//
// Moves the 6-scale skills computation + rider-profile + `skills_history`
// snapshotting off both clients and onto the server, using the shared,
// canonical (app-variant) formula in `@bikelab/shared/calc`
// (`calculateAllSkills`/`determineRiderProfile`). Both clients previously
// computed this themselves with drifted formulas (different window,
// different confidence handling) and raced each other writing
// `POST /api/skills-history` — see A-07/W-44. This module is now the single
// place that computes and persists a skills snapshot; `routes/skillsHistory.js`
// keeps serving reads.
const { pool } = require('../db');
const logger = require('../lib/logger');
const { calculateAllSkills, determineRiderProfile, estimateVO2maxFromActivities } = require('@bikelab/shared/calc');
const stravaActivities = require('./strava/activities');
const stravaTokens = require('./strava/tokens');
const { getUserProfile } = require('../recommendations');

const SKILLS_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

function inWindow(activities, asOf, windowDays) {
  const start = new Date(asOf.getTime() - windowDays * DAY_MS);
  return activities.filter((a) => {
    const d = new Date(a.start_date);
    return d >= start && d <= asOf;
  });
}

// T-3.5: `calculateAllSkills`'s `opts.powerStats` in the same
// `{avgPower, totalActivities}` shape its raw-activity fallback used, built
// from each windowed activity's persisted `estimated_power.avgWatts`
// (getActivities()/services/power.js already attaches this — measured for
// power-meter rides, physics-estimated otherwise) instead of a plain
// `average_watts` mean. Returns null (same as the shared fallback) when
// nothing in the window has an estimate yet.
function powerStatsFromEstimatedPower(windowedActivities) {
  const watts = windowedActivities
    .map((a) => a.estimated_power?.avgWatts)
    .filter((w) => typeof w === 'number' && w > 0);
  if (watts.length === 0) return null;
  const avgPower = watts.reduce((sum, w) => sum + w, 0) / watts.length;
  return { avgPower, totalActivities: watts.length };
}

/**
 * Loads this user's activities + profile and computes the 6 skill scales +
 * rider profile as-of `asOf` (default: now). Never throws for a user who
 * hasn't linked Strava — that's the same "no data yet" case as 0 activities
 * (mirrors `/api/analytics/summary`'s handling of `StravaNotLinkedError`).
 *
 * Returns `{skills, riderProfile, confidence, sampleSize, lastActivityId, activities}`
 * — `activities` is returned too so callers (the route) don't have to
 * re-fetch it to build the analytics-snapshot aggregates.
 */
async function computeSkills(userId, { asOf = new Date() } = {}) {
  let activities = [];
  try {
    activities = await stravaActivities.getActivities(userId);
  } catch (err) {
    if (!(err instanceof stravaTokens.StravaNotLinkedError)) {
      logger.warn({ err: err.message, userId }, '[skills] could not load activities:');
    }
  }

  const profile = await getUserProfile(pool, userId).catch((err) => {
    logger.warn({ err: err.message, userId }, '[skills] could not load profile:');
    return null;
  });

  // Same rolling window as `calculateAllSkills` itself uses, for the VO2max
  // input and the reported `sampleSize` — see @bikelab/shared/calc/skills.ts
  // module doc's "Power" section for why `power` is otherwise approximated.
  const vo2maxEstimate = estimateVO2maxFromActivities(activities, profile, {
    windowDays: SKILLS_WINDOW_DAYS,
    now: asOf,
  });

  const windowed = inWindow(activities, asOf, SKILLS_WINDOW_DAYS);

  // T-3.5: use the server's real per-activity power estimate
  // (`estimated_power`, measured where a power meter exists) instead of
  // `calculateAllSkills`'s own raw `average_watts` fallback — closes the
  // T-3.3 follow-up noted in @bikelab/shared/calc/skills.ts's module doc.
  // Only overridden when at least one windowed activity actually has an
  // estimate yet (`undefined`, not `null`, when it doesn't) — passing an
  // explicit `null` would suppress `calculateAllSkills`'s own raw-activity
  // fallback entirely, which is worse than falling back to it here too.
  const powerStats = powerStatsFromEstimatedPower(windowed);

  const skills = calculateAllSkills(activities, {
    asOf,
    windowDays: SKILLS_WINDOW_DAYS,
    summary: {
      vo2max: vo2maxEstimate.vo2max,
      lthr: profile?.lactate_threshold ?? null,
    },
    ...(powerStats !== null ? { powerStats } : {}),
  });
  const riderProfile = determineRiderProfile(skills);

  const sampleSize = windowed.length;
  const confidence = Math.min(1, Math.sqrt(sampleSize / 20));

  // `getActivities` (services/strava/activities.js `readFromDb`) orders by
  // start_date DESC, so the first item is the most recent activity.
  const lastActivityId = activities[0]?.id ?? null;

  return { skills, riderProfile, confidence, sampleSize, lastActivityId, activities };
}

/**
 * Upserts a `skills_history` snapshot, idempotent per `(user_id,
 * last_activity_id)` — a second call for the same last-synced activity is a
 * no-op (checked explicitly, and backstopped by the
 * `skills_history_user_last_activity_unique` index added in
 * `migrations/*_skills-history-unique.sql` against a races between two
 * concurrent requests). Keeps only the 2 most recent snapshots per user,
 * same retention `routes/skillsHistory.js`'s own `POST` has always used.
 *
 * Returns `{ saved: boolean, snapshot }` — `snapshot` is the row that now
 * represents "latest" for this user (either the one just inserted, or the
 * pre-existing one when this was a no-op).
 */
async function saveSnapshot(userId, skills, { lastActivityId = null, asOf = new Date() } = {}) {
  if (lastActivityId != null) {
    const existing = await pool.query(
      'SELECT * FROM skills_history WHERE user_id = $1 AND last_activity_id = $2 LIMIT 1',
      [userId, lastActivityId]
    );
    if (existing.rows.length > 0) {
      return { saved: false, snapshot: existing.rows[0] };
    }
  }

  let snapshot;
  try {
    const inserted = await pool.query(
      `INSERT INTO skills_history
        (user_id, snapshot_date, climbing, sprint, endurance, tempo, power, consistency, last_activity_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        userId,
        asOf,
        skills.climbing,
        skills.sprint,
        skills.endurance,
        skills.tempo,
        skills.power,
        skills.consistency,
        lastActivityId,
      ]
    );
    snapshot = inserted.rows[0];
  } catch (err) {
    // Unique-violation on (user_id, last_activity_id) — a concurrent request
    // beat us to it; treat exactly like the pre-check above.
    if (err.code === '23505' && lastActivityId != null) {
      const existing = await pool.query(
        'SELECT * FROM skills_history WHERE user_id = $1 AND last_activity_id = $2 LIMIT 1',
        [userId, lastActivityId]
      );
      if (existing.rows.length > 0) return { saved: false, snapshot: existing.rows[0] };
    }
    throw err;
  }

  // Same retention as the legacy POST /api/skills-history: only 2 rows/user.
  await pool.query(
    `DELETE FROM skills_history
     WHERE user_id = $1
       AND id NOT IN (
         SELECT id FROM skills_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 2
       )`,
    [userId]
  );

  return { saved: true, snapshot };
}

/** The most recent `skills_history` row for a user, or null. */
async function getLastSnapshot(userId) {
  const result = await pool.query(
    'SELECT * FROM skills_history WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 1',
    [userId]
  );
  return result.rows[0] || null;
}

const SKILL_KEYS = ['climbing', 'sprint', 'endurance', 'tempo', 'power', 'consistency'];

/** `{climbing: newVal - oldVal, ...}` for each of the 6 scales, or null if there's no previous snapshot. */
function computeTrend(current, previous) {
  if (!previous) return null;
  const trend = {};
  for (const key of SKILL_KEYS) {
    const prevVal = previous[key] != null ? Number(previous[key]) : null;
    trend[key] = prevVal != null ? Math.round((current[key] - prevVal) * 100) / 100 : null;
  }
  return trend;
}

module.exports = {
  SKILLS_WINDOW_DAYS,
  computeSkills,
  saveSnapshot,
  getLastSnapshot,
  computeTrend,
};
