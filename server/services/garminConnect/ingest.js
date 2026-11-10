// One Garmin ride: FIT file in, one garmin_activities row out
// (docs/plans/garmin-connect-api.md §3–4).
//
// Transport-agnostic on purpose — this is the function the personal-key
// backfill (scripts/garmin-sync.js) calls today and the Developer Program
// webhook will call for every rider tomorrow. The caller supplies only what
// the file itself doesn't carry: Garmin's activity id and the ride's name.
//
// The FIT bytes are used and dropped: the summary, the derived analysis and
// a chart-sized downsample are what is stored (see migration 1758000000019).
const logger = require('../../lib/logger');
const garminConnectRepo = require('../../repositories/garminConnect');
const { parseFitActivity, FitParseError } = require('./fit');
const { analyzeStreams, encodeChart, ANALYSIS_VERSION } = require('./analyze');

/**
 * FIT bytes → the row to store, or a skip. Pure apart from the decode.
 * `{ status: 'ready', activity }` | `{ status: 'skipped', reason, sport? }`
 * with reason `not_fit` | `no_session` | `multi_session` | `not_a_ride`.
 */
async function buildActivity({ garminActivityId, name }, fitBuffer) {
  let parsed;
  try {
    parsed = await parseFitActivity(fitBuffer);
  } catch (err) {
    if (err instanceof FitParseError) return { status: 'skipped', reason: err.code };
    throw err;
  }
  if (!parsed.type) return { status: 'skipped', reason: 'not_a_ride', sport: parsed.sport };

  return {
    status: 'ready',
    activity: {
      garmin_activity_id: Number(garminActivityId),
      name: name ?? null,
      type: parsed.type,
      sub_sport: parsed.subSport,
      ...parsed.summary,
      provider: parsed.provider,
      analysis: analyzeStreams(parsed.streams),
      analysis_version: ANALYSIS_VERSION,
      chart: encodeChart(parsed.streams),
    },
  };
}

/**
 * Ingests one activity file for a rider who already has a garmin_connections
 * row. Returns `{ status: 'ingested', garmin_activity_id, type, start_date,
 * device_watts }` or the skip from buildActivity. Idempotent: the same
 * activity again overwrites its row.
 */
async function ingestActivityFile(userId, meta, fitBuffer) {
  const built = await buildActivity(meta, fitBuffer);
  if (built.status !== 'ready') {
    logger.info({ userId, garminActivityId: meta.garminActivityId, reason: built.reason, sport: built.sport }, '[garminConnect] activity skipped');
    return built;
  }
  const { activity } = built;
  await garminConnectRepo.upsertActivity(userId, activity);
  return {
    status: 'ingested',
    garmin_activity_id: activity.garmin_activity_id,
    type: activity.type,
    start_date: activity.start_date,
    device_watts: activity.device_watts,
  };
}

module.exports = { ingestActivityFile, buildActivity };
