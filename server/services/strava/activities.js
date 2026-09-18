// Postgres-first Strava activities/bikes (T-1.3, docs/audit/00-AUDIT-AND-PLAN.md).
//
// Strava allows ~300 reads/15min and 3000/day PER APPLICATION (shared across
// every rider). The old code re-downloaded a user's *entire* ride history,
// page by page, on every cache miss (server restart, 2h TTL, deploy) — in 4
// separate copies of the same loop. This module makes `synced_activities`
// the primary store: a cache miss now means "read Postgres, top it up with
// only what's new since the last sync (`after=<last synced start_date>`)",
// never "re-download everything".
//
// Every consumer still gets the same array of Strava activity objects (same
// fields) it always did — getActivities() just changes where that array
// comes from.
const { pool } = require('../../db');
const { stravaGet, checkStravaLimits, StravaRateLimitError } = require('./client');
const logger = require('../../lib/logger');
const { ACTIVITY_RIDE_TYPES } = require('@bikelab/shared/constants');
const powerService = require('../power');
const { createCache } = require('../../lib/cache');

// --- Caches (T-4.3, docs/audit/00-AUDIT-AND-PLAN.md S-24) -------------------
// Async {get,set,delete} interface (see lib/cache.js) so this works
// unmodified whether the process is alone (in-memory, LRU + TTL — the old
// BoundedCache that used to live here verbatim) or one of several instances
// sharing a Redis backend (config.REDIS_URL set). Entry shape stored/read is
// unchanged: `{data, _ts}`.
const ACTIVITIES_CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours — activities rarely change
const BIKES_CACHE_TTL = 6 * 60 * 60 * 1000;

const activitiesCache = createCache({ namespace: 'strava:activities', ttlMs: ACTIVITIES_CACHE_TTL, max: 200 });
const bikesCache = createCache({ namespace: 'strava:bikes', ttlMs: BIKES_CACHE_TTL, max: 200 });

const DEFAULT_TYPES = ACTIVITY_RIDE_TYPES;

// Throttle for the "recent 30 days" refetch that catches edits/deletions of
// already-synced rides (an `after=` incremental sync alone would never see
// those). Per-user, in-memory — worst case on restart is one extra recent
// refetch per user, not a full history re-download.
const RECENT_REFRESH_WINDOW_MS = 6 * 60 * 60 * 1000; // 6h
const lastRecentRefresh = new Map();
const activitiesSignature = new Map(); // userId -> last served activity-set signature

// --- Durable DB mirror of Strava activities/bikes ---------------------------

// Fields of a Strava SummaryActivity that the server, web and app actually read
// (grep across all three layers) plus the geometry needed for maps. Everything
// else (athlete stub, photo/kudos/comment counters, visibility flags, …) is
// dropped before storage — roughly halves the JSONB row size.
const RAW_FIELDS = [
  'id', 'name', 'type', 'sport_type', 'workout_type', 'start_date', 'start_date_local', 'timezone',
  'distance', 'moving_time', 'elapsed_time', 'total_elevation_gain', 'elev_high', 'elev_low',
  'average_speed', 'max_speed', 'average_heartrate', 'max_heartrate', 'has_heartrate',
  'average_cadence', 'average_watts', 'max_watts', 'weighted_average_watts', 'device_watts', 'kilojoules',
  'average_temp', 'suffer_score', 'gear_id', 'start_latlng', 'end_latlng',
  'trainer', 'commute', 'manual', 'private', 'achievement_count', 'pr_count',
];

function slimActivity(a) {
  const out = {};
  for (const k of RAW_FIELDS) if (a[k] !== undefined) out[k] = a[k];
  if (a.map && a.map.summary_polyline) out.map = { id: a.map.id, summary_polyline: a.map.summary_polyline };
  if (a.gear && a.gear.name) out.gear = { id: a.gear.id, name: a.gear.name };
  return out;
}

// Only cycling activities are mirrored. Strava users log anything (walks,
// hikes, yoga…) and the list is open-ended; the whole app is cycling-only, so
// everything else is dropped at ingest instead of being stored and then
// filtered out on every read. Revisit if other sports become a feature.
function isRideActivity(a) {
  return a && DEFAULT_TYPES.includes(a.type);
}

