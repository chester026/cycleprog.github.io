// Power-meter profile for a rider (best 5 s/1/5/20/60 min, FTP, W/kg, Coggan
// zones) — the numbers the coach quotes instead of averaging `average_watts`.
//
// Only rides with a real power meter (`device_watts`, as Strava marks it)
// count: `estimated_power` is BikeLab's own physics guess (services/power.js)
// and would make every figure here fiction. Per ride, the watts stream is
// fetched once, reduced to its best efforts and cached in `activity_analysis`
// (`kind = 'power'`), so repeat calls never go back to Strava. New stream
// fetches per call are bounded like services/ftpAnalysis.js's; what's left is
// picked up by the next call.
const logger = require('../lib/logger');
const {
  DEFAULT_POWER_DURATIONS,
  bestEfforts,
  toOneHertz,
  mergeBestEfforts,
  estimateFtp,
  powerZones,
  wPerKg,
} = require('@bikelab/shared/calc');
const bikesRepo = require('../repositories/bikes');
const stravaActivities = require('./strava/activities');
const stravaTokens = require('./strava/tokens');
const { StravaRateLimitError } = require('./strava/client');
const activityAnalysisRepo = require('../repositories/activityAnalysis');

const ANALYSIS_KIND = 'power';
const DEFAULT_WEEKS = 12;
const MAX_RIDES_PER_CALL = 50;
const MAX_UNCACHED_STREAM_FETCHES = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

function isPowerMeterRide(activity) {
  return !!(activity.device_watts && activity.average_watts > 0);
}

/** Per-ride best efforts from a `getStreams()` response, `{}` when the ride has no watts stream. */
function computeRideEfforts(streams) {
  const watts = streams?.watts?.data;
  const time = streams?.time?.data;
  if (!Array.isArray(watts) || watts.length === 0) return {};
  const perSecond = Array.isArray(time) && time.length > 0 ? toOneHertz(time, watts) : watts;
  return bestEfforts(perSecond, DEFAULT_POWER_DURATIONS);
}

async function loadActivities(userId) {
  try {
    return await stravaActivities.getActivities(userId);
  } catch (err) {
    if (err instanceof stravaTokens.StravaNotLinkedError) return [];
    throw err;
  }
}

/**
 * Cached or freshly fetched best efforts for each ride, longest first.
 * Returns `{ rides, analyzed, stoppedEarly }`; `stoppedEarly` means the fetch
 * budget or Strava's rate limit cut the pass short.
 */
async function collectRideEfforts(userId, candidates) {
  const rides = [];
  let uncachedFetches = 0;
  let stoppedEarly = false;

  for (const activity of candidates) {
    const date = String(activity.start_date).slice(0, 10);
    const cached = await activityAnalysisRepo.getCachedAnalysis(userId, activity.id, ANALYSIS_KIND);
    if (cached) {
      rides.push({ activityId: activity.id, date, efforts: cached.result.efforts || {} });
      continue;
    }
    if (uncachedFetches >= MAX_UNCACHED_STREAM_FETCHES) {
      stoppedEarly = true;
      continue;
    }
    uncachedFetches += 1;
    try {
      const efforts = computeRideEfforts(await stravaActivities.getStreams(userId, activity.id));
      await activityAnalysisRepo.saveAnalysis(userId, activity.id, ANALYSIS_KIND, { efforts });
      rides.push({ activityId: activity.id, date, efforts });
    } catch (err) {
      logger.warn({ err: err.message, userId, activityId: activity.id }, '[powerProfile] stream fetch failed, skipping ride');
      stoppedEarly = true;
      // Strava's quota is shared by every rider — stop rather than burn more calls.
      if (err instanceof StravaRateLimitError) break;
    }
  }
  return { rides, stoppedEarly };
}

function buildNote({ weeks, qualifying, analyzed, ftp, stoppedEarly, capped }) {
  if (qualifying === 0) {
    return `No power-meter rides in the last ${weeks} weeks (only rides recorded with a real power meter count; BikeLab's estimated power is not used), so FTP and zones can't be derived from rides.`;
  }
  const notes = [];
  if (stoppedEarly || capped) {
    notes.push(`Analyzed ${analyzed} of ${qualifying} power-meter rides in the window; calling again picks up more, so figures may still rise.`);
  }
  if (!ftp) {
    notes.push('No ride in the window has a continuous 20-minute (or 60-minute) effort, so FTP cannot be estimated yet.');
  }
  return notes.length > 0 ? notes.join(' ') : null;
}

/**
 * Power profile over the last `weeks` weeks of the rider's power-meter rides.
 * `ftp`, `wPerKg` and `zones` stay null/empty when the data can't support them.
 */
async function getPowerProfile(userId, { weeks = DEFAULT_WEEKS } = {}) {
  const since = Date.now() - weeks * 7 * DAY_MS;
  const activities = await loadActivities(userId);
  const qualifying = activities.filter((a) => isPowerMeterRide(a) && new Date(a.start_date).getTime() > since);

  // Longest first: only rides of 20+ min can set the FTP-relevant efforts.
  const candidates = [...qualifying].sort((a, b) => (b.moving_time || 0) - (a.moving_time || 0)).slice(0, MAX_RIDES_PER_CALL);
  const { rides, stoppedEarly } = await collectRideEfforts(userId, candidates);

  const profile = mergeBestEfforts(rides);
  const ftpEstimate = estimateFtp(profile);
  // Read-only lookup: recommendations.getUserProfile would create a default profile row.
  const weightKg = ftpEstimate ? await bikesRepo.getRiderWeight(userId) : null;

  return {
    weeks,
    ridesWithPower: qualifying.length,
    ridesAnalyzed: rides.length,
    bestEfforts: profile,
    ftp: ftpEstimate && {
      watts: ftpEstimate.watts,
      method: ftpEstimate.method,
      fromActivityId: ftpEstimate.activityId,
      date: ftpEstimate.date,
    },
    wPerKg: ftpEstimate ? wPerKg(ftpEstimate.watts, weightKg) : null,
    zones: ftpEstimate ? powerZones(ftpEstimate.watts) : [],
    note: buildNote({
      weeks,
      qualifying: qualifying.length,
      analyzed: rides.length,
      ftp: ftpEstimate,
      stoppedEarly,
      capped: qualifying.length > candidates.length,
    }),
  };
}

module.exports = {
  getPowerProfile,
  computeRideEfforts,
  ANALYSIS_KIND,
  DEFAULT_WEEKS,
  MAX_RIDES_PER_CALL,
  MAX_UNCACHED_STREAM_FETCHES,
};
