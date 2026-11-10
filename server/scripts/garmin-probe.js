#!/usr/bin/env node
// Garmin Connect Personal API probe — answers, on the owner's own account,
// the questions the docs leave open before we design the Garmin ingest:
// which endpoints answer, what their payloads look like, how far back the
// activity history goes, and whether the downloaded activity file is a real
// FIT with per-second data. Read-only: GETs against Garmin, no DB access.
//
// Writes:
//   <repo>/garmin-probe.json            the report (git-ignored)
//   server/scripts/.garmin-probe/*.fit   the newest rides' original files
//                                        (git-ignored; FIT parser fixtures)
//
// The report holds payload SHAPES (field names and types). Values are only
// kept for activities (needed to pin units: metres? seconds?) — health
// payloads (sleep, HRV, stress, weight…) stay shape-only unless --values.
// It never contains the API key or the bearer token.
//
// Usage (from server/, reads GARMIN_API from server/.env):
//   node scripts/garmin-probe.js [--days 14] [--fit 3] [--pages 40] [--values] [--out ../garmin-probe.json]
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { externalHttp } = require('../lib/http');
const { readZip } = require('../lib/zip');
const { createGarminPersonalClient } = require('../services/garminConnect/personalClient');

const FIT_DIR = path.join(__dirname, '.garmin-probe');
const PAUSE_MS = Number(process.env.GARMIN_PROBE_PAUSE_MS ?? 250);
const PAGE_SIZE = 100;
const RIDE_TYPE_RE = /cycl|bik|ride/i;

function parseArgs(argv) {
  const args = { days: 14, fit: 3, pages: 40, values: false, out: path.join(__dirname, '..', '..', 'garmin-probe.json') };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--days') args.days = Number(argv[++i]) || args.days;
    else if (a === '--fit') args.fit = Number(argv[++i]);
    else if (a === '--pages') args.pages = Number(argv[++i]) || args.pages;
    else if (a === '--values') args.values = true;
    else if (a === '--out') args.out = path.resolve(argv[++i]);
  }
  return args;
}

const isoDay = (d) => d.toISOString().slice(0, 10);
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// Field names and types of a payload, optionally with scalar values. Arrays
// are described by their length and first element; depth and width are
// capped so a 2000-point stream doesn't become the report.
function describe(value, { values, depth = 0 } = {}) {
  if (value === null || value === undefined || value === '') return values ? value ?? null : 'empty';
  if (Array.isArray(value)) {
    return { _array: value.length, item: value.length && depth < 6 ? describe(value[0], { values, depth: depth + 1 }) : undefined };
  }
  if (typeof value === 'object') {
    if (depth >= 6) return 'object';
    const out = {};
    for (const key of Object.keys(value).slice(0, 120)) out[key] = describe(value[key], { values, depth: depth + 1 });
    return out;
  }
  if (!values) return typeof value;
  return typeof value === 'string' && value.length > 80 ? `${value.slice(0, 80)}…` : value;
}

function fitHeader(buf) {
  if (buf.length < 12) return { isFit: false };
  return {
    isFit: buf.toString('ascii', 8, 12) === '.FIT',
    headerSize: buf[0],
    protocolVersion: buf[1],
    profileVersion: buf.readUInt16LE(2),
    dataBytes: buf.readUInt32LE(4),
  };
}

