// Server-side FTP / high-intensity-interval analysis (T-3.6, docs/audit/
// 00-AUDIT-AND-PLAN.md T-3.6, docs/audit/layers/04-cross-layer.md §4.6,
// docs/audit/layers/02-bikelabapp.md A-04). Both clients used to download a
// whole ride's per-second heart-rate stream and run
// `analyzeHighIntensityTime` themselves (react-spa: from localStorage;
// BikeLabApp: from AsyncStorage, one entry per activity — the single
// biggest contributor to A-04's AsyncStorage bloat). That analysis now runs
// here, over the same shared implementation
// (`@bikelab/shared/calc`'s `analyzeHighIntensityTime`/`getFTPLevel`), and
// its per-activity result is cached in `activity_analysis` (migration
// `1758000000004_activity-analysis.sql`) so a repeat request for the same
// activity never re-fetches its streams from Strava.
const { pool } = require('../db');
const logger = require('../lib/logger');
const { analyzeHighIntensityTime, computeHrZones } = require('@bikelab/shared/calc');
const recommendations = require('../recommendations');
const stravaActivities = require('./strava/activities');

const ANALYSIS_KIND = 'ftp';
const DEFAULT_HR_THRESHOLD = 160;
const MIN_INTERVAL_SEC = 120;

// Bounds one `GET /api/analytics/ftp` request's worst case: a user with a
// long backlog of un-analyzed rides still gets a bounded-latency response,
// and whatever's left over is picked up the next time the route is called
// (each activity's result is cached individually, so nothing is repeated
// work).
const MAX_UNCACHED_STREAM_FETCHES = 20;

/**
 * The HR threshold to use for a user's FTP analysis: zone 4 ("Threshold")'s
 * floor from their computed HR zones, when a profile is available, else the
 * 160bpm default both ported client copies hard-coded.
 */
async function getHrThresholdForUser(userId) {
  let profile = null;
  try {
    profile = await recommendations.getUserProfile(pool, userId);
  } catch (err) {
    logger.warn({ err: err.message, userId }, '[ftpAnalysis] could not load profile, using default HR threshold');
  }
  if (!profile) return DEFAULT_HR_THRESHOLD;
  const zones = computeHrZones(profile);
  const zone4 = zones.zones.find((z) => z.id === 4);
  return zone4?.min || DEFAULT_HR_THRESHOLD;
}

async function getCachedAnalysis(userId, stravaId) {
  const result = await pool.query(
    `SELECT result, computed_at FROM activity_analysis WHERE user_id = $1 AND strava_id = $2 AND kind = $3`,
    [userId, stravaId, ANALYSIS_KIND]
  );
  return result.rows[0] || null;
}

async function saveAnalysis(userId, stravaId, result) {
  await pool.query(
    `INSERT INTO activity_analysis (user_id, strava_id, kind, result, computed_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, strava_id, kind)
     DO UPDATE SET result = EXCLUDED.result, computed_at = NOW()`,
    [userId, stravaId, ANALYSIS_KIND, JSON.stringify(result)]
  );
}

/**
 * Analyzes a single activity, using the cached result if present.
 * `hrThreshold` defaults to the user's zone-4 floor (see
 * `getHrThresholdForUser`) when not given.
 */
async function analyzeActivity(userId, stravaId, hrThreshold) {
  const cached = await getCachedAnalysis(userId, stravaId);
  if (cached) return { result: cached.result, fromCache: true };

  const threshold = hrThreshold ?? (await getHrThresholdForUser(userId));
  const streams = await stravaActivities.getStreams(userId, stravaId);
  const heartrate = streams?.heartrate?.data || [];
  const time = streams?.time?.data;

  const result = analyzeHighIntensityTime(
    { heartrate, time },
    { hrThreshold: threshold, minIntervalSec: MIN_INTERVAL_SEC }
  );

  await saveAnalysis(userId, stravaId, result);
  return { result, fromCache: false };
}

/**
 * Batch analysis over a list of activities (typically this user's rides in
 * a date window) — used by `GET /api/analytics/ftp`. Only fetches streams
 * for activities not already cached, and only up to
 * `MAX_UNCACHED_STREAM_FETCHES` of those per call; anything past the
 * budget is simply skipped this time (it stays uncached, so a later call
 * picks it up).
 */
async function analyzeActivities(userId, activities, opts = {}) {
  const hrThreshold = opts.hrThreshold ?? (await getHrThresholdForUser(userId));

  let totalMinutes = 0;
  let totalIntervals = 0;
  let highIntensitySessions = 0;
  let activitiesAnalyzed = 0;
  let activitiesSkipped = 0;
  let uncachedFetches = 0;

  for (const activity of activities) {
    // Same pre-filter both ported client copies used: no point analyzing a
    // ride with no heart-rate data at all.
    if (!activity.average_heartrate) continue;

    const cached = await getCachedAnalysis(userId, activity.id);
    let result;

    if (cached) {
      result = cached.result;
    } else {
      if (uncachedFetches >= MAX_UNCACHED_STREAM_FETCHES) {
        activitiesSkipped += 1;
        continue;
      }
      uncachedFetches += 1;
      try {
        const streams = await stravaActivities.getStreams(userId, activity.id);
        result = analyzeHighIntensityTime(
          { heartrate: streams?.heartrate?.data || [], time: streams?.time?.data },
          { hrThreshold, minIntervalSec: MIN_INTERVAL_SEC }
        );
        await saveAnalysis(userId, activity.id, result);
      } catch (err) {
        logger.warn({ err: err.message, userId, activityId: activity.id }, '[ftpAnalysis] stream fetch/analysis failed, skipping');
        activitiesSkipped += 1;
        continue;
      }
    }

    activitiesAnalyzed += 1;
    if (result.totalIntervals > 0) {
      highIntensitySessions += 1;
      totalIntervals += result.totalIntervals;
      totalMinutes += result.totalMinutes;
    }
  }

  return {
    totalMinutes,
    totalIntervals,
    highIntensitySessions,
    activitiesAnalyzed,
    activitiesSkipped,
    hrThreshold,
  };
}

module.exports = {
  analyzeActivity,
  analyzeActivities,
  getHrThresholdForUser,
  MAX_UNCACHED_STREAM_FETCHES,
  ANALYSIS_KIND,
};
