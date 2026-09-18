// Server-side power estimation + persistence (T-3.5, docs/audit/00-AUDIT-
// AND-PLAN.md T-3.5, docs/audit/layers/04-cross-layer.md §4.5,
// docs/audit/layers/02-bikelabapp.md A-14, docs/audit/layers/03-react-spa.md
// W-26). Single place that computes `estimateRidePower` (the reconciled
// physics model in `@bikelab/shared/calc/power.ts`) for activities that
// don't have it yet and writes the result into
// `synced_activities.estimated_power` (migration `1758000000003_estimated-
// power.sql`), so every consumer — `GET /api/activities`,
// `GET /api/analytics/summary`, `services/skills.js` — reads the same
// number instead of each client recomputing its own drifted estimate.
const { pool } = require('../db');
const logger = require('../lib/logger');
const { estimateRidePower } = require('@bikelab/shared/calc');
const recommendations = require('../recommendations');
const weatherService = require('./weather');

const DEFAULT_BIKE_WEIGHT_KG = 8; // per T-3.5: NOT read from bike_component_* — every ported copy just defaulted to 8.
const DEFAULT_RIDER_WEIGHT_KG = 75; // same fallback every ported copy used when the profile has no weight.
const DEFAULT_SURFACE = 'road'; // user_profiles has no surface/terrain field today.

// Wind is fetched for every estimated (non power-meter) ride that has
// coordinates — Open-Meteo's archive API answers for any past date and the
// result is persisted once, so the total cost is one call per ride per
// lifetime, not per page load. What is bounded is the *foreground* work: a
// request computes wind for at most MAX_WEATHER_CALLS_PER_REQUEST rides
// (persisting those), serves windless estimates for the rest WITHOUT
// persisting them, and then continues the backlog in the background (one
// pass per user at a time, see `continueInBackground`) so the next page load
// finds everything computed.
const WIND_LOOKBACK_DAYS = 3 * 365; // Open-Meteo archive coverage we rely on
const WIND_LOOKBACK_MS = WIND_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
const MAX_WEATHER_CALLS_PER_REQUEST = 25;
const MAX_WEATHER_CALLS_PER_BACKGROUND_PASS = 150;
const inFlightBackground = new Set(); // userIds with a background pass running

function isEligibleForWind(activity, hasRealPower, now) {
  if (hasRealPower) return false;
  if (!activity.start_date) return false;
  const startMs = new Date(activity.start_date).getTime();
  if (!Number.isFinite(startMs) || now - startMs > WIND_LOOKBACK_MS) return false;
  return Array.isArray(activity.start_latlng) && activity.start_latlng.length === 2;
}

/**
 * Computes and persists `estimated_power` for every activity in `activities`
 * that doesn't already have one (`activity.estimated_power == null`),
 * mutating each such activity in place with the computed value so the
 * caller's response reflects it immediately (no extra DB round trip).
 * Never throws — a profile-load or weather failure is logged and the
 * affected activity just gets the best estimate available (default
 * weight, no wind).
 */
