// Playwright global setup for the login → garage → analysis smoke suite
// (T-6.5, audit W-38..W-41).
//
// Boots the real API (`node server/server.js`, T-6.5's own scratch DB —
// never the dev/integration-test one) against a scratch Postgres database
// it creates itself, mirroring `server/test/integration/setup.js`'s
// recreate-DB + apply-base-schema + let the server's own MIGRATE_ON_START
// migrations run dance (see that file's header for why the order matters).
// Then starts Vite with its `/api` proxy pointed at that API via
// `VITE_API_PROXY` (vite.config.js reads it — see that file's comment).
//
// `pg` and `bcrypt` are not react-spa devDependencies (this task's file
// ownership is scripts + `@playwright/test` only, GUIDE-6.md) — both are
// already hoisted to the workspace root `node_modules` (a symlink into the
// main checkout, not installed by this worktree — see server's/react-spa's
// own `dependencies`), which plain `require()` finds by walking up parent
// directories the normal Node module-resolution way, same as any other
// package this file (under react-spa/e2e/) doesn't directly depend on.
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const {
  REPO_ROOT,
  SERVER_DIR,
  API_PORT,
  WEB_PORT,
  E2E_DB,
  SEED_EMAIL,
  SEED_PASSWORD,
} = require('./env.cjs');

const { Client } = require('pg');
const bcrypt = require('bcrypt');

const PG = {
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
};

async function recreateDatabase() {
  const client = new Client({ ...PG, database: 'postgres' });
  await client.connect();
  try {
    // Terminate any lingering connections from an interrupted previous run
    // — DROP DATABASE fails while anything is still connected to it (same
    // reasoning as server/test/integration/setup.js's recreateDatabase).
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [E2E_DB]
    );
    await client.query(`DROP DATABASE IF EXISTS ${E2E_DB}`);
    await client.query(`CREATE DATABASE ${E2E_DB}`);
  } finally {
    await client.end();
  }
}

function applyBaseSchema() {
  const sql = fs.readFileSync(
    path.join(SERVER_DIR, 'test/fixtures/base-schema.sql'),
    'utf8'
  );
  return withClient(E2E_DB, (client) => client.query(sql));
}

async function withClient(database, fn) {
  const client = new Client({ ...PG, database });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

// Seeds a verified user directly with SQL (bcrypt hash, same approach as
// server/test/integration/helpers.js's createUser) — runs AFTER the API has
// come up (see waitForHealth below), i.e. after the server's own
// MIGRATE_ON_START migrations have already run, so every column the
// migrations add exists by the time this INSERTs.
async function seedUser() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  await withClient(E2E_DB, (client) =>
    client.query(
      `INSERT INTO users (email, password_hash, name, email_verified, is_admin, created_at)
       VALUES ($1, $2, $3, true, false, NOW())
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash, email_verified = true`,
      [SEED_EMAIL, passwordHash, 'E2E Smoke User']
    )
  );
  // A fresh user gets the full-screen OnboardingModal, which covers the
  // sidebar — the smoke test is about navigation, not onboarding, so mark
  // onboarding as done.
  await withClient(E2E_DB, (client) =>
    client.query(
      `INSERT INTO user_profiles (user_id, onboarding_completed)
       SELECT id, true FROM users WHERE email = $1
       ON CONFLICT (user_id) DO UPDATE SET onboarding_completed = true`,
      [SEED_EMAIL]
    )
  );
}

function waitForHealth(url, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on('error', retry);
      function retry() {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
        } else {
          setTimeout(attempt, 300);
        }
      }
    };
    attempt();
  });
}

let apiProcess;
let webProcess;

function killSpawned() {
  if (webProcess && !webProcess.killed) webProcess.kill();
  if (apiProcess && !apiProcess.killed) apiProcess.kill();
}

async function globalSetup() {
  try {
    return await doGlobalSetup();
  } catch (err) {
    // A failure partway through (e.g. Vite's health check times out after
    // the API already came up) must not leave an orphaned api/vite process
    // behind — Playwright only calls the teardown this function returns
    // when setup itself *succeeds*, so a thrown error needs its own cleanup.
    killSpawned();
    throw err;
  }
}

async function doGlobalSetup() {
  await recreateDatabase();
  await applyBaseSchema();

  const apiEnv = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(API_PORT),
    PGHOST: PG.host,
    PGPORT: String(PG.port),
    PGUSER: PG.user,
    PGPASSWORD: PG.password,
    PGDATABASE: E2E_DB,
    PGSSLMODE: 'disable',
    DATABASE_URL: '',
    MIGRATE_ON_START: 'true',
    LOG_LEVEL: 'silent',
    JWT_SECRET: 'e2e-smoke-test-jwt-secret-at-least-32-chars-long',
    STRAVA_CLIENT_ID: 'e2e-test-strava-client-id',
    STRAVA_CLIENT_SECRET: 'e2e-test-strava-client-secret',
    OPENAI_API_KEY: 'e2e-test-openai-key',
    BREVO_API_KEY: 'e2e-test-brevo-key',
  };

  apiProcess = spawn(process.execPath, ['server.js'], {
    cwd: SERVER_DIR,
    env: apiEnv,
    stdio: 'inherit',
  });
  apiProcess.on('error', (err) => {
    console.error('[e2e] API process failed to start:', err);
  });

  await waitForHealth(`http://localhost:${API_PORT}/healthz`, 30000);
  await seedUser();

  // Resolved directly (not spawned through `npx vite`) — `npx` spawns
  // *its own* child process for the actual `vite` binary, so killing the
  // `npx` process in teardown() below would leave that real Vite server
  // running as an orphan. Resolving vite's own bin script (hoisted to the
  // workspace root node_modules — this is an npm workspace, it's not
  // duplicated under react-spa/node_modules) and spawning it directly with
  // `node` means `webProcess` IS the Vite server, so killing it actually
  // stops it.
  // `require.resolve('vite/bin/vite.js', ...)` fails — vite's package.json
  // `exports` map doesn't expose that deep subpath — so resolve the
  // package root instead and join the well-known bin path onto it.
  const vitePkg = require.resolve('vite/package.json', { paths: [REPO_ROOT] });
  const viteBin = path.join(path.dirname(vitePkg), 'bin', 'vite.js');
  webProcess = spawn(
    process.execPath,
    [viteBin, '--port', String(WEB_PORT), '--strictPort'],
    {
      cwd: path.join(REPO_ROOT, 'react-spa'),
      env: {
        ...process.env,
        VITE_API_PROXY: `http://localhost:${API_PORT}`,
      },
      stdio: 'inherit',
    }
  );
  webProcess.on('error', (err) => {
    console.error('[e2e] Vite process failed to start:', err);
  });

  await waitForHealth(`http://localhost:${WEB_PORT}/`, 30000);

  // Playwright's teardown-via-return-value convention (supported since
  // 1.24): global-teardown.js isn't a separate config option here, this
  // is simpler than round-tripping PIDs through a temp file.
  return async function globalTeardown() {
    killSpawned();
  };
}

module.exports = globalSetup;
