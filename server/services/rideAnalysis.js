// Per-ride power breakdown for the coach (docs/plans/
// coach-ride-power-breakdown.md §2–3): NP/IF/TSS, time in zones, this
// ride's best efforts, a climb/flat/descent segment table, pacing fade,
// coasting share — computed once from the ride's per-second streams
// (services/strava/activities.js#getStreams, cached in activity_streams)
// with @bikelab/shared/calc's ridePowerBreakdown, and stored in
// activity_analysis under `kind = 'ride_power'` so repeat questions cost
// no Strava call and no recompute.
//
// FTP (for IF/TSS/zones) comes from the rider's power profile when they have
// one; a ride without a watts stream still gets the segment table (speed, HR,
// grade per climb) with `source: 'none'`.
const logger = require('../lib/logger');
const { ridePowerBreakdown, ridePowerInsights } = require('@bikelab/shared/calc');
const stravaActivities = require('./strava/activities');
const stravaTokens = require('./strava/tokens');
const { StravaRateLimitError } = require('./strava/client');
const activityAnalysisRepo = require('../repositories/activityAnalysis');
const powerProfileService = require('./powerProfile');
const bikesRepo = require('../repositories/bikes');

const ANALYSIS_KIND = 'ride_power';
// Bump when the calc's output shape changes so stale cached rows are
// recomputed instead of served.
const ANALYSIS_VERSION = 4;

async function ftpFor(userId) {
  try {
    const profile = await powerProfileService.getPowerProfile(userId, { weeks: 12 });
    return profile?.ftp?.watts ?? null;
  } catch (err) {
    logger.warn({ err: err.message, userId }, '[rideAnalysis] power profile unavailable, computing without FTP');
    return null;
  }
}

/**
 * `{ activity_id, ...RidePowerBreakdown, ftp_w }` or `{ activity_id, source:
 * 'none', note }` when the streams can't be read (not linked, rate-limited,
 * Strava error). Never throws — the caller is an LLM tool executor.
 */
async function getRidePowerBreakdown(userId, activityId) {
  const stravaId = Number(activityId);
  if (!Number.isFinite(stravaId) || stravaId <= 0) {
    return { activity_id: activityId, source: 'none', note: 'activity_id must be a Strava activity id (a positive integer).' };
  }

  // IF/TSS/zones depend on the FTP of the day, and the FTP moves with every
  // new ride (or a manual entry) — so the cache is keyed on the FTP it was
  // computed with, and a changed FTP recomputes from the (cached) streams.
  const ftp = await ftpFor(userId);
  const cached = await activityAnalysisRepo.getCachedAnalysis(userId, stravaId, ANALYSIS_KIND);
  if (cached && cached.result?.version === ANALYSIS_VERSION && (cached.result.ftp ?? null) === ftp) {
    return cached.result.breakdown;
  }

  let streams;
  try {
    streams = await stravaActivities.getStreams(userId, stravaId);
  } catch (err) {
    if (err instanceof stravaTokens.StravaNotLinkedError) {
      return { activity_id: stravaId, source: 'none', note: 'Strava is not linked, so no per-second data is available for this ride.' };
    }
    if (err instanceof StravaRateLimitError) {
      return { activity_id: stravaId, source: 'none', note: 'Strava rate limit reached — the per-second data for this ride is temporarily unavailable; try again in a few minutes.' };
    }
    logger.warn({ err: err.message, userId, stravaId }, '[rideAnalysis] streams fetch failed');
    return { activity_id: stravaId, source: 'none', note: `Could not read this ride's streams from Strava (${err.response?.status || err.message}).` };
  }

  const breakdown = { activity_id: stravaId, ftp_w: ftp, ...ridePowerBreakdown(streams, { ftp }) };
  if (breakdown.source === 'none') {
    breakdown.note = 'No power-meter data on this ride: watts fields are null. The segment table (speed, heart rate, grade per climb/descent) is real and can be discussed.';
  }
  try {
    await activityAnalysisRepo.saveAnalysis(userId, stravaId, ANALYSIS_KIND, { version: ANALYSIS_VERSION, ftp, breakdown });
  } catch (err) {
    logger.warn({ err: err.message, userId, stravaId }, '[rideAnalysis] failed to cache ride_power');
  }
  return breakdown;
}

const INSIGHTS_WEEKS = 12;

/**
 * The ride screen's Power block (docs/plans/ride-power-insights.md):
 * `{ breakdown, insights }`. `insights` compares this ride's best efforts
 * with every power-meter ride of the last 12 weeks (ranks, gap to best,
 * weekly trend, pacing); null when the ride has no power meter. The
 * history read is the same cached-per-ride pass getPowerProfile uses, so
 * opening a ride costs no extra Strava calls once the profile has been seen.
 */
async function getRidePowerInsights(userId, activityId) {
  const breakdown = await getRidePowerBreakdown(userId, activityId);
  if (breakdown.source !== 'meter') return { breakdown, insights: null };

  let history;
  try {
    history = await powerProfileService.getRideEffortsHistory(userId, { weeks: INSIGHTS_WEEKS });
  } catch (err) {
    if (err instanceof StravaRateLimitError) {
      history = { rides: [], activities: [], partial: true };
    } else {
      throw err;
    }
  }
  const stravaId = Number(activityId);
  const thisRide = history.activities.find((a) => Number(a.id) === stravaId);
  const rideDate = thisRide ? String(thisRide.start_date).slice(0, 10) : new Date().toISOString().slice(0, 10);
  // Read-only lookup (recommendations.getUserProfile would create a row).
  const weightKg = breakdown.ftp_w ? await bikesRepo.getRiderWeight(userId) : null;
  const insights = ridePowerInsights({
    activityId: stravaId,
    rideDate,
    efforts: breakdown.best_efforts_w,
    history: history.rides,
    intensityFactor: breakdown.if_,
    vi: breakdown.vi,
    fadePct: breakdown.fade ? breakdown.fade.pct : null,
    ftpWatts: breakdown.ftp_w,
    weightKg,
  });
  return { breakdown, insights: { ...insights, weeks: INSIGHTS_WEEKS, partial: !!history.partial } };
}

module.exports = { getRidePowerBreakdown, getRidePowerInsights, ANALYSIS_KIND, ANALYSIS_VERSION, INSIGHTS_WEEKS };
