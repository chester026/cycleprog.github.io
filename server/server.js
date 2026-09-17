// BikeLab API — application bootstrap (T-4.1, docs/audit/00-AUDIT-AND-PLAN.md).
//
// This file only wires things together: env → express app → global
// middleware → static assets → domain routers → SPA fallback → error
// handling → process lifecycle. Every HTTP route lives in routes/<domain>.js;
// business logic in services/<domain>.js; SQL in repositories/<domain>.js.
// Nothing in here should grow a route handler again.

// Single source of truth for env: parses + validates the environment with
// zod, exits the process on a bad/missing value, and loads .env itself — see
// config/index.js. It must be required before anything else reads the
// environment (fail-fast-at-boot).
const config = require('./config');

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');

const logger = require('./lib/logger');
const Sentry = require('./lib/sentry');
const { pool } = require('./db');
const { runMigrations } = require('./migrate');
const { patchAsyncRoutes } = require('./lib/asyncRoutes');
const { apiLimiter } = require('./middleware/rateLimits');
const errorHandler = require('./middleware/errorHandler');
const { seedAchievements } = require('./achievements');
const { cleanupOldCache } = require('./aiAnalysis');

const app = express();
// Behind Render's (or any) reverse proxy — needed for correct req.ip / X-Forwarded-* handling.
app.set('trust proxy', 1);
// Any `async (req, res) => {...}` handler registered directly on `app`
// forwards a rejected promise to the error handler (routers do the same via
// patchAsyncRoutes in each routes/*.js).
patchAsyncRoutes(app);

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------
app.use(require('./middleware/requestLogger'));

// CSP is off here because this same server also serves the SPA build and
// static privacy/legal HTML pages, which would need a bespoke policy to not
// break under a default CSP.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

app.use(cors({
  origin: (origin, cb) => {
    const allowed = [config.FRONTEND_URL, 'https://bikelab.app', 'https://www.bikelab.app', 'http://localhost:5173', 'http://localhost:8080'].filter(Boolean);
    cb(null, !origin || allowed.includes(origin));
  },
  credentials: true,
}));

app.use(express.json());

// Global rate limit for the API surface. Tighter per-route limiters
// (auth brute force, AI cost) are applied inside the routers — see
// middleware/rateLimits.js.
app.use('/api', apiLimiter);

// index.html and hashed assets must never be served from a stale HTTP cache.
app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/index.html' ||
      (req.path.startsWith('/assets/') && req.path.match(/[a-zA-Z0-9]{8,}\.(js|css)$/))) {
    res.setHeader('Cache-Control', 'no-cache');
  }
  next();
});

// ---------------------------------------------------------------------------
// Browser-facing (non-/api) pages: OAuth callbacks, Universal Links, static
// ---------------------------------------------------------------------------
// Apple Universal Links, the Strava OAuth login callback (/exchange_token),
// the Oura OAuth callback (/oura/exchange_token) and the Strava "link"
// callback page (/link_strava) — they render HTML or redirect rather than
// returning JSON.
app.use('/', require('./routes/oauthCallbacks'));

app.use(express.static('public'));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'public/privacy.html')));
app.use(express.static(path.join(__dirname, '../react-spa/public')));
app.use('/img/garage', express.static(path.join(__dirname, '../react-spa/src/assets/img/garage')));
app.use('/img/hero', express.static(path.join(__dirname, '../react-spa/src/assets/img/hero')));

// SPA build with explicit MIME types.
app.use(express.static(path.join(__dirname, '../react-spa/dist'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html');
    }
  },
}));

