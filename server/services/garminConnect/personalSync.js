// Personal-key transport: pulls the ONE Garmin account behind the owner's
// Personal API key into BikeLab (docs/plans/garmin-connect-api.md §5).
// Driven by scripts/garmin-sync.js, plus the health half by refresh.js (the
// owner's own "fetch now" from the app). Nothing here may run for another
// rider: Garmin's terms rule out serving other people with a personal key.
//
//   rides  — list → download original file → ingest. Everything below the
//            download is the shared path (ingest.js).
//   health — daily summaries + sleep + HRV for a date range →
//            garmin_health_days (mapping in personalHealth.js).
//
// When the Developer Program push arrives it replaces this file and
// personalHealth.js, not what they write into.
const garminConnectRepo = require('../../repositories/garminConnect');
const { readZip } = require('../../lib/zip');
const { ingestActivityFile } = require('./ingest');
const { ANALYSIS_VERSION } = require('./analyze');
const { mapPersonalHealth, garminUserIdOf } = require('./personalHealth');

const LIST_PATH = '/activitylist-service/activities/search/activities';
const PAGE_SIZE = 100;
const MAX_PAGES = 200;
// Cheap pre-filter on Garmin's activity type so a run is never downloaded;
// the FIT file's own `sport` is what actually decides (ingest.js).
const RIDE_TYPE_RE = /cycl|bik|ride/i;

const typeKey = (a) => String(a?.activityType?.typeKey ?? '');
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** Every activity on the account, newest first, as Garmin lists them. */
async function listActivities(client) {
  const all = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await client.get(LIST_PATH, { start: page * PAGE_SIZE, limit: PAGE_SIZE });
    const items = Array.isArray(batch) ? batch : batch?.activityList || [];
    all.push(...items);
    if (items.length < PAGE_SIZE) break;
  }
  return all;
}

/**
 * The original FIT file for one activity, or null when Garmin's ZIP holds
 * something else (a ride imported into Garmin Connect as GPX/TCX keeps that
 * format). `fitCache` — optional `{ read(id), write(id, bytes) }` — keeps
 * downloaded files on the developer's disk so a re-ingest costs no API call.
 */
async function fetchFit(client, activityId, fitCache) {
  const cached = fitCache?.read(activityId);
  if (cached) return { fit: cached, downloaded: false };
  const zip = await client.downloadActivityZip(activityId);
  const entry = readZip(zip).find((e) => /\.fit$/i.test(e.name));
  if (!entry) return { fit: null, downloaded: true };
  fitCache?.write(activityId, entry.data);
  return { fit: entry.data, downloaded: true };
}

/**
 * Syncs the personal-key account into `userId`. Idempotent: rides already
 * stored at the current ANALYSIS_VERSION are left alone unless `force`.
 *
 * Options: `force`, `limit` (max rides to ingest this run), `dryRun` (list
 * and count only — no download, no write), `pauseMs` between downloads,
 * `fitCache`, `onProgress(event)`.
 *
 * Returns `{ listed, rides, upToDate, ingested, skipped: {reason: n},
 * failed: [{id, error}], pending, rateLimited }`.
 */
async function syncPersonalAccount(userId, client, options = {}) {
  const { force = false, limit = Infinity, dryRun = false, pauseMs = 250, fitCache = null, onProgress = () => {} } = options;
  const listed = await listActivities(client);
  const rides = listed.filter((a) => a?.activityId != null && RIDE_TYPE_RE.test(typeKey(a)));
  const summary = { listed: listed.length, rides: rides.length, upToDate: 0, ingested: 0, skipped: {}, failed: [], pending: 0, rateLimited: false };

  const ownerId = listed.find((a) => a?.ownerId != null)?.ownerId ?? null;
  if (!dryRun) {
    if (ownerId === null) throw new Error('Garmin returned no activities with an ownerId — cannot tell which Garmin account this key belongs to');
    await garminConnectRepo.upsertConnection(userId, { garminUserId: ownerId, transport: 'personal' });
  }
  const stored = await garminConnectRepo.getIngestedVersions(userId);

  for (const activity of rides) {
    const id = Number(activity.activityId);
    if (!force && stored.get(id) === ANALYSIS_VERSION) {
      summary.upToDate += 1;
      continue;
    }
    if (dryRun || summary.ingested >= limit || summary.rateLimited) {
      summary.pending += 1;
      continue;
    }
    try {
      const { fit, downloaded } = await fetchFit(client, id, fitCache);
      const result = fit
        ? await ingestActivityFile(userId, { garminActivityId: id, name: activity.activityName ?? null }, fit)
        : { status: 'skipped', reason: 'no_fit_file' };
      if (result.status === 'ingested') summary.ingested += 1;
      else summary.skipped[result.reason] = (summary.skipped[result.reason] || 0) + 1;
      onProgress({ id, name: activity.activityName ?? null, start: activity.startTimeGMT ?? null, ...result });
      if (downloaded && pauseMs > 0) await sleep(pauseMs);
    } catch (err) {
      // 429: stop asking; what is left is picked up by the next run.
      if (err.status === 429) {
        summary.rateLimited = true;
        summary.pending += 1;
      } else {
        summary.failed.push({ id, error: err.message });
      }
      onProgress({ id, name: activity.activityName ?? null, status: 'failed', error: err.message });
    }
  }

  if (!dryRun) await garminConnectRepo.touchLastSync(userId);
  return summary;
}

