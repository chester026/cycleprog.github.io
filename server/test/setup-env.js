// Runs before every test file (see vitest.config.js `setupFiles`) so that
// requiring `../config` (directly, or transitively via ../db,
// ../middleware/auth, etc.) never fails config validation just because a
// test doesn't care about Strava/OpenAI/Postgres. Individual test files can
// still override any of these (e.g. auth.middleware.test.js sets its own
// JWT_SECRET) — module-level `process.env.X = ...` in a test file runs after
// this file, since Vitest loads setupFiles first.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-at-least-32-characters-long';
process.env.STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID || 'test-strava-client-id';
process.env.STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET || 'test-strava-client-secret';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';
process.env.PGHOST = process.env.PGHOST || 'localhost';