// One-time-per-process cleanup of rows mirrored before the ingest filter
// existed. Cheap (indexed by user_id), runs on the next cache miss per user.
const nonRidePruned = new Set();
async function pruneNonRideRows(userId) {
  if (nonRidePruned.has(userId)) return;
  nonRidePruned.add(userId);
  try {
    const result = await pool.query(
      `DELETE FROM synced_activities
        WHERE user_id = $1 AND (type IS NULL OR NOT (type = ANY($2::text[])))`,
      [userId, [...DEFAULT_TYPES]]
    );
    if (result.rowCount > 0) {
      logger.info({ userId, removed: result.rowCount }, '[strava/activities] pruned non-ride rows');
    }
  } catch (err) {
    nonRidePruned.delete(userId);
    logger.error({ err: err.message, userId }, '[strava/activities] failed to prune non-ride rows:');
  }
}

async function syncActivitiesToDb(userId, rawActivities) {
  const activities = (rawActivities || []).filter(isRideActivity);
  if (activities.length === 0) return;
  try {
    const ids = [],
      names = [],
      types = [],
      starts = [],
      dists = [],
      movTimes = [],
      elapTimes = [],
      elevs = [],
      avgSpeeds = [],
      maxSpeeds = [],
      avgHrs = [],
      maxHrs = [],
      avgCads = [],
      avgWatts = [],
      maxWatts = [],
      wAvgWatts = [],
      raws = [];
    for (const a of activities) {
      ids.push(a.id);
      names.push(a.name || null);
      types.push(a.type || null);
      starts.push(a.start_date || null);
      dists.push(a.distance || 0);
      movTimes.push(a.moving_time || 0);
      elapTimes.push(a.elapsed_time || 0);
      elevs.push(a.total_elevation_gain || 0);
      avgSpeeds.push(a.average_speed || 0);
      maxSpeeds.push(a.max_speed || 0);
      avgHrs.push(a.average_heartrate ?? null);
      maxHrs.push(a.max_heartrate ?? null);
      avgCads.push(a.average_cadence ?? null);
      avgWatts.push(a.average_watts ?? null);
      maxWatts.push(a.max_watts ?? null);
      wAvgWatts.push(a.weighted_average_watts ?? null);
      raws.push(JSON.stringify(slimActivity(a)));
    }
    await pool.query(
      `INSERT INTO synced_activities (
         user_id, strava_id, name, type, start_date, distance, moving_time, elapsed_time,
         total_elevation_gain, average_speed, max_speed, average_heartrate, max_heartrate,
         average_cadence, average_watts, max_watts, weighted_average_watts, raw, synced_at
       )
       SELECT $1, t.*, NOW() FROM UNNEST(
         $2::bigint[], $3::text[], $4::text[], $5::timestamptz[], $6::numeric[], $7::int[], $8::int[],
         $9::numeric[], $10::numeric[], $11::numeric[], $12::numeric[], $13::numeric[],
         $14::numeric[], $15::numeric[], $16::numeric[], $17::numeric[], $18::jsonb[]
       ) AS t(strava_id, name, type, start_date, distance, moving_time, elapsed_time,
              total_elevation_gain, average_speed, max_speed, average_heartrate, max_heartrate,
              average_cadence, average_watts, max_watts, weighted_average_watts, raw)
       ON CONFLICT (user_id, strava_id) DO UPDATE SET
         name = EXCLUDED.name, type = EXCLUDED.type, start_date = EXCLUDED.start_date,
         distance = EXCLUDED.distance, moving_time = EXCLUDED.moving_time, elapsed_time = EXCLUDED.elapsed_time,
         total_elevation_gain = EXCLUDED.total_elevation_gain, average_speed = EXCLUDED.average_speed,
         max_speed = EXCLUDED.max_speed, average_heartrate = EXCLUDED.average_heartrate,
         max_heartrate = EXCLUDED.max_heartrate, average_cadence = EXCLUDED.average_cadence,
         average_watts = EXCLUDED.average_watts, max_watts = EXCLUDED.max_watts,
         weighted_average_watts = EXCLUDED.weighted_average_watts, raw = EXCLUDED.raw, synced_at = NOW()`,
      [
        userId,
        ids,
        names,
        types,
        starts,
        dists,
        movTimes,
        elapTimes,
        elevs,
        avgSpeeds,
        maxSpeeds,
        avgHrs,
        maxHrs,
        avgCads,
        avgWatts,
        maxWatts,
        wAvgWatts,
        raws,
      ]
    );
  } catch (err) {
    logger.error({ err: err.message }, '[sync] Failed to mirror activities to DB:');
  }
}

