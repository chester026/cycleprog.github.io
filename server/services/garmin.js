// Garmin Connect IQ bridge — pairing flow and the `home` payload
// (docs/plans/garmin-connect-iq.md). HTTP in routes/garmin.js, SQL in
// repositories/garmin.js. Nothing here computes goal progress: `buildHome`
// reads the same server-computed numbers GET /api/meta-goals and
// GET /api/activities/:id/meta-goals-progress already produce and only
// reshapes them for a device with a few hundred KB of RAM.
const crypto = require('crypto');
const { ApiError } = require('../lib/apiError');
const logger = require('../lib/logger');
const garminRepo = require('../repositories/garmin');
const goalsRepo = require('../repositories/goals');
const { issueDeviceToken } = require('../lib/jwt');
const { loadGoalProgressContext, withGoalProgress } = require('./goals');
const { getActivitiesPage, getMetaGoalsProgressForActivity } = require('./activities');
const stravaTokens = require('./strava/tokens');
const stravaActivities = require('./strava/activities');
const bikesService = require('./bikes');
const bikesRepo = require('../repositories/bikes');
const { COMPONENT_LABELS } = require('@bikelab/shared/constants');

const PAIR_TTL_MS = 10 * 60 * 1000;
const CODE_RETRIES = 5;

// Wire-format limits (contract/garmin.ts explains why the keys are short).
const MAX_GOALS = 5;
const MAX_SUBS = 6;
const MAX_CONTRIBS = 4;
const MAX_PARTS = 6;
const TITLE_MAX = 40;

// ---------------------------------------------------------------------------
// Pairing
// ---------------------------------------------------------------------------

function randomCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

async function startPairing({ device_id, device_name }) {
  await garminRepo.deleteExpiredUnconsumed();
  const pollKey = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + PAIR_TTL_MS);
  // The partial unique index on live codes makes a collision a 23505; with
  // a million codes and a handful of live attempts a retry is ~never taken,
  // but it must not be a 500 when it is.
  for (let attempt = 0; attempt < CODE_RETRIES; attempt += 1) {
    const code = randomCode();
    try {
      await garminRepo.createPairing({ deviceId: device_id, deviceName: device_name, code, pollKey, expiresAt });
      return { code, poll_key: pollKey, expires_in: Math.floor(PAIR_TTL_MS / 1000) };
    } catch (e) {
      if (e.code !== '23505') throw e;
    }
  }
  throw new ApiError(503, 'GARMIN_CODE_UNAVAILABLE', 'Could not allocate a pairing code, try again');
}

async function confirmPairing(userId, code) {
  const row = await garminRepo.findLiveByCode(code);
  if (!row) throw new ApiError(404, 'GARMIN_CODE_NOT_FOUND', 'Pairing code not found or expired');
  const bound = await garminRepo.bindPairingToUser(row.id, userId);
  if (!bound) throw new ApiError(404, 'GARMIN_CODE_NOT_FOUND', 'Pairing code not found or expired');
  logger.info({ userId, deviceId: row.device_id }, '[garmin] pairing confirmed');
  return { success: true, device_name: row.device_name ?? null };
}

async function pollPairing(pollKey) {
  const row = await garminRepo.findByPollKey(pollKey);
  if (!row || row.consumed_at || row.revoked_at) {
    throw new ApiError(410, 'GARMIN_PAIR_GONE', 'Pairing attempt is no longer valid');
  }
  if (!row.user_id) {
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new ApiError(410, 'GARMIN_PAIR_GONE', 'Pairing code expired');
    }
    return { status: 'pending' };
  }
  const tokenId = crypto.randomUUID();
  const consumed = await garminRepo.consumePairing(row.id, tokenId);
  if (!consumed) throw new ApiError(410, 'GARMIN_PAIR_GONE', 'Pairing attempt is no longer valid');
  const user = await garminRepo.getUserForToken(row.user_id);
  if (!user) throw new ApiError(410, 'GARMIN_PAIR_GONE', 'Pairing attempt is no longer valid');
  const token = issueDeviceToken(user, { tokenId, deviceId: row.device_id });
  const superseded = await garminRepo.revokeOtherPairingsOfDevice(user.id, row.device_id, consumed.id);
  logger.info({ userId: user.id, deviceId: row.device_id, superseded }, '[garmin] device token issued');
  return { status: 'ok', token };
}

async function unpairDevice(tokenId) {
  const revoked = await garminRepo.revokeByTokenId(tokenId);
  return { success: revoked };
}

