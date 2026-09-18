const express = require('express');
const logger = require('../lib/logger');
const router = express.Router();
const ouraService = require('../ouraService');
const ouraRepo = require('../repositories/oura');
const { authMiddleware: authenticateUser } = require('../middleware/auth');
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const { issuePurposeToken } = require('../lib/jwt');
const config = require('../config');
patchAsyncRoutes(router);

let pool;

const REDIRECT_URI = `${config.FRONTEND_URL}/oura/exchange_token`;

// Step 1 of connecting: mint a short-lived, single-purpose token that
// carries THIS user's id through the Oura redirect round-trip. We
// deliberately don't reuse the rider's normal session JWT for `state` — it
// would sit in Oura's own server logs and the browser history for the
// ~30 seconds of the OAuth dance. A narrowly-scoped, short-expiry token
// limits the blast radius if that ever leaked.
router.get('/connect-state', authenticateUser, (req, res) => {
  try {
    const state = issuePurposeToken(req.userId, 'oura_connect', '10m');
    const authUrl = ouraService.buildAuthorizeUrl({ redirectUri: REDIRECT_URI, state });
    res.json({ authUrl });
  } catch (e) {
    res.status(503).json({ error: e.message, code: 'UPSTREAM_ERROR' });
  }
});

router.get('/status', authenticateUser, async (req, res) => {
  try {
    const userRow = await ouraRepo.getOuraConnectionStatus(req.userId);
    const connected = !!userRow?.oura_access_token;
    let latest = null;
    if (connected) {
      const row = await ouraRepo.getLatestOuraDay(req.userId);
      // Postgres NUMERIC columns come back from pg as strings (it avoids
      // silently losing precision on floats) — total_sleep_hours/average_hrv/
      // resting_heart_rate are NUMERIC, so without this the client's
      // `.toFixed()` calls crash on what looks like a number but is a string.
      // readiness/sleep/activity_score are INTEGER and come back as real
      // numbers already, so they're passed through as-is.
      latest = row
        ? {
            day: row.day,
            readiness_score: row.readiness_score,
            sleep_score: row.sleep_score,
            activity_score: row.activity_score,
            total_sleep_hours: row.total_sleep_hours != null ? Number(row.total_sleep_hours) : null,
            average_hrv: row.average_hrv != null ? Number(row.average_hrv) : null,
            resting_heart_rate: row.resting_heart_rate != null ? Number(row.resting_heart_rate) : null,
            min_heart_rate: row.min_heart_rate != null ? Number(row.min_heart_rate) : null,
            // stress_high/recovery_high_seconds are INTEGER — pg returns those as real
            // numbers already, unlike the NUMERIC columns above.
            stress_high_seconds: row.stress_high_seconds,
            stress_recovery_high_seconds: row.stress_recovery_high_seconds,
            stress_day_summary: row.stress_day_summary,
            resilience_level: row.resilience_level,
            resilience_sleep_recovery: row.resilience_sleep_recovery != null ? Number(row.resilience_sleep_recovery) : null,
            resilience_daytime_recovery: row.resilience_daytime_recovery != null ? Number(row.resilience_daytime_recovery) : null,
            resilience_stress: row.resilience_stress != null ? Number(row.resilience_stress) : null,
            spo2_average: row.spo2_average != null ? Number(row.spo2_average) : null,
            breathing_disturbance_index: row.breathing_disturbance_index != null ? Number(row.breathing_disturbance_index) : null,
          }
        : null;
    }
    res.json({ connected, ouraUserId: userRow?.oura_user_id || null, latest });
  } catch (e) {
    logger.error({ err: e.message }, '[oura] /status failed:');
    res.status(500).json({ error: 'Failed to load Oura status', code: 'INTERNAL' });
  }
});

// On-demand refresh — same idea as Strava's "open the Activities tab once
// to sync": the rider taps a button, we pull the last N days from Oura.
router.post('/sync', authenticateUser, async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.body?.days, 10) || 14, 1), 60);
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  try {
    const result = await ouraService.fetchAndCacheOuraData(pool, req.userId, {
      startDate: fmt(start),
      endDate: fmt(end),
    });
    res.json(result);
  } catch (e) {
    logger.error({ err: e.response?.data || e.message }, '[oura] /sync failed:');
    res.status(502).json({ error: 'Failed to sync from Oura', code: 'UPSTREAM_ERROR' });
  }
});

router.post('/unlink', authenticateUser, async (req, res) => {
  try {
    const accessToken = await ouraRepo.getOuraAccessToken(req.userId);
    if (accessToken) {
      await ouraService.revokeToken(accessToken);
    }
    await ouraRepo.clearOuraConnection(req.userId);
    res.json({ ok: true });
  } catch (e) {
    logger.error({ err: e.message }, '[oura] /unlink failed:');
    res.status(500).json({ error: 'Failed to disconnect Oura', code: 'INTERNAL' });
  }
});

module.exports = function (sharedPool) {
  pool = sharedPool;
  return router;
};