async function syncBikesToDb(userId, bikes) {
  if (!bikes || bikes.length === 0) return;
  try {
    const ids = [],
      names = [],
      distKms = [],
      primaries = [],
      brands = [],
      models = [];
    for (const b of bikes) {
      ids.push(String(b.id));
      names.push(b.name || null);
      distKms.push(b.distanceKm || 0);
      primaries.push(!!b.primary);
      brands.push(b.brand_name || null);
      models.push(b.model_name || null);
    }
    await pool.query(
      `INSERT INTO synced_bikes (user_id, bike_id, name, distance_km, is_primary, brand_name, model_name, synced_at)
       SELECT $1, t.*, NOW() FROM UNNEST(
         $2::text[], $3::text[], $4::numeric[], $5::boolean[], $6::text[], $7::text[]
       ) AS t(bike_id, name, distance_km, is_primary, brand_name, model_name)
       ON CONFLICT (user_id, bike_id) DO UPDATE SET
         name = EXCLUDED.name, distance_km = EXCLUDED.distance_km, is_primary = EXCLUDED.is_primary,
         brand_name = EXCLUDED.brand_name, model_name = EXCLUDED.model_name, synced_at = NOW()`,
      [userId, ids, names, distKms, primaries, brands, models]
    );
  } catch (err) {
    logger.error({ err: err.message }, '[sync] Failed to mirror bikes to DB:');
  }
}

// Reconstructs a Strava-shaped activity object from a synced_activities row.
// Prefers the full `raw` JSON (present for anything synced by this version
// of the code); falls back to the selected columns for rows synced before
// `raw` existed, until backfillRawIfNeeded() re-downloads and fills it in.
function rowToActivity(row) {
  const activity = row.raw ? { ...row.raw } : {
    id: Number(row.strava_id),
    name: row.name,
    type: row.type,
    start_date: row.start_date,
    distance: row.distance !== null ? Number(row.distance) : undefined,
    moving_time: row.moving_time,
    elapsed_time: row.elapsed_time,
    total_elevation_gain: row.total_elevation_gain !== null ? Number(row.total_elevation_gain) : undefined,
    average_speed: row.average_speed !== null ? Number(row.average_speed) : undefined,
    max_speed: row.max_speed !== null ? Number(row.max_speed) : undefined,
    average_heartrate: row.average_heartrate !== null ? Number(row.average_heartrate) : undefined,
    max_heartrate: row.max_heartrate !== null ? Number(row.max_heartrate) : undefined,
    average_cadence: row.average_cadence !== null ? Number(row.average_cadence) : undefined,
    average_watts: row.average_watts !== null ? Number(row.average_watts) : undefined,
    max_watts: row.max_watts !== null ? Number(row.max_watts) : undefined,
    weighted_average_watts: row.weighted_average_watts !== null ? Number(row.weighted_average_watts) : undefined,
  };
  // Attach the persisted power estimate (T-3.5) regardless of raw-vs-
  // reconstructed shape, so every consumer of getActivities() gets it for
  // free without needing its own physics or its own weather calls.
  activity.estimated_power = row.estimated_power ?? null;
  return activity;
}

async function fetchAllPages(userId, params) {
  let all = [];
  let page = 1;
  const per_page = 200;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const response = await stravaGet(userId, '/athlete/activities', {
      params: { ...params, per_page, page },
      timeout: 15000,
    });
    const batch = response.data;
    if (!batch || !batch.length) break;
    all = all.concat(batch);
    if (batch.length < per_page) break;
    page++;
  }
  return all;
}

async function fullDownload(userId) {
  const all = await fetchAllPages(userId, {});
  await syncActivitiesToDb(userId, all);
  return all;
}

async function incrementalDownload(userId, afterEpoch) {
  const all = await fetchAllPages(userId, { after: afterEpoch });
  if (all.length) await syncActivitiesToDb(userId, all);
  return all;
}

