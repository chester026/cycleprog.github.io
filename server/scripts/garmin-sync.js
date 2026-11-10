#!/usr/bin/env node
// Pulls the owner's Garmin Connect data into BikeLab with the Personal API
// key (docs/plans/garmin-connect-api.md §5). Development transport — real
// riders will arrive through the Developer Program push, into the same
// tables.
//
//   rides  — for every ride on the account, download the original FIT file,
//            derive the summary / analysis / chart, store one
//            garmin_activities row.
//   health — the last N days of sleep, HRV, resting heart rate, stress and
//            Body Battery, one garmin_health_days row a day.
//
// WRITES TO THE DATABASE in server/.env — which is the production database.
// It only touches the Garmin tables (migrations 1758000000019 and …020 must
// have run: `npm run migrate`), and only for the one BikeLab user named
// below.
//
// Safe to re-run: rides already stored are skipped, so after the first full
// pass a run only fetches what is new; the health window is small and is
// always re-fetched, because the most recent days are still changing.
//
// Usage (from server/, reads GARMIN_API from server/.env):
//   node scripts/garmin-sync.js --strava-id <athlete id>   which BikeLab user
//                               --user-id <id> | --email <address>
//     [--dry-run]         list, fetch and count only — nothing is written
//     [--only rides|health]  do just one half
//     [--health-days 30]  how many days of health data to (re)fetch
//     [--limit 20]        ingest at most this many rides this run
//     [--force]           re-ingest rides that are already stored
//     [--no-cache]        don't keep downloaded FIT files on disk
//
// Downloaded FIT files are kept in server/scripts/.garmin-probe/fit/
// (git-ignored) so `--force` after a calc change costs no Garmin calls.
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { pool } = require('../db');
const { externalHttp } = require('../lib/http');
const { createGarminPersonalClient } = require('../services/garminConnect/personalClient');
const { syncPersonalAccount, syncPersonalHealth } = require('../services/garminConnect/personalSync');
const garminConnectRepo = require('../repositories/garminConnect');

const FIT_DIR = path.join(__dirname, '.garmin-probe', 'fit');
const PAUSE_MS = Number(process.env.GARMIN_PROBE_PAUSE_MS ?? 250);