const typeKey = (a) => a?.activityType?.typeKey || a?.activityTypeDTO?.typeKey || a?.activityType || 'unknown';
const startOf = (a) => a?.startTimeGMT || a?.startTimeLocal || a?.summaryDTO?.startTimeGMT || null;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!config.GARMIN_API) {
    console.error('GARMIN_API is not set in server/.env');
    process.exit(2);
  }
  const client = createGarminPersonalClient({ apiKey: config.GARMIN_API, http: externalHttp });
  const report = { ranAt: new Date().toISOString(), args: { ...args, out: undefined }, token: null, calls: [], history: null, files: [] };
  let rateLimited = false;

  async function call(label, urlPath, { params, kind = 'documented', values = args.values } = {}) {
    if (rateLimited) return null;
    const started = Date.now();
    const entry = { label, path: urlPath, params, kind };
    try {
      const data = await client.get(urlPath, params);
      Object.assign(entry, { ok: true, ms: Date.now() - started, shape: describe(data, { values }) });
      console.log(`  ✓ ${String(entry.ms).padStart(5)} ms  ${label}`);
      report.calls.push(entry);
      await sleep(PAUSE_MS);
      return data;
    } catch (err) {
      Object.assign(entry, { ok: false, ms: Date.now() - started, status: err.status ?? null, error: err.message });
      console.log(`  ✗ ${err.status ?? 'ERR'}  ${label}${kind === 'exploratory' ? '  (exploratory)' : ''}`);
      report.calls.push(entry);
      if (err.status === 429) {
        rateLimited = true;
        console.log('  ! 429 — rate limited, stopping here');
      }
      await sleep(PAUSE_MS);
      return null;
    }
  }

  console.log('Token');
  try {
    await client.getToken();
    const hours = (client.tokenExpiresAt() - Date.now()) / 3600000;
    report.token = { ok: true, expiresInHours: Math.round(hours * 10) / 10 };
    console.log(`  ✓ exchanged, valid for ${report.token.expiresInHours} h`);
  } catch (err) {
    report.token = { ok: false, status: err.status ?? null, error: err.message };
    console.log(`  ✗ ${err.message}`);
    fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  const today = new Date();
  const end = isoDay(today);
  const start = isoDay(new Date(today.getTime() - args.days * 86400000));
  const yesterday = isoDay(new Date(today.getTime() - 86400000));

  console.log('\nProfile');
  await call('profile settings', '/userprofile-service/userprofile/settings');
  await call('heart-rate zones', '/biometric-service/heartRateZones/v2');
  await call('devices', '/device-service/deviceregistration/devices', { kind: 'exploratory' });
  await call('power zones', '/biometric-service/powerZones/sports/all', { kind: 'exploratory' });
  await call('latest cycling FTP', '/biometric-service/biometric/latestFunctionalThresholdPower/CYCLING', { kind: 'exploratory', values: true });

  console.log('\nActivities');
  const firstPage = await call('activity list (first 20)', '/activitylist-service/activities/search/activities', {
    params: { start: 0, limit: 20 },
    values: true,
  });
  const list = Array.isArray(firstPage) ? firstPage : firstPage?.activityList || [];
  const rides = list.filter((a) => RIDE_TYPE_RE.test(String(typeKey(a))));
  const sample = rides[0] || list[0];
  if (sample?.activityId) {
    const id = sample.activityId;
    await call('activity summary', `/activity-service/activity/${id}`, { values: true });
    await call('activity workouts', `/activity-service/activity/${id}/workouts`);
    await call('activity details (streams)', `/activity-service/activity/${id}/details`, {
      params: { maxChartSize: 2000, maxPolylineSize: 4000 },
      kind: 'exploratory',
    });
    await call('activity splits', `/activity-service/activity/${id}/splits`, { kind: 'exploratory' });
    await call('activity HR time in zones', `/activity-service/activity/${id}/hrTimeInZones`, { kind: 'exploratory' });
    await call('activity power time in zones', `/activity-service/activity/${id}/powerTimeInZones`, { kind: 'exploratory' });
  }

  console.log('\nActivity files');
  fs.mkdirSync(FIT_DIR, { recursive: true });
  for (const a of (rides.length ? rides : list).slice(0, Math.max(0, args.fit))) {
    if (rateLimited) break;
    const started = Date.now();
    const file = { activityId: a.activityId, type: typeKey(a), start: startOf(a) };
    try {
      const zip = await client.downloadActivityZip(a.activityId);
      file.zipBytes = zip.length;
      file.entries = readZip(zip).map((e) => {
        const header = fitHeader(e.data);
        const savedAs = `${a.activityId}-${path.basename(e.name)}`;
        fs.writeFileSync(path.join(FIT_DIR, savedAs), e.data);
        return { name: e.name, bytes: e.data.length, savedAs, ...header };
      });
      file.ok = true;
      file.ms = Date.now() - started;
      console.log(`  ✓ ${a.activityId}  ${file.entries.map((e) => `${e.name} ${Math.round(e.bytes / 1024)} KB${e.isFit ? ' FIT' : ''}`).join(', ')}`);
    } catch (err) {
      Object.assign(file, { ok: false, status: err.status ?? null, error: err.message });
      console.log(`  ✗ ${a.activityId}  ${err.message}`);
      if (err.status === 429) rateLimited = true;
    }
    report.files.push(file);
    await sleep(PAUSE_MS);
  }

  console.log('\nHealth');
  await call('daily summaries', '/usersummary-service/v2/dailysummaries', { params: { startDate: start, endDate: end } });
  await call('sleep (range)', '/sleep-service/sleep/dailySleepSummariesByDate', { params: { startDate: start, endDate: end } });
  await call('sleep (one night)', '/sleep-service/sleep/dailySleep', { params: { date: yesterday } });
  await call('HRV (range)', `/hrv-service/hrv/daily/${start}/${end}`);
  await call('body battery', '/wellness-service/wellness/bodyBattery/reports/daily', { params: { startDate: start, endDate: end } });
  await call('stress', `/usersummary-service/stats/stress/daily/${start}/${end}`);
  await call('daily heart rate', '/wellness-service/wellness/dailyHeartRate', { params: { date: yesterday } });
  await call('weight', `/weight-service/weight/range/${start}/${end}`, { params: { includeAll: true } });
  await call('VO2max', `/metrics-service/metrics/maxmet/daily/${start}/${end}`, { kind: 'exploratory' });
  await call('training readiness', `/metrics-service/metrics/trainingreadiness/${yesterday}`, { kind: 'exploratory' });
  await call('training status', `/metrics-service/metrics/trainingstatus/aggregated/${yesterday}`, { kind: 'exploratory' });

  // How much history is reachable, and what is in it — the Starter tier has
  // no backfill, so this decides whether the personal key can supply it.
  console.log('\nHistory depth');
  const history = { total: 0, byType: {}, withPower: 0, newest: null, oldest: null, pages: 0, complete: false };
  for (let page = 0; page < args.pages && !rateLimited; page += 1) {
    let batch;
    try {
      batch = await client.get('/activitylist-service/activities/search/activities', { start: page * PAGE_SIZE, limit: PAGE_SIZE });
    } catch (err) {
      history.error = err.message;
      if (err.status === 429) rateLimited = true;
      break;
    }
    const items = Array.isArray(batch) ? batch : batch?.activityList || [];
    history.pages += 1;
    if (items.length === 0) {
      history.complete = true;
      break;
    }
    for (const a of items) {
      history.total += 1;
      const key = String(typeKey(a));
      history.byType[key] = (history.byType[key] || 0) + 1;
      if (a.avgPower != null || a.averagePower != null) history.withPower += 1;
      const s = startOf(a);
      if (s && (!history.newest || s > history.newest)) history.newest = s;
      if (s && (!history.oldest || s < history.oldest)) history.oldest = s;
    }
    if (items.length < PAGE_SIZE) {
      history.complete = true;
      break;
    }
    await sleep(PAUSE_MS);
  }
  report.history = history;
  console.log(`  ${history.total} activities${history.complete ? '' : '+'}, ${history.oldest || '?'} → ${history.newest || '?'}, ${history.withPower} with power`);
  console.log(`  by type: ${Object.entries(history.byType).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`);

  report.rateLimited = rateLimited;
  fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
  const ok = report.calls.filter((c) => c.ok).length;
  console.log(`\n${ok}/${report.calls.length} calls answered. Report: ${args.out}`);
  console.log(`Activity files: ${FIT_DIR}`);
}

main().catch((err) => {
  // Only the message: a raw axios error would print the Authorization header.
  console.error(err.message);
  process.exitCode = 1;
});
