#!/usr/bin/env node
// Restores completed goals a rider lost (owner request, 09/2026: goals were
// deleted while the app was being rebuilt) from a hand-written JSON file —
// see scripts/restore-goals/dmitrii-2026.json for the format.
//
// Each goal becomes a normal meta_goal (status 'completed') + activity-source
// sub-goals, back-dated so the app treats it exactly like a goal that was
// created and finished at the time:
//   - created_at  = `start` — the goal window starts here (services/goals.js
//                   measures sub-goals over [created_at, target_date]);
//   - target_date = `end`;
//   - completed_at/updated_at = the date of the latest matched `keyRides`
//                   ride in synced_activities (the event itself), or `end`
//                   when no ride matches — so the Garage card and the goal
//                   Share Studio recap cover the real build-up to the event.
// Sub-goal progress is computed live from real rides by the same
// goalCalculator the API uses; nothing here is a hard-coded "100%".
//
// The matched key rides are also attached to the goal (meta_goal_rides, the
// same rows POST /api/meta-goals/:id/complete writes), and completed_at is
// the exact start of the latest one.
//
// Safe by default: without --apply it only prints what it would insert,
// which rides it matched, and each sub-goal's real value vs target.
// Idempotent: a goal whose title already exists for the user is skipped.
// Everything is inserted in one transaction.
//
// --attach-only is for goals that were restored BEFORE rides were attached:
// it inserts nothing, and for each existing completed goal (matched by title)
// replaces its attached rides with the matched key rides and moves
// completed_at to the latest of them. Goals not in the database, or without a
// matched ride, are skipped. Combine with --apply like the normal mode.
//
// Usage (from server/, reads server/.env like the app):
//   node scripts/restore-goals.js --file scripts/restore-goals/dmitrii-2026.json --strava-id 40612950
//   node scripts/restore-goals.js --file ... --strava-id 40612950 --apply
//   node scripts/restore-goals.js --file ... --strava-id 40612950 --attach-only [--apply]
//   (--email <address> works instead of --strava-id)
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');
const goalCalculator = require('../goalCalculator');
const ridesRepo = require('../repositories/metaGoalRides');

const TIERS = ['base', 'epic', 'grand', 'legendary'];
// Matching tolerance for keyRides: GPS distance/elevation differ between
// devices and Strava's own recalculation, so an "86 km / 1700 m" race day
// can land as 84.9 km / 1620 m.
const DISTANCE_TOLERANCE = 0.9;
const ELEVATION_TOLERANCE = 0.85;

// Sub-goal kinds -> the metric JSON the goal engine understands
// (packages/shared/src/constants/goalTypes.ts, calc/goalProgress.ts).
const SUB_GOAL_KINDS = {
  longest_ride_km: () => ({
    unit: 'km',
    metric: { source: 'activity', aggregate: 'max', field: 'distance', transform: 0.001 },
  }),
  biggest_climb_m: () => ({
    unit: 'm',
    metric: { source: 'activity', aggregate: 'max', field: 'total_elevation_gain' },
  }),
  total_climb_m: () => ({
    unit: 'm',
    metric: { source: 'activity', aggregate: 'sum', field: 'total_elevation_gain' },
  }),
  rides_over_km: (sg) => ({
    unit: 'rides',
    metric: { source: 'activity', aggregate: 'count', filter: { min_distance: sg.min_km * 1000 } },
  }),
};

function parseArgs(argv) {
  const args = { apply: false, attachOnly: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') args.apply = true;
    else if (argv[i] === '--attach-only') args.attachOnly = true;
    else if (argv[i] === '--file') args.file = argv[++i];
    else if (argv[i] === '--strava-id') args.stravaId = argv[++i];
    else if (argv[i] === '--email') args.email = argv[++i];
  }
  return args;
}

