// Garmin health data as the AI coach sees it (docs/plans/
// garmin-connect-api.md §7): the reader behind analyze_readiness, the
// feasibility tool's one-line recovery note and the system prompt's Health
// section. Reads garmin_health_days only — it never calls Garmin; fetching is
// the rider's explicit action (the chat's "Get Garmin health data" chip →
// POST /api/garmin/connect/sync, services/garminConnect/refresh.js).
//
// Owner decision 2026-11-10 — Garmin SUPPLEMENTS the other sources: a rider
// with Apple Health or Oura keeps getting sleep / HRV / readiness from
// those, and Garmin adds what they don't have, Body Battery and stress
// (`supplement()` below). Only a rider with Garmin alone gets Garmin's own
// sleep, HRV and resting heart rate too.
//
// Never throws: a coach turn must not fail because this table could not be
// read. Every failure degrades to "no Garmin data".
const config = require('../../config');
const logger = require('../../lib/logger');
const garminConnectRepo = require('../../repositories/garminConnect');

// Body Battery and stress move all day; past this age the figures are
// "as of earlier", and the app offers to fetch fresh ones.
const STALE_AFTER_MS = 3 * 60 * 60 * 1000;
// Within this long after a fetch, another one is pointless (refresh.js would
// not even call Garmin within a minute): the chat does not offer the button
// again on the very reply that follows the rider's tap.
const JUST_SYNCED_MS = 2 * 60 * 1000;
const DEFAULT_DAYS = 7;
const MAX_DAYS = 30;

// Garmin's Developer Program allows AI processing of a rider's data only
// with an AI transparency statement and their explicit consent (plan §1).
// That screen does not exist yet, so the coach reads Garmin data only for a
// connection made with the owner's own Personal API key. Add 'oauth' here
// together with the consent flow, not before.
const COACH_TRANSPORTS = new Set(['personal']);

const minutes = (seconds) => (seconds === null || seconds === undefined ? null : Math.round(seconds / 60));
const hours = (seconds) => (seconds === null || seconds === undefined ? null : Math.round(seconds / 360) / 10);

/** One garmin_health_days row → the day as the model reads it (units in the names). */
function toCoachDay(row) {
  return {
    day: row.day,
    body_battery_high: row.body_battery_high,
    body_battery_low: row.body_battery_low,
    body_battery_charged: row.body_battery_charged,
    body_battery_drained: row.body_battery_drained,
    stress_avg: row.stress_avg,
    stress_qualifier: row.stress_qualifier,
    stress_high_minutes: minutes(row.stress_high_seconds),
    stress_rest_minutes: minutes(row.stress_rest_seconds),
    sleep_hours: hours(row.sleep_seconds),
    sleep_score: row.sleep_score,
    hrv_ms: row.hrv_last_night_ms === null ? null : Math.round(row.hrv_last_night_ms),
    hrv_status: row.hrv_status,
    resting_hr_bpm: row.resting_hr,
  };
}

const SUPPLEMENT_FIELDS = [
  'day', 'body_battery_high', 'body_battery_low', 'body_battery_charged', 'body_battery_drained',
  'stress_avg', 'stress_qualifier', 'stress_high_minutes', 'stress_rest_minutes',
];

/**
 * The same payload reduced to what only Garmin has, for a rider whose sleep
 * / HRV / readiness come from another source: two sets of sleep numbers for
 * one night would leave the model to pick, and it would pick differently
 * each time. Days with neither Body Battery nor stress are dropped.
 */
function supplement(health) {
  if (!health) return null;
  const days = health.days
    .filter((d) => d.body_battery_high !== null || d.stress_avg !== null)
    .map((d) => Object.fromEntries(SUPPLEMENT_FIELDS.map((field) => [field, d[field]])));
  return { ...health, days };
}

/** Whether the server can fetch fresh data for this connection itself (see refresh.js). */
function canRefresh(connection, apiKey = config.GARMIN_API) {
  return connection.transport === 'personal' && !!apiKey;
}

/**
 * What the coach can do with this rider's Garmin: `connected` — it may read
 * their data at all (COACH_TRANSPORTS); `canRefresh` — the app's "Get Garmin
 * health data" button would work for them (see refresh.js). The system
 * prompt and the chat route both go by this, so the coach never points the
 * rider at a button that is not there. Never throws.
 */
async function getCoachAccess(userId, { apiKey = config.GARMIN_API } = {}) {
  const none = { connected: false, canRefresh: false };
  if (!userId) return none;
  try {
    const connection = await garminConnectRepo.getConnection(userId);
    if (!connection || !COACH_TRANSPORTS.has(connection.transport)) return none;
    return { connected: true, canRefresh: canRefresh(connection, apiKey) };
  } catch (err) {
    logger.warn({ err: err.message, userId }, '[garminConnect] connection lookup failed, coach runs without Garmin');
    return none;
  }
}

/**
 * The rider's recent Garmin health days for the coach, or null when Garmin
 * is not connected (or not usable by the coach — COACH_TRANSPORTS).
 *
 * `{ days, as_of, stale, can_refresh }` — `days` newest first (toCoachDay),
 * possibly empty; `as_of` the ISO time the data was last fetched from
 * Garmin; `stale` true when that is over STALE_AFTER_MS ago or never
 * happened; `can_refresh` whether the app's refresh chip would work.
 */
async function getCoachHealth(userId, { days = DEFAULT_DAYS, now = Date.now(), apiKey = config.GARMIN_API } = {}) {
  if (!userId) return null;
  try {
    const connection = await garminConnectRepo.getConnection(userId);
    if (!connection || !COACH_TRANSPORTS.has(connection.transport)) return null;
    const limit = Math.min(Math.max(parseInt(days, 10) || DEFAULT_DAYS, 1), MAX_DAYS);
    const [rows, stats] = await Promise.all([
      garminConnectRepo.getHealthDays(userId, { limit }),
      garminConnectRepo.getHealthStats(userId),
    ]);
    const syncedAt = stats.last_health_sync_at ? new Date(stats.last_health_sync_at).getTime() : null;
    return {
      days: rows.map(toCoachDay),
      as_of: syncedAt === null ? null : new Date(syncedAt).toISOString(),
      stale: syncedAt === null || now - syncedAt > STALE_AFTER_MS,
      can_refresh: canRefresh(connection, apiKey),
    };
  } catch (err) {
    logger.warn({ err: err.message, userId }, '[garminConnect] health read failed, coach runs without Garmin');
    return null;
  }
}

/** Whether the rider's Garmin health data was fetched within the last couple of minutes. Never throws. */
async function wasJustSynced(userId, { now = Date.now() } = {}) {
  const health = await getCoachHealth(userId, { days: 1, now });
  return !!health?.as_of && now - Date.parse(health.as_of) < JUST_SYNCED_MS;
}

module.exports = { getCoachHealth, getCoachAccess, wasJustSynced, JUST_SYNCED_MS, supplement, toCoachDay, canRefresh, STALE_AFTER_MS, COACH_TRANSPORTS };