function parseArgs(argv) {
  const args = { userId: null, email: null, stravaId: null, dryRun: false, force: false, limit: Infinity, cache: true, only: null, healthDays: 30 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--user-id') args.userId = Number(argv[++i]);
    else if (a === '--email') args.email = argv[++i];
    else if (a === '--strava-id') args.stravaId = Number(argv[++i]);
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--force') args.force = true;
    else if (a === '--no-cache') args.cache = false;
    else if (a === '--limit') args.limit = Number(argv[++i]) || args.limit;
    else if (a === '--health-days') args.healthDays = Math.max(1, Math.round(Number(argv[++i])) || args.healthDays);
    else if (a === '--only') {
      args.only = argv[++i];
      if (args.only !== 'rides' && args.only !== 'health') throw new Error('--only takes "rides" or "health"');
    } else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

async function findUser(args) {
  const by = args.userId ? ['id', args.userId] : args.email ? ['email', args.email] : args.stravaId ? ['strava_id', args.stravaId] : null;
  if (!by) throw new Error('Say which BikeLab user this Garmin account belongs to: --strava-id <id>, --user-id <id> or --email <address>');
  const result = await pool.query(`SELECT id, email, name, strava_id FROM users WHERE ${by[0]} = $1`, [by[1]]);
  if (result.rows.length !== 1) throw new Error(`Expected exactly one user with ${by[0]} = ${by[1]}, found ${result.rows.length}`);
  return result.rows[0];
}

function diskCache() {
  fs.mkdirSync(FIT_DIR, { recursive: true });
  const file = (id) => path.join(FIT_DIR, `${id}.fit`);
  return {
    read: (id) => (fs.existsSync(file(id)) ? fs.readFileSync(file(id)) : null),
    write: (id, bytes) => fs.writeFileSync(file(id), bytes),
  };
}

function progressLine(event) {
  const when = event.start ? String(event.start).slice(0, 10) : '          ';
  const what = event.status === 'ingested'
    ? `✓ ${event.type}${event.device_watts ? ' · power' : ''}`
    : event.status === 'skipped' ? `– skipped (${event.reason}${event.sport ? `: ${event.sport}` : ''})` : `✗ ${event.error}`;
  console.log(`  ${when}  ${String(event.id).padEnd(12)} ${what}  ${event.name ?? ''}`);
}

async function syncRides(user, client, args) {
  console.log('\nRides');
  const summary = await syncPersonalAccount(user.id, client, {
    force: args.force,
    limit: args.limit,
    dryRun: args.dryRun,
    pauseMs: PAUSE_MS,
    fitCache: args.cache ? diskCache() : null,
    onProgress: progressLine,
  });

  const skipped = Object.entries(summary.skipped).map(([reason, n]) => `${n} ${reason}`).join(', ') || 'none';
  console.log(`\n${summary.listed} activities on the account, ${summary.rides} of them rides`);
  console.log(`  already stored: ${summary.upToDate}`);
  console.log(`  ${args.dryRun ? 'would ingest' : 'ingested'}:    ${args.dryRun ? summary.pending : summary.ingested}`);
  if (!args.dryRun) {
    console.log(`  skipped:        ${skipped}`);
    console.log(`  failed:         ${summary.failed.length}${summary.failed.length ? ` — ${summary.failed.map((f) => `${f.id}: ${f.error}`).join('; ')}` : ''}`);
    if (summary.pending) console.log(`  left for the next run: ${summary.pending}${summary.rateLimited ? ' (Garmin rate limit reached)' : ''}`);
    const stats = await garminConnectRepo.getActivityStats(user.id);
    const perRide = stats.activities ? Math.round(stats.stored_bytes / stats.activities / 1024) : 0;
    console.log(`\nIn the database: ${stats.activities} rides, ${(stats.stored_bytes / 1048576).toFixed(1)} MB (${perRide} KB a ride)`);
  }
  return summary.failed.length === 0;
}

// One mapped day on one line, in the units Garmin Connect shows — printed so
// the mapping can be checked against the app by eye.
function healthLine(row) {
  const cell = (value, unit = '') => (value === null || value === undefined ? '—' : `${value}${unit}`);
  const minutes = row.sleep_seconds === null ? null : Math.round(row.sleep_seconds / 60);
  const hours = minutes === null ? '—' : `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
  return [
    `  ${row.day}`,
    `sleep ${hours.padEnd(5)}`,
    `score ${cell(row.sleep_score).padEnd(3)}`,
    `HRV ${cell(row.hrv_last_night_ms, ' ms').padEnd(8)}${row.hrv_status ? ` ${row.hrv_status}` : ''}`,
    `RHR ${cell(row.resting_hr).padEnd(3)}`,
    `stress ${cell(row.stress_avg).padEnd(3)}`,
    `body battery ${cell(row.body_battery_low)}–${cell(row.body_battery_high)}`,
  ].join('   ');
}

async function syncHealth(user, client, args) {
  console.log('\nHealth');
  const summary = await syncPersonalHealth(user.id, client, { days: args.healthDays, dryRun: args.dryRun, pauseMs: PAUSE_MS });
  console.log(`  ${summary.from} … ${summary.to}: ${summary.days} days with data ${args.dryRun ? 'found' : 'stored'} (${summary.withSleep} with sleep, ${summary.withHrv} with HRV)`);
  for (const miss of summary.missed) console.log(`  ! ${miss.part} did not answer (${miss.status ?? 'error'}) — those columns stay empty`);
  if (summary.rateLimited) console.log('  ! Garmin rate limit reached — the rest is picked up by the next run');
  if (summary.latest.length) {
    console.log('\n  Latest days as stored — compare with Garmin Connect:');
    for (const row of summary.latest) console.log(healthLine(row));
  }
  return true;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!config.GARMIN_API) throw new Error('GARMIN_API is not set in server/.env');
  const user = await findUser(args);
  console.log(`Garmin (personal key) → BikeLab user #${user.id} ${user.name || ''} <${user.email}>${args.dryRun ? '   [DRY RUN]' : ''}`);

  const client = createGarminPersonalClient({ apiKey: config.GARMIN_API, http: externalHttp });
  let ok = true;
  if (args.only !== 'health') ok = (await syncRides(user, client, args)) && ok;
  if (args.only !== 'rides') ok = (await syncHealth(user, client, args)) && ok;
  if (!ok) process.exitCode = 1;
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { parseArgs, healthLine };
