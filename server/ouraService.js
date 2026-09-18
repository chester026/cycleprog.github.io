// server/ouraService.js
//
// Oura Ring integration — HTTP glue only (OAuth token exchange/refresh +
// Oura Cloud API v2 reads). Oura is a health-data SOURCE for the AI Coach
// (readiness/sleep/HRV), unlike Strava which is also how a rider logs in
// and creates their account here. Oura never creates or authenticates a
// user — every function below operates on an ALREADY-KNOWN userId (the
// rider must already be logged in via Strava before connecting Oura).
// See routes/oura.js for the authenticated API surface and the
// `/oura/exchange_token` callback in server.js for the OAuth handoff.
//
// Data cached from here lives in Postgres (oura_daily_data — see the
// migration near strava_athlete_id in server.js), unlike Apple Health's
// healthContext which deliberately never touches the DB. That's not a
// privacy downgrade so much as a technical necessity: Oura's access/refresh
// tokens have to live server-side to be refreshed at all, so once tokens
// are already server-side, caching the daily scores alongside them avoids
// hitting Oura's API on every single coach message.
//
// NOTE for whoever fills in OURA_CLIENT_ID/SECRET: the exact field names
// Oura's v2 API returns (day/score/average_hrv/average_heart_rate/etc.)
// were written from the public API docs, not verified against a live
// response — there was no real Oura token available to test against while
// writing this. fetchAndCacheOuraData stores the full raw payload in the
// `raw` JSONB column specifically so a field-name mismatch is a quick fix
// (re-read `raw`, adjust the mapping below) rather than a re-architecture.
// Sanity-check the shape against https://cloud.ouraring.com/v2/docs once
// you have a real connected account, before relying on this in front of
// riders.

const axios = require('./lib/http').externalHttp;
const config = require('./config');
const logger = require('./lib/logger');
const ouraRepo = require('./repositories/oura');

const OURA_CLIENT_ID = config.OURA_CLIENT_ID || '';
const OURA_CLIENT_SECRET = config.OURA_CLIENT_SECRET || '';
const OURA_AUTHORIZE_URL = 'https://cloud.ouraring.com/oauth/authorize';
const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token';
const OURA_REVOKE_URL = 'https://api.ouraring.com/oauth/revoke';
const OURA_API_BASE = 'https://api.ouraring.com/v2/usercollection';

// `personal` + `daily` covers daily_readiness/daily_sleep/daily_activity/
// daily_resilience and personal_info. `spo2Daily` and `stress` are each
// their OWN separate scopes, not bundled into `daily` — confirmed from
// Oura's own app-settings page, which lists Stress as its own checkbox
// alongside Daily/SpO2/Heart Health/etc, contradicting every third-party
// SDK doc found while building this (they all list only 8 scopes with no
// separate stress one — those docs are just stale). SpO2 is additionally
// Gen-3-ring-only. Deliberately NOT requesting email/heartrate/workout/
// tag/session/"Heart Health" so the Oura consent screen only asks the
// rider for what this feature actually uses.
//
// Riders who connected Oura before spo2Daily/stress were added here won't
// have them on their existing grant — they'll need to Disconnect +
// reconnect to pick them up. fetchAndCacheOuraData's daily_spo2 AND
// daily_stress calls are each isolated in their own try/catch specifically
// so a still-missing scope is a soft miss (null columns), not a sync
// failure, for riders who haven't reconnected yet.
const OURA_SCOPE = 'personal daily spo2Daily stress';

function assertConfigured() {
  if (!OURA_CLIENT_ID || !OURA_CLIENT_SECRET) {
    throw new Error(
      'Oura is not configured yet — set OURA_CLIENT_ID and OURA_CLIENT_SECRET in server/.env ' +
      '(from the application you register at https://cloud.ouraring.com/oauth/applications).'
    );
  }
}

// Builds the URL the app opens in the system browser. `redirectUri` MUST
// exactly match what's registered in the Oura application — no extra query
// params (Oura, unlike Strava, matches redirect_uri strictly) — so any
// round-trip context (which user is connecting) travels in `state` instead.
function buildAuthorizeUrl({ redirectUri, state }) {
  assertConfigured();
  const params = new URLSearchParams({
    client_id: OURA_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: OURA_SCOPE,
    state,
  });
  return `${OURA_AUTHORIZE_URL}?${params.toString()}`;
}

async function exchangeCodeForToken(code, redirectUri) {
  assertConfigured();
  const res = await axios.post(
    OURA_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: OURA_CLIENT_ID,
      client_secret: OURA_CLIENT_SECRET,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
  );
  return res.data; // { access_token, refresh_token, expires_in, token_type }
}

async function refreshAccessToken(refreshToken) {
  assertConfigured();
  const res = await axios.post(
    OURA_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: OURA_CLIENT_ID,
      client_secret: OURA_CLIENT_SECRET,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
  );
  return res.data;
}