// Plain-data checks on the input file, so a typo fails before any SQL runs.
function validateGoals(goals) {
  const errors = [];
  goals.forEach((g, i) => {
    const at = `goals[${i}] "${g.title || '?'}"`;
    if (!g.title) errors.push(`${at}: title is required`);
    if (!TIERS.includes(g.tier)) errors.push(`${at}: tier must be one of ${TIERS.join(', ')}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(g.start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(g.end || '')) {
      errors.push(`${at}: start/end must be YYYY-MM-DD`);
    } else if (g.start > g.end) errors.push(`${at}: start is after end`);
    (g.subGoals || []).forEach((sg, j) => {
      if (!SUB_GOAL_KINDS[sg.kind]) errors.push(`${at} subGoals[${j}]: unknown kind "${sg.kind}"`);
      if (!(Number(sg.target) > 0)) errors.push(`${at} subGoals[${j}]: target must be > 0`);
    });
  });
  return errors;
}

function rowToActivity(row) {
  return {
    id: Number(row.strava_id),
    name: row.name,
    type: row.type,
    start_date: row.start_date instanceof Date ? row.start_date.toISOString() : row.start_date,
    distance: row.distance != null ? Number(row.distance) : 0,
    moving_time: row.moving_time,
    total_elevation_gain: row.total_elevation_gain != null ? Number(row.total_elevation_gain) : 0,
    average_speed: row.average_speed != null ? Number(row.average_speed) : undefined,
  };
}

const dayOf = (iso) => String(iso).slice(0, 10);

function inWindow(a, g) {
  const d = dayOf(a.start_date);
  return d >= g.start && d <= g.end;
}

// For each key ride, the ride in the window closest to its distance/climb
// (sum of relative differences), among those that clear the tolerances. Each
// ride is used for at most one key across ALL goals (GranFondo's two days are
// two rides; the Kykkos ride can't also be the Olympus ride).
// A key with `date` pins the match to that day — for when two similar rides
// fall in one window and the dry run picked the wrong one.
function matchKeyRides(g, activities, used = new Set()) {
  const candidatesInWindow = activities.filter((a) => inWindow(a, g));
  return (g.keyRides || []).map((key) => {
    const score = (a) =>
      (key.distance_km ? Math.abs(a.distance / 1000 - key.distance_km) / key.distance_km : 0) +
      (key.elevation_m ? Math.abs(a.total_elevation_gain - key.elevation_m) / key.elevation_m : 0);
    const candidates = candidatesInWindow.filter(
      (a) =>
        !used.has(a.id) &&
        (!key.date || dayOf(a.start_date) === key.date) &&
        (!key.distance_km || a.distance / 1000 >= key.distance_km * DISTANCE_TOLERANCE) &&
        (!key.elevation_m || a.total_elevation_gain >= key.elevation_m * ELEVATION_TOLERANCE)
    );
    candidates.sort((a, b) => score(a) - score(b));
    const ride = candidates[0] || null;
    if (ride) used.add(ride.id);
    return { key, ride };
  });
}

function fmtRide(a) {
  return `${dayOf(a.start_date)} "${a.name}" ${(a.distance / 1000).toFixed(1)} km / ${Math.round(a.total_elevation_gain)} m`;
}

// Why an existing goal is or isn't touched in --attach-only mode.
function attachOnlyVerdict(existingGoal, matchedRides) {
  if (!existingGoal) return 'SKIP (goal not in the database)';
  if (existingGoal.status !== 'completed') return 'SKIP (goal is not completed)';
  if (matchedRides.length === 0) return 'SKIP (no key ride matched)';
  return 'ATTACH';
}

// Same writes as POST /api/meta-goals/:id/complete for an already-completed goal.
async function attachRides(client, userId, metaId, completedAt, rides) {
  await client.query(
    // Separate params for the two columns: see the INSERT in main().
    'UPDATE meta_goals SET completed_at = $1, updated_at = $2 WHERE id = $3 AND user_id = $4',
    [completedAt, completedAt, metaId, userId]
  );
  await ridesRepo.replaceRides(metaId, userId, rides.map((r) => r.id), client);
}

async function findUser(args) {
  if (args.stravaId) {
    const r = await pool.query('SELECT id, email, strava_id FROM users WHERE strava_id = $1', [args.stravaId]);
    return r.rows[0] || null;
  }
  const r = await pool.query('SELECT id, email, strava_id FROM users WHERE lower(email) = lower($1)', [args.email]);
  return r.rows[0] || null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file || (!args.stravaId && !args.email)) {
    console.error('Usage: node scripts/restore-goals.js --file <json> (--strava-id <id> | --email <address>) [--apply]');
    process.exit(2);
  }
  const { goals } = JSON.parse(fs.readFileSync(path.resolve(args.file), 'utf8'));
  const errors = validateGoals(goals || []);
  if (errors.length) {
    console.error(`Input file has problems:\n  ${errors.join('\n  ')}`);
    process.exit(2);
  }

  const user = await findUser(args);
  if (!user) {
    console.error(`No user found for ${args.stravaId ? `strava_id ${args.stravaId}` : `email ${args.email}`}.`);
    process.exit(1);
  }
  console.log(`User #${user.id} (strava ${user.strava_id}, ${user.email || 'no email'})`);
  console.log(args.apply ? 'Mode: APPLY — writing to the database.\n' : 'Mode: dry run — nothing is written (add --apply).\n');

  const [activityRows, existingRows] = await Promise.all([
    pool.query(
      `SELECT strava_id, name, type, start_date, distance, moving_time, total_elevation_gain, average_speed
         FROM synced_activities WHERE user_id = $1 ORDER BY start_date`,
      [user.id]
    ),
    pool.query('SELECT id, status, lower(title) AS t FROM meta_goals WHERE user_id = $1', [user.id]),
  ]);
  const activities = activityRows.rows.map(rowToActivity);
  const existing = new Map(existingRows.rows.map((r) => [r.t, r]));
  console.log(`${activities.length} synced rides in the database.\n`);

  const plan = [];
  const usedRides = new Set();
  for (const g of goals) {
    const existingGoal = existing.get(g.title.toLowerCase());
    const matches = matchKeyRides(g, activities, usedRides);
    const matched = matches.filter((m) => m.ride).map((m) => m.ride);
    // The goal is done at the start of the last event ride (e.g. GranFondo's
    // day two) — what POST /complete would stamp — else noon on its end day.
    const completedAt = matched.length
      ? matched.map((r) => r.start_date).sort().pop()
      : `${g.end}T12:00:00Z`;

    const verdict = args.attachOnly
      ? attachOnlyVerdict(existingGoal, matched)
      : existingGoal ? 'SKIP (already exists)' : 'ADD';
    console.log(`${verdict}  ${g.title}  [${g.tier}]  ${g.start} → ${g.end}`);
    for (const m of matches) {
      const want = [m.key.distance_km && `${m.key.distance_km} km`, m.key.elevation_m && `${m.key.elevation_m} m`].filter(Boolean).join(' / ');
      console.log(`   key ride ${want}: ${m.ride ? fmtRide(m.ride) : 'NOT FOUND in this window'}`);
    }
    console.log(`   completed: ${completedAt}${matched.length ? '' : ' (no key ride matched — using end of window)'}`);

    if (args.attachOnly) {
      console.log('');
      if (verdict === 'ATTACH') plan.push({ metaId: existingGoal.id, completedAt, rides: matched });
      continue;
    }
    const subGoals = (g.subGoals || []).map((sg) => {
      const { unit, metric } = SUB_GOAL_KINDS[sg.kind](sg);
      // Same window the API will use once the goal exists: [created_at,
      // target_date]. Full-day bounds — a bare 'YYYY-MM-DD' parses as
      // midnight and would drop rides ridden on the last day.
      const actual = goalCalculator.calculateProgress(
        { metric, target_value: sg.target, start_date: `${g.start}T00:00:00Z`, end_date: `${g.end}T23:59:59Z` },
        { activities }
      );
      return { ...sg, unit, metric, actual: Number(actual) || 0 };
    });
    for (const sg of subGoals) {
      const pct = Math.min(100, Math.round((sg.actual / sg.target) * 100));
      console.log(`   • ${sg.title}: ${Math.round(sg.actual * 10) / 10} / ${sg.target} ${sg.unit} (${pct}%)`);
    }
    console.log('');
    if (!existingGoal) plan.push({ g, completedAt, rides: matched, subGoals });
  }

  const verb = args.attachOnly ? 'have rides attached' : 'be added';
  if (!args.apply) {
    console.log(`Dry run: ${plan.length} goal(s) would ${verb}. Re-run with --apply to write them.`);
    return;
  }
  if (plan.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (args.attachOnly) {
      for (const { metaId, completedAt, rides } of plan) {
        await attachRides(client, user.id, metaId, completedAt, rides);
        console.log(`Attached ${rides.length} ride(s) to goal #${metaId}`);
      }
      await client.query('COMMIT');
      console.log(`\nDone: ${plan.length} goal(s) updated.`);
      return;
    }
    for (const { g, completedAt, rides, subGoals } of plan) {
      const meta = await client.query(
        `INSERT INTO meta_goals
           (user_id, title, description, target_date, ai_generated, ai_context, status, tier, focus_tags,
            created_at, updated_at, completed_at)
         VALUES ($1, $2, $3, $4, false, $5, 'completed', $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          user.id,
          g.title,
          g.description || null,
          g.end,
          JSON.stringify({ restored: true, restoredAt: new Date().toISOString(), source: path.basename(args.file) }),
          g.tier,
          g.focus_tags || [],
          `${g.start}T00:00:00Z`,
          // updated_at and completed_at get separate params: the production
          // table's updated_at is not the same timestamp type as the newer
          // completed_at, and Postgres refuses one $n used for both
          // ("inconsistent types deduced for parameter").
          completedAt,
          completedAt,
        ]
      );
      const metaId = meta.rows[0].id;
      for (const [i, sg] of subGoals.entries()) {
        await client.query(
          `INSERT INTO goals
             (user_id, meta_goal_id, title, description, target_value, current_value, unit, source, metric,
              priority, reasoning, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'activity', $8, $9, $10, $11, $12)`,
          [
            user.id,
            metaId,
            sg.title,
            sg.description || null,
            sg.target,
            sg.actual,
            sg.unit,
            JSON.stringify(sg.metric),
            i + 1,
            'Restored from the rider\'s own record of a completed goal.',
            `${g.start}T00:00:00Z`,
            completedAt,
          ]
        );
      }
      await ridesRepo.replaceRides(metaId, user.id, rides.map((r) => r.id), client);
      console.log(`Added #${metaId} ${g.title} (${subGoals.length} sub-goals, ${rides.length} ride(s))`);
    }
    await client.query('COMMIT');
    console.log(`\nDone: ${plan.length} goal(s) restored.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Rolled back, nothing was written:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { validateGoals, matchKeyRides, SUB_GOAL_KINDS };
