// SQL for Oura Ring integration (T-4.2, S-28: "no pool.query in routes/"
// DoD leftover from T-4.1). Backs routes/oura.js's simple reads/writes and
// ouraService.js's daily-data upsert (batched via UNNEST instead of one
// round-trip per day — see upsertDailyDataBatch).
const { pool } = require('../db');

// --- routes/oura.js -------------------------------------------------------

async function getOuraConnectionStatus(userId, db = pool) {
  const result = await db.query(
    'SELECT oura_user_id, oura_access_token FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

async function getLatestOuraDay(userId, db = pool) {
  const result = await db.query(
    `SELECT day, readiness_score, sleep_score, activity_score, total_sleep_hours,
            average_hrv, resting_heart_rate, min_heart_rate,
            stress_high_seconds, stress_recovery_high_seconds, stress_day_summary,
            resilience_level, resilience_sleep_recovery, resilience_daytime_recovery, resilience_stress,
            spo2_average, breathing_disturbance_index, synced_at
     FROM oura_daily_data WHERE user_id = $1 ORDER BY day DESC LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function getOuraAccessToken(userId, db = pool) {
  const result = await db.query('SELECT oura_access_token FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.oura_access_token || null;
}

async function clearOuraConnection(userId, db = pool) {
  await db.query(
    `UPDATE users SET oura_access_token = NULL, oura_refresh_token = NULL,
                       oura_expires_at = NULL, oura_user_id = NULL WHERE id = $1`,
    [userId]
  );
}

// --- ouraService.js --------------------------------------------------------

async function getUserOuraTokens(userId, db = pool) {
  const result = await db.query(
    'SELECT oura_access_token, oura_refresh_token, oura_expires_at FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

async function updateOuraTokens(userId, accessToken, refreshToken, expiresAt, db = pool) {
  await db.query(
    'UPDATE users SET oura_access_token = $1, oura_refresh_token = $2, oura_expires_at = $3 WHERE id = $4',
    [accessToken, refreshToken, expiresAt, userId]
  );
}

// Batched upsert for fetchAndCacheOuraData — one UNNEST round-trip instead
// of one INSERT-per-day loop (S-28, audit ouraService.js:267-328). Same
// columns/ON CONFLICT semantics as the original per-day query; `rows` is an
// array of { day, readiness_score, ..., raw } objects, one per Oura day.
async function upsertDailyDataBatch(userId, rows, db = pool) {
  if (!rows || rows.length === 0) return 0;

  const days = [];
  const readinessScores = [];
  const sleepScores = [];
  const activityScores = [];
  const totalSleepHours = [];
  const averageHrvs = [];
  const restingHeartRates = [];
  const minHeartRates = [];
  const temperatureDeviations = [];
  const stressHighSeconds = [];
  const stressRecoveryHighSeconds = [];
  const stressDaySummaries = [];
  const resilienceLevels = [];
  const resilienceSleepRecoveries = [];
  const resilienceDaytimeRecoveries = [];
  const resilienceStresses = [];
  const spo2Averages = [];
  const breathingDisturbanceIndices = [];
  const raws = [];

  for (const row of rows) {
    days.push(row.day);
    readinessScores.push(row.readiness_score ?? null);
    sleepScores.push(row.sleep_score ?? null);
    activityScores.push(row.activity_score ?? null);
    totalSleepHours.push(row.total_sleep_hours ?? null);
    averageHrvs.push(row.average_hrv ?? null);
    restingHeartRates.push(row.resting_heart_rate ?? null);
    minHeartRates.push(row.min_heart_rate ?? null);
    temperatureDeviations.push(row.temperature_deviation ?? null);
    stressHighSeconds.push(row.stress_high_seconds ?? null);
    stressRecoveryHighSeconds.push(row.stress_recovery_high_seconds ?? null);
    stressDaySummaries.push(row.stress_day_summary ?? null);
    resilienceLevels.push(row.resilience_level ?? null);
    resilienceSleepRecoveries.push(row.resilience_sleep_recovery ?? null);
    resilienceDaytimeRecoveries.push(row.resilience_daytime_recovery ?? null);
    resilienceStresses.push(row.resilience_stress ?? null);
    spo2Averages.push(row.spo2_average ?? null);
    breathingDisturbanceIndices.push(row.breathing_disturbance_index ?? null);
    raws.push(JSON.stringify(row.raw));
  }

  await db.query(
    `INSERT INTO oura_daily_data (
       user_id, day, readiness_score, sleep_score, activity_score,
       total_sleep_hours, average_hrv, resting_heart_rate, min_heart_rate, temperature_deviation,
       stress_high_seconds, stress_recovery_high_seconds, stress_day_summary,
       resilience_level, resilience_sleep_recovery, resilience_daytime_recovery, resilience_stress,
       spo2_average, breathing_disturbance_index, raw, synced_at
     )
     SELECT $1, t.*, NOW() FROM UNNEST(
       $2::date[], $3::int[], $4::int[], $5::int[],
       $6::numeric[], $7::numeric[], $8::numeric[], $9::numeric[], $10::numeric[],
       $11::int[], $12::int[], $13::text[],
       $14::text[], $15::numeric[], $16::numeric[], $17::numeric[],
       $18::numeric[], $19::numeric[], $20::jsonb[]
     ) AS t(day, readiness_score, sleep_score, activity_score,
            total_sleep_hours, average_hrv, resting_heart_rate, min_heart_rate, temperature_deviation,
            stress_high_seconds, stress_recovery_high_seconds, stress_day_summary,
            resilience_level, resilience_sleep_recovery, resilience_daytime_recovery, resilience_stress,
            spo2_average, breathing_disturbance_index, raw)
     ON CONFLICT (user_id, day) DO UPDATE SET
       readiness_score = EXCLUDED.readiness_score,
       sleep_score = EXCLUDED.sleep_score,
       activity_score = EXCLUDED.activity_score,
       total_sleep_hours = EXCLUDED.total_sleep_hours,
       average_hrv = EXCLUDED.average_hrv,
       resting_heart_rate = EXCLUDED.resting_heart_rate,
       min_heart_rate = EXCLUDED.min_heart_rate,
       temperature_deviation = EXCLUDED.temperature_deviation,
       stress_high_seconds = EXCLUDED.stress_high_seconds,
       stress_recovery_high_seconds = EXCLUDED.stress_recovery_high_seconds,
       stress_day_summary = EXCLUDED.stress_day_summary,
       resilience_level = EXCLUDED.resilience_level,
       resilience_sleep_recovery = EXCLUDED.resilience_sleep_recovery,
       resilience_daytime_recovery = EXCLUDED.resilience_daytime_recovery,
       resilience_stress = EXCLUDED.resilience_stress,
       spo2_average = EXCLUDED.spo2_average,
       breathing_disturbance_index = EXCLUDED.breathing_disturbance_index,
       raw = EXCLUDED.raw,
       synced_at = NOW()`,
    [
      userId, days, readinessScores, sleepScores, activityScores,
      totalSleepHours, averageHrvs, restingHeartRates, minHeartRates, temperatureDeviations,
      stressHighSeconds, stressRecoveryHighSeconds, stressDaySummaries,
      resilienceLevels, resilienceSleepRecoveries, resilienceDaytimeRecoveries, resilienceStresses,
      spo2Averages, breathingDisturbanceIndices, raws,
    ]
  );

  return rows.length;
}

module.exports = {
  getOuraConnectionStatus,
  getLatestOuraDay,
  getOuraAccessToken,
  clearOuraConnection,
  getUserOuraTokens,
  updateOuraTokens,
  upsertDailyDataBatch,
};
