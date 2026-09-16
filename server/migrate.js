// Schema migrations via node-pg-migrate (T-1.4, docs/audit/00-AUDIT-AND-PLAN.md,
// S-29). Two ways this is used:
//
//   - `node migrate.js` / `node migrate.js up`   — apply pending migrations.
//   - `node migrate.js down [count]`             — roll back `count`
//     migrations (default 1).
//   - `require('./migrate').runMigrations()`     — called from server.js at
//     startup, gated by config.MIGRATE_ON_START (default true), before
//     `app.listen`.
//
// Migration files live in ./migrations, are plain `.sql` (node-pg-migrate's
// SQL-file mode — one file, no up/down split, since every DDL statement this
// app has ever run is already idempotent (`IF NOT EXISTS`) — see the
// migrations directory README/comments), and are tracked in the
// `pgmigrations` table.
//
// Connects with a single dedicated `pg.Client` built from the exact same
// config as the app pool (see db/pgConfig.js) — not the shared pool itself,
// since node-pg-migrate wants ownership of the connection it runs on (it
// takes an advisory lock for the duration of the run) and this needs to work
// standalone from the CLI, without booting the rest of the app / pool.
const path = require('path');
const { Client } = require('pg');
const { runner } = require('node-pg-migrate');
const { buildPgConfig } = require('./db/pgConfig');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const MIGRATIONS_TABLE = 'pgmigrations';

async function runMigrations({ direction = 'up', count } = {}) {
  const client = new Client(buildPgConfig());
  await client.connect();
  try {
    const results = await runner({
      dbClient: client,
      dir: MIGRATIONS_DIR,
      migrationsTable: MIGRATIONS_TABLE,
      direction,
      count: direction === 'down' ? (count ?? 1) : count,
      checkOrder: true,
      singleTransaction: false, // migrations already contain their own idempotent guards; keep failures isolated per-file
    });
    for (const r of results) {
      console.log(`[migrate] ${direction} ${r.name}`);
    }
    if (results.length === 0) {
      console.log(`[migrate] no migrations to run (${direction})`);
    }
    return results;
  } finally {
    await client.end();
  }
}

// CLI entry point: `node migrate.js [up|down] [count]`
if (require.main === module) {
  const [, , dirArg = 'up', countArg] = process.argv;
  const direction = dirArg === 'down' ? 'down' : 'up';
  const count = countArg !== undefined ? Number(countArg) : undefined;

  runMigrations({ direction, count })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[migrate] failed:', err);
      process.exit(1);
    });
}

module.exports = { runMigrations };
