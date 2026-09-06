const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const ouraService = require('../ouraService');

let pool;

// Same shape as routes/skillsHistory.js's authenticateUser — there's no
// shared auth-middleware module in this codebase yet (server.js's
// authMiddleware isn't exported), so this is duplicated rather than
// refactored out, to keep this feature's blast radius to Oura only.
const authenticateUser = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId || decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token', code: 'UNAUTHORIZED' });
  }
};

const REDIRECT_URI = `${process.env.FRONTEND_URL || 'https://bikelab.app'}/oura/exchange_token`;

// Step 1 of connecting: mint a short-lived, single-purpose token that
// carries THIS user's id through the Oura redirect round-trip. We
// deliberately don't reuse the rider's normal session JWT for `state` — it
// would sit in Oura's own server logs and the browser history for the
// ~30 seconds of the OAuth dance. A narrowly-scoped, short-expiry token
// limits the blast radius if that ever leaked.
router.get('/connect-state', authenticateUser, (req, res) => {
  try {
    const state = jwt.sign(
      { userId: req.userId, purpose: 'oura_connect' },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );
    const authUrl = ouraService.buildAuthorizeUrl({ redirectUri: REDIRECT_URI, state });
    res.json({ authUrl });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

router.get('/status', authenticateUser, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT oura_user_id, oura_access_token FROM users WHERE id = $1',
      [req.userId]
    );
    const connected = !!rows[0]?.oura_access_token;
    let latest = null;
    if (connected) {
      const latestRes = await pool.query(
        `SELECT day, readiness_score, sleep_score, activity_score, total_sleep_hours,
                average_hrv, resting_heart_rate, min_heart_rate,
                stress_high_seconds, stress_recovery_high_seconds, stress_day_summary,
                resilience_level, resilience_sleep_recovery, resilience_daytime_recovery, resilience_stress,
                spo2_average, breathing_disturbance_index, synced_at
         FROM oura_daily_data WHERE user_id = $1 ORDER BY day DESC LIMIT 1`,
        [req.userId]
      );
      const row = latestRes.rows[0];
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
    res.json({ connected, ouraUserId: rows[0]?.oura_user_id || null, latest });
  } catch (e) {
    console.error('[oura] /status failed:', e.message);
    res.status(500).json({ error: 'Failed to load Oura status' });
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
    console.error('[oura] /sync failed:', e.response?.data || e.message);
    res.status(502).json({ error: 'Failed to sync from Oura' });
  }
});

router.post('/unlink', authenticateUser, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT oura_access_token FROM users WHERE id = $1', [req.userId]);
    if (rows[0]?.oura_access_token) {
      await ouraService.revokeToken(rows[0].oura_access_token);
    }
    await pool.query(
      `UPDATE users SET oura_access_token = NULL, oura_refresh_token = NULL,
                         oura_expires_at = NULL, oura_user_id = NULL WHERE id = $1`,
      [req.userId]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[oura] /unlink failed:', e.message);
    res.status(500).json({ error: 'Failed to disconnect Oura' });
  }
});

module.exports = function (sharedPool) {
  pool = sharedPool;
  return router;
};
