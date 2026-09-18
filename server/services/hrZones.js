// Server-side, zone-independent HR histogram + time-in-HR-zones (audit
// W-18/W-22-style problem for `HeartRateZonesChart.jsx`: that component used
// to download per-activity streams for up to 20 rides on every Analysis
// page visit whenever fewer than half its rides had streams cached — each
// download is a Strava API call, so a single page visit could burn ~20 of
// them, every time, forever (no server-side streams cache exists).
//
// The fix: per activity, compute an HR *histogram* — `{bins: {"<bpm>":
// seconds}, total_seconds, source: 'streams'}` — once, and persist it in the
// shared `activity_analysis` cache table (repositories/activityAnalysis.js,
// `kind = 'hr_histogram'`, same table `services/ftpAnalysis.js` uses for
// `kind = 'ftp'`). The histogram is bpm-keyed, not zone-keyed, so a later
// profile change (different max_hr/resting_hr/lactate_threshold) never
// invalidates it — `GET /api/analytics/hr-zones` re-buckets the same cached
// histogram into whatever zones the profile currently computes.
const logger = require('../lib/logger');
const { computeHrZones, zoneForHr } = require('@bikelab/shared/calc');
const recommendations = require('../recommendations');
const { pool } = require('../db');
const stravaActivities = require('./strava/activities');
const activityAnalysisRepo = require('../repositories/activityAnalysis');

const ANALYSIS_KIND = 'hr_histogram';

// Strava streams pause during a stopped ride (traffic light, food stop);
// the gap between two consecutive samples can be minutes long. Capping it
// mirrors ftpAnalysis.js's MIN_INTERVAL_SEC reasoning in spirit — a long gap
// must never get attributed to whatever bpm the rider happened to be at
// right before stopping.
const MAX_GAP_SEC = 30;

// Bounds one `GET /api/analytics/hr-zones` request's worst case: a user with
// a long backlog of un-analyzed rides still gets a bounded-latency response
// (at most this many new Strava stream calls), and whatever's left over is
// finished off the request path (see `continueInBackground`) so a later
// visit finds it cached.
const MAX_HR_STREAM_FETCHES_PER_REQUEST = 15;
const inFlightBackground = new Set(); // userIds with a background pass running

/**
 * Builds a zone-independent HR histogram from a `getStreams()` response:
 * the seconds between each pair of consecutive samples (capped at
 * `MAX_GAP_SEC`, per the Strava-pause reasoning above) attributed to the
 * *earlier* sample's bpm — that's the reading that was actually current
 * during that interval. Pure, no I/O — unit-tested directly.
 */
function computeHrHistogram(streams) {
  const hr = streams?.heartrate?.data || [];
  const time = streams?.time?.data || [];
  const n = Math.min(hr.length, time.length);

  const bins = {};
  let totalSeconds = 0;
  for (let i = 1; i < n; i += 1) {
    const dt = time[i] - time[i - 1];
    if (!(dt > 0)) continue; // out-of-order/duplicate timestamp — skip
    const bpm = hr[i - 1];
    if (!bpm || bpm <= 0) continue; // dropout/invalid reading — skip

    const seconds = Math.min(dt, MAX_GAP_SEC);
    const key = String(Math.round(bpm));
    bins[key] = (bins[key] || 0) + seconds;
    totalSeconds += seconds;
  }

  return { bins, total_seconds: totalSeconds, source: 'streams' };
}

/** Adds one histogram's seconds into `zoneSeconds` (keyed by zone id), bucketed by the current zones. */
function addHistogramToZones(histogram, zones, zoneSeconds) {
  for (const [bpmKey, seconds] of Object.entries(histogram.bins || {})) {
    const zoneId = zoneForHr(zones, Number(bpmKey));
    if (zoneId != null) zoneSeconds[zoneId] = (zoneSeconds[zoneId] || 0) + seconds;
  }
}

function periodStart(period) {
  const now = Date.now();
  switch (period) {
    case '4w': return new Date(now - 28 * 24 * 60 * 60 * 1000);
    case '3m': return new Date(now - 92 * 24 * 60 * 60 * 1000);
    case '1y': return new Date(now - 365 * 24 * 60 * 60 * 1000);
    case 'all': return null;
    default: return new Date(now - 28 * 24 * 60 * 60 * 1000); // same 4w default as /api/analytics/ftp
  }
}

/** This user's current HR zones — server-derived, same source as GET /api/user-profile's `hr_zones`. */
async function getZonesForUser(userId) {
  const profile = await recommendations.getUserProfile(pool, userId);
  return computeHrZones(profile || {});
}