async function enrichEstimatedPower(userId, activities, opts = {}) {
  if (!Array.isArray(activities) || activities.length === 0) return activities;

  const now0 = Date.now();
  const needsWork = (a) => {
    if (a.estimated_power == null) return true;
    // Rows persisted windless by the earlier 60-day cutoff: retry with wind.
    const hasRealPower = !!(a.device_watts && a.average_watts);
    return a.estimated_power.hasWind === false && a.estimated_power.method !== 'measured' && isEligibleForWind(a, hasRealPower, now0);
  };
  const missing = activities.filter(needsWork);
  if (missing.length === 0) return activities;
  const budget = opts.budget ?? MAX_WEATHER_CALLS_PER_REQUEST;

  let profile = null;
  try {
    profile = await recommendations.getUserProfile(pool, userId);
  } catch (err) {
    logger.warn({ err: err.message, userId }, '[power] could not load profile for estimation, using defaults');
  }
  const riderWeightKg = parseFloat(profile?.weight) || DEFAULT_RIDER_WEIGHT_KG;
  const bikeWeightKg = parseFloat(profile?.bike_weight) || DEFAULT_BIKE_WEIGHT_KG;
  const surface = profile?.surface_type || DEFAULT_SURFACE;

  const now = Date.now();
  let weatherCallsUsed = 0;
  const toPersist = []; // { strava_id, estimated_power }

  for (const activity of missing) {
    const hasRealPower = !!(activity.device_watts && activity.average_watts);
    const wantsWind = isEligibleForWind(activity, hasRealPower, now);
    const withinBudget = weatherCallsUsed < budget;

    let wind = null;
    if (wantsWind && withinBudget) {
      weatherCallsUsed += 1;
      try {
        wind = await weatherService.getWindForActivity(activity);
      } catch (err) {
        logger.warn({ err: err.message, activityId: activity.id }, '[power] wind fetch failed, estimating without wind');
        wind = null;
      }
    }

    const estimate = estimateRidePower(activity, {
      riderWeightKg,
      bikeWeightKg,
      surface,
      wind,
    });

    const value = {
      avgWatts: estimate.avgWatts,
      method: estimate.method,
      confidence: estimate.confidence,
      hasWind: !!wind,
      computedAt: new Date().toISOString(),
    };
    activity.estimated_power = value;

    // Only persist a "final" result: either wind wasn't wanted (no coords,
    // too old, real power meter) or it was tried (fetched or genuinely
    // failed/unavailable). An activity that wanted wind but lost out to the
    // per-request budget stays unpersisted so the next call retries it with
    // wind instead of settling for this windless number forever.
    if (wantsWind && !withinBudget) {
      continue;
    }
    toPersist.push({ strava_id: activity.id, estimated_power: value });
  }

  const leftover = missing.filter((a) => a.estimated_power && a.estimated_power.hasWind === false && isEligibleForWind(a, false, now));
  if (leftover.length > 0 && !opts.background) continueInBackground(userId, leftover);

  if (toPersist.length > 0) {
    try {
      await pool.query(
        `UPDATE synced_activities AS sa SET estimated_power = t.estimated_power::jsonb
           FROM UNNEST($2::bigint[], $3::jsonb[]) AS t(strava_id, estimated_power)
          WHERE sa.user_id = $1 AND sa.strava_id = t.strava_id`,
        [userId, toPersist.map((u) => u.strava_id), toPersist.map((u) => JSON.stringify(u.estimated_power))]
      );
    } catch (err) {
      logger.error({ err: err.message, userId }, '[power] failed to persist estimated_power');
    }
  }

  return activities;
}

// Finishes the wind backlog for a user off the request path: one pass at a
// time per user, bounded, and invalidates the in-memory activities cache at
// the end so the next request reads the persisted values.
function continueInBackground(userId, leftover) {
  if (inFlightBackground.has(userId)) return;
  inFlightBackground.add(userId);
  setTimeout(async () => {
    try {
      // Work on copies: the request's objects already hold their windless
      // estimate; recompute into fresh objects so persistence is clean.
      const copies = leftover.map((a) => ({ ...a, estimated_power: null }));
      await enrichEstimatedPower(userId, copies, { budget: MAX_WEATHER_CALLS_PER_BACKGROUND_PASS, background: true });
      const { activitiesCache } = require('./strava/activities');
      await activitiesCache.delete(userId);
      logger.info({ userId, count: copies.length }, '[power] background wind enrichment pass done');
    } catch (err) {
      logger.warn({ err: err.message, userId }, '[power] background wind enrichment failed');
    } finally {
      inFlightBackground.delete(userId);
    }
  }, 50).unref?.();
}

module.exports = { enrichEstimatedPower, MAX_WEATHER_CALLS_PER_REQUEST, WIND_LOOKBACK_DAYS, MAX_WEATHER_CALLS_PER_BACKGROUND_PASS };
