// Personal-key transport, health side: the Garmin Connect web gateway's
// daily-summary / sleep / HRV payloads → garmin_health_days rows
// (docs/plans/garmin-connect-api.md §4–5, migration 1758000000020).
//
// These JSON shapes belong to the Personal API. The Developer Program pushes
// different ones (dailies, sleeps, hrv summaries); its mapper will be a
// sibling of this file writing the same row. The row is the common ground,
// as the FIT file is for rides.
//
// Field names come from scripts/garmin-probe.js run on the owner's account
// (shapes only — the probe keeps no health values). Everything is read
// defensively: a missing block, a null or one of Garmin's negative "no
// data" markers becomes null, never a wrong number.
//
// Pure: payloads in, rows out.
const { HEALTH_COLUMNS } = require('./healthColumns');

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// A reading, or null. Garmin marks "not measured" with -1 / -2 in places
// (stress most of all), so a negative is never a value here.
function reading(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
const int = (value) => (reading(value) === null ? null : Math.round(value));
const real = (value, digits = 1) => {
  const n = reading(value);
  if (n === null) return null;
  const k = 10 ** digits;
  return Math.round(n * k) / k;
};
// Positive only: 0 bpm, a 0 sleep score or 0 ms of HRV is "not measured".
const positive = (value) => (reading(value) > 0 ? value : null);
const positiveInt = (value) => (positive(value) === null ? null : Math.round(value));
const millisToSeconds = (value) => (reading(value) === null ? null : Math.round(value / 1000));
const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** One /usersummary-service/v2/dailysummaries item → the daytime columns. */
function mapDailySummary(item) {
  const { heartRate, stress, bodyBattery, respiration, movement } = item || {};
  return {
    resting_hr: positiveInt(heartRate?.restingValue),
    min_hr: positiveInt(heartRate?.minValue),
    max_hr: positiveInt(heartRate?.maxValue),
    stress_avg: int(stress?.avgLevel),
    stress_max: int(stress?.maxLevel),
    stress_qualifier: text(stress?.qualifier),
    stress_rest_seconds: millisToSeconds(stress?.restDurationInMillis),
    stress_low_seconds: millisToSeconds(stress?.lowStressDurationInMillis),
    stress_medium_seconds: millisToSeconds(stress?.mediumStressDurationInMillis),
    stress_high_seconds: millisToSeconds(stress?.highStressDurationInMillis),
    body_battery_high: int(bodyBattery?.maxValue),
    body_battery_low: int(bodyBattery?.minValue),
    body_battery_charged: int(bodyBattery?.chargedValue),
    body_battery_drained: int(bodyBattery?.drainedValue),
    respiration_avg: real(positive(respiration?.avgValue)),
    steps: int(movement?.steps?.value),
  };
}

/** One /sleep-service/sleep/dailySleepSummariesByDate item → the sleep columns. */
function mapSleep(item) {
  const s = item || {};
  return {
    sleep_seconds: positiveInt(s.sleepTimeSeconds),
    deep_sleep_seconds: int(s.deepSleepSeconds),
    light_sleep_seconds: int(s.lightSleepSeconds),
    rem_sleep_seconds: int(s.remSleepSeconds),
    awake_seconds: int(s.awakeSleepSeconds),
    nap_seconds: positiveInt(s.napTimeSeconds),
    // The probe saw no scored night; Garmin Connect nests the score like this.
    sleep_score: positiveInt(s.sleepScores?.overall?.value ?? s.overallSleepScore?.value ?? s.sleepScore),
    sleep_avg_hr: real(positive(s.avgHeartRate)),
    sleep_avg_stress: real(s.avgSleepStress),
    sleep_respiration: real(positive(s.averageRespirationValue)),
    spo2_avg: real(positive(s.averageSpO2Value)),
  };
}

/** One /hrv-service/hrv/daily `hrvSummaries` item → the HRV columns. */
function mapHrv(item) {
  return {
    hrv_last_night_ms: real(positive(item?.lastNightAvg)),
    hrv_weekly_avg_ms: real(positive(item?.weeklyAvg)),
    hrv_status: text(item?.status),
  };
}

const listOf = (payload, key) => (Array.isArray(payload) ? payload : Array.isArray(payload?.[key]) ? payload[key] : []);

/**
 * The three range payloads → one row per day that has any reading, oldest
 * first: `{ day: 'YYYY-MM-DD', ...HEALTH_COLUMNS }`. Any of the three may be
 * null (endpoint missing on the account, request failed): the days simply
 * come out without those columns.
 */
function mapPersonalHealth({ summaries = null, sleep = null, hrv = null } = {}) {
  const byDay = new Map();
  const merge = (day, patch) => {
    if (typeof day !== 'string' || !DAY_RE.test(day)) return;
    byDay.set(day, { ...(byDay.get(day) || {}), ...patch });
  };
  for (const item of listOf(summaries, 'data')) merge(item?.calendarDate, mapDailySummary(item));
  for (const item of listOf(sleep, 'dailySleepSummaries')) merge(item?.calendarDate ?? item?.sleepNeed?.calendarDate, mapSleep(item));
  for (const item of listOf(hrv, 'hrvSummaries')) merge(item?.calendarDate, mapHrv(item));

  const rows = [];
  for (const day of [...byDay.keys()].sort()) {
    const values = byDay.get(day);
    const row = { day };
    for (const column of HEALTH_COLUMNS) row[column] = values[column] ?? null;
    // Steps alone are not health data: a day the watch only sat in a pocket
    // is not a day worth a row.
    if (HEALTH_COLUMNS.some((column) => column !== 'steps' && row[column] !== null)) rows.push(row);
  }
  return rows;
}

/** The Garmin account id the payloads belong to, when they say (for the connection row). */
function garminUserIdOf({ summaries = null, hrv = null } = {}) {
  const fromSummaries = listOf(summaries, 'data').find((item) => item?.userProfilePk != null)?.userProfilePk;
  return fromSummaries ?? hrv?.userProfilePk ?? null;
}

module.exports = { mapPersonalHealth, mapDailySummary, mapSleep, mapHrv, garminUserIdOf };
