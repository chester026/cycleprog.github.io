// Builds the pg connection config shared by the app's pool (../db.js) and
// any standalone `pg.Client`/`pg.Pool` this process creates outside of that
// pool — currently the node-pg-migrate runner (../migrate.js) and the schema
// dump tool (../scripts/dump-schema.js). Kept as a pure function with no
// side effects (no pool creation, no `pg.types` parser registration) so
// requiring it never opens a connection or mutates global pg state — that
// stays in db.js, which is still the module everything else in the app
// requires for `{pool, withTransaction}`.
const fs = require('fs');
const config = require('../config');

const isProduction = config.PGSSLMODE === 'require' || config.NODE_ENV === 'production';

function buildSsl() {
  if (config.PGSSLMODE === 'disable') return false; // explicit opt-out (local PG without TLS)
  if (!isProduction) return false;
  if (config.PGSSLROOTCERT) {
    return { ca: fs.readFileSync(config.PGSSLROOTCERT) };
  }
  // See db.js for why this is a deliberate (loud) fallback rather than a bug.
  console.warn(
    '[db] PGSSLROOTCERT not set — connecting to Postgres with ssl.rejectUnauthorized=false ' +
      '(TLS is used, but the server certificate is not verified). Set PGSSLROOTCERT to a CA ' +
      'bundle to enable verification.'
  );
  return { rejectUnauthorized: false };
}

// Same shape as the config object passed to `new Pool(...)` in db.js, minus
// pool-only options (max/min/idleTimeoutMillis/...) — also valid as-is for
// `new Client(...)`.
function buildPgConfig() {
  return {
    connectionString: config.DATABASE_URL || undefined,
    host: config.DATABASE_URL ? undefined : config.PGHOST,
    user: config.DATABASE_URL ? undefined : config.PGUSER,
    password: config.DATABASE_URL ? undefined : config.PGPASSWORD,
    database: config.DATABASE_URL ? undefined : config.PGDATABASE,
    port: config.DATABASE_URL ? undefined : config.PGPORT,
    ssl: buildSsl(),
  };
}

module.exports = { buildPgConfig };
