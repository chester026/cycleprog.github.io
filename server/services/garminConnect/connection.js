// The rider's Garmin Connect link, as the app's Integrations screen sees it
// (GET /api/garmin/connect/status — docs/plans/garmin-connect-api.md §6):
// is it connected, how many rides and health days came through it, and the
// newest health day's headline figures.
const garminConnectRepo = require('../../repositories/garminConnect');

// Whether a rider can link Garmin by themselves from the app. False until
// BikeLab is approved for Garmin's Developer Program and the OAuth flow
// exists: today the only connection is the owner's, made out-of-band by
// scripts/garmin-sync.js with the Personal API key. The app shows its
// "connect" UI disabled while this is false, so flipping it here is what
// opens the feature.
const SELF_SERVICE_AVAILABLE = false;

const round1 = (n) => Math.round(n * 10) / 10;

// The newest health day as the app shows it: hours rather than seconds, and
// only the handful of figures a rider recognises from Garmin Connect.
function latestHealth(row) {
  if (!row) return null;
  return {
    day: row.day,
    sleep_hours: row.sleep_seconds === null ? null : round1(row.sleep_seconds / 3600),
    sleep_score: row.sleep_score,
    hrv_ms: row.hrv_last_night_ms === null ? null : Math.round(row.hrv_last_night_ms),
    hrv_status: row.hrv_status,
    resting_hr: row.resting_hr,
    body_battery_high: row.body_battery_high,
    body_battery_low: row.body_battery_low,
    stress_avg: row.stress_avg,
  };
}

const DISCONNECTED = {
  connected: false,
  transport: null,
  connected_at: null,
  last_sync_at: null,
  activities: 0,
  last_activity_at: null,
  health_days: 0,
  last_health_day: null,
  health_latest: null,
};

/**
 * `{ connected, available, transport, connected_at, last_sync_at,
 * activities, last_activity_at, health_days, last_health_day,
 * health_latest }` — everything null/0 when not connected.
 */
async function getStatus(userId) {
  const connection = await garminConnectRepo.getConnection(userId);
  if (!connection) return { ...DISCONNECTED, available: SELF_SERVICE_AVAILABLE };
  const [stats, healthStats, healthDays] = await Promise.all([
    garminConnectRepo.getActivityStats(userId),
    garminConnectRepo.getHealthStats(userId),
    garminConnectRepo.getHealthDays(userId, { limit: 1 }),
  ]);
  return {
    connected: true,
    available: SELF_SERVICE_AVAILABLE,
    transport: connection.transport,
    connected_at: connection.connected_at,
    last_sync_at: connection.last_sync_at,
    activities: stats.activities,
    last_activity_at: stats.last_activity_at,
    health_days: healthStats.health_days,
    last_health_day: healthStats.last_health_day,
    health_latest: latestHealth(healthDays[0]),
  };
}

module.exports = { getStatus, latestHealth, SELF_SERVICE_AVAILABLE };