/**
 * Batch time-in-HR-zones over `activities` (already period + has_heartrate
 * filtered by the caller). Per activity: cached histogram -> use it; else
 * fetch+compute+persist up to `MAX_HR_STREAM_FETCHES_PER_REQUEST` new
 * streams; anything past that budget falls back to `moving_time` in the
 * zone of `average_heartrate` (same approximation the client used to do)
 * and is queued for a background pass so the next call finds it cached.
 */
async function computeHrZonesDistribution(userId, activities, period) {
  const hrZones = await getZonesForUser(userId);
  const zones = hrZones.zones;
  const zoneSeconds = {};
  for (const z of zones) zoneSeconds[z.id] = 0;

  let withStreams = 0;
  let fallback = 0;
  let uncachedFetches = 0;
  const pendingActivities = []; // activities that hit the budget — finished in the background

  for (const activity of activities) {
    const cached = await activityAnalysisRepo.getCachedAnalysis(userId, activity.id, ANALYSIS_KIND);
    if (cached) {
      addHistogramToZones(cached.result, zones, zoneSeconds);
      withStreams += 1;
      continue;
    }

    if (uncachedFetches >= MAX_HR_STREAM_FETCHES_PER_REQUEST) {
      applyFallback(activity, zones, zoneSeconds);
      fallback += 1;
      pendingActivities.push(activity);
      continue;
    }

    uncachedFetches += 1;
    try {
      const streams = await stravaActivities.getStreams(userId, activity.id);
      const histogram = computeHrHistogram(streams);
      await activityAnalysisRepo.saveAnalysis(userId, activity.id, ANALYSIS_KIND, histogram);
      addHistogramToZones(histogram, zones, zoneSeconds);
      withStreams += 1;
    } catch (err) {
      logger.warn({ err: err.message, userId, activityId: activity.id }, '[hrZones] stream fetch/histogram failed, using average-HR fallback');
      applyFallback(activity, zones, zoneSeconds);
      fallback += 1;
    }
  }

  if (pendingActivities.length > 0) continueInBackground(userId, pendingActivities);

  const totalSeconds = Object.values(zoneSeconds).reduce((a, b) => a + b, 0);
  const zonesOut = zones.map((z) => {
    const seconds = zoneSeconds[z.id] || 0;
    return {
      id: z.id,
      name: z.name,
      color: z.color,
      min: z.min,
      max: z.max,
      seconds,
      percent: totalSeconds > 0 ? +((seconds / totalSeconds) * 100).toFixed(1) : 0,
    };
  });

  return {
    zones: zonesOut,
    coverage: {
      total: activities.length,
      withStreams,
      fallback,
      pending: pendingActivities.length,
    },
    period,
  };
}

/** Same approximation `HeartRateZonesChart.jsx` used client-side: the whole `moving_time` counts toward the zone of `average_heartrate`. */
function applyFallback(activity, zones, zoneSeconds) {
  if (!activity.average_heartrate || !activity.moving_time) return;
  const zoneId = zoneForHr(zones, activity.average_heartrate);
  if (zoneId != null) zoneSeconds[zoneId] = (zoneSeconds[zoneId] || 0) + activity.moving_time;
}

// Finishes the backlog of un-analyzed activities off the request path: one
// pass at a time per user (same `inFlightBackground` pattern as
// services/power.js's wind backlog), so the *next* `GET
// /api/analytics/hr-zones` call finds them all cached and `pending` drops.
function continueInBackground(userId, pendingActivities) {
  if (inFlightBackground.has(userId)) return;
  inFlightBackground.add(userId);
  setTimeout(async () => {
    try {
      for (const activity of pendingActivities) {
        try {
          const cached = await activityAnalysisRepo.getCachedAnalysis(userId, activity.id, ANALYSIS_KIND);
          if (cached) continue; // another request already filled it in
          const streams = await stravaActivities.getStreams(userId, activity.id);
          const histogram = computeHrHistogram(streams);
          await activityAnalysisRepo.saveAnalysis(userId, activity.id, ANALYSIS_KIND, histogram);
        } catch (err) {
          logger.warn({ err: err.message, userId, activityId: activity.id }, '[hrZones] background histogram pass failed for one activity, continuing');
        }
      }
      logger.info({ userId, count: pendingActivities.length }, '[hrZones] background HR-histogram pass done');
    } finally {
      inFlightBackground.delete(userId);
    }
  }, 50).unref?.();
}

module.exports = {
  computeHrHistogram,
  computeHrZonesDistribution,
  getZonesForUser,
  periodStart,
  ANALYSIS_KIND,
  MAX_HR_STREAM_FETCHES_PER_REQUEST,
};