// Best-effort: catches edits/deletions of recently-synced rides that a pure
// `after=` sync would never notice (an incremental sync only ever sees NEW
// activities). Throttled per-user so it doesn't turn every cache miss back
// into a "hit Strava again" call.
async function maybeRefreshRecent(userId, { force = false } = {}) {
  const now = Date.now();
  const last = lastRecentRefresh.get(userId) || 0;
  if (!force && now - last < RECENT_REFRESH_WINDOW_MS) return;
  lastRecentRefresh.set(userId, now);
  const after = Math.floor((now - 30 * 24 * 60 * 60 * 1000) / 1000);
  const recent = await incrementalDownload(userId, after);
  // Activities deleted (or re-typed to a private/hidden state) on Strava no
  // longer come back in this window — drop their mirrored rows so they don't
  // linger forever now that we no longer re-download the full history.
  try {
    const keepIds = recent.filter(isRideActivity).map((a) => String(a.id));
    await pool.query(
      `DELETE FROM synced_activities
        WHERE user_id = $1
          AND start_date > to_timestamp($2)
          AND NOT (strava_id::text = ANY($3::text[]))`,
      [userId, after, keepIds]
    );
  } catch (err) {
    logger.error({ err: err.message }, '[strava/activities] failed to prune deleted activities:');
  }
}

// Cache-miss path: top up Postgres with only what's changed since the last
// sync, then fall back to whatever's already in Postgres if Strava is
// rate-limiting us — that's the whole point of this refactor (T-1.3 DoD:
// a restart makes <=1 Strava request, and a rate-limited user still gets a
// (stale but complete) response instead of a 500/429).
async function syncIncremental(userId, { force = false } = {}) {
  try {
    const maxRow = await pool.query(
      'SELECT MAX(start_date) AS max_start FROM synced_activities WHERE user_id = $1',
      [userId]
    );
    const maxStart = maxRow.rows[0]?.max_start;
    await pruneNonRideRows(userId);
    if (!maxStart) {
      await fullDownload(userId);
    } else {
      // 60s overlap: Strava's `after` is exclusive-ish, and upserting on
      // (user_id, strava_id) makes re-fetching the boundary activity a no-op.
      const afterEpoch = Math.floor(new Date(maxStart).getTime() / 1000) - 60;
      await incrementalDownload(userId, afterEpoch);
    }
    await maybeRefreshRecent(userId, { force });
  } catch (err) {
    if (err instanceof StravaRateLimitError) {
      logger.warn(`[strava/activities] rate-limited syncing user ${userId} — serving stored data instead of failing the request.`);
      return;
    }
    throw err;
  }
}

// One-time-per-user backfill for rows synced before the `raw` column
// existed. Best-effort: a rate limit here just means those rows keep
// falling back to the reconstructed-from-columns shape until the next
// opportunity.
async function backfillRawIfNeeded(userId) {
  let missing = 0;
  try {
    const check = await pool.query(
      'SELECT COUNT(*)::int AS n FROM synced_activities WHERE user_id = $1 AND raw IS NULL',
      [userId]
    );
    missing = check.rows[0]?.n || 0;
    if (missing === 0) return;
    logger.warn({ userId, missing }, '[strava/activities] legacy rows without raw JSON — starting one-time full download');
    const all = await fullDownload(userId);
    const after = await pool.query(
      'SELECT COUNT(*)::int AS n FROM synced_activities WHERE user_id = $1 AND raw IS NULL',
      [userId]
    );
    logger.info(
      { userId, downloaded: all.length, stillMissing: after.rows[0]?.n || 0 },
      '[strava/activities] raw backfill finished'
    );
  } catch (err) {
    if (err instanceof StravaRateLimitError) {
      logger.warn({ userId, missing }, '[strava/activities] raw backfill postponed: Strava rate limit (429)');
    } else {
      logger.error({ err, userId, missing }, '[strava/activities] raw backfill failed');
    }
  }
}

async function readFromDb(userId, types) {
  const result = await pool.query('SELECT * FROM synced_activities WHERE user_id = $1 ORDER BY start_date DESC', [
    userId,
  ]);
  const degraded = result.rows.some((r) => !r.raw);
  const all = result.rows.map(rowToActivity);
  return { items: types ? all.filter((a) => types.includes(a.type)) : all, degraded };
}