// --- Health ------------------------------------------------------------------

// Garmin Connect's own web client asks for at most four weeks at a time.
const HEALTH_CHUNK_DAYS = 28;
const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Inclusive [from, to] day ranges of at most HEALTH_CHUNK_DAYS covering the last `days` days up to `today`. */
function healthChunks(days, today) {
  const end = Date.parse(`${today}T00:00:00Z`);
  const chunks = [];
  for (let from = end - (days - 1) * DAY_MS; from <= end; from += HEALTH_CHUNK_DAYS * DAY_MS) {
    chunks.push({ from: isoDay(from), to: isoDay(Math.min(from + (HEALTH_CHUNK_DAYS - 1) * DAY_MS, end)) });
  }
  return chunks;
}

/**
 * The three range payloads for one chunk. Each is fetched on its own: an
 * account without a watch that tracks sleep or HRV answers 404 there, and
 * that must cost those columns, not the whole day (the lesson of
 * ouraService.js's daily_stress). Only a 429 is rethrown.
 */
async function fetchHealthRange(client, { from, to }) {
  const requests = [
    ['summaries', '/usersummary-service/v2/dailysummaries', { startDate: from, endDate: to }],
    ['sleep', '/sleep-service/sleep/dailySleepSummariesByDate', { startDate: from, endDate: to }],
    ['hrv', `/hrv-service/hrv/daily/${from}/${to}`, undefined],
  ];
  const payloads = {};
  const missed = [];
  for (const [part, path, params] of requests) {
    try {
      payloads[part] = await client.get(path, params);
    } catch (err) {
      if (err.status === 429) throw err;
      payloads[part] = null;
      missed.push({ part, status: err.status ?? null });
    }
  }
  return { payloads, missed };
}

/**
 * Syncs the last `days` days of health data of the personal-key account
 * into `userId`. Always re-fetches the whole window: the most recent days
 * are still changing, and a day is one small row.
 *
 * Options: `days` (default 30), `today` ('YYYY-MM-DD', default the UTC
 * date), `dryRun` (fetch and map, write nothing), `pauseMs` between chunks,
 * `expectGarminUserId` — the Garmin account the rider's connection is for;
 * payloads that name another account throw `GARMIN_ACCOUNT_MISMATCH` before
 * anything is written (the personal key reads whichever account it was
 * issued for, and that must be this rider's).
 *
 * Returns `{ from, to, days, withSleep, withHrv, missed: [{part, status}],
 * rateLimited, latest }` — `days` is rows stored (or that would be),
 * `latest` the newest mapped rows (up to 7, newest first) for the caller to
 * show.
 */
async function syncPersonalHealth(userId, client, options = {}) {
  const { days = 30, today = isoDay(Date.now()), dryRun = false, pauseMs = 250, expectGarminUserId = null } = options;
  const chunks = healthChunks(Math.max(1, days), today);
  const summary = { from: chunks[0].from, to: today, days: 0, withSleep: 0, withHrv: 0, missed: [], rateLimited: false, latest: [] };
  let connected = dryRun || !!(await garminConnectRepo.getConnection(userId));
  const mapped = [];

  for (const chunk of chunks) {
    let fetched;
    try {
      fetched = await fetchHealthRange(client, chunk);
    } catch {
      // fetchHealthRange only rethrows a 429: stop, keep what is stored.
      summary.rateLimited = true;
      break;
    }
    for (const miss of fetched.missed) {
      if (!summary.missed.some((m) => m.part === miss.part && m.status === miss.status)) summary.missed.push(miss);
    }
    const rows = mapPersonalHealth(fetched.payloads);
    const payloadUserId = garminUserIdOf(fetched.payloads);
    if (expectGarminUserId !== null && payloadUserId !== null && String(payloadUserId) !== String(expectGarminUserId)) {
      throw Object.assign(new Error('The Garmin key reads a different Garmin account than the one this rider connected'), { code: 'GARMIN_ACCOUNT_MISMATCH' });
    }
    if (rows.length > 0 && !connected) {
      const garminUserId = payloadUserId;
      if (garminUserId === null) throw new Error('Garmin health payloads carry no userProfilePk — cannot tell which Garmin account this key belongs to');
      await garminConnectRepo.upsertConnection(userId, { garminUserId, transport: 'personal' });
      connected = true;
    }
    if (!dryRun) await garminConnectRepo.upsertHealthDays(userId, rows);
    mapped.push(...rows);
    if (pauseMs > 0 && chunk !== chunks[chunks.length - 1]) await sleep(pauseMs);
  }

  summary.days = mapped.length;
  summary.withSleep = mapped.filter((r) => r.sleep_seconds !== null).length;
  summary.withHrv = mapped.filter((r) => r.hrv_last_night_ms !== null).length;
  summary.latest = mapped.slice(-7).reverse();
  if (!dryRun && mapped.length > 0) await garminConnectRepo.touchLastSync(userId);
  return summary;
}

module.exports = { syncPersonalAccount, syncPersonalHealth, listActivities, healthChunks, PAGE_SIZE, HEALTH_CHUNK_DAYS };
