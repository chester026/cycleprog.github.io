// Shared bootstrap for integration tests (T-1.7, docs/audit/00-AUDIT-AND-
// PLAN.md). Each integration test file `require`s this module and awaits
// its exported promise — the actual DB-create/migrate/require-server work
// only ever runs once per `vitest` process (module-level singleton), no
// matter how many test files import it, because `require()` caches this
// module.
//
// Order matters a lot here:
//   1. Drop + recreate a scratch database (`bikelab_it` by default) using a
//      separate connection to the `postgres` maintenance database — you
//      cannot DROP/CREATE DATABASE from a connection that's `\c`'d into the
//      database being dropped, and it can't run inside a transaction
//      (node-postgres runs each `.query()` call as its own implicit
//      statement here, which is what we need).
//   2. Point PGDATABASE (and everything else server/config/index.js reads)
//      at that scratch database via `process.env`, BEFORE requiring
//      anything under server/ — config/index.js (and everything that
//      transitively requires it: db.js, migrate.js, server.js, ...) reads
//      `process.env` once, at require time, and freezes the result. Setting
//      env vars after any of those modules has already been required would
//      be silently ignored.
//   3. Apply test/fixtures/base-schema.sql (the tables no migration creates
//      — see that file's header) directly with `psql`/`pg`.
//   4. Run the real migrations (`../../migrate`'s runMigrations()) on top,
//      so integration tests exercise the exact same migration set
//      production does.
//   5. Only now `require('../../server')` — this is what actually builds
//      `app` (registers every route/middleware) using the config frozen in
//      step 2.
const path = require('path');
const { Client } = require('pg');

const IT_DB = process.env.BIKELAB_IT_DB || 'bikelab_it';

function maintenanceConnConfig() {
  // Deliberately NOT `../../db/pgConfig` here — that module reads
  // `../config`, which we cannot require yet (see module header: nothing
  // under server/ may be required before step 2 sets process.env). This
  // stays a small, self-contained env read of just the Postgres
  // connection bits, mirroring db/pgConfig.js's DATABASE_URL-or-PG*
  // fallback but targeting the `postgres` maintenance database rather than
  // PGDATABASE.
  if (process.env.DATABASE_URL) {
    // Swap whatever database the URL points at for the `postgres`
    // maintenance database, keeping host/port/user/password/query as-is.
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = '/postgres';
    return { connectionString: url.toString() };
  }
  return {
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: 'postgres',
    ssl: process.env.PGSSLMODE === 'disable' ? false : undefined,
  };
}

async function recreateDatabase() {
  const client = new Client(maintenanceConnConfig());
  await client.connect();
  try {
    // Terminate any lingering connections to the scratch DB (a previous,
    // interrupted run) — DROP DATABASE fails while anything is still
    // connected to it.
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [IT_DB]
    );
    await client.query(`DROP DATABASE IF EXISTS ${IT_DB}`);
    await client.query(`CREATE DATABASE ${IT_DB}`);
  } finally {
    await client.end();
  }
}

async function applyBaseSchema() {
  const fs = require('fs');
  const sql = fs.readFileSync(path.join(__dirname, '../fixtures/base-schema.sql'), 'utf8');
  const client = new Client({
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: IT_DB,
    ssl: process.env.PGSSLMODE === 'disable' ? false : undefined,
    connectionString: process.env.DATABASE_URL
      ? (() => {
          const url = new URL(process.env.DATABASE_URL);
          url.pathname = `/${IT_DB}`;
          return url.toString();
        })()
      : undefined,
  });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

let bootPromise;

// Resolves to the built `app` (express instance from server/server.js),
// fully wired up against a freshly migrated `bikelab_it` database. Safe to
// call from multiple test files/tests — the underlying work runs exactly
// once (module-level memoized promise).
function bootstrap() {
  if (!bootPromise) {
    bootPromise = (async () => {
      await recreateDatabase();

      // From here on, process.env is what config/index.js (and everything
      // that requires it) will see — nothing under server/ may be required
      // above this line.
      process.env.PGDATABASE = IT_DB;
      process.env.NODE_ENV = 'test';
      process.env.MIGRATE_ON_START = 'false';
      process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
      process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-jwt-secret-at-least-32-chars';
      process.env.STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID || 'test-strava-client-id';
      process.env.STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET || 'test-strava-client-secret';
      process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';
      // Dummy — makes brevo-config.js's BREVO_CONFIGURED true so
      // /api/register's sendVerificationEmail() call doesn't throw before
      // even trying to send. auth.test.js additionally monkey-patches
      // lib/http's shared axios instance so that call never reaches the
      // real network.
      process.env.BREVO_API_KEY = process.env.BREVO_API_KEY || 'test-brevo-key';
      // Never let anything actually reach Strava/OpenAI: no test in this
      // suite exercises a route that calls out (see this file's header +
      // integration test comments), and these are already dummy values.

      await applyBaseSchema();

      const { runMigrations } = require('../../migrate');
      await runMigrations({ direction: 'up' });

      // Only now is it safe to pull in the app itself.
      const { app } = require('../../server');
      const { pool } = require('../../db');
      return { app, pool };
    })();
  }
  return bootPromise;
}

module.exports = { bootstrap, IT_DB };