// getActivities(userId, { types, force }) — the one function every route/
// tool that needs "this user's activities" should call.
//   1. in-memory cache hit (unless force) -> return.
//   2. else sync Postgres incrementally from Strava (or fully, first time).
//   3. read ALL rows for the user from Postgres, filter by `types`, cache,
//      return.
async function getActivities(userId, { types = DEFAULT_TYPES, force = false } = {}) {
  if (!force) {
    const cached = await activitiesCache.get(userId);
    if (cached && Array.isArray(cached.data)) {
      return cached.data;
    }
  }

  await backfillRawIfNeeded(userId);
  await syncIncremental(userId, { force });

  const { items: filtered, degraded } = await readFromDb(userId, types);

  // T-3.5: fill in `estimated_power` for whatever's missing it (bounded per
  // request — see services/power.js). Best-effort: a profile/weather
  // failure must never turn a cache-miss activities fetch into a 500.
  try {
    await powerService.enrichEstimatedPower(userId, filtered);
  } catch (err) {
    logger.error({ err: err.message, userId }, '[strava/activities] estimated_power enrichment failed:');
  }

  // Rows without `raw` are legacy/degraded (no map polyline, no gear_id). If the
  // backfill could not complete (rate limit, Strava down) serve them, but do not
  // pin them in the cache for the full TTL — retry the backfill on the next call.
  if (degraded) {
    logger.warn({ userId }, '[strava/activities] serving activities without raw JSON (backfill pending)');
  } else {
    await activitiesCache.set(userId, { data: filtered, _ts: Date.now() });
  }
  // Bikes (gear counts, primary bike) are derived from this set; if it changed
  // since bikes were last computed, drop that cache so /api/bikes recomputes.
  const signature = `${filtered.length}:${filtered[0]?.id || 0}:${degraded ? 'd' : 'ok'}`;
  if (activitiesSignature.get(userId) !== signature) {
    activitiesSignature.set(userId, signature);
    await bikesCache.delete(userId);
  }
  return filtered;
}

async function getActivity(userId, id) {
  const response = await stravaGet(userId, `/activities/${id}`, {});
  return response.data;
}

async function getStreams(userId, id) {
  const response = await stravaGet(userId, `/activities/${id}/streams`, {
    params: { keys: 'watts,heartrate,cadence,altitude,velocity_smooth,time', key_by_type: true },
  });
  return response.data;
}

async function invalidate(userId) {
  await activitiesCache.delete(userId);
}

async function invalidateBikes(userId) {
  await bikesCache.delete(userId);
}

// --- Bikes -------------------------------------------------------------