async function listDevices(userId) {
  return garminRepo.listDevices(userId);
}

async function removeDevice(userId, id) {
  const revoked = await garminRepo.revokeDevice(id, userId);
  if (!revoked) throw new ApiError(404, 'GARMIN_DEVICE_NOT_FOUND', 'Device not found');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Home payload
// ---------------------------------------------------------------------------

function trim(s, max = TITLE_MAX) {
  const str = String(s ?? '').trim();
  if (str.length <= max) return str;
  return `${str.slice(0, max - 1).trimEnd()}…`;
}

function round(n, decimals = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

function daysUntil(dateish, now) {
  if (!dateish) return null;
  const t = new Date(dateish).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((t - now.getTime()) / 86400000));
}

function mapSubGoal(g) {
  return {
    t: trim(g.title || g.metric_name || 'Goal'),
    cur: round(g.current_value, 1),
    tgt: round(g.target_value, 1),
    u: g.unit ? trim(g.unit, 8) : null,
    pct: Math.max(0, Math.min(100, Math.round(Number(g.percent) || 0))),
    d: g.pace && Number.isFinite(Number(g.pace.percentDelta)) ? Math.round(Number(g.pace.percentDelta)) : null,
  };
}

// Pure: (primary bike row + its /api/bikes/:id/health-shaped health) →
// the `bike` wire object. Most worn components first, capped.
function mapBike(bike, health, componentLabels) {
  if (!bike) return null;
  const labelOf = (id) => trim((componentLabels && componentLabels[id]) || COMPONENT_LABELS[id] || id, 16);
  // The next-service component is shown on its own line above the list,
  // so it is left out of `parts` instead of being repeated as its first row.
  const nextId = health?.nextService?.component || null;
  const parts = (health?.components || [])
    .filter((c) => c.id !== nextId)
    .sort((a, b) => a.healthPercent - b.healthPercent)
    .slice(0, MAX_PARTS)
    .map((c) => ({
      c: labelOf(c.id),
      pct: Math.max(0, Math.min(100, Math.round(Number(c.healthPercent) || 0))),
      km: Math.max(0, Math.round(Number(c.remainingKm) || 0)),
      s: c.status || 'good',
    }));
  const nextComp = nextId ? (health.components || []).find((c) => c.id === nextId) : null;
  const next = nextId
    ? {
        c: labelOf(nextId),
        km: Math.max(0, Math.round(Number(health.nextService.inKm) || 0)),
        s: nextComp?.status || 'good',
      }
    : null;
  return {
    n: trim(bike.name || 'Bike'),
    km: Math.round(Number(bike.distanceKm) || 0),
    r: Math.max(0, Math.round(Number(bike.activitiesCount) || 0)),
    h: Math.max(0, Math.min(100, Math.round(Number(health?.overallHealth) || 0))),
    next,
    parts,
  };
}

// Pure: (meta-goals with their sub-goals already carrying percent/pace,
// the last ride + its impact rows, the bike) → the wire payload.
// Unit-tested on its own; buildHome below only gathers the inputs.
function mapHome({ metaGoals, lastRide, impact, bike = null, now = new Date() }) {
  const goals = metaGoals
    .filter((mg) => mg.status === 'active')
    .slice(0, MAX_GOALS)
    .map((mg) => {
      const subs = (mg.sub_goals || []).slice(0, MAX_SUBS).map(mapSubGoal);
      const withPace = (mg.sub_goals || []).filter((g) => g.pace && typeof g.pace.onTrack === 'boolean');
      return {
        id: Number(mg.id),
        t: trim(mg.title),
        pct: subs.length ? Math.round(subs.reduce((s, g) => s + g.pct, 0) / subs.length) : 0,
        days: daysUntil(mg.target_date, now),
        ok: withPace.length === 0 ? true : withPace.every((g) => g.pace.onTrack),
        subs,
      };
    });

  let last = null;
  if (lastRide) {
    const startLocal = lastRide.start_date_local || lastRide.start_date;
    last = {
      id: String(lastRide.id),
      n: trim(lastRide.name || 'Ride'),
      d: startLocal ? String(startLocal).slice(0, 10) : '',
      km: round((Number(lastRide.distance) || 0) / 1000, 1),
      m: Math.round(Number(lastRide.total_elevation_gain) || 0),
      min: Math.round((Number(lastRide.moving_time) || 0) / 60),
      impact: (impact || [])
        .filter((row) => row.progressGain > 0 || (row.contributions || []).length > 0)
        .slice(0, MAX_GOALS)
        .map((row) => ({
          id: Number(row.id),
          pct: Math.round(Number(row.progress) || 0),
          gain: Math.round(Number(row.progressGain) || 0),
          c: (row.contributions || []).slice(0, MAX_CONTRIBS).map((ct) => ({ l: trim(ct.label, 16), v: trim(ct.value, 12) })),
        })),
    };
  }

  return { v: 1, at: now.toISOString(), goals, last, bike };
}

async function loadMetaGoalsWithProgress(userId) {
  const metaGoals = await goalsRepo.listMetaGoals(userId);
  const allGoals = await goalsRepo.listGoalsOrderedByPriority(userId);
  const ctx = await loadGoalProgressContext(userId);
  const byMeta = new Map();
  for (const g of allGoals) {
    if (g.meta_goal_id == null) continue;
    if (!byMeta.has(g.meta_goal_id)) byMeta.set(g.meta_goal_id, []);
    byMeta.get(g.meta_goal_id).push(withGoalProgress(g, ctx));
  }
  // Read-only: unlike GET /api/goals this does not persist current_value —
  // the device is a viewer, the app/web remain the only writers.
  return metaGoals.map((mg) => ({ ...mg, sub_goals: byMeta.get(mg.id) || [] }));
}

async function loadLastRide(userId) {
  try {
    const page = await getActivitiesPage(userId, { limit: 1 });
    return page.items[0] || null;
  } catch (err) {
    // No activity source linked yet is "no last ride", not an error — the
    // device still shows the goals.
    if (err instanceof stravaTokens.StravaNotLinkedError) return null;
    throw err;
  }
}

// Primary Strava bike (or the first one with mileage) + the same component
// wear GET /api/bikes/:id/health computes, minus that route's Strava /gear
// fallback: the device shows what the cache knows, it never triggers an
// extra Strava call.
async function loadBike(userId) {
  let bikes;
  try {
    bikes = await stravaActivities.getBikes(userId);
  } catch (err) {
    if (err instanceof stravaTokens.StravaNotLinkedError) return null;
    logger.warn({ err: err.message, userId }, '[garmin] bikes unavailable');
    return null;
  }
  const real = (bikes || []).filter((b) => b && b.id !== 'total');
  const bike = real.find((b) => b.primary) || real.find((b) => Number(b.distanceKm) > 0) || real[0];
  if (!bike) return null;

  const [riderWeight, skills, { resets }, { componentLabels }] = await Promise.all([
    bikesRepo.getRiderWeight(userId),
    bikesRepo.getLatestSkills(userId),
    bikesRepo.getComponentResets(userId, bike.id),
    bikesRepo.getComponentLabels(userId, bike.id),
  ]);
  const ridingStyle = skills
    ? { climbing: skills.climbing || 0, sprint: skills.sprint || 0, power: skills.power || 0 }
    : { climbing: 0, sprint: 0, power: 0 };
  const health = bikesService.computeComponentHealth({
    gearTotalKm: Number(bike.distanceKm) || 0,
    riderWeight: riderWeight ?? 75,
    ridingStyle,
    resets,
  });
  return { bike, health, componentLabels };
}

async function buildHome(userId) {
  const [metaGoals, lastRide, bikeInfo] = await Promise.all([
    loadMetaGoalsWithProgress(userId),
    loadLastRide(userId),
    loadBike(userId).catch((err) => {
      logger.warn({ err: err.message, userId }, '[garmin] bike health unavailable');
      return null;
    }),
  ]);
  let impact = [];
  if (lastRide) {
    try {
      impact = (await getMetaGoalsProgressForActivity(userId, String(lastRide.id))) || [];
    } catch (err) {
      // Impact is decoration on top of the ride; don't fail the whole
      // payload if the per-activity calculator hiccups.
      logger.warn({ err: err.message, userId }, '[garmin] impact unavailable for last ride');
    }
  }
  const bike = bikeInfo ? mapBike(bikeInfo.bike, bikeInfo.health, bikeInfo.componentLabels) : null;
  return mapHome({ metaGoals, lastRide, impact, bike });
}

module.exports = {
  PAIR_TTL_MS,
  startPairing,
  confirmPairing,
  pollPairing,
  unpairDevice,
  listDevices,
  removeDevice,
  mapBike,
  mapHome,
  buildHome,
};
