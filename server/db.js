// Shared Postgres pool, factored out of server.js so middleware/auth.js
// (and any other module that needs a DB handle without pulling in all of
// server.js) can require it directly.
const { Pool, types } = require('pg');
const { buildPgConfig } = require('./db/pgConfig');
const logger = require('./lib/logger');

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

// node-postgres's default parser for NUMERIC/DECIMAL (OID 1700) returns a
// string, to avoid silently losing precision on floats pg's own driver can't
// represent exactly. In practice every NUMERIC column this app reads
// (goals.current_value/target_value, synced_activities.distance/*, user_
// profiles.weight/bike_weight, oura_daily_data.*, etc.) is already run
// through Number()/parseFloat() at every call site that does arithmetic on
// it (see docs/audit/layers/01-server.md S-37) — confirmed by grepping
// server/*.js, routes/, recommendations/ for those column names before
// adding this. parseFloat on an already-numeric value is a no-op, so this
// only changes behaviour where code compared/used the raw DB value without
// converting it first: goals current_value/target_value fallbacks
// (`sg.current_value || 0`) and the `newCurrentValue !== goal.current_value`
// checks in server.js (~5481, ~5555), which today always evaluate unequal
// (number !== string) and fire a spurious UPDATE — this fixes that, it does
// not introduce a new bug.
types.setTypeParser(1700, parseFloat);

// Connection/SSL config (host/user/password/database/port/ssl) is shared
// with any other module that talks to Postgres outside this pool — the
// node-pg-migrate runner (migrate.js) and the schema dump tool
// (scripts/dump-schema.js) — via db/pgConfig.js, so all three ways this
// process ever connects to Postgres agree on TLS/host settings. Only the
// pool-sizing options below are specific to this long-lived pool.
const pool = new Pool({
  ...buildPgConfig(),
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
  logger.error({ err: err.message }, '[pg pool] Unexpected error on idle client:');
});

// Runs `fn(client)` inside BEGIN/COMMIT, ROLLBACK-ing and rethrowing on any
// failure, and always releasing the client back to the pool. `fn` must use
// the given `client` for every query it wants inside the transaction (not
// the shared `pool`) — that's what puts them on the same connection/BEGIN.
//
// This is a proof-of-concept helper used so far only by DELETE /api/account
// (server.js) — the other manual BEGIN/COMMIT/ROLLBACK blocks in server.js
// are migrated to it separately (T-4.2), not as part of introducing it.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, withTransaction };