async function getBikes(userId, { force = false } = {}) {
  if (!force) {
    const cached = await bikesCache.get(userId);
    if (cached && Array.isArray(cached.data)) {
      return cached.data;
    }
  }

  const limitCheck = await checkStravaLimits();
  if (limitCheck.blocked) {
    throw new StravaRateLimitError('Strava API rate limit reached. Try again later.', 900);
  }

  const athleteResp = await stravaGet(userId, '/athlete', {});
  const athlete = athleteResp.data;
  const bikes = athlete.bikes || [];

  const statsResp = await stravaGet(userId, `/athletes/${athlete.id}/stats`, {});
  const stats = statsResp.data;

  // Recent activities (already Ride/VirtualRide-filtered, most recent
  // first) are all we need to guess the "primary" gear.
  const activities = await getActivities(userId, { types: DEFAULT_TYPES });

  let primaryGearId = null;
  const last10Activities = activities.filter((a) => a.gear_id).slice(0, 10);
  if (last10Activities.length >= 3) {
    const gearCounts = {};
    last10Activities.forEach((a) => {
      gearCounts[a.gear_id] = (gearCounts[a.gear_id] || 0) + 1;
    });
    let maxCount = 0;
    for (const [gearId, count] of Object.entries(gearCounts)) {
      if (count > maxCount) {
        maxCount = count;
        primaryGearId = gearId;
      }
    }
  } else if (last10Activities.length > 0) {
    primaryGearId = last10Activities[0].gear_id;
  }

  let formattedBikes = [];

  if (bikes && bikes.length > 0) {
    const bikeDetailsPromises = bikes.map(async (bike) => {
      try {
        const gearResponse = await stravaGet(userId, `/gear/${bike.id}`, {});
        return gearResponse.data;
      } catch (error) {
        logger.error({ err: error.message }, `Error fetching gear details for ${bike.id}:`);
        return null;
      }
    });
    const bikeDetails = await Promise.all(bikeDetailsPromises);

    const gearActivityCounts = {};
    activities.forEach((a) => {
      if (a.gear_id) gearActivityCounts[a.gear_id] = (gearActivityCounts[a.gear_id] || 0) + 1;
    });

    formattedBikes = bikes.map((bike, index) => {
      const details = bikeDetails[index];
      const isPrimary = primaryGearId ? bike.id === primaryGearId : bike.primary;
      return {
        id: bike.id,
        name: details?.name || bike.name,
        distance: details?.distance || bike.distance,
        distanceKm: details?.distance
          ? Math.round((details.distance / 1000) * 100) / 100
          : bike.distance
          ? Math.round((bike.distance / 1000) * 100) / 100
          : 0,
        primary: isPrimary,
        resource_state: details?.resource_state || bike.resource_state,
        brand_name: details?.brand_name,
        model_name: details?.model_name,
        activitiesCount: gearActivityCounts[bike.id] || 0,
      };
    });

    formattedBikes.sort((a, b) => {
      if (a.primary && !b.primary) return -1;
      if (!a.primary && b.primary) return 1;
      return 0;
    });
  } else {
    const gearMap = new Map();
    activities.forEach((activity) => {
      if (activity.gear_id) {
        if (!gearMap.has(activity.gear_id)) {
          gearMap.set(activity.gear_id, {
            id: activity.gear_id,
            name: activity.gear?.name || `Bike ${activity.gear_id}`,
            activities: [],
            totalDistance: 0,
          });
        }
        const gear = gearMap.get(activity.gear_id);
        gear.activities.push(activity);
        gear.totalDistance += activity.distance || 0;
      }
    });

    const gearPromises = Array.from(gearMap.keys()).map(async (gearId) => {
      try {
        const gearResponse = await stravaGet(userId, `/gear/${gearId}`, {});
        return gearResponse.data;
      } catch (error) {
        return null;
      }
    });
    const gearDetails = await Promise.all(gearPromises);

    formattedBikes = Array.from(gearMap.values()).map((gear, index) => {
      const gearDetail = gearDetails[index];
      const isPrimary = primaryGearId ? gear.id === primaryGearId : gearDetail?.primary || index === 0;
      return {
        id: gear.id,
        name: gearDetail?.name || gear.name,
        distance: gearDetail?.distance || gear.totalDistance,
        distanceKm: gearDetail?.distance
          ? Math.round((gearDetail.distance / 1000) * 100) / 100
          : Math.round((gear.totalDistance / 1000) * 100) / 100,
        primary: isPrimary,
        resource_state: gearDetail?.resource_state || 2,
        activitiesCount: gear.activities.length,
        brand_name: gearDetail?.brand_name,
        model_name: gearDetail?.model_name,
      };
    });

    formattedBikes.sort((a, b) => {
      if (a.primary && !b.primary) return -1;
      if (!a.primary && b.primary) return 1;
      return 0;
    });
  }

  if (formattedBikes.length === 0 && stats.all_ride_totals) {
    formattedBikes.push({
      id: 'total',
      name: 'Total Distance',
      distance: stats.all_ride_totals.distance,
      distanceKm: Math.round((stats.all_ride_totals.distance / 1000) * 100) / 100,
      primary: true,
      resource_state: 3,
    });
  }

  await bikesCache.set(userId, { data: formattedBikes, _ts: Date.now() });
  syncBikesToDb(userId, formattedBikes).catch(() => {});

  return formattedBikes;
}

module.exports = {
  slimActivity,
  RAW_FIELDS,
  activitiesCache,
  bikesCache,
  getActivities,
  getActivity,
  getStreams,
  getBikes,
  invalidate,
  invalidateBikes,
  syncActivitiesToDb,
  syncBikesToDb,
  DEFAULT_TYPES,
  isRideActivity,
  pruneNonRideRows,
};
