// Shared Postgres pool, factored out of server.js so middleware/auth.js
// (and any other module that needs a DB handle without pulling in all of
// server.js) can require it directly.
const { Pool, types } = require('pg');

// node-postgres's default parser for bare DATE columns (OID 1082) builds a
// JS Date via `new Date(year, month, day)` — LOCAL time — then anything that
// later calls .toISOString()/JSON.stringify() on it converts to UTC. On a
// server whose process timezone is ahead of UTC (e.g. any European TZ),
// local midnight rolls back into the previous UTC day, so a DATE stored as
// exactly '2026-07-14' gets serialized as "2026-07-13T22:00:00.000Z" —
// every reader that takes the date portion of that string (calendar list,
// created-event cards, etc.) then shows the 13th. The DB value itself was
// always correct; only the read path was shifting it. DATE has no time or
// zone component to begin with, so the fix is to stop converting it to a
// Date object at all and just hand back the raw "YYYY-MM-DD" string.
types.setTypeParser(1082, (val) => val);

const isProduction = process.env.PGSSLMODE === 'require' || process.env.NODE_ENV === 'production';

const pool = new Pool({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  port: process.env.PGPORT,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  max: 25,
  min: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// pg-pool keeps a small number of idle clients open (see `min` above) —
// the remote Postgres (or a network hop in between, e.g. Render's proxy)
// can close one of those out from under us at any time (ECONNRESET,
// "Connection terminated unexpectedly"), which pg-pool then re-emits as an
// 'error' event ON THE POOL ITSELF, not on any individual query's promise.
// With no listener attached, Node treats that as an uncaught exception and
// kills the ENTIRE process — taking down every in-flight request, not just
// whatever happened to be idle. This is the #1 thing node-postgres's own
// docs call out as required for any long-running pool. The pool
// transparently opens a fresh connection for the next query either way;
// logging here is just so a dead idle client shows up somewhere instead of
// crashing the app silently at 3am.
pool.on('error', (err) => {
  console.error('[pg pool] Unexpected error on idle client:', err.message);
});

module.exports = { pool };