// ---------------------------------------------------------------------------
// API routers — one per domain. Order matters only where two routers are
// mounted on the same prefix (/api): Express tries them in registration
// order, and none of them define overlapping paths.
// ---------------------------------------------------------------------------
// Auth: register/login/verify/resend, Strava start/link-start/exchange, unlink.
app.use('/api', require('./routes/auth'));
// AI coach (SSE chat + conversations).
app.use('/api/coach', require('./routes/coach'));
// Strava activities: list/detail/streams/ftp-analysis/cache-clear/ai-analysis/
// meta-goals-progress; POST /api/ai-analysis.
app.use('/api/activities', require('./routes/activities'));
app.use('/api', require('./routes/aiAnalysis'));
// Manual rides.
app.use('/api/rides', require('./routes/rides'));
// Coach-managed calendar (CALENDAR_SPEC.md §2) — distinct from /api/rides.
app.use('/api/calendar', require('./routes/calendar'));
// Garage/hero images, Strava image proxy, ImageKit config.
app.use('/api', require('./routes/media'));
// Admin: Strava diagnostics/limits + user management (/api/admin/*, /api/strava/limits*).
app.use('/api', require('./routes/admin'));
// Analytics: 4-week summary, FTP, per-activity analysis.
app.use('/api/analytics', require('./routes/analytics'));
// Bikes: garage health, component labels/resets, onboarding.
app.use('/api/bikes', require('./routes/bikes'));
app.use('/api/checklist', require('./routes/checklist'));
// Personal goals + meta goals (progress via goalCalculator / @bikelab/shared/calc).
app.use('/api/goals', require('./routes/goals'));
app.use('/api/meta-goals', require('./routes/metaGoals'));
app.use('/api/account', require('./routes/account'));
// Weather proxy (Open-Meteo).
app.use('/api/weather', require('./routes/weather'));
// Training plan / training types.
app.use('/api', require('./routes/training'));
app.use('/api/user-profile', require('./routes/userProfile'));
app.use('/api/events', require('./routes/events'));
// Skills: GET /api/skills computes + snapshots server-side (T-3.3);
// /api/skills-history is the admin-only manual fallback.
app.use('/api/skills-history', require('./routes/skillsHistory')(pool));
app.use('/api/skills', require('./routes/skills'));
// Oura — health-data source only; never issues a session JWT.
app.use('/api/oura', require('./routes/oura')(pool));
// Analytics snapshots (admin-only fallback) + achievements.
app.use('/api/analytics-snapshot', require('./routes/analyticsSnapshot'));
app.use('/api/achievements', require('./routes/achievements'));

app.get('/healthz', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
});

// SPA fallback — everything else gets index.html.
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found', code: 'API_ENDPOINT_NOT_FOUND' });
  }
  // /link_strava is handled by routes/oauthCallbacks.js above; reaching this
  // means the callback fell through.
  if (req.path === '/link_strava') {
    return res.status(404).send('Strava callback not properly handled');
  }
  if (req.path.includes('.') && !req.path.endsWith('.html')) {
    return res.status(404).send('File not found');
  }
  res.sendFile(path.join(__dirname, '../react-spa/dist/index.html'));
});

// Must be registered after all routes but before our own error handler, so
// Sentry captures the error and still forwards it to errorHandler.js.
Sentry.setupExpressErrorHandler(app);
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Process lifecycle
// ---------------------------------------------------------------------------
process.on('unhandledRejection', (r) => {
  Sentry.captureException(r);
  logger.error({ err: r }, 'unhandledRejection');
});
process.on('uncaughtException', (e) => {
  Sentry.captureException(e);
  logger.error({ err: e }, 'uncaughtException');
  process.exit(1);
});

// Periodic AI-analysis cache cleanup (every 24h).
setInterval(async () => {
  try {
    await cleanupOldCache(pool);
  } catch (error) {
    logger.error({ err: error }, 'AI analysis cache cleanup failed:');
  }
}, 24 * 60 * 60 * 1000).unref();

// `server` is set inside main() once app.listen() actually runs — declared
// here (module scope) so shutdown()'s SIGTERM/SIGINT handlers, registered
// unconditionally below, can still reach it.
let server;

function shutdown(signal) {
  logger.debug(`${signal} received, shutting down...`);
  if (!server) {
    // Signal arrived before app.listen() (e.g. still running migrations) —
    // nothing to close yet, just tear down the pool and exit.
    pool.end().then(() => process.exit(0));
    return;
  }
  server.close(() => {
    pool.end().then(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Startup order (T-1.4, S-29): config is already loaded (top of file) → run
// pending schema migrations → seed achievement definitions + prune stale AI
// cache (data, not schema) → app.listen.
async function main() {
  if (config.MIGRATE_ON_START) {
    await runMigrations();
  }
  await seedAchievements(pool);
  cleanupOldCache(pool).catch(() => {});
  server = app.listen(config.PORT, () => logger.debug(`Server running at http://localhost:${config.PORT}`));
}

// Only boot (migrate → seed → listen) when this file is run directly (`node
// server.js`), not when it's `require()`'d — e.g. by integration tests
// (test/integration/setup.js), which need `app` wired up without opening a
// listening socket or racing migrations against their own DB setup (T-1.7).
if (require.main === module) {
  main().catch((err) => {
    logger.error({ err }, '❌ Startup failed:');
    process.exit(1);
  });
}

module.exports = { app, main };