async function fetchPersonalInfo(accessToken) {
  const res = await axios.get(`${OURA_API_BASE}/personal_info`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 10000,
  });
  return res.data; // { id, age, weight, height, biological_sex, email }
}

// Returns a still-valid access token for this user, transparently
// refreshing (and persisting the refreshed pair) if it's within 5 minutes
// of expiry. Returns null if the user has never connected Oura at all.
async function getValidAccessToken(pool, userId) {
  const user = await ouraRepo.getUserOuraTokens(userId, pool);
  if (!user || !user.oura_access_token) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAt = Number(user.oura_expires_at) || 0;
  if (expiresAt - nowSec > 300) {
    return user.oura_access_token;
  }
  if (!user.oura_refresh_token) {
    // Nothing we can do proactively — let the caller's API call fail with
    // a 401 and surface that, rather than guessing.
    return user.oura_access_token;
  }

  const tokens = await refreshAccessToken(user.oura_refresh_token);
  const newExpiresAt = nowSec + (Number(tokens.expires_in) || 0);
  await ouraRepo.updateOuraTokens(
    userId,
    tokens.access_token,
    tokens.refresh_token || user.oura_refresh_token,
    newExpiresAt,
    pool
  );
  return tokens.access_token;
}

// Pulls daily_readiness + daily_sleep + daily_activity + the detailed
// per-period `sleep` endpoint (the only one carrying raw HRV ms / resting
// HR bpm / actual sleep duration — daily_sleep's `contributors` are 0-100
// sub-scores, not raw values) for [startDate, endDate], merges them by
// `day`, and upserts one row per day into oura_daily_data.
async function fetchAndCacheOuraData(pool, userId, { startDate, endDate }) {
  const accessToken = await getValidAccessToken(pool, userId);
  if (!accessToken) return { synced: 0, note: 'Oura not connected' };

  const headers = { Authorization: `Bearer ${accessToken}` };
  const params = { start_date: startDate, end_date: endDate };

  const [readinessRes, sleepRes, activityRes, sleepPeriodsRes] = await Promise.all([
    axios.get(`${OURA_API_BASE}/daily_readiness`, { headers, params, timeout: 10000 }),
    axios.get(`${OURA_API_BASE}/daily_sleep`, { headers, params, timeout: 10000 }),
    axios.get(`${OURA_API_BASE}/daily_activity`, { headers, params, timeout: 10000 }),
    axios.get(`${OURA_API_BASE}/sleep`, { headers, params, timeout: 10000 }),
  ]);

  // daily_stress/daily_resilience/daily_spo2 are each fetched and caught
  // INDIVIDUALLY, never inside the Promise.all above. Learned the hard
  // way: Promise.all rejects (and discards every already-fulfilled
  // result) the instant ANY one of its promises rejects \u2014 that's what
  // turned Oura's 403 on daily_stress ("Token is not authorized access
  // stress scope" \u2014 Stress turned out to be its own separate OAuth
  // scope, confirmed from Oura's own app dashboard, not covered by
  // `daily` like third-party docs claimed; fixed by adding it to
  // OURA_SCOPE above) into a total sync failure, taking
  // readiness/sleep/activity/HRV down with it too. Kept these isolated
  // even after that fix so a rider who hasn't reconnected yet to pick up
  // the new `stress` scope gets a soft null here instead of a broken sync,
  // and so any future scope surprise degrades the same way.
  let stressRes = { data: { data: [] } };
  try {
    stressRes = await axios.get(`${OURA_API_BASE}/daily_stress`, { headers, params, timeout: 10000 });
  } catch (e) {
    logger.error({ err: e.response?.data || e.message }, '[oura] daily_stress fetch failed (non-fatal \u2014 rider likely hasn\'t reconnected since the stress scope was added):');
  }

  // daily_resilience has no separate scope (it's covered by `daily`, per
  // both the same dashboard check and the original docs) \u2014 kept
  // isolated anyway for the same reason as above.
  let resilienceRes = { data: { data: [] } };
  try {
    resilienceRes = await axios.get(`${OURA_API_BASE}/daily_resilience`, { headers, params, timeout: 10000 });
  } catch (e) {
    logger.error({ err: e.response?.data || e.message }, '[oura] daily_resilience fetch failed (non-fatal):');
  }

  let spo2Res = { data: { data: [] } };
  try {
    spo2Res = await axios.get(`${OURA_API_BASE}/daily_spo2`, { headers, params, timeout: 10000 });
  } catch (e) {
    logger.error({ err: e.response?.data || e.message }, '[oura] daily_spo2 fetch failed (non-fatal \u2014 missing spo2Daily scope or non-Gen3 ring):');
  }

  const byDay = new Map();
  const merge = (day, patch) => byDay.set(day, { ...(byDay.get(day) || {}), ...patch });

  for (const r of readinessRes.data?.data || []) {
    merge(r.day, {
      readiness_score: r.score ?? null,
      temperature_deviation: r.temperature_deviation ?? null,
      raw_readiness: r,
    });
  }
  for (const s of sleepRes.data?.data || []) {
    merge(s.day, { sleep_score: s.score ?? null, raw_daily_sleep: s });
  }
  for (const a of activityRes.data?.data || []) {
    merge(a.day, { activity_score: a.score ?? null, raw_activity: a });
  }
  for (const p of sleepPeriodsRes.data?.data || []) {
    // A night can have more than one period (nap + main sleep) — keep
    // whichever is longest as "the" sleep for that day.
    const existing = byDay.get(p.day);
    const existingDuration = existing?.raw_sleep_period?.total_sleep_duration || 0;
    if (!existing?.raw_sleep_period || (p.total_sleep_duration || 0) > existingDuration) {
      merge(p.day, {
        average_hrv: p.average_hrv ?? null,
        resting_heart_rate: p.average_heart_rate ?? null,
        min_heart_rate: p.lowest_heart_rate ?? null,
        total_sleep_hours: p.total_sleep_duration != null ? p.total_sleep_duration / 3600 : null,
        raw_sleep_period: p,
      });
    }
  }
  for (const s of stressRes.data?.data || []) {
    merge(s.day, {
      stress_high_seconds: s.stress_high ?? null,
      stress_recovery_high_seconds: s.recovery_high ?? null,
      stress_day_summary: s.day_summary ?? null,
      raw_stress: s,
    });
  }
  for (const r of resilienceRes.data?.data || []) {
    merge(r.day, {
      resilience_level: r.level ?? null,
      resilience_sleep_recovery: r.contributors?.sleep_recovery ?? null,
      resilience_daytime_recovery: r.contributors?.daytime_recovery ?? null,
      resilience_stress: r.contributors?.stress ?? null,
      raw_resilience: r,
    });
  }
  for (const o of spo2Res.data?.data || []) {
    merge(o.day, {
      spo2_average: o.spo2_percentage?.average ?? null,
      breathing_disturbance_index: o.breathing_disturbance_index ?? null,
      raw_spo2: o,
    });
  }

  // Batched into one UNNEST upsert instead of one INSERT per day (S-28,
  // T-4.1 DoD leftover "no pool.query in routes/" — this loop was the
  // ouraService.js half of that audit item). Same columns/ON CONFLICT
  // semantics as the old per-day query — see
  // repositories/oura.js#upsertDailyDataBatch.
  const dailyRows = Array.from(byDay.entries()).map(([day, row]) => ({
    day,
    readiness_score: row.readiness_score ?? null,
    sleep_score: row.sleep_score ?? null,
    activity_score: row.activity_score ?? null,
    total_sleep_hours: row.total_sleep_hours ?? null,
    average_hrv: row.average_hrv ?? null,
    resting_heart_rate: row.resting_heart_rate ?? null,
    min_heart_rate: row.min_heart_rate ?? null,
    temperature_deviation: row.temperature_deviation ?? null,
    stress_high_seconds: row.stress_high_seconds ?? null,
    stress_recovery_high_seconds: row.stress_recovery_high_seconds ?? null,
    stress_day_summary: row.stress_day_summary ?? null,
    resilience_level: row.resilience_level ?? null,
    resilience_sleep_recovery: row.resilience_sleep_recovery ?? null,
    resilience_daytime_recovery: row.resilience_daytime_recovery ?? null,
    resilience_stress: row.resilience_stress ?? null,
    spo2_average: row.spo2_average ?? null,
    breathing_disturbance_index: row.breathing_disturbance_index ?? null,
    raw: {
      readiness: row.raw_readiness,
      daily_sleep: row.raw_daily_sleep,
      activity: row.raw_activity,
      sleep_period: row.raw_sleep_period,
      stress: row.raw_stress,
      resilience: row.raw_resilience,
      spo2: row.raw_spo2,
    },
  }));

  const synced = await ouraRepo.upsertDailyDataBatch(userId, dailyRows, pool);

  return { synced, days: Array.from(byDay.keys()) };
}

async function revokeToken(accessToken) {
  if (!accessToken || !OURA_CLIENT_ID || !OURA_CLIENT_SECRET) return;
  try {
    await axios.post(
      OURA_REVOKE_URL,
      new URLSearchParams({
        client_id: OURA_CLIENT_ID,
        client_secret: OURA_CLIENT_SECRET,
        token: accessToken,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
    );
  } catch (e) {
    // Non-fatal — we still clear our own copy of the tokens either way.
    logger.error({ err: e.response?.data || e.message }, '[oura] revoke failed (non-fatal):');
  }
}

module.exports = {
  OURA_SCOPE,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  fetchPersonalInfo,
  getValidAccessToken,
  fetchAndCacheOuraData,
  revokeToken,
};
