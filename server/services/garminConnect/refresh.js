// The rider's own "fetch my Garmin health data now" (owner decision
// 2026-11-10, docs/plans/garmin-connect-api.md §7): POST
// /api/garmin/connect/sync, called by the coach chat's "Get Garmin health
// data" chip and by the Refresh button on the Garmin integration screen.
//
// This is the ONE place a request handler uses the Personal API key, and it
// can only ever serve its owner: it runs for a rider whose connection was
// made with that key (`transport: 'personal'`, created by
// scripts/garmin-sync.js), and it refuses to store anything if the key turns
// out to read a different Garmin account than that connection names. A rider
// connected through the Developer Program will not come through here — their
// data is pushed to us.
//
// Health only, and only the last few days: three Garmin requests, a second
// or two. Rides stay with the script (a download per ride).
const config = require('../../config');
const logger = require('../../lib/logger');
const { externalHttp } = require('../../lib/http');
const { ApiError, tooMany } = require('../../lib/apiError');
const garminConnectRepo = require('../../repositories/garminConnect');
const { createGarminPersonalClient } = require('./personalClient');
const personalSync = require('./personalSync');
const coachHealth = require('./coachHealth');
const connection = require('./connection');

// Today, yesterday and the day before: enough to pick up last night and to
// finish yesterday's daytime figures.
const REFRESH_DAYS = 3;
// A double tap, or the chip and the screen button together, is one fetch.
const MIN_INTERVAL_MS = 60 * 1000;

// One client for the process: it caches the 24 h bearer token.
let client = null;
function personalClient() {
  client ??= createGarminPersonalClient({ apiKey: config.GARMIN_API, http: externalHttp });
  return client;
}

/**
 * Fetches the rider's latest health days from Garmin and returns
 * `{ synced_days, ...status }` (status as GET /api/garmin/connect/status).
 * `synced_days` is 0 when the last fetch was under a minute ago.
 *
 * Throws ApiError: 409 GARMIN_NOT_CONNECTED, 503 GARMIN_REFRESH_UNAVAILABLE
 * (this connection can't be refreshed from here), 409 GARMIN_ACCOUNT_MISMATCH,
 * 429 RATE_LIMITED (Garmin's limit), 502 UPSTREAM_ERROR (Garmin did not answer).
 */
async function refreshHealth(userId, { now = Date.now() } = {}) {
  const row = await garminConnectRepo.getConnection(userId);
  if (!row) throw new ApiError(409, 'GARMIN_NOT_CONNECTED', 'Garmin is not connected');
  if (!coachHealth.canRefresh(row)) {
    throw new ApiError(503, 'GARMIN_REFRESH_UNAVAILABLE', 'Garmin data cannot be refreshed on demand for this connection');
  }

  const stats = await garminConnectRepo.getHealthStats(userId);
  const lastSync = stats.last_health_sync_at ? new Date(stats.last_health_sync_at).getTime() : null;
  let syncedDays = 0;
  if (lastSync === null || now - lastSync >= MIN_INTERVAL_MS) {
    let summary;
    try {
      summary = await personalSync.syncPersonalHealth(userId, module.exports.personalClient(), {
        days: REFRESH_DAYS,
        pauseMs: 0,
        expectGarminUserId: row.garmin_user_id,
      });
    } catch (err) {
      if (err.code === 'GARMIN_ACCOUNT_MISMATCH') throw new ApiError(409, 'GARMIN_ACCOUNT_MISMATCH', err.message);
      throw err;
    }
    if (summary.rateLimited) throw tooMany('Garmin rate limit reached — try again in a few minutes');
    // All three requests failed: Garmin (or the key) is not answering. One
    // or two missing is an account without that feature, not an outage.
    if (summary.days === 0 && summary.missed.length === 3) {
      logger.warn({ userId, missed: summary.missed }, '[garminConnect] refresh: Garmin did not answer');
      throw new ApiError(502, 'UPSTREAM_ERROR', 'Garmin did not answer');
    }
    syncedDays = summary.days;
  }
  return { synced_days: syncedDays, ...(await connection.getStatus(userId)) };
}

module.exports = { refreshHealth, personalClient, REFRESH_DAYS, MIN_INTERVAL_MS };
