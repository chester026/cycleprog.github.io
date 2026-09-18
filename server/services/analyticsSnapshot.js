// Server-side `analytics_snapshots` writer (T-3.3, docs/audit/00-AUDIT-AND-
// PLAN.md T-3.3, docs/audit/layers/04-cross-layer.md §5.4,
// docs/audit/layers/03-react-spa.md W-44). Previously clients computed
// these numbers themselves and posted them via `POST /api/analytics-
// snapshot` (react-spa `AnalysisPage.jsx`'s `buildSnapshotPayload` +
// mobile's `AnalysisScreen.tsx`) — now the server computes and writes this
// row itself, from the same data `GET /api/skills` already loaded, and that
// POST route becomes an admin-only fallback (see server.js).
//
// Aggregates mirror `react-spa/src/utils/garageData.js`'s
// `buildSnapshotPayload`/`aggregateMinMax`: mean of each ride's own
// avg-field for `avg`, max of each ride's own max-field for `max` (falling
// back to the max avg-field when there's no dedicated max field, e.g.
// cadence), min of each ride's own avg-field for `min`. Computed over ALL
// of the user's ride activities (`Ride`/`VirtualRide`) — not windowed to
// the skills' rolling 90 days — same scope the client version used.
const { pool } = require('../db');
const { estimateVO2maxFromActivities } = require('@bikelab/shared/calc');
const stravaActivities = require('./strava/activities');
const stravaTokens = require('./strava/tokens');
const { getUserProfile } = require('../recommendations');
const logger = require('../lib/logger');

const RIDE_TYPES = ['Ride', 'VirtualRide'];

function aggregateMinMax(rides, avgField, maxField) {
  const avgs = rides.map((a) => a[avgField]).filter((v) => typeof v === 'number' && v > 0);
  if (!avgs.length) return { avg: null, max: null, min: null };
  const avg = avgs.reduce((s, v) => s + v, 0) / avgs.length;
  const maxes = maxField ? rides.map((a) => a[maxField]).filter((v) => typeof v === 'number' && v > 0) : [];
  return {
    avg,
    max: maxes.length ? Math.max(...maxes) : Math.max(...avgs),
    min: Math.min(...avgs),
  };
}

/**
 * Computes and upserts this user's `analytics_snapshots` row for today.
 * Interim power source: `weighted_average_watts` (falling back to
 * `average_watts`) straight off the raw ride, same documented approximation
 * `@bikelab/shared/calc/skills.ts` uses until T-3.5 lands a real
 * wind/rider/bike-weight-adjusted `estimated_power` — see that module's
 * doc comment. `lastActivityId`/`activities` may be passed in by a caller
 * (`GET /api/skills`) that already loaded them, to avoid a second Strava-
 * activities round trip.
 *
 * No-ops (returns `{saved: false, reason: 'no_new_data'}`) when a row for
 * today's `last_activity_id` already exists — same "no_new_data" contract
 * `POST /api/analytics-snapshot` always had (ON CONFLICT (user_id,
 * snapshot_date) DO UPDATE means this is really "already up to date for
 * today AND for this activity", not a hard guard, but existing callers only
 * ever cared about not re-writing identical data).
 */
async function upsertAnalyticsSnapshot(userId, { activities: providedActivities, lastActivityId: providedLastActivityId } = {}) {
  let activities = providedActivities;
  if (!activities) {
    try {
      activities = await stravaActivities.getActivities(userId);
    } catch (err) {
      if (!(err instanceof stravaTokens.StravaNotLinkedError)) {
        logger.warn({ err: err.message, userId }, '[analyticsSnapshot] could not load activities:');
      }
      activities = [];
    }
  }

  const rides = activities.filter((a) => RIDE_TYPES.includes(a.type));
  if (!rides.length) return { saved: false, reason: 'no_activities' };

  const lastActivityId = providedLastActivityId ?? rides[0]?.id ?? null;
  if (!lastActivityId) return { saved: false, reason: 'no_activities' };

  const existing = await pool.query(
    'SELECT id FROM analytics_snapshots WHERE user_id = $1 AND last_activity_id = $2 AND snapshot_date = CURRENT_DATE',
    [userId, lastActivityId]
  );
  if (existing.rows.length > 0) return { saved: false, reason: 'no_new_data' };

  const heart = aggregateMinMax(rides, 'average_heartrate', 'max_heartrate');
  const speed = aggregateMinMax(rides, 'average_speed', 'max_speed');
  const cadence = aggregateMinMax(rides, 'average_cadence', null);
  const power = aggregateMinMax(
    rides.map((a) => ({ ...a, __power: a.weighted_average_watts ?? a.average_watts })),
    '__power',
    null
  );

  const profile = await getUserProfile(pool, userId).catch(() => null);
  const vo2maxEstimate = estimateVO2maxFromActivities(rides, profile, { windowDays: null });

  await pool.query(
    `INSERT INTO analytics_snapshots (
      user_id, snapshot_date, last_activity_id,
      avg_power, max_power, min_power,
      avg_hr, max_hr, min_hr,
      avg_speed, max_speed, min_speed,
      avg_cadence, max_cadence, min_cadence,
      vo2max, activities_count
    ) VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    ON CONFLICT (user_id, snapshot_date) DO UPDATE SET
      last_activity_id = EXCLUDED.last_activity_id,
      avg_power = EXCLUDED.avg_power, max_power = EXCLUDED.max_power, min_power = EXCLUDED.min_power,
      avg_hr = EXCLUDED.avg_hr, max_hr = EXCLUDED.max_hr, min_hr = EXCLUDED.min_hr,
      avg_speed = EXCLUDED.avg_speed, max_speed = EXCLUDED.max_speed, min_speed = EXCLUDED.min_speed,
      avg_cadence = EXCLUDED.avg_cadence, max_cadence = EXCLUDED.max_cadence, min_cadence = EXCLUDED.min_cadence,
      vo2max = EXCLUDED.vo2max, activities_count = EXCLUDED.activities_count,
      created_at = NOW()`,
    [
      userId,
      lastActivityId,
      power.avg,
      power.max,
      power.min,
      heart.avg,
      heart.max,
      heart.min,
      speed.avg,
      speed.max,
      speed.min,
      cadence.avg,
      cadence.max,
      cadence.min,
      vo2maxEstimate.vo2max,
      rides.length,
    ]
  );

  await pool.query(
    `DELETE FROM analytics_snapshots
     WHERE user_id = $1
       AND id NOT IN (
         SELECT id FROM analytics_snapshots WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 2
       )`,
    [userId]
  );

  return { saved: true };
}

module.exports = { upsertAnalyticsSnapshot };
