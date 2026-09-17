#!/usr/bin/env node
// Recomputes every existing `skills_history` row with the canonical shared
// formula (T-3.3, docs/audit/00-AUDIT-AND-PLAN.md T-3.3 "Продуктовое
// решение владельца продукта"), UPDATING each row's 6 scale columns IN
// PLACE (never inserting/deleting rows) so trends don't jump the moment
// this switch ships — every historical point gets recomputed as-of its own
// `created_at`, using exactly the activities that existed for that user at
// that time (`synced_activities` rows with `start_date <= created_at`).
//
// DOES NOT call Strava — reads only from `synced_activities` (DB), per the
// task rule that a recompute must be reproducible/offline. A user whose
// activities were never synced into Postgres (or whose sync predates
// T-1.3) simply gets whatever's already there recomputed from an empty/
// partial activity list — same "0 activities -> all-zero skills" behaviour
// `calculateAllSkills` always has, not a special case here.
//
// Usage:
//   node scripts/recompute-skills-history.js [--dry-run] [--user <id>]
//
//   --dry-run   Print what would change (old vs new values) without writing.
//   --sync      First pull each user's activities from Strava through the
//               quota-aware client (services/strava/activities.getActivities:
//               incremental when possible, full download for users with no
//               mirrored rows), THEN recompute. Use this as the pre-release
//               warm-up so users who haven't logged in since the migration
//               still get a correct history. Without it the script never
//               touches Strava.
//   --user <id> Only this user's rows (repeatable-safe; omit for all users
//               that have at least one `skills_history` row).
//
// Also available as `npm run skills:recompute -- [--dry-run] [--user <id>]`.
const { pool } = require('../db');
const logger = require('../lib/logger');
const { calculateAllSkills, estimateVO2maxFromActivities } = require('@bikelab/shared/calc');
const { getUserProfile } = require('../recommendations');

const SKILLS_WINDOW_DAYS = 90;

function parseArgs(argv) {
  const args = { dryRun: false, userId: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--sync') args.sync = true;
    else if (argv[i] === '--user') args.userId = Number(argv[++i]);
  }
  return args;
}

function rowToActivity(row) {
  if (row.raw) return row.raw;
  return {
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
}

const SKILL_KEYS = ['climbing', 'sprint', 'endurance', 'tempo', 'power', 'consistency'];

async function recomputeUser(userId, { dryRun }) {
  const [historyResult, activitiesResult, profile] = await Promise.all([
    pool.query('SELECT * FROM skills_history WHERE user_id = $1 ORDER BY snapshot_date ASC', [userId]),
    pool.query('SELECT * FROM synced_activities WHERE user_id = $1 ORDER BY start_date DESC', [userId]),
    getUserProfile(pool, userId).catch(() => null),
  ]);

  const allActivities = activitiesResult.rows.map(rowToActivity);
  let changed = 0;

  for (const row of historyResult.rows) {
    const asOf = new Date(row.created_at || row.snapshot_date);
    // Only activities that existed as of this snapshot's own timestamp —
    // otherwise a rider's later rides would leak into an earlier point's
    // recomputation and the trend line would still jump.
    const activitiesAsOf = allActivities.filter((a) => new Date(a.start_date) <= asOf);

    const vo2maxEstimate = estimateVO2maxFromActivities(activitiesAsOf, profile, {
      windowDays: SKILLS_WINDOW_DAYS,
      now: asOf,
    });
    const newSkills = calculateAllSkills(activitiesAsOf, {
      asOf,
      windowDays: SKILLS_WINDOW_DAYS,
      summary: { vo2max: vo2maxEstimate.vo2max, lthr: profile?.lactate_threshold ?? null },
    });

    const oldSkills = {};
    for (const key of SKILL_KEYS) oldSkills[key] = row[key] != null ? Number(row[key]) : null;

    const diffKeys = SKILL_KEYS.filter((key) => oldSkills[key] !== newSkills[key]);
    if (diffKeys.length > 0) {
      changed++;
      const diffStr = diffKeys.map((k) => `${k}: ${oldSkills[k]} -> ${newSkills[k]}`).join(', ');
      console.log(`  [user ${userId}] snapshot ${row.id} (${row.snapshot_date}): ${diffStr}`);
    }

    if (!dryRun) {
      await pool.query(
        `UPDATE skills_history
         SET climbing = $1, sprint = $2, endurance = $3, tempo = $4, power = $5, consistency = $6
         WHERE id = $7`,
        [newSkills.climbing, newSkills.sprint, newSkills.endurance, newSkills.tempo, newSkills.power, newSkills.consistency, row.id]
      );
    }
  }

  return { rows: historyResult.rows.length, changed };
}

async function main() {
  const { dryRun, userId, sync } = parseArgs(process.argv.slice(2));

  let userIds;
  if (userId) {
    userIds = [userId];
  } else {
    const result = await pool.query('SELECT DISTINCT user_id FROM skills_history ORDER BY user_id');
    userIds = result.rows.map((r) => r.user_id);
  }

  console.log(`${dryRun ? '[DRY RUN] ' : ''}Recomputing skills_history for ${userIds.length} user(s)...`);

  if (sync) {
    const { getActivities } = require('../services/strava/activities');
    const { StravaNotLinkedError } = require('../services/strava/tokens');
    for (const uid of userIds) {
      try {
        const acts = await getActivities(uid, { force: true });
        console.log(`  synced user ${uid}: ${acts.length} activities in DB`);
      } catch (err) {
        if (err instanceof StravaNotLinkedError) console.log(`  user ${uid}: Strava not linked, skipping sync`);
        else console.log(`  user ${uid}: sync failed (${err.message}) — recomputing from what is stored`);
      }
    }
  }

  let totalRows = 0;
  let totalChanged = 0;
  for (const uid of userIds) {
    const { rows, changed } = await recomputeUser(uid, { dryRun });
    totalRows += rows;
    totalChanged += changed;
  }

  console.log(
    `${dryRun ? '[DRY RUN] would update' : 'Updated'} ${totalChanged}/${totalRows} skills_history row(s) across ${userIds.length} user(s).`
  );
  await pool.end();
}

if (require.main === module) {
  main().catch((err) => {
    logger.error({ err }, '[recompute-skills-history] failed:');
    console.error(err);
    process.exit(1);
  });
}

module.exports = { recomputeUser, rowToActivity };
