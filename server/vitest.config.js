// Two suites share this one config file (T-1.7, docs/audit/00-AUDIT-AND-
// PLAN.md):
//   - unit (default): fast, DB-free — `npm test` / `npm run test:all`.
//   - integration: needs a running Postgres — `npm run test:integration`,
//     gated by the INTEGRATION=1 env var so `npm test` never accidentally
//     tries to open a DB connection nobody asked for.
// Both read the same `test/setup-env.js` (dummy env vars so requiring
// ../config never fails validation); the integration test files
// additionally `require('./setup')` themselves for the DB bootstrap — see
// test/integration/setup.js.
const isIntegration = process.env.INTEGRATION === '1';

module.exports = {
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup-env.js'],
    include: isIntegration
      ? ['test/integration/**/*.test.js']
      : ['test/**/*.test.js'],
    exclude: isIntegration ? [] : ['test/integration/**'],
    // Integration tests share one real database across a whole run
    // (test/integration/setup.js's DROP/CREATE DATABASE + migrate happens
    // once) — running files in parallel workers would race that setup and
    // each other's rows, so force them onto a single thread.
    ...(isIntegration ? { fileParallelism: false } : {}),
    // Migrations + a handful of sequential HTTP round-trips per test can be
    // slower than the unit-test default under CI/local Postgres.
    testTimeout: isIntegration ? 20000 : 5000,
  },
};
