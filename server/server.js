// Single source of truth for env: parses + validates the environment with
// zod, exits the process on a bad/missing value, and loads .env itself — see
// config/index.js. Requiring it first (before anything else reads the
// environment) preserves the previous fail-fast-at-boot behaviour of the
// checkRequiredEnv() IIFE this replaces.
const config = require('./config');

const express = require('express');
const axios = require('./lib/http').externalHttp;
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const escapeHtml = require('escape-html');
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const app = express();
// Behind Render's (or any) reverse proxy — needed for correct req.ip / X-Forwarded-* handling.
app.set('trust proxy', 1);
const logger = require('./lib/logger');
const Sentry = require('./lib/sentry');
app.use(require('./middleware/requestLogger'));
// Wrap route registration so any `async (req, res) => {...}` handler passed to
// app.get/post/put/delete/patch automatically forwards rejected promises to
// Express's error handler, instead of them becoming unhandled rejections.
for (const m of ['get', 'post', 'put', 'delete', 'patch']) {
  const orig = app[m].bind(app);
  app[m] = (routePath, ...handlers) => orig(routePath, ...handlers.map((h) => (typeof h === 'function' && h.constructor.name === 'AsyncFunction') ? asyncHandler(h) : h));
}

const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;

// CSP is off here because this same server also serves the SPA build and
// static privacy/legal HTML pages, which would need a bespoke policy to not
// break under a default CSP.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

app.use(cors({
  origin: (origin, cb) => {
    const allowed = [config.FRONTEND_URL, 'https://bikelab.app', 'https://www.bikelab.app', 'http://localhost:5173', 'http://localhost:8080'].filter(Boolean);
    cb(null, !origin || allowed.includes(origin));
  },
  credentials: true
}));

app.use(express.json());
const PORT = config.PORT;

// Global rate limit for the API surface, plus tighter limits on the
// auth endpoints (brute force) and the AI endpoints (cost/abuse). All three
// respond with the same unified error body on a 429 — express-rate-limit
// sends `message` as-is as the JSON body, so it's set here rather than going
// through errorHandler.
const RATE_LIMIT_MESSAGE = { error: 'Too many requests', code: 'RATE_LIMITED' };
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false, message: RATE_LIMIT_MESSAGE });
app.use('/api', apiLimiter);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: RATE_LIMIT_MESSAGE });
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
  keyGenerator: (req) => (req.user?.userId ? String(req.user.userId) : ipKeyGenerator(req.ip)),
});

// Middleware для предотвращения кеширования только файлов с хешами
app.use((req, res, next) => {
  // Отключаем кеширование для index.html и файлов с хешами
  if (req.path === '/' || req.path === '/index.html' || 
      (req.path.startsWith('/assets/') && req.path.match(/[a-zA-Z0-9]{8,}\.(js|css)$/))) {
    res.setHeader('Cache-Control', 'no-cache');
  }
  next();
});

// STRAVA_CLIENT_SECRET is no longer read here directly — it only ever goes
// into a Strava OAuth token-endpoint request body, and those now live
// exclusively in services/strava/tokens.js and services/strava/oauth.js.
const CLIENT_ID = config.STRAVA_CLIENT_ID;
// Устаревшие файлы удалены - теперь используется многопользовательская архитектура
// const RIDES_FILE = path.join(__dirname, '../public/rides.json');
// const TOKENS_FILE = path.join(__dirname, 'strava_tokens.json');
// const PLANNED_RIDES_FILE = path.join(__dirname, '../public/manual_rides.json');
const GARAGE_DIR = path.join(__dirname, '../react-spa/src/assets/img/garage');
const HERO_DIR = path.join(__dirname, '../react-spa/src/assets/img/hero');
const { analyzeTraining, cleanupOldCache, getCacheStats } = require('./aiAnalysis');
const {
  seedAchievements,
  evaluateAchievements,
  getUserAchievements,
  getAllAchievements,
} = require('./achievements');
const { generateGoalsWithAI, calculateRecentStats, analyzePerformanceTrends, identifyStrengthsAndWeaknesses } = require('./aiGoals');
const createCoachModule = require('./aiCoach');
const ouraService = require('./ouraService');
const goalCalculator = require('./goalCalculator');
const { 
  uploadToImageKit, 
  deleteFromImageKit, 
  getImageUrl, 
  FOLDERS,
  getImageKitConfig,
  saveImageMetadata,
  getUserImages,
  deleteImageMetadata
} = require('./imagekit-config');
const { generateVerificationToken, sendVerificationEmail, sendPasswordResetEmail } = require('./brevo-config');
const { 
  getUserProfile, 
  updateUserProfile, 
  generatePersonalizedPlan, 
  getGoalSpecificRecommendations, 
  getTrainingTypeDetails, 
  getAllTrainingTypes, 
  getPlanExecutionStats,
  getCustomTrainingPlan,
  saveCustomTrainingPlan,
  deleteCustomTraining,
  completeOnboarding
} = require('./recommendations');

// ImageKit configuration loaded successfully

const bcrypt = require('bcrypt');

// Pool creation (with the DATE-parser fix and the pool error listener) now
// lives in ./db.js so middleware/auth.js can share the same pool without
// requiring the whole of server.js.
const { pool, withTransaction } = require('./db');
const { runMigrations } = require('./migrate');

// Strava — T-1.2/T-1.3 (docs/audit/00-AUDIT-AND-PLAN.md). One token/refresh
// helper, one rate-limited/queued HTTP client, one Postgres-backed activities
// store — replaces the 11 copies of the refresh block and the 4+3 copies of
// the activities pagination loop that used to live directly in this file.
const stravaTokens = require('./services/strava/tokens');
const stravaClient = require('./services/strava/client');
const stravaOAuth = require('./services/strava/oauth');
const stravaActivities = require('./services/strava/activities');
const { activitiesCache, bikesCache } = stravaActivities;

const { issueSessionToken, verifyPurposeToken } = require('./lib/jwt');
const { authMiddleware, requireAdmin } = require('./middleware/auth');
const {
  buildStravaAuthorizeUrl,
  createState,
  consumeState,
  createAuthCode,
  consumeAuthCode,
} = require('./lib/oauthState');

// Base URL Strava redirects back to (this server), as opposed to
// FRONTEND_URL which is where the SPA/marketing site lives. Same host in
// most deployments today (this server also serves the SPA build — see the
// express.static() calls below), but kept distinct so a future split
// frontend/backend deploy doesn't silently break the OAuth redirect_uri.
const BACKEND_BASE = config.BACKEND_BASE;

// Schema DDL that used to live in this IIFE (CREATE TABLE/ALTER TABLE for
// oauth_states, auth_codes, bike_component_resets, bike_component_labels,
// meta_goals/goals columns, analytics_snapshots, achievements/
// user_achievements, coach_conversations/coach_messages, synced_activities/
// synced_bikes, calendar_events (+ backfill from rides), users columns
// (strava_athlete_id/is_admin/oura_*), oura_daily_data, and the
// CREATE INDEX block) has moved to migrations/1758000000001_startup-iife.sql,
// applied once via `npm run migrate` / runMigrations() in main() below
// instead of on every process boot — T-1.4, docs/audit/00-AUDIT-AND-PLAN.md,
// S-29. seedAchievements() (data, not schema — upserts via ON CONFLICT) and
// the stale-AI-cache cleanup that used to run at the end of this IIFE are
// still called at startup, from main(), after migrations have run.

// Apple Universal Links - раздаём apple-app-site-association с правильными заголовками
app.get('/.well-known/apple-app-site-association', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(path.join(__dirname, 'public/.well-known/apple-app-site-association'));
});

// Также поддержка без .well-known (старые версии iOS)
app.get('/apple-app-site-association', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(path.join(__dirname, 'public/.well-known/apple-app-site-association'));
});

app.use(express.static('public'));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'public/privacy.html')));
app.use(express.static(path.join(__dirname, '../react-spa/public')));
app.use('/img/garage', express.static(path.join(__dirname, '../react-spa/src/assets/img/garage')));
app.use('/img/hero', express.static(path.join(__dirname, '../react-spa/src/assets/img/hero')));

// Раздача статики фронта с правильными MIME типами
app.use(express.static(path.join(__dirname, '../react-spa/dist'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (path.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html');
    }
  }
}));

// Устаревшие функции удалены - теперь используется многопользовательская архитектура
// function loadTokens() { ... }
// function saveTokens() { ... }
// loadTokens();

// Public, rate-limited: mints a fresh one-time `state` and returns the
// Strava authorize URL for the LOGIN flow. Both web and mobile call this
// instead of building the authorize URL themselves (see
// docs/audit/layers/03-react-spa.md W-28 — previously 5 web + 2 mobile call
// sites each picked their own scope/redirect).
app.get('/api/auth/strava/start', authLimiter, async (req, res) => {
  const client = req.query.client === 'mobile' ? 'mobile' : 'web';
  try {
    const state = await createState(pool, { purpose: 'login', client });
    const url = buildStravaAuthorizeUrl({
      clientId: CLIENT_ID,
      redirectUri: `${BACKEND_BASE}/exchange_token`,
      state,
    });
    res.json({ url });
  } catch (e) {
    logger.error({ err: e.message }, '❌ /api/auth/strava/start error:');
    res.status(500).json({ error: 'Failed to start Strava login', code: 'INTERNAL' });
  }
});

// Auth-required: mints a fresh one-time `state` (carrying this user's id)
// and returns the Strava authorize URL for the LINK flow — attaching Strava
// to an already-logged-in account without creating/switching to a
// different account (see docs/audit/layers/02-bikelabapp.md A-01).
app.get('/api/auth/strava/link-start', authMiddleware, async (req, res) => {
  const client = req.query.client === 'mobile' ? 'mobile' : 'web';
  try {
    const state = await createState(pool, { purpose: 'link', userId: req.userId, client });
    const url = buildStravaAuthorizeUrl({
      clientId: CLIENT_ID,
      redirectUri: `${BACKEND_BASE}/link_strava`,
      state,
    });
    res.json({ url });
  } catch (e) {
    logger.error({ err: e.message }, '❌ /api/auth/strava/link-start error:');
    res.status(500).json({ error: 'Failed to start Strava link', code: 'INTERNAL' });
  }
});

// Public, rate-limited: exchanges the short-lived one-time auth code (minted
// by /exchange_token or /link_strava after a successful Strava round-trip)
// for the real session JWT. This is a POST with the code in the body —
// never a URL — specifically so the session JWT never has to travel through
// a redirect URL, browser history, Referer header or access log again (see
// docs/audit/layers/01-server.md S-07).
app.post('/api/auth/exchange', authLimiter, async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Missing code', code: 'BAD_REQUEST' });
  const userId = await consumeAuthCode(pool, code);
  if (!userId) return res.status(400).json({ error: 'Invalid or expired code', code: 'BAD_REQUEST' });
  const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  const user = userResult.rows[0];
  if (!user) return res.status(400).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
  const jwtToken = issueSessionToken(user);
  res.json({ token: jwtToken, user: { id: user.id, name: user.name, avatar: user.avatar, email: user.email } });
});

app.get('/exchange_token', async (req, res, next) => {
  const { code, state } = req.query;
  logger.debug('📥 /exchange_token called with code:', code ? 'YES' : 'NO');

  if (!code) {
    // Если нет code — это не Strava, а SPA, передаём дальше
    logger.debug('⚠️ No code, passing to next handler');
    return next();
  }

  // `state` is required from here on: it's what proves this code exchange
  // was actually initiated by us (via /api/auth/strava/start) rather than an
  // attacker's crafted authorize link (login-CSRF — see
  // docs/audit/layers/01-server.md S-07). It also tells us which client
  // (web/mobile) to redirect back to.
  const stateRow = state ? await consumeState(pool, state) : null;
  if (!stateRow || stateRow.purpose !== 'login') {
    return res.status(400).send(`
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Error</title></head>
<body style="font-family: sans-serif; padding: 2rem; background: #0a0a0a; color: #fff;">
  <h1>Authorization Failed</h1>
  <p>This login link is invalid or has expired. Please go back to the app and try again.</p>
</body>
</html>
    `);
  }
  const client = stateRow.client;

  try {
    // 1. Получаем access_token через Strava OAuth
    const tokenData = await stravaOAuth.exchangeCode(code);
    const access_token = tokenData.access_token;
    const refresh_token = tokenData.refresh_token;
    const expires_at = tokenData.expires_at;

    // 2. Получаем профиль пользователя Strava
    const athlete = await stravaOAuth.getAthlete(access_token);
    const strava_id = athlete.id;
    const email = athlete.email || null;
    const name = athlete.firstname + (athlete.lastname ? ' ' + athlete.lastname : '');
    const avatar = athlete.profile || null;

    // 3. Находим или создаём пользователя в базе
    let user;
    const userResult = await pool.query('SELECT * FROM users WHERE strava_id = $1', [strava_id]);
    if (userResult.rows.length > 0) {
      // Обновляем токены и профиль
      user = userResult.rows[0];
      await pool.query(
        'UPDATE users SET strava_access_token = $1, strava_refresh_token = $2, strava_expires_at = $3, name = $4, email = COALESCE($5, email), avatar = $6, strava_athlete_id = COALESCE(strava_athlete_id, strava_id) WHERE id = $7',
        [access_token, refresh_token, expires_at, name, email, avatar, user.id]
      );
    } else {
      // Не нашли по strava_id — это может значить, что аккаунт раньше был
      // привязан к Strava, но отвязан через /api/unlink_strava (который
      // обнуляет strava_id). Раньше в этом случае создавался НОВЫЙ
      // пользователь, из-за чего все цели/чаты/календарь оставались висеть
      // на старом id, а юзер видел пустое приложение.
      // Email и имя ненадёжны как ключ для воссоединения: Strava часто не
      // отдаёт email (NULL), а имя вообще не уникально — среди наших же
      // тестовых аккаунтов несколько строк с одинаковым "Dmitriy Krikunov".
      // Настоящий постоянный идентификатор — strava_athlete_id: копия
      // strava_id, которая НИКОГДА не обнуляется (в отличие от strava_id,
      // который /api/unlink_strava чистит специально, чтобы в UI корректно
      // показывалось "отключено"). Ищем по нему.
      const byAthleteId = await pool.query(
        'SELECT * FROM users WHERE strava_athlete_id = $1',
        [strava_id]
      );

      if (byAthleteId.rows.length > 0) {
        const reunited = byAthleteId.rows[0];
        await pool.query(
          'UPDATE users SET strava_id = $1, strava_access_token = $2, strava_refresh_token = $3, strava_expires_at = $4, name = $5, avatar = $6 WHERE id = $7',
          [strava_id, access_token, refresh_token, expires_at, name, avatar, reunited.id]
        );
        const refreshed = await pool.query('SELECT * FROM users WHERE id = $1', [reunited.id]);
        user = refreshed.rows[0];
      } else {
        // Действительно новый пользователь — создаём и сразу фиксируем
        // постоянный идентификатор.
        const insertResult = await pool.query(
          'INSERT INTO users (strava_id, strava_athlete_id, strava_access_token, strava_refresh_token, strava_expires_at, name, email, avatar) VALUES ($1, $1, $2, $3, $4, $5, $6, $7) RETURNING *',
          [strava_id, access_token, refresh_token, expires_at, name, email, avatar]
        );
        user = insertResult.rows[0];
      }
    }

    // 4. Вместо выдачи JWT прямо здесь — одноразовый короткоживущий (60s)
    // auth code. Сессионный JWT никогда не попадает в redirect URL (см.
    // docs/audit/layers/01-server.md S-07): клиент обменяет этот code на
    // JWT через POST /api/auth/exchange.
    const authCode = await createAuthCode(pool, user.id);

    if (client === 'mobile') {
      const deepLink = `bikelab://auth?code=${encodeURIComponent(authCode)}`;
      logger.debug('📱 Mobile login — redirecting to deep link');
      return res.redirect(deepLink);
    } else {
      const redirectUrl = `${config.FRONTEND_URL}/exchange_token?code=${encodeURIComponent(authCode)}`;
      logger.debug('🌐 Web login — redirecting to SPA:', redirectUrl);
      return res.redirect(redirectUrl);
    }
  } catch (err) {
    logger.error({ err: err.response?.data || err.message || err }, '❌ Exchange token error:');
    try {
      res.status(500).send(`
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Error</title></head>
<body style="font-family: sans-serif; padding: 2rem; background: #0a0a0a; color: #fff;">
  <h1>Authorization Failed</h1>
  <p>Something went wrong. Please try again.</p>
  <p style="color: #ff3b30; font-size: 12px;">${escapeHtml(err.message || 'Unknown error')}</p>
</body>
</html>
      `);
    } catch (sendErr) {
      logger.error({ err: sendErr }, '❌ Failed to send error response:');
    }
  }
});

// Oura OAuth callback — the ONLY place besides ouraService.js that talks
// to Oura's token endpoint directly. Unlike /exchange_token (Strava) this
// never creates a user or issues a new session JWT: the rider must already
// be logged in (via Strava) before tapping "Connect" in
// OuraIntegrationScreen, and `state` (minted by GET /api/oura/connect-state)
// is how we recover THEIR userId across the redirect round-trip.
app.get('/oura/exchange_token', async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    return res.status(400).send(`<h1>Oura authorization failed</h1><p>${escapeHtml(oauthError)}</p>`);
  }
  if (!code || !state) {
    return res.status(400).send('Missing code or state');
  }

  let userId;
  try {
    const payload = verifyPurposeToken(state, 'oura_connect');
    userId = payload.userId;
  } catch (e) {
    return res.status(400).send('This Oura connection link expired or is invalid — go back to the app and tap "Connect Oura" again.');
  }

  try {
    const redirectUri = `${config.FRONTEND_URL}/oura/exchange_token`;
    const tokens = await ouraService.exchangeCodeForToken(code, redirectUri);
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAt = nowSec + (Number(tokens.expires_in) || 0);
    const personalInfo = await ouraService.fetchPersonalInfo(tokens.access_token);

    await pool.query(
      'UPDATE users SET oura_access_token = $1, oura_refresh_token = $2, oura_expires_at = $3, oura_user_id = $4 WHERE id = $5',
      [tokens.access_token, tokens.refresh_token, expiresAt, String(personalInfo.id || ''), userId]
    );

    // Warm the cache with the last two weeks right away so the coach and
    // OuraIntegrationScreen have data immediately, same idea as Strava's
    // first sync. Best-effort — a failure here shouldn't block the
    // "you're connected" page; /api/oura/sync covers manual retry.
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
      const fmt = (d) => d.toISOString().slice(0, 10);
      await ouraService.fetchAndCacheOuraData(pool, userId, { startDate: fmt(start), endDate: fmt(end) });
    } catch (e) {
      logger.error({ err: e.response?.data || e.message }, '[oura] initial sync after connect failed (non-fatal):');
    }

    res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Oura Connected</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #fff; text-align: center; padding: 2rem; }
    .logo { font-size: 64px; margin-bottom: 1rem; }
    h1 { font-size: 24px; margin-bottom: 1rem; }
    .button { display: inline-block; background: linear-gradient(135deg, #FF5E00, #FF8033); color: #fff; padding: 20px 60px; border-radius: 16px; text-decoration: none; font-size: 20px; font-weight: 700; margin: 2rem 0; box-shadow: 0 8px 24px rgba(255, 94, 0, 0.4); }
  </style>
</head>
<body>
  <div>
    <div class="logo">💍</div>
    <h1>✅ Oura Connected!</h1>
    <p style="color:#aaa;">Tap below to go back to BikeLab</p>
    <a href="bikelab://oura?connected=true" class="button">🚀 Open BikeLab App</a>
  </div>
</body>
</html>
    `);
  } catch (err) {
    logger.error({ err: err.response?.data || err.message || err }, '❌ Oura exchange_token error:');
    res.status(500).send('<h1>Something went wrong connecting Oura</h1><p>Please go back to the app and try again.</p>');
  }
});

// AI Coach — see aiCoach.js. calculateGoalProgress is a hoisted function
// declaration further down this file; referencing it here is safe because
// this object is only used once requests start coming in, long after the
// whole module has finished loading.
const coach = createCoachModule({
  pool,
  activitiesCache,
  bikesCache,
  calculateGoalProgress: (...args) => calculateGoalProgress(...args),
  // BIKE_COMPONENTS is declared further down this file (near the bike-health
  // route) — wrapped in a getter for the same reason calculateGoalProgress
  // is above: this object is built at module-load time, before that later
  // `const` exists, but the getter itself is only ever called once a real
  // request comes in, long after the whole file has finished loading.
  getBikeComponents: () => BIKE_COMPONENTS,
});

function stravaErrorResponse(res, err, fallbackMessage) {
  if (err instanceof stravaTokens.StravaNotLinkedError) {
    return res.status(401).json({ error: 'Strava token not found', code: 'STRAVA_NOT_LINKED' });
  }
  if (err instanceof stravaClient.StravaRateLimitError) {
    return res
      .status(429)
      .json({ error: 'Strava API rate limit reached. Try again later.', code: 'RATE_LIMITED', retryAfter: err.retryAfterSec || 900 });
  }
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
    logger.error({ err: err.message }, 'Strava API timeout:');
    return res.status(503).json({ error: 'Strava API timeout. Please try again later.', code: 'UPSTREAM_ERROR' });
  }
  logger.error(err.response?.data || err);
  if (err.response && err.response.data) {
    const status = err.response.status || 500;
    return res
      .status(status)
      .json({ error: err.response.data.message || err.response.data || fallbackMessage, code: 'UPSTREAM_ERROR' });
  }
  return res.status(500).json({ error: err.message || fallbackMessage, code: 'INTERNAL' });
}

// --- Новый эндпоинт: Strava activities только для текущего пользователя ---
app.get('/api/activities', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    let allActivities;
    try {
      allActivities = await stravaActivities.getActivities(userId);
    } catch (err) {
      if (err instanceof stravaTokens.StravaNotLinkedError) return res.json([]);
      throw err;
    }

    // Пересчитываем ачивки в фоне (не блокируем ответ)
    evaluateAchievements(pool, userId, allActivities).then(result => {
      if (result.newly_unlocked.length > 0) {
        logger.debug(`🏆 New achievements for user ${userId}:`, result.newly_unlocked.map(a => a.name).join(', '));
      }
    }).catch(err => logger.error({ err: err.message }, 'Achievement eval error:'));

    res.json(allActivities);
  } catch (err) {
    stravaErrorResponse(res, err, 'Failed to fetch activities');
  }
});

// Эндпоинт для получения детальной информации об активности
app.get('/api/activities/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const activity = await stravaActivities.getActivity(userId, id);
    res.json(activity);
  } catch (err) {
    if (err instanceof stravaTokens.StravaNotLinkedError) {
      return res.status(401).json({ error: 'Strava token not found', code: 'STRAVA_NOT_LINKED' });
    }
    logger.error({ err: err.response?.data || err.message }, 'Error fetching activity details:');
    if (err.response?.status === 404) {
      res.status(404).json({ error: 'Activity not found', code: 'ACTIVITY_NOT_FOUND' });
    } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      res.status(503).json({ error: 'Strava API timeout', code: 'UPSTREAM_ERROR' });
    } else {
      res.status(500).json({ error: 'Failed to fetch activity details', code: 'INTERNAL' });
    }
  }
});

// Новый эндпоинт для получения streams (временных рядов) по id активности
app.get('/api/activities/:id/streams', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const streams = await stravaActivities.getStreams(userId, id);
    res.json(streams);
  } catch (err) {
    if (err instanceof stravaTokens.StravaNotLinkedError) {
      return res.status(401).json({ error: 'Strava token not found', code: 'STRAVA_NOT_LINKED' });
    }
    logger.error(err.response?.data || err);
    if (err.response && err.response.data) {
      const status = err.response.status || 500;
      res.status(status).json({ error: err.response.data.message || err.response.data || 'Failed to fetch streams', code: 'UPSTREAM_ERROR' });
    } else {
      res.status(500).json({ error: err.message || 'Failed to fetch streams', code: 'INTERNAL' });
    }
  }
});

// 🧹 Сброс кэша активностей (для обновления после изменений фильтров)
app.post('/api/activities/cache/clear', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    stravaActivities.invalidate(userId);
    res.json({
      success: true,
      message: 'Activities cache cleared. Reload the page to fetch fresh data including VirtualRide activities.'
    });
  } catch (err) {
    logger.error({ err }, 'Error clearing cache:');
    res.status(500).json({ error: err.message, code: 'INTERNAL' });
  }
});



// Get all rides for current user
app.get('/api/rides', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const result = await pool.query('SELECT * FROM rides WHERE user_id = $1 ORDER BY start DESC', [userId]);
  res.json(result.rows);
});

// Add a ride for current user
app.post('/api/rides', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const { title, location, locationLink, details, start } = req.body;
  const result = await pool.query(
    'INSERT INTO rides (user_id, title, location, location_link, details, start) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [userId, title, location, locationLink, details, start]
  );
  
  // Автоматически обновляем цели после добавления поездки
  await updateUserGoals(userId, req.headers.authorization);
  
  res.json(result.rows[0]);
});

// Update a ride
app.put('/api/rides/:id', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const { title, location, locationLink, details, start } = req.body;
  const result = await pool.query(
    'UPDATE rides SET title=$1, location=$2, location_link=$3, details=$4, start=$5 WHERE id=$6 AND user_id=$7 RETURNING *',
    [title, location, locationLink, details, start, id, userId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Ride not found', code: 'RIDE_NOT_FOUND' });
  res.json(result.rows[0]);
});

// Delete a ride
app.delete('/api/rides/:id', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const result = await pool.query(
    'DELETE FROM rides WHERE id=$1 AND user_id=$2 RETURNING *',
    [id, userId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Ride not found', code: 'RIDE_NOT_FOUND' });
  res.json({ success: true });
});

// (Optional) Import rides for current user
app.post('/api/rides/import', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
    const ridesToImport = req.body;
    if (!Array.isArray(ridesToImport)) {
    return res.status(400).json({ error: 'Expected array of rides', code: 'BAD_REQUEST' });
    }
  let imported = 0;
  for (const ride of ridesToImport) {
    await pool.query(
      'INSERT INTO rides (user_id, title, location, location_link, details, start) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, ride.title, ride.location, ride.locationLink, ride.details, ride.start]
    );
    imported++;
  }
  
  // Автоматически обновляем цели после импорта поездок
  await updateUserGoals(userId, req.headers.authorization);

  res.json({ success: true, imported });
});

// --- Calendar (CALENDAR_SPEC.md §2) -----------------------------------------
// Coach-managed calendar: planned rides, rest days, maintenance, purchases,
// races, notes. Separate from /api/rides above — see the calendar_events
// table comment in the startup migration for why the two coexist.

const CALENDAR_EVENT_TYPES = ['planned_ride', 'rest_day', 'maintenance', 'purchase', 'event', 'note'];

// All four handlers below are wrapped in try/catch — they weren't before,
// which meant any DB error (a genuinely transient one, or a migration that
// hadn't finished/landed yet, e.g. the goal_id column rollout) surfaced as
// an unhandled promise rejection. Node terminates the whole process on an
// unhandled rejection by default (since Node 15) rather than just failing
// that one request, which took the entire server down over what should
// have been a single 500 response.
app.get('/api/calendar', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const params = [userId];
    // LEFT JOIN meta_goals so the Calendar screen/detail modal can show
    // which goal (if any) a training session is working toward without a
    // second round trip per event.
    let sql = `SELECT ce.*, mg.title AS goal_title
               FROM calendar_events ce
               LEFT JOIN meta_goals mg ON mg.id = ce.goal_id
               WHERE ce.user_id = $1`;
    // GoalDetailsScreen's "Scheduled sessions" wants every event ever linked
    // to that goal (past + future) — a goal-scoped query is already a small,
    // bounded set, so skip the default date window entirely rather than
    // requiring the caller to guess a wide enough from/to range.
    if (req.query.goal_id) {
      params.push(req.query.goal_id);
      sql += ` AND ce.goal_id = $${params.length}`;
    } else {
      const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
      const to = req.query.to || new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0];
      params.push(from, to);
      sql += ` AND ce.start_date >= $${params.length - 1} AND ce.start_date <= $${params.length}`;
    }
    if (req.query.type) {
      params.push(req.query.type);
      sql += ` AND ce.type = $${params.length}`;
    }
    sql += ' ORDER BY ce.start_date ASC';
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    logger.error({ err: err.message }, '[calendar] GET failed:');
    res.status(500).json({ error: 'Failed to load calendar events', code: 'INTERNAL' });
  }
});

app.post('/api/calendar', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { type, title, description, location, location_link, start_date, end_date, all_day, start_time, end_time, goal_id } = req.body;
    if (!title || !start_date) {
      return res.status(400).json({ error: 'title and start_date are required', code: 'VALIDATION_ERROR' });
    }
    const eventType = CALENDAR_EVENT_TYPES.includes(type) ? type : 'planned_ride';
    const result = await pool.query(
      `INSERT INTO calendar_events
         (user_id, type, title, description, location, location_link, start_date, end_date, all_day, start_time, end_time, source, goal_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'user', $12)
       RETURNING *`,
      [
        userId, eventType, title, description || null, location || null, location_link || null,
        start_date, end_date || null, all_day !== undefined ? all_day : true, start_time || null, end_time || null,
        goal_id || null,
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err: err.message }, '[calendar] POST failed:');
    res.status(500).json({ error: 'Failed to create calendar event', code: 'INTERNAL' });
  }
});

app.put('/api/calendar/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const allowed = ['type', 'title', 'description', 'location', 'location_link', 'start_date', 'end_date', 'all_day', 'start_time', 'end_time', 'completed', 'apple_event_id', 'goal_id'];
    const sets = [];
    const values = [id, userId];
    let i = 3;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = $${i}`);
        values.push(req.body[key]);
        i++;
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update', code: 'BAD_REQUEST' });
    sets.push('updated_at = NOW()');
    const result = await pool.query(
      `UPDATE calendar_events SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err: err.message }, '[calendar] PUT failed:');
    res.status(500).json({ error: 'Failed to update calendar event', code: 'INTERNAL' });
  }
});

app.delete('/api/calendar/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM calendar_events WHERE id = $1 AND user_id = $2 RETURNING id, migrated_from_ride_id',
      [id, userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    // Events backfilled from the legacy `rides` table (migrated_from_ride_id
    // set) must also drop the source row — otherwise the startup migration's
    // `WHERE NOT EXISTS (... migrated_from_ride_id ...)` backfill guard sees
    // no calendar_events row referencing that ride on the next server restart
    // and silently recreates the "deleted" event from `rides`.
    const migratedRideId = result.rows[0].migrated_from_ride_id;
    if (migratedRideId) {
      try {
        await pool.query('DELETE FROM rides WHERE id = $1 AND user_id = $2', [migratedRideId, userId]);
      } catch (e) {
        logger.error({ err: e.message }, '[calendar] Failed to delete source rides row:');
      }
    }
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err.message }, '[calendar] DELETE failed:');
    res.status(500).json({ error: 'Failed to delete calendar event', code: 'INTERNAL' });
  }
});

// Multer configuration
if (!fs.existsSync(GARAGE_DIR)) fs.mkdirSync(GARAGE_DIR, { recursive: true });
if (!fs.existsSync(HERO_DIR)) fs.mkdirSync(HERO_DIR, { recursive: true });

// Multer configuration for ImageKit (memory storage) — only real images,
// capped well below the old 25MB so a bad/huge upload can't tie up a
// request or the ImageKit quota.
const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024 // 8MB limit
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only JPEG/PNG/WebP allowed'));
    }
    cb(null, true);
  }
});

const { isAllowedImageUrl } = require('./lib/imageProxy');

// Прокси для изображений Strava (решает CORS проблему). Intentionally kept
// unauthenticated (used as an <img src>), but hardened against SSRF: only
// https URLs on a small allowlist of known image hosts are fetched, with a
// timeout and a response-size cap.
app.get('/api/proxy/strava-image', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl || !isAllowedImageUrl(imageUrl)) {
      return res.status(400).json({ error: 'URL parameter is required', code: 'VALIDATION_ERROR' });
    }

    const response = await axios.get(imageUrl, {
      responseType: 'stream',
      timeout: 5000,
      maxContentLength: 5 * 1024 * 1024,
      maxRedirects: 2,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // Передаем только content-type от оригинального ответа
    res.setHeader('Content-Type', response.headers['content-type']);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    // Передаем поток данных
    response.data.pipe(res);
  } catch (error) {
    logger.error({ err: error.message }, 'Error proxying image:');
    res.status(500).json({ error: 'Failed to proxy image', code: 'INTERNAL' });
  }
});

// Получить соответствие позиций и файлов (обновлено для многопользовательской архитектуры)
app.get('/api/garage/positions', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const images = await getUserImages(pool, userId, 'garage');
    res.json(images.garage || {});
  } catch (error) {
    res.status(500).json({ error: 'Failed to load garage images', code: 'INTERNAL' });
  }
});

// Загрузить новое изображение с позицией (ImageKit) - обновлено для многопользовательской архитектуры
app.post('/api/garage/upload', authMiddleware, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Missing file parameter for upload', code: 'BAD_REQUEST' });
  const pos = req.body.pos;
  if (!['right','left-top','left-bottom'].includes(pos)) return res.status(400).json({ error: 'Некорректная позиция', code: 'VALIDATION_ERROR' });

  try {
    const userId = req.user.userId;

    // Получаем глобальную конфигурацию ImageKit
    const config = getImageKitConfig();
    if (!config) {
      return res.status(400).json({ error: 'ImageKit configuration not found', code: 'IMAGEKIT_CONFIG_MISSING' });
    }

    // Получаем текущие изображения пользователя
    const currentImages = await getUserImages(pool, userId, 'garage');
    const currentImage = currentImages.garage?.[pos];

    // Если на этой позиции уже есть файл — удалить старый файл из ImageKit
    if (currentImage && currentImage.fileId) {
      const deleteResult = await deleteFromImageKit(currentImage.fileId, config);
      if (!deleteResult.success) {
        logger.warn('Failed to delete old image:', deleteResult.error);
      }
    }

    // Загружаем файл в ImageKit — имя строится из userId/pos/timestamp и
    // расширения, выведенного из mimetype (никогда из req.file.originalname,
    // которое приходит от клиента и не должно попадать в путь файла).
    const ext = IMAGE_EXT_BY_MIME[req.file.mimetype] || 'jpg';
    const fileName = `${userId}_${pos}_${Date.now()}.${ext}`;
    const uploadResult = await uploadToImageKit(req.file, FOLDERS.GARAGE, fileName, config);
    
    if (!uploadResult.success) {
      return res.status(500).json({ error: uploadResult.error, code: 'INTERNAL' });
    }
    
    // Сохраняем метаданные в базу данных
    const saveResult = await saveImageMetadata(
      pool, 
      userId, 
      'garage', 
      pos, 
      uploadResult, 
      req.file
    );
    
    if (!saveResult.success) {
      return res.status(500).json({ error: 'Failed to save image metadata', code: 'INTERNAL' });
    }
    
    res.json({ 
      filename: uploadResult.name, 
      pos,
      url: uploadResult.url,
      fileId: uploadResult.fileId
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload image', code: 'INTERNAL' });
  }
});

// Получить hero изображения пользователя
app.get('/api/hero/images', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userImages = await getUserImages(pool, userId, 'hero');
    
    // Формируем объект с позициями
    const positions = ['garage', 'plan', 'trainings', 'checklist', 'nutrition'];
    const result = {};
    
    positions.forEach(pos => {
      // Проверяем, есть ли изображение для этой позиции
      if (userImages.hero && userImages.hero[pos]) {
        result[pos] = userImages.hero[pos];
      } else {
        result[pos] = null;
      }
    });
    
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error getting hero images:');
    res.status(500).json({ error: 'Failed to get hero images', code: 'INTERNAL' });
  }
});

// Загрузить новое hero изображение с позицией (ImageKit)
app.post('/api/hero/upload', authMiddleware, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided', code: 'BAD_REQUEST' });
    
    const userId = req.user.userId;
    const pos = req.body.pos;
    
    if (!['garage','plan','trainings','checklist','nutrition'].includes(pos)) {
      return res.status(400).json({ error: 'Invalid position', code: 'VALIDATION_ERROR' });
    }
    
    // Получаем глобальную конфигурацию ImageKit
    const config = getImageKitConfig();
    if (!config) {
      return res.status(400).json({ error: 'ImageKit configuration not found', code: 'IMAGEKIT_CONFIG_MISSING' });
    }
    
    // Удаляем старое изображение если есть
    await deleteImageMetadata(pool, userId, 'hero', pos);
    
    // Загружаем в ImageKit
    const heroExt = IMAGE_EXT_BY_MIME[req.file.mimetype] || 'jpg';
    const uploadResult = await uploadToImageKit(
      req.file,
      `hero/${userId}`,
      `${pos}_${Date.now()}.${heroExt}`,
      config
    );

    if (!uploadResult.success) {
      return res.status(500).json({ error: uploadResult.error, code: 'INTERNAL' });
    }

    // Сохраняем метаданные в базу данных
    await saveImageMetadata(
      pool,
      userId,
      'hero',
      pos,
      uploadResult,
      req.file
    );

    res.json({
      filename: uploadResult.name,
      pos,
      url: uploadResult.url,
      fileId: uploadResult.fileId
    });

  } catch (error) {
    logger.error({ err: error }, 'Error uploading hero image:');
    res.status(500).json({ error: 'Failed to upload hero image', code: 'INTERNAL' });
  }
});

// Назначить изображение во все hero позиции (ImageKit)
app.post('/api/hero/assign-all', authMiddleware, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided', code: 'BAD_REQUEST' });
    
    const userId = req.user.userId;
    const positions = ['garage', 'plan', 'trainings', 'checklist', 'nutrition'];
    
    // Получаем глобальную конфигурацию ImageKit
    const config = getImageKitConfig();
    if (!config) {
      return res.status(400).json({ error: 'ImageKit configuration not found', code: 'IMAGEKIT_CONFIG_MISSING' });
    }
    
    // Удаляем старые изображения
    for (const pos of positions) {
      await deleteImageMetadata(pool, userId, 'hero', pos);
    }
    
    // Загружаем в ImageKit
    const allHeroExt = IMAGE_EXT_BY_MIME[req.file.mimetype] || 'jpg';
    const uploadResult = await uploadToImageKit(
      req.file,
      `hero/${userId}`,
      `all_hero_${Date.now()}.${allHeroExt}`,
      config
    );
    
    if (!uploadResult.success) {
      return res.status(500).json({ error: uploadResult.error, code: 'INTERNAL' });
    }
    
    // Сохраняем метаданные для всех позиций
    for (const pos of positions) {
      await saveImageMetadata(
        pool, 
        userId, 
        'hero', 
        pos, 
        uploadResult, 
        req.file
      );
    }
    
    res.json({ 
      filename: uploadResult.name, 
      positions: positions,
      url: uploadResult.url,
      fileId: uploadResult.fileId,
      deletedFiles: positions.length
    });
    
  } catch (error) {
    logger.error({ err: error }, 'Error uploading hero image to all positions:');
    res.status(500).json({ error: 'Failed to upload hero image to all positions', code: 'INTERNAL' });
  }
});

// Удалить изображение и из meta (ImageKit) - обновлено для многопользовательской архитектуры
app.delete('/api/garage/images/:name', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Получаем глобальную конфигурацию ImageKit
    const config = getImageKitConfig();
    if (!config) {
      return res.status(400).json({ error: 'ImageKit configuration not found', code: 'IMAGEKIT_CONFIG_MISSING' });
    }
    
    // Находим изображение в базе данных
    const result = await pool.query(
      'SELECT * FROM user_images WHERE user_id = $1 AND file_name = $2',
      [userId, req.params.name]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found', code: 'IMAGE_NOT_FOUND' });
    }
    
    const image = result.rows[0];
    
    // Удаляем из ImageKit
    if (image.file_id) {
      await deleteFromImageKit(image.file_id, config);
    }
    
    // Удаляем из базы данных
    await deleteImageMetadata(pool, userId, image.image_type, image.position);
    
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete image', code: 'INTERNAL' });
  }
});

// Удалить hero изображение из конкретной позиции (ImageKit)
app.delete('/api/hero/positions/:position', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const userId = req.user.userId;
    const position = req.params.position;
    const positions = ['garage', 'plan', 'trainings', 'checklist', 'nutrition'];
    
    if (!positions.includes(position)) {
      return res.status(400).json({ error: 'Invalid position', code: 'VALIDATION_ERROR' });
    }
    
    // Получаем изображение из базы данных
    const result = await pool.query(
      'SELECT * FROM user_images WHERE user_id = $1 AND image_type = $2 AND position = $3',
      [userId, 'hero', position]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Position is empty', code: 'NOT_FOUND' });
    }
    
    const image = result.rows[0];
    
    // Получаем глобальную конфигурацию ImageKit
    const config = getImageKitConfig();
    if (!config) {
      return res.status(400).json({ error: 'ImageKit configuration not found', code: 'IMAGEKIT_CONFIG_MISSING' });
    }
    
    // Удаляем из ImageKit
    if (image.file_id) {
      await deleteFromImageKit(image.file_id, config);
    }
    
    // Удаляем из базы данных
    await deleteImageMetadata(pool, userId, 'hero', position);
    
    res.json({ ok: true, message: 'Image deleted successfully' });
    
  } catch (error) {
    logger.error({ err: error }, 'Error deleting hero image:');
    res.status(500).json({ error: 'Failed to delete hero image', code: 'INTERNAL' });
  }
});

// Получение ImageKit конфигурации (глобальная для всех пользователей)
app.get('/api/imagekit/config', authMiddleware, async (req, res) => {
  try {
    const config = getImageKitConfig();
    
    if (!config) {
      return res.status(404).json({ error: 'ImageKit configuration not found', code: 'IMAGEKIT_CONFIG_MISSING' });
    }
    
    // Не возвращаем приватные ключи
    res.json({
      public_key: config.public_key,
      url_endpoint: config.url_endpoint
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get ImageKit configuration', code: 'INTERNAL' });
  }
});



// Новый эндпоинт для получения лимитов Strava
// Diagnostics for the Postgres-first activities store: how much is mirrored,
// how many legacy rows still lack raw JSON (→ degraded objects without map/gear),
// and the current Strava rate-limit budget. Admin only.
app.get('/api/admin/strava/sync-status', authMiddleware, requireAdmin, async (req, res) => {
  const perUser = await pool.query(`
    SELECT u.id AS user_id, u.email,
           COUNT(sa.strava_id)::int AS activities,
           COUNT(sa.strava_id) FILTER (WHERE sa.raw IS NULL)::int AS without_raw,
           MAX(sa.start_date) AS last_activity,
           MAX(sa.synced_at) AS last_synced_at
      FROM users u
      LEFT JOIN synced_activities sa ON sa.user_id = u.id
     WHERE u.strava_id IS NOT NULL
     GROUP BY u.id, u.email
     ORDER BY u.id`);
  const totals = await pool.query(`
    SELECT COUNT(*)::int AS activities,
           COUNT(*) FILTER (WHERE raw IS NULL)::int AS without_raw,
           pg_size_pretty(pg_total_relation_size('synced_activities')) AS table_size
      FROM synced_activities`);
  res.json({ totals: totals.rows[0], users: perUser.rows, strava_limits: stravaClient.getLimits() });
});

app.get('/api/strava/limits', authMiddleware, requireAdmin, (req, res) => {
  try {
    res.json(stravaClient.getLimits() || {
      limit15min: null,
      limitDay: null,
      usage15min: null,
      usageDay: null,
      lastUpdate: null
    });
  } catch (error) {
    logger.error({ err: error }, 'Error getting Strava limits:');
    res.status(500).json({
      error: 'Failed to get Strava limits',
      code: 'INTERNAL',
      limits: {
        limit15min: null,
        limitDay: null,
        usage15min: null,
        usageDay: null,
        lastUpdate: null
      }
    });
  }
});

// Принудительно обновить лимиты Strava (обновлено для многопользовательской архитектуры)
app.post('/api/strava/limits/refresh', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const userId = req.user.userId;
    logger.debug('🔄 Refreshing Strava limits for user:', userId);

    // Делаем тестовый запрос для получения лимитов — stravaClient reads the
    // rate-limit headers off every response it makes, so this GET /athlete
    // is enough to refresh stravaRateLimits.
    await stravaClient.stravaGet(userId, '/athlete', {});
    logger.debug('✅ Strava limits updated:', stravaClient.getLimits());

    res.json({
      success: true,
      message: 'Лимиты обновлены',
      limits: stravaClient.getLimits()
    });
  } catch (err) {
    if (err instanceof stravaTokens.StravaNotLinkedError) {
      logger.debug('❌ No Strava token found for user:', req.user.userId);
      return res.status(400).json({ error: 'Нет Strava токена для пользователя', code: 'STRAVA_NOT_LINKED' });
    }
    logger.error({ err: err.message }, '❌ Error refreshing Strava limits:');
    res.status(500).json({
      error: err.response?.data?.message || err.message || 'Failed to refresh limits',
      code: 'INTERNAL'
    });
  }
});

// === Аналитика по поездкам за 4-недельный цикл ===
app.get('/api/analytics/summary', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const filterYear = req.query.year ? parseInt(req.query.year) : null;
    let periodParam = req.query.period || '4w';
    // Получаем все поездки: Strava + ручные
    let activities = [];
    // Strava
    try {
      const stravaActivitiesList = await stravaActivities.getActivities(userId);
      activities = activities.concat(stravaActivitiesList);
    } catch (err) {
      if (!(err instanceof stravaTokens.StravaNotLinkedError)) {
        logger.warn('[analytics/summary] could not load Strava activities:', err.message);
      }
    }
    // Ручные
    const manualResult = await pool.query('SELECT * FROM rides WHERE user_id = $1', [userId]);
    activities = activities.concat(manualResult.rows);
    
    // ВАЖНО: Фильтрация только велосипедных активностей (Ride и VirtualRide)
    // Strava активности уже отфильтрованы при загрузке, но ручные могут быть любого типа
    activities = activities.filter(a => !a.type || ['Ride', 'VirtualRide'].includes(a.type));
    
    // Фильтрация по userId, если есть
    if (req.query.userId) {
      activities = activities.filter(a => !a.userId || a.userId == req.query.userId);
    }
    // --- Новое: фильтрация по году ---
    let isAllYears = false;
    let yearOnly = false;
    if (req.query.year === 'all') {
      isAllYears = true;
      // не фильтруем по году
      if (!req.query.period) {
        // Если выбран все годы и не указан период — вернуть все активности
        periodParam = 'all';
      }
    } else if (filterYear) {
      activities = activities.filter(a => a.start_date && new Date(a.start_date).getFullYear() === filterYear);
      // Если явно НЕ передан period, то это запрос на весь год
      if (!req.query.period) yearOnly = true;
    }

    // Activities loaded from cache
    if (!activities.length) return res.json({ summary: null });

    // --- Новое: фильтрация по period ---
    let filtered = activities;
    const now = new Date();
    let periodStart = null, periodEnd = null;
    if (yearOnly) {
      // Только год, без периода — весь год
      periodStart = new Date(filterYear, 0, 1);
      periodEnd = new Date(filterYear, 11, 31, 23, 59, 59, 999);
      filtered = activities; // уже отфильтрованы по году
    } else if (periodParam === '4w') {
      // === Новый расчёт календарного 4-недельного блока ===
      // 1. Найти ближайший прошедший понедельник (или сегодня, если сегодня понедельник)
      const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayOfWeek = nowDate.getDay(); // 0=вс, 1=пн, ...
      const daysSinceMonday = (dayOfWeek + 6) % 7; // 0=пн, 6=вс
      // 2. Найти номер недели в году (ISO week)
      function getISOWeek(d) {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
        return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
      }
      const isoWeek = getISOWeek(nowDate);
      // 3. Определить номер 4-недельного блока (1,2,3...)
      const blockNum = Math.floor((isoWeek - 1) / 4);
      // 4. Найти первый понедельник этого блока
      const firstMonday = new Date(nowDate);
      firstMonday.setDate(firstMonday.getDate() - daysSinceMonday - ((isoWeek - 1) % 4) * 7);
      // 5. Начало периода — этот понедельник, конец — через 28 дней (воскресенье включительно)
      periodStart = new Date(firstMonday);
      periodEnd = new Date(firstMonday);
      periodEnd.setDate(periodEnd.getDate() + 27); // 28 дней
      // 6. Фильтруем активности по этому периоду
      filtered = activities.filter(a => {
        const d = new Date(a.start_date);
        return d >= periodStart && d <= periodEnd;
      });
      // Period calculation for plan-fact-hero
      // Filtered activities for current period
    } else if (periodParam === '3m') {
      const threeMonthsAgo = new Date(now.getTime() - 92 * 24 * 60 * 60 * 1000);
      filtered = activities.filter(a => new Date(a.start_date) > threeMonthsAgo);
      periodStart = threeMonthsAgo;
      periodEnd = now;
    } else if (periodParam === 'year') {
      const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      filtered = activities.filter(a => new Date(a.start_date) > yearAgo);
      periodStart = yearAgo;
      periodEnd = now;
    } else if (periodParam === 'all') {
      filtered = activities;
      if (filtered.length) {
        periodStart = new Date(Math.min(...filtered.map(a => new Date(a.start_date))));
        periodEnd = new Date(Math.max(...filtered.map(a => new Date(a.start_date))));
      }
    }



    // Аналитика по filtered (аналогично текущей логике)
    const totalRides = filtered.length;
    const totalTimeH = filtered.reduce((sum, a) => sum + (a.moving_time || 0), 0) / 3600;
    const totalCalories = filtered.reduce((sum, a) => {
      const hr = a.average_heartrate || 0;
      const t = (a.moving_time || 0) / 3600;
      return sum + t * (hr >= 140 ? 850 : 600);
    }, 0);
    const carbsPerHour = 35;
    const totalCarbs = totalTimeH * carbsPerHour;
    const totalWater = totalTimeH * 0.6;
    const totalElev = filtered.reduce((sum, a) => sum + (a.total_elevation_gain || 0), 0);
    const totalMovingSec = filtered.reduce((sum, a) => sum + (a.moving_time || 0), 0);
    const totalKm = filtered.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000;
    const avgSpeed = totalMovingSec > 0 ? (totalKm / (totalMovingSec / 3600)) : null;
    let longest = null;
    filtered.forEach(a => {
      if (!longest || (a.distance || 0) > (longest.distance || 0)) longest = a;
    });
    let longestStats = null;
    if (longest) {
      const distKm = (longest.distance || 0) / 1000;
      const timeH = (longest.moving_time || 0) / 3600;
      const hr = longest.average_heartrate || 0;
      const cal = timeH * (hr >= 140 ? 850 : 600);
      const carbs = timeH * carbsPerHour;
      const water = timeH * 0.6;
      const gels = Math.ceil((carbs * 0.7) / 25);
      const bars = Math.ceil((carbs * 0.7) / 40);
      longestStats = { distKm, timeH, cal, carbs, water, gels, bars, name: longest.name, date: longest.start_date };
    }
    // Среднее число тренировок в неделю (за период)
    let avgPerWeek = 0;
    if (periodParam === 'year' || periodParam === 'all') {
      avgPerWeek = +(totalRides / 52).toFixed(2);
    } else if (periodParam === '3m') {
      avgPerWeek = +(totalRides / 13).toFixed(2);
    } else {
      avgPerWeek = +(totalRides / 4).toFixed(2);
    }
    // Количество длинных поездок (>50км или >2.5ч)
    const longRidesCount = filtered.filter(a => (a.distance || 0) > 50000 || (a.moving_time || 0) > 2.5 * 3600).length;
    // Количество интервальных тренировок (по названию/type)
    const intervalsCount = filtered.filter(a => (a.name || '').toLowerCase().includes('интервал') || (a.name || '').toLowerCase().includes('interval') || (a.type && a.type.toLowerCase().includes('interval'))).length;
    
    // Анализ высокоинтенсивного времени (≥160 BPM ≥120 сек подряд)
    let highIntensityTimeMin = 0;
    let highIntensityIntervals = 0;
    let highIntensitySessions = 0;
    
    // Простой анализ по среднему пульсу (так как streams данные недоступны на сервере)
    for (const act of filtered) {
      if (act.average_heartrate && act.average_heartrate >= 160 && act.moving_time && act.moving_time >= 120) {
        // Если средний пульс ≥160 и время ≥2 минуты, считаем это интервалом
        highIntensityTimeMin += Math.round(act.moving_time / 60);
        highIntensityIntervals++;
        highIntensitySessions++;
      }
    }

    // Динамический план на основе профиля пользователя
    const { getPlanFromProfile } = require('./trainingPlans');
    
    // Получаем профиль пользователя для персонализации плана
    let userProfile = null;
    try {
      const profileResult = await pool.query('SELECT * FROM user_profiles WHERE user_id = $1', [userId]);
      if (profileResult.rows.length > 0) {
        userProfile = profileResult.rows[0];
      }
    } catch (error) {
      logger.warn('Could not fetch user profile for plan calculation:', error);
    }
    
    // Получаем персонализированный план
    const plan = getPlanFromProfile(userProfile);
    const progress = {
      rides: Math.round(totalRides / plan.rides * 100),
      km: Math.round(totalKm / plan.km * 100),
      long: Math.round(longRidesCount / plan.long * 100),
      intervals: Math.round(intervalsCount / plan.intervals * 100)
    };
    // Время по пульсовым зонам (Z2, Z3, Z4, другое)
    let z2 = 0, z3 = 0, z4 = 0, other = 0;
    filtered.forEach(a => {
      if (!a.average_heartrate || !a.moving_time) return;
      const hr = a.average_heartrate;
      const t = a.moving_time / 60; // минуты
      if (hr >= 109 && hr < 127) z2 += t;
      else if (hr >= 127 && hr < 145) z3 += t;
      else if (hr >= 145 && hr < 163) z4 += t;
      else other += t;
    });
    const zones = { z2: Math.round(z2), z3: Math.round(z3), z4: Math.round(z4), other: Math.round(other) };
    function estimateVO2max(acts, userProfile) {
      // VO2max calculation with activity data
      if (!acts.length) {
        // No activities available for VO2max calculation
        return null;
      }
      
      // Получаем лучшую скорость и лучшее усилие
      const bestSpeed = Math.max(...acts.map(a => (a.average_speed || 0) * 3.6)); // км/ч
      const avgHR = acts.reduce((sum, a) => sum + (a.average_heartrate || 0), 0) / acts.filter(a => a.average_heartrate).length;
      
      // Используем данные профиля или значения по умолчанию
      const age = userProfile?.age || 35;
      const weight = userProfile?.weight || 75;
      const gender = userProfile?.gender || 'male';
      const restingHR = userProfile?.resting_heartrate || 60;
      const maxHR = userProfile?.max_heartrate || (220 - age);
      
      // Если нет данных о скорости, возвращаем базовую оценку
      if (bestSpeed < 10) return null;
      
      // Модифицированная формула на основе Jack Daniels' и cycling power equations
      // Базовый расчет VO₂max для велоспорта
      let vo2max;
      
      if (bestSpeed >= 40) {
        // Высокая скорость - используем формулу для конкурентного уровня
        vo2max = 2.8 * bestSpeed - 25; // Линейная зависимость для высоких скоростей
      } else {
        // Обычная скорость - базовая формула с коэффициентами для велоспорта
        vo2max = 1.8 * bestSpeed + 10; // Более реалистичная формула
      }
      
      // Корректировки на основе данных профиля
      
      // Возрастная корректировка (VO₂max снижается с возрастом)
      const ageAdjustment = Math.max(0.85, 1 - (age - 25) * 0.005);
      vo2max *= ageAdjustment;
      
      // Гендерная корректировка
      if (gender === 'female') {
        vo2max *= 0.88; // У женщин обычно на 10-15% ниже
      }
      
      // Корректировка на основе HR данных (если доступны)
      if (avgHR && restingHR && maxHR) {
        const hrReserve = maxHR - restingHR;
        const avgHRPercent = (avgHR - restingHR) / hrReserve;
        
        // Если средний пульс высокий при хорошей скорости - VO₂max может быть ниже
        if (avgHRPercent > 0.85 && bestSpeed < 35) {
          vo2max *= 0.92;
        } else if (avgHRPercent < 0.7 && bestSpeed > 30) {
          vo2max *= 1.05; // Хорошая эффективность
        }
      }
      
      // Бонус за тренированность (интервальные тренировки)
      const intervals = acts.filter(a => 
        (a.name || '').toLowerCase().includes('интервал') || 
        (a.name || '').toLowerCase().includes('interval') || 
        (a.type && a.type.toLowerCase().includes('interval'))
      );
      
      const longRides = acts.filter(a => (a.distance || 0) > 50000 || (a.moving_time || 0) > 2.5 * 3600).length; // >50км или >2.5ч
      const recentActs = acts.filter(a => {
        const actDate = new Date(a.start_date);
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        return actDate > monthAgo;
      });
      
      // Тренированность: интервалы + объем + регулярность
      let fitnessBonus = 1;
      if (intervals.length >= 8) fitnessBonus += 0.08;
      else if (intervals.length >= 4) fitnessBonus += 0.05;
      else if (intervals.length >= 2) fitnessBonus += 0.02;
      
      if (longRides >= 4) fitnessBonus += 0.03;
      if (recentActs.length >= 12) fitnessBonus += 0.03; // регулярность
      
      vo2max *= fitnessBonus;
      
      // Ограничиваем разумными пределами
      vo2max = Math.max(25, Math.min(80, vo2max));
      
      return Math.round(vo2max);
    }
    function estimateFTP(acts) { return null; }
    // Для VO2max используем плавающие периоды, как в goals cache
    let vo2maxActivities = filtered;
    if (periodParam === '4w') {
      const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      vo2maxActivities = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
      // Rolling 28 days VO2max calculation
    } else if (periodParam === '3m') {
      const threeMonthsAgo = new Date(now.getTime() - 92 * 24 * 60 * 60 * 1000);
      vo2maxActivities = activities.filter(a => new Date(a.start_date) > threeMonthsAgo);
      // Rolling 3 months VO2max calculation
    } else if (periodParam === 'year') {
      const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      vo2maxActivities = activities.filter(a => new Date(a.start_date) > yearAgo);
      // Rolling year VO2max calculation
    }
    
    const vo2max = estimateVO2max(vo2maxActivities, userProfile);
    // VO2max calculated for analytics summary
    // User profile loaded for calculations
    const ftp = estimateFTP(filtered);
    

    
    res.json({
      summary: {
        totalCalories: Math.round(totalCalories),
        totalTimeH: +totalTimeH.toFixed(1),
        totalCarbs: Math.round(totalCarbs),
        totalWater: +totalWater.toFixed(1),
        totalRides,
        longestRide: longestStats,
        avgPerWeek,
        longRidesCount,
        intervalsCount,
        highIntensityTimeMin,
        highIntensityIntervals,
        highIntensitySessions,
        progress,
        plan, // Добавляем план в ответ
        zones,
        totalKm: Math.round(totalKm),
        totalElev: Math.round(totalElev),
        totalMovingHours: +(totalMovingSec / 3600).toFixed(1),
        avgSpeed: avgSpeed !== null ? +avgSpeed.toFixed(1) : null,
        vo2max,
        ftp
      },
      period: {
        start: periodStart,
        end: periodEnd
      }
    });
  } catch (err) {
    logger.error({ err }, 'Ошибка аналитики:');
    res.status(500).json({ error: 'Ошибка аналитики', code: 'INTERNAL' });
  }
});

// Функция для вычисления VO2max для конкретного периода
async function calculateVO2maxForPeriod(userId, period) {
  try {

    
    // Получаем активности через общий сервис (кэш/БД/Strava) — раньше эта
    // функция при промахе кэша делала свой собственный, нефильтрованный по
    // типу и обрезанный до 100 штук запрос к Strava и писала его ПРЯМО в
    // activitiesCache, тем самым отравляя кэш для goals/bike-health/
    // achievements неполными данными (S-23). Теперь единственный писатель в
    // activitiesCache — services/strava/activities.js.
    let activities = [];
    try {
      activities = await stravaActivities.getActivities(userId);
    } catch (err) {
      if (!(err instanceof stravaTokens.StravaNotLinkedError)) {
        logger.warn('Could not load activities for VO2max calculation:', err.message);
      }
    }
    if (activities.length === 0) {
      logger.error(`❌ No activities available for VO₂max calculation for user ${userId}`);
      return null;
    }

    // Получаем профиль пользователя
    let userProfile = null;
    try {
      const profileResult = await pool.query('SELECT * FROM user_profiles WHERE user_id = $1', [userId]);
      if (profileResult.rows.length > 0) {
        userProfile = profileResult.rows[0];
      } else {
        logger.warn(`⚠️ No user profile found for user ${userId}`);
      }
    } catch (error) {
      logger.warn('Could not fetch user profile for VO2max calculation:', error);
    }
    
    // Фильтруем по периоду
    let filteredActivities = activities;
    const now = new Date();
    
    if (period === '4w') {
      const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      filteredActivities = activities.filter(a => new Date(a.start_date) > fourWeeksAgo);
    } else if (period === '3m') {
      const threeMonthsAgo = new Date(now.getTime() - 92 * 24 * 60 * 60 * 1000);
      filteredActivities = activities.filter(a => new Date(a.start_date) > threeMonthsAgo);
    } else if (period === 'year') {
      const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      filteredActivities = activities.filter(a => new Date(a.start_date) > yearAgo);
    }
    
    if (filteredActivities.length === 0) {
      logger.warn(`⚠️ No activities found for period ${period}, returning null`);
      return null;
    }
    

    
    // Используем функцию estimateVO2max из analytics endpoint
    // Копируем её логику здесь для доступности
    function estimateVO2max(acts, userProfile) {
      if (!acts.length) return null;
      
      // Получаем лучшую скорость и лучшее усилие
      const bestSpeed = Math.max(...acts.map(a => (a.average_speed || 0) * 3.6)); // км/ч
      const avgHR = acts.reduce((sum, a) => sum + (a.average_heartrate || 0), 0) / acts.filter(a => a.average_heartrate).length;
      
      // Используем данные профиля или значения по умолчанию
      const age = userProfile?.age || 35;
      const weight = userProfile?.weight || 75;
      const gender = userProfile?.gender || 'male';
      const restingHR = userProfile?.resting_hr || 60;
      const maxHR = userProfile?.max_hr || (220 - age);
      
      // Базовый расчет VO₂max для велоспорта
      let vo2max;
      
      if (bestSpeed >= 40) {
        // Высокая скорость - используем формулу для конкурентного уровня
        vo2max = 2.8 * bestSpeed - 25; // Линейная зависимость для высоких скоростей
      } else {
        // Обычная скорость - базовая формула с коэффициентами для велоспорта
        vo2max = 1.8 * bestSpeed + 10; // Более реалистичная формула
      }
      
      // Корректировки на основе данных профиля
      
      // Возрастная корректировка (VO₂max снижается с возрастом)
      const ageAdjustment = Math.max(0.85, 1 - (age - 25) * 0.005);
      vo2max *= ageAdjustment;
      
      // Гендерная корректировка
      if (gender === 'female') {
        vo2max *= 0.88; // У женщин обычно на 10-15% ниже
      }
      
      // Корректировка на основе HR данных (если доступны)
      if (avgHR && restingHR && maxHR) {
        const hrReserve = maxHR - restingHR;
        const avgHRPercent = (avgHR - restingHR) / hrReserve;
        
        // Если средний пульс высокий при хорошей скорости - VO₂max может быть ниже
        if (avgHRPercent > 0.85 && bestSpeed < 35) {
          vo2max *= 0.92;
        } else if (avgHRPercent < 0.7 && bestSpeed > 30) {
          vo2max *= 1.05; // Хорошая эффективность
        }
      }
      
      // Бонус за тренированность (интервальные тренировки)
      const intervals = acts.filter(a => 
        (a.name || '').toLowerCase().includes('интервал') || 
        (a.name || '').toLowerCase().includes('interval') || 
        (a.type && a.type.toLowerCase().includes('interval'))
      );
      
      const longRides = acts.filter(a => (a.distance || 0) > 50000 || (a.moving_time || 0) > 2.5 * 3600);
      
      // Регулярность тренировок
      const totalRides = acts.length;
      const daysSpan = Math.max(1, (new Date() - new Date(Math.min(...acts.map(a => new Date(a.start_date))))) / (1000 * 60 * 60 * 24));
      const ridesPerWeek = (totalRides / daysSpan) * 7;
      
      let fitnessBonus = 1;
      if (intervals.length >= 1) fitnessBonus += 0.03;
      if (intervals.length >= 3) fitnessBonus += 0.02;
      if (longRides.length >= 1) fitnessBonus += 0.02;
      if (longRides.length >= 3) fitnessBonus += 0.02;
      if (ridesPerWeek >= 3) fitnessBonus += 0.03;
      if (ridesPerWeek >= 5) fitnessBonus += 0.02;
      
      vo2max *= fitnessBonus;
      
      // Ограничиваем разумными пределами
      vo2max = Math.max(25, Math.min(80, vo2max));
      
      return Math.round(vo2max);
    }
    
    const vo2max = estimateVO2max(filteredActivities, userProfile);

    
    // VO2max calculation completed
    return vo2max;
  } catch (error) {
    // pino's `err` serializer already includes message + stack, so this
    // replaces both the old summary log and the separate "Error details" one.
    logger.error({ err: error }, '❌ Error calculating VO2max for period:');
    return null;
  }
}

// === Получение информации о велосипедах пользователя из Strava ===
app.get('/api/bikes', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const formattedBikes = await stravaActivities.getBikes(userId);
    res.json(formattedBikes);
  } catch (err) {
    if (err instanceof stravaTokens.StravaNotLinkedError) {
      return res.json([]);
    }
    if (err instanceof stravaClient.StravaRateLimitError) {
      return res
        .status(429)
        .json({ error: 'Strava API rate limit reached. Try again later.', code: 'RATE_LIMITED', retryAfter: err.retryAfterSec || 900 });
    }
    logger.error({ err: err.response?.data || err }, 'Error fetching bikes:');
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      res.status(503).json({ error: 'Strava API timeout. Please try again later.', code: 'UPSTREAM_ERROR' });
    } else {
      res.status(500).json({ error: err.message || 'Failed to fetch bikes', code: 'INTERNAL' });
    }
  }
});

// === Bike Health — component wear calculations ===

const BIKE_COMPONENTS = [
  { id: 'chain', baseLifecycle: 6000 },
  { id: 'cassette', baseLifecycle: 15000 },
  { id: 'chainrings', baseLifecycle: 20000 },
  { id: 'brake_pads', baseLifecycle: 6000 },
  { id: 'rotors', baseLifecycle: 20000 },
  { id: 'tires', baseLifecycle: 6000 },
  { id: 'sealant', baseLifecycle: 5000 },
  { id: 'wheel_bearings', baseLifecycle: 15000 },
  { id: 'bar_tape', baseLifecycle: 6000 },
  { id: 'saddle', baseLifecycle: 25000 },
  { id: 'pedals', baseLifecycle: 20000 },
  { id: 'cleats', baseLifecycle: 8000 },
];

function computeRidingStyle(activities) {
  if (!activities || activities.length === 0) {
    return { climbing: 0, sprint: 0, power: 0 };
  }

  // Climbing score: elevation density (m per 100km)
  const ridesWithElevation = activities.filter(a => a.total_elevation_gain > 0 && a.distance > 0);
  let climbingScore = 0;
  if (ridesWithElevation.length > 0) {
    const densities = ridesWithElevation.map(a => (a.total_elevation_gain / (a.distance / 1000)) * 100);
    const medianDensity = densities.sort((a, b) => a - b)[Math.floor(densities.length / 2)];
    // Scale: 200 m/100km = 0, 3000 m/100km = 100
    climbingScore = Math.min(100, Math.max(0, ((medianDensity - 200) / 2800) * 100));
  }

  // Sprint score: max speed variability
  const flatRides = activities.filter(a => {
    const distKm = a.distance / 1000;
    const elevPerKm = distKm > 0 ? a.total_elevation_gain / distKm : 0;
    const avgSpeedKmh = (a.average_speed || 0) * 3.6;
    return elevPerKm < 10 && distKm > 10 && avgSpeedKmh >= 22;
  });
  let sprintScore = 0;
  if (flatRides.length > 0) {
    const maxSpeeds = flatRides.map(a => (a.max_speed || 0) * 3.6);
    const medianMax = maxSpeeds.sort((a, b) => a - b)[Math.floor(maxSpeeds.length / 2)];
    // Scale: 30 km/h = 0, 65 km/h = 100
    sprintScore = Math.min(100, Math.max(0, ((medianMax - 30) / 35) * 100));
  }

  // Power score: average watts
  const withPower = activities.filter(a => a.average_watts > 0);
  let powerScore = 0;
  if (withPower.length > 0) {
    const avgWatts = withPower.reduce((s, a) => s + a.average_watts, 0) / withPower.length;
    // Scale: 80W = 0, 300W = 100
    powerScore = Math.min(100, Math.max(0, ((avgWatts - 80) / 220) * 100));
  }

  return {
    climbing: Math.round(climbingScore),
    sprint: Math.round(sprintScore),
    power: Math.round(powerScore),
  };
}

function determineRiderProfile(skills) {
  const { climbing, sprint, endurance, tempo, power, consistency } = skills;
  const avgSkill = (climbing + sprint + endurance + tempo + power + consistency) / 6;

  const skillsArray = [
    { name: 'climbing', value: climbing },
    { name: 'sprint', value: sprint },
    { name: 'endurance', value: endurance },
    { name: 'tempo', value: tempo },
    { name: 'power', value: power },
    { name: 'consistency', value: consistency },
  ].sort((a, b) => b.value - a.value);

  const topSkill = skillsArray[0];
  const secondSkill = skillsArray[1];
  const dominance = topSkill.value - avgSkill;
  const maxDiff = skillsArray[0].value - skillsArray[skillsArray.length - 1].value;

  if (avgSkill < 40) return { profile: 'Developing Rider', emoji: '🎯' };
  if (maxDiff < 20 && avgSkill >= 55) return { profile: 'All-Rounder', emoji: '🚴' };
  if (consistency > 75 && consistency - avgSkill > 15) return { profile: 'Consistent Trainer', emoji: '📊' };
  if (tempo >= 60 && power >= 60 && (tempo + power) / 2 > avgSkill + 10) return { profile: 'Time Trialist', emoji: '⏱️' };

  if (dominance > 10) {
    const profiles = {
      climbing: { profile: 'Climber', emoji: '🏔️' },
      sprint: { profile: 'Sprinter', emoji: '⚡' },
      endurance: { profile: 'Endurance Rider', emoji: '💪' },
      tempo: { profile: 'Tempo Specialist', emoji: '🎯' },
      power: { profile: 'Power House', emoji: '⚡' },
    };
    return profiles[topSkill.name] || { profile: 'Versatile Rider', emoji: '🚴' };
  }

  if (topSkill.name === 'climbing' && secondSkill.name === 'endurance') return { profile: 'Mountain Endurance', emoji: '🏔️' };
  if (topSkill.name === 'sprint' && secondSkill.name === 'power') return { profile: 'Explosive Sprinter', emoji: '💥' };

  return { profile: 'Versatile Rider', emoji: '🚴' };
}

function computeStyleFactor(componentId, ridingStyle) {
  const { climbing, sprint, power } = ridingStyle;
  switch (componentId) {
    case 'chain': return 1 + (climbing / 100) * 0.3 + (power / 100) * 0.2;
    case 'cassette': return 1 + (sprint / 100) * 0.5 + (power / 100) * 0.3;
    case 'chainrings': return 1 + (power / 100) * 0.3 + (sprint / 100) * 0.2;
    case 'brake_pads': return 1 + (climbing / 100) * 0.8;
    case 'rotors': return 1 + (climbing / 100) * 0.5;
    case 'tires': return 1 + (climbing / 100) * 0.15;
    case 'wheel_bearings': return 1 + (climbing / 100) * 0.1 + (power / 100) * 0.1;
    default: return 1.0; // bar_tape, saddle
  }
}

function getHealthStatus(healthPercent) {
  if (healthPercent > 40) return 'good';
  if (healthPercent > 25) return 'warning';
  if (healthPercent > 15) return 'attention';
  return 'critical';
}

app.get('/api/bikes/:bikeId/health', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { bikeId } = req.params;

    // 1. Get rider weight from profile
    const profileResult = await pool.query(
      'SELECT weight FROM user_profiles WHERE user_id = $1', [userId]
    );
    const riderWeight = profileResult.rows[0]?.weight ? parseFloat(profileResult.rows[0].weight) : 75;

    // 2. Get all activities, filter by gear_id
    let activities = [];
    try {
      activities = await stravaActivities.getActivities(userId);
    } catch (err) {
      if (!(err instanceof stravaTokens.StravaNotLinkedError)) throw err;
    }

    const bikeActivities = activities.filter(a => a.gear_id === bikeId);
    const totalKm = bikeActivities.reduce((s, a) => s + (a.distance || 0), 0) / 1000;

    // 3. Get riding style from skills_history (actual computed values)
    let ridingStyle = { climbing: 0, sprint: 0, power: 0 };
    let riderProfile = { profile: 'Unknown', emoji: '❓' };
    const skillsResult = await pool.query(
      `SELECT climbing, sprint, endurance, tempo, power, consistency FROM skills_history
       WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 1`,
      [userId]
    );
    if (skillsResult.rows.length > 0) {
      const s = skillsResult.rows[0];
      const allSkills = {
        climbing: s.climbing || 0,
        sprint: s.sprint || 0,
        endurance: s.endurance || 0,
        tempo: s.tempo || 0,
        power: s.power || 0,
        consistency: s.consistency || 0,
      };

      // Determine dominant skills for wear factors
      ridingStyle = { climbing: allSkills.climbing, sprint: allSkills.sprint, power: allSkills.power };

      // Determine rider profile (same logic as client skillsCalculator)
      riderProfile = determineRiderProfile(allSkills);
    }

    // 4. Get latest resets for each component
    const resetsResult = await pool.query(
      `SELECT DISTINCT ON (component) component, reset_at, reset_km
       FROM bike_component_resets
       WHERE user_id = $1 AND bike_id = $2
       ORDER BY component, reset_at DESC`,
      [userId, bikeId]
    );
    const resets = {};
    resetsResult.rows.forEach(r => {
      resets[r.component] = { resetAt: r.reset_at, resetKm: parseFloat(r.reset_km) || 0 };
    });
    const onboardingCompleted = resetsResult.rows.length > 0;

    // 4b. Custom gear labels (see bike_component_labels table comment above)
    const labelsResult = await pool
      .query(
        `SELECT target_type, target_key, custom_name FROM bike_component_labels
         WHERE user_id = $1 AND bike_id = $2`,
        [userId, bikeId]
      )
      .catch(() => ({ rows: [] }));
    const groupLabels = {};
    const componentLabels = {};
    labelsResult.rows.forEach((r) => {
      if (r.target_type === 'group') groupLabels[r.target_key] = r.custom_name;
      else if (r.target_type === 'component') componentLabels[r.target_key] = r.custom_name;
    });

    // 5. Get totalKm — prefer Strava gear distance (more accurate than summing activities)
    let gearTotalKm = totalKm;
    const cachedBikes = bikesCache.get(userId);
    if (cachedBikes && Array.isArray(cachedBikes.data)) {
      const bikeData = cachedBikes.data.find(b => b.id === bikeId);
      if (bikeData && bikeData.distanceKm > 0) {
        gearTotalKm = bikeData.distanceKm;
      }
    }
    // If no cached distance and we have a Strava token, fetch gear details directly
    if (gearTotalKm === 0) {
      try {
        const gearResp = await stravaClient.stravaGet(userId, `/gear/${bikeId}`, {});
        if (gearResp.data && gearResp.data.distance) {
          gearTotalKm = Math.round(gearResp.data.distance / 1000 * 100) / 100;
        }
      } catch (gearErr) {
        logger.warn('Could not fetch gear distance from Strava:', gearErr.message);
      }
    }

    // 6. Calculate wear per component
    logger.debug(`[BikeHealth] bikeId=${bikeId}, gearTotalKm=${gearTotalKm}, bikeActivities=${bikeActivities.length}, ridingStyle=`, ridingStyle);
    const weightFactor = riderWeight / 75;
    const components = BIKE_COMPONENTS.map(comp => {
      const reset = resets[comp.id];
      const kmSinceReset = reset ? Math.max(0, gearTotalKm - reset.resetKm) : gearTotalKm;
      const styleFactor = computeStyleFactor(comp.id, ridingStyle);
      const effectiveKm = kmSinceReset * weightFactor * styleFactor;
      const healthPercent = Math.max(0, Math.round(100 - (effectiveKm / comp.baseLifecycle) * 100));
      const remainingKm = Math.max(0, Math.round((comp.baseLifecycle - effectiveKm) / weightFactor / styleFactor));

      return {
        id: comp.id,
        healthPercent,
        kmSinceReset: Math.round(kmSinceReset),
        effectiveKm: Math.round(effectiveKm),
        baseLifecycle: comp.baseLifecycle,
        remainingKm,
        status: getHealthStatus(healthPercent),
        weightFactor: Math.round(weightFactor * 100) / 100,
        styleFactor: Math.round(styleFactor * 100) / 100,
        lastResetAt: reset?.resetAt || null,
        lastResetKm: reset?.resetKm || 0,
      };
    });

    const overallHealth = Math.round(
      components.reduce((s, c) => s + c.healthPercent, 0) / components.length
    );

    // 8. Next service = component with least remaining km
    const nearest = components.reduce((min, c) => c.remainingKm < min.remainingKm ? c : min, components[0]);

    res.json({
      bikeId,
      totalKm: Math.round(gearTotalKm),
      riderWeight,
      ridingStyle,
      riderProfile,
      components,
      overallHealth,
      nextService: { component: nearest.id, inKm: nearest.remainingKm },
      onboardingCompleted,
      groupLabels,
      componentLabels,
    });
  } catch (err) {
    logger.error({ err }, 'Error computing bike health:');
    res.status(500).json({ error: 'Failed to compute bike health', code: 'INTERNAL' });
  }
});

// === Bike gear labels — custom names for a component group or a single
// component card (see bike_component_labels table comment). Body:
// { labels: [{ target_type: 'group'|'component', target_key, custom_name }, ...] }
// Accepts several at once since one rider statement can set both
// ("wheels are Hunt, tires are Conti GP5000" -> group 'wheels' + component
// 'tires' in the same call).
app.put('/api/bikes/:bikeId/labels', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { bikeId } = req.params;
    const { labels } = req.body;

    if (!Array.isArray(labels) || labels.length === 0) {
      return res.status(400).json({ error: 'labels array is required', code: 'VALIDATION_ERROR' });
    }

    const validGroupKeys = ['drivetrain', 'brakes', 'wheels', 'contact'];
    const validComponentIds = BIKE_COMPONENTS.map((c) => c.id);

    const clean = labels.filter((l) => {
      if (!l || typeof l.custom_name !== 'string' || !l.custom_name.trim()) return false;
      if (l.target_type === 'group') return validGroupKeys.includes(l.target_key);
      if (l.target_type === 'component') return validComponentIds.includes(l.target_key);
      return false;
    });

    if (clean.length === 0) {
      return res.status(400).json({ error: 'No valid labels provided', code: 'BAD_REQUEST' });
    }

    for (const l of clean) {
      await pool.query(
        `INSERT INTO bike_component_labels (user_id, bike_id, target_type, target_key, custom_name, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (user_id, bike_id, target_type, target_key)
         DO UPDATE SET custom_name = EXCLUDED.custom_name, updated_at = NOW()`,
        [userId, bikeId, l.target_type, l.target_key, l.custom_name.trim().slice(0, 64)]
      );
    }

    res.json({ success: true, count: clean.length });
  } catch (err) {
    logger.error({ err }, 'Error saving bike gear labels:');
    res.status(500).json({ error: 'Failed to save labels', code: 'INTERNAL' });
  }
});

// === Bike component reset (mark as replaced) ===
app.post('/api/bikes/:bikeId/components/:component/reset', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { bikeId, component } = req.params;

    const validComponents = BIKE_COMPONENTS.map(c => c.id);
    if (!validComponents.includes(component)) {
      return res.status(400).json({ error: 'Invalid component', code: 'VALIDATION_ERROR' });
    }

    // Get current bike mileage
    let currentKm = 0;
    const cachedBikes = bikesCache.get(userId);
    if (cachedBikes && Array.isArray(cachedBikes.data)) {
      const bikeData = cachedBikes.data.find(b => b.id === bikeId);
      if (bikeData) currentKm = bikeData.distanceKm;
    }

    await pool.query(
      'INSERT INTO bike_component_resets (user_id, bike_id, component, reset_km) VALUES ($1, $2, $3, $4)',
      [userId, bikeId, component, currentKm]
    );

    res.json({ success: true, component, resetKm: currentKm });
  } catch (err) {
    logger.error({ err }, 'Error resetting component:');
    res.status(500).json({ error: 'Failed to reset component', code: 'INTERNAL' });
  }
});

// === Bike onboarding — bulk initial component setup ===
app.post('/api/bikes/:bikeId/onboarding', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { bikeId } = req.params;
    const { resets } = req.body;

    if (!Array.isArray(resets) || resets.length === 0) {
      return res.status(400).json({ error: 'resets array is required', code: 'VALIDATION_ERROR' });
    }

    const validIds = BIKE_COMPONENTS.map(c => c.id);
    const values = [];
    const params = [];
    let idx = 1;

    for (const r of resets) {
      if (!validIds.includes(r.component)) continue;
      values.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, 'onboarding')`);
      params.push(userId, bikeId, r.component, r.resetKm ?? 0);
      idx += 4;
    }

    if (values.length === 0) {
      return res.status(400).json({ error: 'No valid components provided', code: 'BAD_REQUEST' });
    }

    await pool.query(
      `INSERT INTO bike_component_resets (user_id, bike_id, component, reset_km, source)
       VALUES ${values.join(', ')}`,
      params
    );

    res.json({ success: true, count: values.length });
  } catch (err) {
    logger.error({ err }, 'Error saving bike onboarding:');
    res.status(500).json({ error: 'Failed to save bike onboarding', code: 'INTERNAL' });
  }
});

// === Анализ отдельной активности: тип и рекомендации ===
app.get('/api/analytics/activity/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    
    // Получаем активности пользователя (кэш/БД/Strava)
    let activities = [];
    try {
      activities = await stravaActivities.getActivities(userId);
    } catch (error) {
      if (!(error instanceof stravaTokens.StravaNotLinkedError)) {
        logger.error({ err: error }, 'Error fetching activities for analysis:');
      }
    }

    // Находим нужную активность
    const activity = activities.find(a => String(a.id) === String(id));
    if (!activity) return res.status(404).json({ error: 'Activity not found', code: 'ACTIVITY_NOT_FOUND' });

    // Анализ активности (логика с фронта)
    let type = 'Regular';
    if (activity.distance && activity.distance/1000 > 60) type = 'Long';
    else if (activity.average_speed && activity.average_speed*3.6 < 20 && activity.moving_time && activity.moving_time/60 < 60) type = 'Recovery';
    else if (activity.total_elevation_gain && activity.total_elevation_gain > 800) type = 'Mountain';
    else if ((activity.name||'').toLowerCase().includes('интервал') || (activity.type||'').toLowerCase().includes('interval')) type = 'Interval';

    const recommendations = [];
    if (activity.average_speed && activity.average_speed*3.6 < 25) {
      recommendations.push({
        title: 'Average speed below 25 km/h',
        advice: 'To improve speed, include interval training (e.g., 4×4 min with 4 min rest, Z4-Z5), work on pedal technique (cadence 90–100), pay attention to your body position on the bike, and aerodynamics.'
      });
    }
    if (activity.average_heartrate && activity.average_heartrate > 155) {
      recommendations.push({
        title: 'Heart rate above 155 bpm',
        advice: 'This may indicate high intensity or insufficient recovery. Check your sleep quality, stress level, add recovery training, pay attention to hydration and nutrition.'
      });
    }
    if (activity.total_elevation_gain && activity.total_elevation_gain > 500 && activity.average_speed*3.6 < 18) {
      recommendations.push({
        title: 'Mountain training with low speed',
        advice: 'To improve results, add strength training off the bike and intervals in ascents (e.g., 5×5 min in Z4).'
      });
    }
    if (!activity.average_heartrate) {
      recommendations.push({
        title: 'No heart rate data',
        advice: 'Add a heart rate monitor for more accurate intensity control and recovery.'
      });
    }
    if (!activity.distance || activity.distance/1000 < 30) {
      recommendations.push({
        title: 'Short distance',
        advice: 'To develop endurance, plan at least one long ride (60+ km) per week. Gradually increase the distance, remembering to eat and hydrate on the road.'
      });
    }
    if (type === 'Recovery') {
      recommendations.push({
        title: 'Recovery training',
        advice: 'Great! Don\'t forget to alternate such training with intervals and long rides for progress.'
      });
    }
    if (type === 'Interval' && activity.average_heartrate && activity.average_heartrate < 140) {
      recommendations.push({
        title: 'Interval training with low heart rate',
        advice: 'Intervals should be performed with greater intensity (Z4-Z5) to get the maximum training effect.'
      });
    }
    if (!activity.average_cadence) {
      recommendations.push({
        title: 'No cadence data',
        advice: 'Using a cadence sensor will help track pedal technique and avoid excessive fatigue.'
      });
    }
    if (recommendations.length === 0) {
      recommendations.push({
        title: 'Great training!',
        advice: 'Training completed perfectly! Continue in the same spirit and gradually increase the load for further progress.'
      });
    }
    res.json({ type, recommendations });
  } catch (err) {
    logger.error({ err }, 'Ошибка анализа активности:');
    res.status(500).json({ error: err.message || 'Ошибка анализа активности', code: 'INTERNAL' });
  }
});

// Auth moved to the shared authMiddleware (was a manual jwt.verify here) —
// the 401 body on a missing/invalid token is now `{ error: 'No token' }` /
// `{ error: 'Invalid token' }` instead of `{ error: 'Authorization required' }`
// (see docs/audit/00-AUDIT-AND-PLAN.md T-1.1; noted as an acceptable change).
app.post('/api/ai-analysis', aiLimiter, authMiddleware, async (req, res) => {
  try {
    const summary = req.body.summary;
    if (!summary) return res.status(400).json({ error: 'No summary provided', code: 'BAD_REQUEST' });
    const userId = req.user.userId;
    const analysis = await analyzeTraining(summary, pool, userId);
    res.json({ analysis });
  } catch (e) {
    logger.error({ err: e }, 'AI analysis error:');
    res.status(500).json({ error: 'AI analysis failed', code: 'INTERNAL' });
  }
});

// AI анализ для конкретной активности (для RN)
app.get('/api/activities/:id/ai-analysis', authMiddleware, async (req, res) => {
  const startTime = Date.now();
  try {
    const activityId = req.params.id;
    logger.debug(`\n🚀 AI Analysis API request - Activity ID: ${activityId}`);
    const userId = req.user.userId || req.user.id;
    logger.debug(`👤 User ID: ${userId}`);

    // Получаем детали активности из Strava
    let activity;
    try {
      activity = await stravaActivities.getActivity(userId, activityId);
    } catch (err) {
      if (err instanceof stravaTokens.StravaNotLinkedError) {
        return res.status(404).json({ error: 'Strava token not found. Please reconnect your Strava account.', code: 'STRAVA_NOT_LINKED' });
      }
      throw err;
    }

    // Формируем summary для AI
    const summary = {
      name: activity.name,
      date: activity.start_date,
      distance_km: (activity.distance / 1000).toFixed(2),
      moving_time_min: Math.round(activity.moving_time / 60),
      elapsed_time_min: Math.round(activity.elapsed_time / 60),
      average_speed_kmh: (activity.average_speed * 3.6).toFixed(1),
      max_speed_kmh: (activity.max_speed * 3.6).toFixed(1),
      average_heartrate: activity.average_heartrate ? Math.round(activity.average_heartrate) : null,
      max_heartrate: activity.max_heartrate ? Math.round(activity.max_heartrate) : null,
      average_cadence: activity.average_cadence ? Math.round(activity.average_cadence) : null,
      average_temp: activity.average_temp,
      total_elevation_gain_m: activity.total_elevation_gain,
      max_elevation_m: activity.elev_high,
      real_average_power_w: activity.average_watts ? Math.round(activity.average_watts) : null,
      real_max_power_w: activity.max_watts ? Math.round(activity.max_watts) : null,
    };
    
    // Получаем AI анализ
    const analysis = await analyzeTraining(summary, pool, userId);
    
    const duration = Date.now() - startTime;
    logger.debug(`⏱️  Total request time: ${duration}ms\n`);
    
    res.json({ analysis });
  } catch (e) {
    const duration = Date.now() - startTime;
    logger.error({ err: e.message }, `❌ AI analysis error (${duration}ms):`);
    if (e.response && e.response.status === 401) {
      return res.status(401).json({ error: 'Strava token expired', code: 'STRAVA_TOKEN_EXPIRED' });
    }
    res.status(500).json({ error: 'AI analysis failed', code: 'INTERNAL' });
  }
});

// Get or calculate meta-goals progress for specific activity
app.get('/api/activities/:id/meta-goals-progress', authMiddleware, async (req, res) => {
  try {
    const activityId = req.params.id;
    const userId = req.user.userId;
    
    // Проверяем кеш в БД - для каждой мета-цели храним только последний просмотренный заезд
    const cachedProgress = await pool.query(
      `SELECT meta_goal_id, activity_id, progress_before, progress_after, contributions 
       FROM activity_meta_goals_progress 
       WHERE user_id = $1 AND activity_id = $2`,
      [userId, activityId]
    );
    
    // Если для ЭТОГО заезда есть сохранённые данные - возвращаем
    if (cachedProgress.rows.length > 0) {
      const metaGoalIds = cachedProgress.rows.map(r => r.meta_goal_id);
      const metaGoals = await pool.query(
        'SELECT id, title, status FROM meta_goals WHERE id = ANY($1) AND user_id = $2',
        [metaGoalIds, userId]
      );
      
      const result = cachedProgress.rows.map(row => {
        const metaGoal = metaGoals.rows.find(mg => mg.id === row.meta_goal_id);
        return {
          id: row.meta_goal_id,
          title: metaGoal?.title || 'Unknown Goal',
          status: metaGoal?.status || 'unknown',
          progress: Math.round(row.progress_after),
          progressGain: Math.max(0, Math.round(row.progress_after - row.progress_before)),
          contributions: row.contributions || []
        };
      });
      
      logger.debug(`✅ Returning cached progress for activity ${activityId}`);
      return res.json(result);
    }
    
    // Если кеша нет - вычисляем
    const activity = await getActivityDetails(activityId, userId);
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found', code: 'ACTIVITY_NOT_FOUND' });
    }
    
    // Получаем активные мета-цели пользователя
    const metaGoalsResult = await pool.query(
      'SELECT * FROM meta_goals WHERE user_id = $1 AND status = $2',
      [userId, 'active']
    );
    
    // Получаем предыдущие значения для всех мета-целей (из последних записей)
    const previousProgress = await pool.query(
      'SELECT meta_goal_id, progress_after FROM activity_meta_goals_progress WHERE user_id = $1',
      [userId]
    );
    
    const previousProgressMap = new Map(
      previousProgress.rows.map(r => [r.meta_goal_id, r.progress_after])
    );
    
    const metaGoals = metaGoalsResult.rows;
    const result = [];

    // Batch load all sub-goals for all meta-goals in one query
    const metaGoalIds = metaGoals.map(mg => mg.id);
    const allSubGoalsResult = metaGoalIds.length > 0
      ? await pool.query(
          'SELECT * FROM goals WHERE meta_goal_id = ANY($1::int[]) AND goal_type != $2',
          [metaGoalIds, 'ftp_vo2max']
        )
      : { rows: [] };
    const subGoalsByMeta = new Map();
    for (const sg of allSubGoalsResult.rows) {
      if (!subGoalsByMeta.has(sg.meta_goal_id)) subGoalsByMeta.set(sg.meta_goal_id, []);
      subGoalsByMeta.get(sg.meta_goal_id).push(sg);
    }
    
    for (const metaGoal of metaGoals) {
      const subGoals = subGoalsByMeta.get(metaGoal.id) || [];
      if (subGoals.length === 0) continue;
      
      // Вычисляем текущий прогресс (ПОСЛЕ этого заезда)
      const progressValuesAfter = subGoals.map(sg => {
        const current = sg.current_value || 0;
        const target = sg.target_value || 1;
        return Math.min((current / target) * 100, 100);
      });
      
      const avgProgressAfter = progressValuesAfter.reduce((sum, p) => sum + p, 0) / progressValuesAfter.length;
      
      // Прогресс ДО = progress_after из предыдущей записи (последний просмотренный заезд)
      // Если записи нет - вычисляем как обычно (вычитаем вклад текущего заезда)
      let avgProgressBefore;
      
      if (previousProgressMap.has(metaGoal.id)) {
        // Используем прогресс из предыдущего просмотренного заезда
        avgProgressBefore = previousProgressMap.get(metaGoal.id);
        logger.debug(`📊 Meta-goal ${metaGoal.id}: Using previous progress ${avgProgressBefore}%`);
      } else {
        // Первый раз - вычисляем вычитая вклад текущего заезда
        const progressValuesBefore = subGoals.map(sg => {
          const current = sg.current_value || 0;
          const target = sg.target_value || 1;
          let currentWithoutRide = current;
          
          if (sg.goal_type === 'distance') {
            currentWithoutRide = current - (activity.distance / 1000);
          } else if (sg.goal_type === 'elevation') {
            currentWithoutRide = current - activity.total_elevation_gain;
          } else if (sg.goal_type === 'rides_count') {
            currentWithoutRide = current - 1;
          } else if (sg.goal_type === 'time') {
            currentWithoutRide = current - (activity.moving_time / 60);
          }
          
          currentWithoutRide = Math.max(0, currentWithoutRide);
          return Math.min((currentWithoutRide / target) * 100, 100);
        });
        
        avgProgressBefore = progressValuesBefore.reduce((sum, p) => sum + p, 0) / progressValuesBefore.length;
        logger.debug(`📊 Meta-goal ${metaGoal.id}: Calculated initial progress ${avgProgressBefore}%`);
      }
      
      const progressGain = Math.max(0, Math.round(avgProgressAfter - avgProgressBefore));
      
      // Вычисляем вклады
      const contributions = [];
      for (const sg of subGoals) {
        let contributionValue = '';
        
        if (sg.goal_type === 'distance') {
          const distanceKm = activity.distance / 1000;
          if (distanceKm > 0.1) {
            contributionValue = `+${distanceKm.toFixed(1)} km`;
          }
        } else if (sg.goal_type === 'elevation') {
          const elevation = activity.total_elevation_gain;
          if (elevation > 1) {
            contributionValue = `+${Math.round(elevation)} m`;
          }
        } else if (sg.goal_type === 'rides_count') {
          contributionValue = '+1 ride';
        } else if (sg.goal_type === 'time') {
          const timeMin = activity.moving_time / 60;
          if (timeMin > 1) {
            contributionValue = `+${Math.round(timeMin)} min`;
          }
        }
        
        if (contributionValue) {
          contributions.push({
            type: sg.goal_type,
            label: sg.goal_type === 'distance' ? 'Distance' :
                   sg.goal_type === 'elevation' ? 'Elevation' :
                   sg.goal_type === 'rides_count' ? 'Rides' :
                   sg.goal_type === 'time' ? 'Time' : 'Progress',
            value: contributionValue
          });
        }
      }
      
      // Сохраняем в БД - ПЕРЕЗАПИСЫВАЕМ последний заезд для этой мета-цели
      await pool.query(
        `INSERT INTO activity_meta_goals_progress 
         (activity_id, meta_goal_id, user_id, progress_before, progress_after, contributions) 
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (meta_goal_id, user_id) 
         DO UPDATE SET 
           activity_id = $1,
           progress_before = $4,
           progress_after = $5,
           contributions = $6,
           created_at = NOW()`,
        [activityId, metaGoal.id, userId, avgProgressBefore, avgProgressAfter, JSON.stringify(contributions)]
      );
      
      result.push({
        id: metaGoal.id,
        title: metaGoal.title,
        status: metaGoal.status,
        progress: Math.round(avgProgressAfter),
        progressGain: progressGain,
        contributions
      });
    }
    
    logger.debug(`✅ Calculated and saved progress for activity ${activityId}`);
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error calculating meta-goals progress:');
    res.status(500).json({ error: 'Failed to calculate progress', code: 'INTERNAL' });
  }
});

// Helper function to get activity details
async function getActivityDetails(activityId, userId) {
  try {
    return await stravaActivities.getActivity(userId, activityId);
  } catch (error) {
    if (!(error instanceof stravaTokens.StravaNotLinkedError)) {
      logger.error({ err: error }, 'Error fetching activity details:');
    }
    return null;
  }
}

// Регистрация нового пользователя
app.post('/api/register', authLimiter, async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    // Проверяем, не существует ли уже пользователь с таким email
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists', code: 'EMAIL_ALREADY_EXISTS' });
    }
    
    // Хешируем пароль
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Создаем пользователя
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id, email, name',
      [email, hashedPassword, name]
    );
    
    const user = result.rows[0];
    
    // Генерируем токен верификации
    const verificationToken = generateVerificationToken();
    
    // Сохраняем токен в базе
    await pool.query(
      'UPDATE users SET verification_token = $1, verification_token_expires = NOW() + INTERVAL \'24 hours\' WHERE id = $2',
      [verificationToken, user.id]
    );
    
    // Отправляем email для верификации
    await sendVerificationEmail(email, verificationToken, name);
    
    res.json({ 
      success: true, 
      message: 'Registration successful. Please check your email to verify your account.',
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (err) {
    logger.error({ err }, 'Registration error:');
    res.status(500).json({ error: err.message || 'Registration failed', code: 'INTERNAL' });
  }
});

// Подтверждение email
app.get('/api/verify-email', async (req, res) => {
  const { token } = req.query;
  
  if (!token) {
    return res.status(400).json({ error: 'Verification token required', code: 'VALIDATION_ERROR' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email, verification_token_expires FROM users WHERE verification_token = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid verification token', code: 'INVALID_TOKEN' });
    }

    const user = result.rows[0];
    
    // Проверяем срок действия токена
    if (new Date() > new Date(user.verification_token_expires)) {
      return res.status(400).json({ error: 'Verification token has expired', code: 'TOKEN_EXPIRED' });
    }

    // Подтверждаем email
    await pool.query(
      'UPDATE users SET email_verified = TRUE, verification_token = NULL, verification_token_expires = NULL WHERE id = $1',
      [user.id]
    );

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Email verification error:');
    res.status(500).json({ error: 'Email verification failed', code: 'INTERNAL' });
  }
});

// Повторная отправка email подтверждения
app.post('/api/resend-verification', authLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email required', code: 'VALIDATION_ERROR' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email_verified FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }

    const user = result.rows[0];
    
    if (user.email_verified) {
      return res.status(400).json({ error: 'Email is already verified', code: 'ALREADY_VERIFIED' });
    }

    // Генерируем новый токен
    const verificationToken = generateVerificationToken();
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 часа

    await pool.query(
      'UPDATE users SET verification_token = $1, verification_token_expires = $2 WHERE id = $3',
      [verificationToken, tokenExpires, user.id]
    );

    // Отправляем email подтверждения
    const emailSent = await sendVerificationEmail(email, verificationToken);
    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to send verification email', code: 'INTERNAL' });
    }

    res.json({ message: 'Verification email sent successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Resend verification error:');
    res.status(500).json({ error: 'Failed to resend verification email', code: 'INTERNAL' });
  }
});

app.post('/api/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required', code: 'VALIDATION_ERROR' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    const user = result.rows[0];
    // Strava-only accounts have no password_hash — bcrypt.compare(x, null) throws (500).
    // Same 401 as a wrong password so the response doesn't reveal account type.
    const match = user.password_hash ? await bcrypt.compare(password, user.password_hash) : false;
    if (!match) return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    
    // Проверяем верификацию email
    if (!user.email_verified) {
      return res.status(403).json({ 
        error: 'Email not verified. Please check your email and click the verification link.',
        needsVerification: true
      });
    }
    
    // ВАЖНО: включаем strava_id, name, avatar!
    const token = issueSessionToken(user);
    res.json({ token, user: { id: user.id, email: user.email, created_at: user.created_at } });
  } catch (e) {
    logger.error({ err: e }, 'Login error:');
    res.status(500).json({ error: 'Login failed', code: 'INTERNAL' });
  }
});

// === Защита всех /api маршрутов ===
// app.use('/api', authMiddleware); // Убираем глобальную защиту, используем индивидуальную

// --- NEW: checklist endpoints using DB and userId ---

// Get all checklist items for current user
app.get('/api/checklist', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const result = await pool.query(
    'SELECT * FROM checklist WHERE user_id = $1 ORDER BY section, id',
    [userId]
  );
  res.json(result.rows);
});

// Add a checklist item for current user
app.post('/api/checklist', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const { section, item, checked } = req.body;
  const result = await pool.query(
    'INSERT INTO checklist (user_id, section, item, checked) VALUES ($1, $2, $3, $4) RETURNING *',
    [userId, section, item, checked ?? false]
  );
  res.json(result.rows[0]);
});

// Update a checklist item (e.g., mark as checked)
app.put('/api/checklist/:id', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const { checked, link } = req.body;
  
  let query, params;
  if (link !== undefined) {
    // Обновляем ссылку
    query = 'UPDATE checklist SET link = $1 WHERE id = $2 AND user_id = $3 RETURNING *';
    params = [link, id, userId];
  } else {
    // Обновляем статус checked
    query = 'UPDATE checklist SET checked = $1 WHERE id = $2 AND user_id = $3 RETURNING *';
    params = [checked, id, userId];
  }
  
  const result = await pool.query(query, params);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found', code: 'ITEM_NOT_FOUND' });
  res.json(result.rows[0]);
});

// Delete a checklist item
app.delete('/api/checklist/:id', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const result = await pool.query(
    'DELETE FROM checklist WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, userId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found', code: 'ITEM_NOT_FOUND' });
  res.json({ success: true });
});

// Delete a checklist section (all items in the section)
app.delete('/api/checklist/section/:section', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const { section } = req.params;
  
  // Декодируем название секции (двойное кодирование)
  const decodedSection = decodeURIComponent(decodeURIComponent(section));
  
  const result = await pool.query(
    'DELETE FROM checklist WHERE section = $1 AND user_id = $2 RETURNING *',
    [decodedSection, userId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Section not found', code: 'SECTION_NOT_FOUND' });
  res.json({ success: true, deletedCount: result.rows.length });
});

// --- NEW: Personal Goals endpoints ---

// Get all goals for current user
app.get('/api/goals', authMiddleware, async (req, res) => {
  const userId = req.user.userId;

  const result = await pool.query(
    'SELECT * FROM goals WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );

  // Progress is computed fresh here now (goalCalculator.js), not read
  // stale off the current_value column — same universal calculator used by
  // the coach's get_goals_progress tool, so both surfaces agree. Client-side
  // recomputation (goalsCache.ts's calculateGoalProgress) becomes redundant
  // for activity/skills-source goals once the client trusts this field; kept
  // as a fallback there for 'health'-source goals only (see
  // md/GOALS_REDESIGN_PLAN_FINAL.md §2.1 — health data is client-only and
  // can't be computed here).
  let activities = [];
  try {
    activities = await stravaActivities.getActivities(userId);
  } catch (err) {
    if (!(err instanceof stravaTokens.StravaNotLinkedError)) {
      logger.warn('[goals] could not load activities:', err.message);
    }
  }
  const [profileResult, skillsResult] = await Promise.all([
    pool.query('SELECT * FROM user_profiles WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM skills_history WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 1', [userId]),
  ]);
  const userProfile = profileResult.rows[0] || null;
  const skillsSnapshot = skillsResult.rows[0] || null;

  const goalsWithProgress = result.rows.map((g) => {
    const current_value = goalCalculator.calculateProgress(g, {
      activities,
      skillsSnapshot,
      userProfile,
      legacyCalculator: calculateGoalProgress,
    });
    const target = Number(g.target_value) || 1;
    return {
      ...g,
      current_value,
      percent: Math.round(Math.min((Number(current_value) / target) * 100, 100)),
      pace: goalCalculator.addPaceData({ ...g, current_value }),
    };
  });

  res.json(goalsWithProgress);
});

// Add a new goal for current user
app.post('/api/goals', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { title, description, target_value, current_value, unit, goal_type, period, hr_threshold, duration_threshold, meta_goal_id } = req.body;
    
    logger.debug('📝 Creating goal for user:', userId);
    logger.debug('📝 Received meta_goal_id:', meta_goal_id);
    
    // Валидация числовых полей - конвертируем пустые строки в 0 для создания
    const validatedTargetValue = (target_value === '' || target_value === null || target_value === undefined) ? 0 : Number(target_value);
    const validatedCurrentValue = (current_value === '' || current_value === null || current_value === undefined) ? 0 : Number(current_value);
    const validatedHrThreshold = (hr_threshold === '' || hr_threshold === null || hr_threshold === undefined) ? 160 : Number(hr_threshold);
    const validatedDurationThreshold = (duration_threshold === '' || duration_threshold === null || duration_threshold === undefined) ? 120 : Number(duration_threshold);
    const validatedMetaGoalId = meta_goal_id || null;

    logger.debug('✅ Validated meta_goal_id:', validatedMetaGoalId);

    // A goal must only be attached to a meta-goal the caller actually owns —
    // otherwise any user could dangle a goal off someone else's meta-goal id.
    if (validatedMetaGoalId) {
      const metaGoalCheck = await pool.query(
        'SELECT 1 FROM meta_goals WHERE id = $1 AND user_id = $2',
        [validatedMetaGoalId, userId]
      );
      if (metaGoalCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Meta goal not found', code: 'META_GOAL_NOT_FOUND' });
      }
    }

    // Вычисляем VO2max для FTP целей
    let vo2maxValue = null;
    if (goal_type === 'ftp_vo2max') {
      vo2maxValue = await calculateVO2maxForPeriod(userId, period || '4w');
      // Saving FTP goal with calculated VO2max
    }
    
    const result = await pool.query(
      'INSERT INTO goals (user_id, title, description, target_value, current_value, unit, goal_type, period, hr_threshold, duration_threshold, vo2max_value, meta_goal_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *',
      [userId, title, description, validatedTargetValue, validatedCurrentValue, unit, goal_type, period || '4w', validatedHrThreshold, validatedDurationThreshold, vo2maxValue, validatedMetaGoalId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error creating goal:');
    res.status(500).json({ error: 'Failed to create goal', code: 'INTERNAL' });
  }
});

// Update a goal
app.put('/api/goals/:id', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const { title, description, target_value, current_value, unit, goal_type, period, hr_threshold, duration_threshold } = req.body;
  
  // Логирование для avg_hr_hills (только при отладке)
  // if (goal_type === 'avg_hr_hills') {
  //   logger.debug('🟡 API PUT /api/goals/:id - Saving avg_hr_hills:', {
  //     goalId: id,
  //     current_value,
  //     userId
  //   });
  // }
  
  try {
    // Получаем текущую цель из базы данных
    const currentGoalResult = await pool.query(
      'SELECT * FROM goals WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (currentGoalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Goal not found', code: 'GOAL_NOT_FOUND' });
    }
    
    const currentGoal = currentGoalResult.rows[0];
    
    // Собираем данные для обновления, используя существующие значения как fallback
    const updateData = {
      title: title !== undefined ? title : currentGoal.title,
      description: description !== undefined ? description : currentGoal.description,
      target_value: target_value !== undefined ? (target_value === '' || target_value === null ? 0 : Number(target_value)) : currentGoal.target_value,
      current_value: current_value !== undefined ? (current_value === '' || current_value === null ? 0 : Number(current_value)) : currentGoal.current_value,
      unit: unit !== undefined ? unit : currentGoal.unit,
      goal_type: goal_type !== undefined ? goal_type : currentGoal.goal_type,
      period: period !== undefined ? period : currentGoal.period,
      hr_threshold: hr_threshold !== undefined ? (hr_threshold === '' || hr_threshold === null ? 160 : Number(hr_threshold)) : currentGoal.hr_threshold,
      duration_threshold: duration_threshold !== undefined ? (duration_threshold === '' || duration_threshold === null ? 120 : Number(duration_threshold)) : currentGoal.duration_threshold
    };
    
    // Пересчитываем VO2max для FTP целей при обновлении
    let vo2maxValue = currentGoal.vo2max_value; // По умолчанию оставляем старое значение
    
    if (updateData.goal_type === 'ftp_vo2max') {
      // Пересчитываем VO2max если изменился период или если его не было
      const periodChanged = updateData.period !== currentGoal.period;
      const noExistingVO2max = !currentGoal.vo2max_value;
      
      if (periodChanged || noExistingVO2max) {
        vo2maxValue = await calculateVO2maxForPeriod(userId, updateData.period);
        // VO2max recalculated for updated FTP goal
      }
    } else {
      // Если тип цели изменился с FTP на другой, очищаем VO2max
      if (currentGoal.goal_type === 'ftp_vo2max') {
        vo2maxValue = null;
        logger.debug(`🗑️ Clearing VO2max value - goal type changed from ftp_vo2max to ${updateData.goal_type}`);
      }
    }
    
    const result = await pool.query(
      'UPDATE goals SET title = $1, description = $2, target_value = $3, current_value = $4, unit = $5, goal_type = $6, period = $7, hr_threshold = $8, duration_threshold = $9, vo2max_value = $10, updated_at = NOW() WHERE id = $11 AND user_id = $12 RETURNING *',
      [updateData.title, updateData.description, updateData.target_value, updateData.current_value, updateData.unit, updateData.goal_type, updateData.period, updateData.hr_threshold, updateData.duration_threshold, vo2maxValue, id, userId]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, 'Error updating goal:');
    res.status(500).json({ error: 'Failed to update goal', code: 'INTERNAL' });
  }
});

// Recalculate VO2max for specific FTP goal
app.post('/api/goals/recalc-vo2max/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { period } = req.body;
    
    // Проверяем, что цель существует и принадлежит пользователю
    const goalResult = await pool.query(
      'SELECT * FROM goals WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (goalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Goal not found', code: 'GOAL_NOT_FOUND' });
    }
    
    const goal = goalResult.rows[0];
    
    // Проверяем, что это FTP цель
    if (goal.goal_type !== 'ftp_vo2max') {
      return res.status(400).json({ error: 'This endpoint is only for FTP/VO2max goals', code: 'BAD_REQUEST' });
    }
    
    // Пересчитываем VO₂max

    const newVO2max = await calculateVO2maxForPeriod(userId, period || goal.period);
    
    if (newVO2max === null) {
      logger.error(`❌ VO₂max calculation returned null for user ${userId}, goal ${id}, period: ${period || goal.period}`);
      return res.status(500).json({ error: 'Failed to calculate VO₂max', code: 'INTERNAL' });
    }
    
  
    
    // Обновляем значение в базе данных
    const updateResult = await pool.query(
      'UPDATE goals SET vo2max_value = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *',
      [newVO2max, id, userId]
    );
    

    
    res.json({
      success: true,
      goal_id: id,
      old_vo2max: goal.vo2max_value,
      vo2max_value: newVO2max,
      updated_goal: updateResult.rows[0]
    });
    
  } catch (error) {
    logger.error({ err: error }, 'Error recalculating VO₂max:');
    res.status(500).json({ error: 'Failed to recalculate VO₂max', code: 'INTERNAL' });
  }
});

// Delete a goal
app.delete('/api/goals/:id', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  
  const result = await pool.query(
    'DELETE FROM goals WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, userId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Goal not found', code: 'GOAL_NOT_FOUND' });
  res.json({ success: true });
});

// --- Meta Goals endpoints ---

// Get all meta goals for current user
app.get('/api/meta-goals', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await pool.query(
      'SELECT * FROM meta_goals WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    
    // Derive tier for goals that don't have one yet
    const needsTier = result.rows.filter(mg => !mg.tier || mg.tier === 'base');
    let subGoalsByMeta = new Map();
    if (needsTier.length > 0) {
      const ids = needsTier.map(mg => mg.id);
      const sgResult = await pool.query(
        'SELECT meta_goal_id, goal_type, target_value, period FROM goals WHERE meta_goal_id = ANY($1::int[]) AND user_id = $2',
        [ids, userId]
      );
      for (const sg of sgResult.rows) {
        if (!subGoalsByMeta.has(sg.meta_goal_id)) subGoalsByMeta.set(sg.meta_goal_id, []);
        subGoalsByMeta.get(sg.meta_goal_id).push(sg);
      }
    }

    const metaGoalsWithTrainings = result.rows.map(metaGoal => {
      let trainingTypes = [];
      
      if (metaGoal.ai_context) {
        try {
          const aiContext = typeof metaGoal.ai_context === 'string' 
            ? JSON.parse(metaGoal.ai_context) 
            : metaGoal.ai_context;
          
          trainingTypes = aiContext.trainingTypes || [];
        } catch (e) {
          // Old format — no trainingTypes
        }
      }

      let tier = metaGoal.tier || 'base';
      
      return {
        ...metaGoal,
        tier: tier || 'base',
        trainingTypes
      };
    });
    
    res.json(metaGoalsWithTrainings);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching meta goals:');
    res.status(500).json({ error: 'Failed to fetch meta goals', code: 'INTERNAL' });
  }
});

// Get single meta goal with sub-goals
app.get('/api/meta-goals/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    
    // Получаем мета-цель
    const metaGoalResult = await pool.query(
      'SELECT * FROM meta_goals WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (metaGoalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Meta goal not found', code: 'META_GOAL_NOT_FOUND' });
    }
    
    // Получаем подцели
    const subGoalsResult = await pool.query(
      'SELECT * FROM goals WHERE meta_goal_id = $1 AND user_id = $2 ORDER BY priority ASC, created_at DESC',
      [id, userId]
    );

    // Свежий progress через тот же universal calculator, что и /api/goals и
    // get_goals_progress — иначе GoalDetailsScreen (читает этот endpoint) и
    // MetaGoalCard (читает /api/goals) будут показывать разные числа.
    let activities = [];
    try {
      activities = await stravaActivities.getActivities(userId);
    } catch (err) {
      if (!(err instanceof stravaTokens.StravaNotLinkedError)) {
        logger.warn('[meta-goals] could not load activities:', err.message);
      }
    }
    const [profileResult, skillsResult] = await Promise.all([
      pool.query('SELECT * FROM user_profiles WHERE user_id = $1', [userId]),
      pool.query('SELECT * FROM skills_history WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 1', [userId]),
    ]);
    const userProfile = profileResult.rows[0] || null;
    const skillsSnapshot = skillsResult.rows[0] || null;

    const subGoalsWithProgress = subGoalsResult.rows.map((g) => {
      const current_value = goalCalculator.calculateProgress(g, {
        activities,
        skillsSnapshot,
        userProfile,
        legacyCalculator: calculateGoalProgress,
      });
      const target = Number(g.target_value) || 1;
      return {
        ...g,
        current_value,
        percent: Math.round(Math.min((Number(current_value) / target) * 100, 100)),
        pace: goalCalculator.addPaceData({ ...g, current_value }),
      };
    });

    // Парсим ai_context для извлечения trainingTypes
    const metaGoal = metaGoalResult.rows[0];
    let trainingTypes = [];

    if (metaGoal.ai_context) {
      try {
        // Пытаемся распарсить как JSON (новый формат)
        const aiContext = typeof metaGoal.ai_context === 'string'
          ? JSON.parse(metaGoal.ai_context)
          : metaGoal.ai_context;

        trainingTypes = aiContext.trainingTypes || [];
      } catch (e) {
        // Старый формат (просто строка) - игнорируем, trainingTypes = []
        // Это нормально для целей, созданных до обновления
      }
    }

    const readyToComplete = subGoalsWithProgress.length > 0
      && subGoalsWithProgress.every(g => Number(g.current_value) >= Number(g.target_value) * 0.98)
      && metaGoal.status === 'active';

    res.json({
      metaGoal: {
        ...metaGoal,
        trainingTypes,
        readyToComplete,
      },
      subGoals: subGoalsWithProgress
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching meta goal:');
    res.status(500).json({ error: 'Failed to fetch meta goal', code: 'INTERNAL' });
  }
});

// Create meta goal manually
app.post('/api/meta-goals', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { title, description, target_date, ai_generated = false, ai_context = null } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required', code: 'VALIDATION_ERROR' });
    }
    
    const result = await pool.query(
      `INSERT INTO meta_goals (user_id, title, description, target_date, ai_generated, ai_context, status) 
       VALUES ($1, $2, $3, $4, $5, $6, 'active') 
       RETURNING *`,
      [userId, title, description, target_date || null, ai_generated, ai_context]
    );
    
    logger.debug('✅ Meta goal created:', result.rows[0].id, title);
    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error creating meta goal:');
    res.status(500).json({ error: 'Failed to create meta goal', code: 'INTERNAL' });
  }
});

// Функция для расчета прогресса цели на основе активностей
function calculateGoalProgress(goal, activities, userProfile = null) {
  const periodActivities = activities.filter(a => {
    const activityDate = new Date(a.start_date);
    const now = new Date();
    
    const periodDays = {
      '4w': 28,
      '3m': 92,
      'year': 365,
      'all': Infinity
    };
    
    const days = periodDays[goal.period] || 28;
    if (days === Infinity) return true;
    
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return activityDate >= startDate;
  });
  
  if (periodActivities.length === 0) return 0;
  
  switch (goal.goal_type) {
    case 'distance': {
      const totalDistance = periodActivities.reduce((sum, a) => sum + (a.distance || 0), 0) / 1000;
      return parseFloat(totalDistance.toFixed(2));
    }
    
    case 'elevation': {
      const totalElevation = periodActivities.reduce((sum, a) => sum + (a.total_elevation_gain || 0), 0);
      return Math.round(totalElevation);
    }
    
    case 'time': {
      const totalTime = periodActivities.reduce((sum, a) => sum + (a.moving_time || 0), 0) / 3600;
      return parseFloat(totalTime.toFixed(1));
    }
    
    case 'long_rides': {
      const longRides = periodActivities.filter(a => 
        (a.distance || 0) > 50000 || 
        (a.moving_time || 0) > 2.5 * 3600
      ).length;
      return longRides;
    }
    
    case 'speed_flat': {
      const flatRides = periodActivities.filter(a => {
        const distance = a.distance || 0;
        const elevation = a.total_elevation_gain || 0;
        return distance > 3000 && elevation < distance * 0.02 && elevation < 500;
      });
      if (flatRides.length === 0) return 0;
      const speeds = flatRides.map(a => (a.average_speed || 0) * 3.6);
      const avgSpeed = speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
      return parseFloat(avgSpeed.toFixed(1));
    }
    
    case 'speed_hills': {
      const hillRides = periodActivities.filter(a => {
        const distance = a.distance || 0;
        const elevation = a.total_elevation_gain || 0;
        const speed = (a.average_speed || 0) * 3.6;
        return distance > 3000 && (elevation >= distance * 0.015 || elevation >= 500) && speed < 25;
      });
      if (hillRides.length === 0) return 0;
      const hillSpeeds = hillRides.map(a => (a.average_speed || 0) * 3.6);
      const avgHillSpeed = hillSpeeds.reduce((sum, speed) => sum + speed, 0) / hillSpeeds.length;
      return parseFloat(avgHillSpeed.toFixed(1));
    }
    
    case 'avg_power': {
      const powerActivities = periodActivities.filter(a => a.distance > 1000);
      if (powerActivities.length === 0) return 0;
      
      // Физические константы
      const GRAVITY = 9.81;
      const AIR_DENSITY_SEA_LEVEL = 1.225;
      const CD_A = 0.4;
      const CRR = 0.005;
      
      // Вес из профиля или значения по умолчанию
      const RIDER_WEIGHT = parseFloat(userProfile?.weight) || 75;
      const BIKE_WEIGHT = parseFloat(userProfile?.bike_weight) || 8;
      const totalWeight = RIDER_WEIGHT + BIKE_WEIGHT;
      
      // Функция расчета плотности воздуха
      const calculateAirDensity = (temperature, elevation) => {
        const tempK = temperature ? temperature + 273.15 : 288.15;
        const heightM = elevation || 0;
        const pressureAtHeight = 101325 * Math.exp(-heightM / 7400);
        const R = 287.05;
        return pressureAtHeight / (R * tempK);
      };
      
      // Расчет мощности для каждой активности
      const powerValues = powerActivities.map(activity => {
        const distance = parseFloat(activity.distance) || 0;
        const time = parseFloat(activity.moving_time) || 0;
        const elevationGain = parseFloat(activity.total_elevation_gain) || 0;
        const averageSpeed = parseFloat(activity.average_speed) || 0;
        const temperature = activity.average_temp;
        const maxElevation = activity.elev_high;
        
        const airDensity = calculateAirDensity(temperature, maxElevation);
        
        if (distance <= 0 || time <= 0 || averageSpeed <= 0) return 0;
        
        const averageGrade = elevationGain / distance;
        let gravityPower = totalWeight * GRAVITY * averageGrade * averageSpeed;
        const rollingPower = CRR * totalWeight * GRAVITY * averageSpeed;
        const aeroPower = 0.5 * airDensity * CD_A * Math.pow(averageSpeed, 3);
        
        let totalPower = rollingPower + aeroPower;
        
        if (averageGrade > 0) {
          totalPower += gravityPower;
        } else {
          totalPower += gravityPower;
          const minPowerOnDescent = 20;
          totalPower = Math.max(minPowerOnDescent, totalPower);
        }
        
        return isNaN(totalPower) || totalPower < 0 || totalPower > 10000 ? 0 : totalPower;
      }).filter(power => power > 0);
      
      if (powerValues.length === 0) return 0;
      return Math.round(powerValues.reduce((sum, power) => sum + power, 0) / powerValues.length);
    }
    
    case 'cadence': {
      const activitiesWithCadence = periodActivities.filter(a => a.average_cadence && a.average_cadence > 0);
      if (activitiesWithCadence.length === 0) return 0;
      const cadenceValues = activitiesWithCadence.map(a => a.average_cadence);
      return Math.round(cadenceValues.reduce((sum, cadence) => sum + cadence, 0) / cadenceValues.length);
    }
    
    case 'pulse': {
      const pulseActivities = periodActivities.filter(a => a.average_heartrate && a.average_heartrate > 0);
      if (pulseActivities.length === 0) return 0;
      const totalPulse = pulseActivities.reduce((sum, a) => sum + (a.average_heartrate || 0), 0);
      return Math.round(totalPulse / pulseActivities.length);
    }
    
    case 'avg_hr_flat': {
      const flatPulseActivities = periodActivities.filter(a => {
        const distance = a.distance || 0;
        const elevation = a.total_elevation_gain || 0;
        return distance > 3000 && elevation < distance * 0.02 && elevation < 500 && a.average_heartrate && a.average_heartrate > 0;
      });
      if (flatPulseActivities.length === 0) return 0;
      const flatAvgHR = flatPulseActivities.reduce((sum, a) => sum + (a.average_heartrate || 0), 0) / flatPulseActivities.length;
      return Math.round(flatAvgHR);
    }
    
    case 'avg_hr_hills': {
      const hillPulseActivities = periodActivities.filter(a => {
        const distance = a.distance || 0;
        const elevation = a.total_elevation_gain || 0;
        return distance > 3000 && (elevation >= distance * 0.02 || elevation >= 500) && a.average_heartrate && a.average_heartrate > 0;
      });
      if (hillPulseActivities.length === 0) return 0;
      const hillAvgHR = hillPulseActivities.reduce((sum, a) => sum + (a.average_heartrate || 0), 0) / hillPulseActivities.length;
      return Math.round(hillAvgHR);
    }
    
    case 'recovery': {
      const recoveryRides = periodActivities.filter(a => ['Ride', 'VirtualRide'].includes(a.type) && (a.average_speed || 0) * 3.6 < 20);
      return recoveryRides.length;
    }
    
    case 'intervals': {
      // Intervals умышленно не считаются автоматически
      return 0;
    }
    
    default:
      return 0;
  }
}

// AI Generate meta goal and sub-goals
app.post('/api/meta-goals/ai-generate', authMiddleware, aiLimiter, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { userGoalDescription } = req.body;
    
    if (!userGoalDescription) {
      return res.status(400).json({ error: 'Goal description is required', code: 'VALIDATION_ERROR' });
    }
    
    logger.debug('🤖 AI Generation started for user:', userId);
    logger.debug('📝 Goal description:', userGoalDescription);
    
    // Получаем профиль пользователя
    const profileResult = await pool.query(
      'SELECT * FROM user_profiles WHERE user_id = $1',
      [userId]
    );
    const userProfile = profileResult.rows[0] || {};
    
    // Получаем активности (кэш/БД/Strava)
    let activities = [];
    try {
      activities = await stravaActivities.getActivities(userId);
      logger.debug(`📊 Using ${activities.length} activities`);
    } catch (stravaError) {
      if (!(stravaError instanceof stravaTokens.StravaNotLinkedError)) {
        logger.warn('Could not load activities from Strava:', stravaError.message);
      }
    }
    
    // Фильтруем только последние 3 месяца
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const recentActivities = activities.filter(a => {
      const activityDate = new Date(a.start_date);
      return activityDate >= threeMonthsAgo;
    });
    
    // Вычисляем статистику
    const recentStats = calculateRecentStats(recentActivities, '3m');
    
    // 📈 Анализируем тренды и производительность (локально, без API calls)
    const trends = analyzePerformanceTrends(recentActivities);
    const analysis = identifyStrengthsAndWeaknesses(recentActivities, userProfile);
    
    logger.debug('📊 User stats:', {
      experience: userProfile.experience_level,
      workouts: userProfile.workouts_per_week,
      avgDistance: recentStats.avgDistance,
      totalRides: recentStats.totalRides,
      distanceTrend: trends.distanceTrend?.direction,
      strengthsCount: analysis.strengths?.length,
      weaknessesCount: analysis.weaknesses?.length
    });
    
    // Existing active goals — fed into the prompt so the model doesn't
    // propose a near-duplicate sub-goal under a new meta-goal (advisory
    // only, see aiGoals.js's existingGoalsBlock).
    const existingGoalsResult = await pool.query(
      `SELECT mg.id, mg.title, mg.focus_tags, mg.target_date,
              g.title AS sub_title, g.metric, g.target_value, g.unit
       FROM meta_goals mg
       LEFT JOIN goals g ON g.meta_goal_id = mg.id
       WHERE mg.user_id = $1 AND mg.status = 'active'
       ORDER BY mg.id`,
      [userId]
    );
    const existingGoalsMap = new Map();
    for (const row of existingGoalsResult.rows) {
      if (!existingGoalsMap.has(row.id)) {
        existingGoalsMap.set(row.id, { title: row.title, focus_tags: row.focus_tags || [], target_date: row.target_date, subGoals: [] });
      }
      if (row.sub_title) {
        existingGoalsMap.get(row.id).subGoals.push({ title: row.sub_title, metric: row.metric, target_value: row.target_value, unit: row.unit });
      }
    }
    const existingGoals = Array.from(existingGoalsMap.values());

    // Генерируем цели через AI с расширенным контекстом
    const aiResponse = await generateGoalsWithAI(
      userGoalDescription,
      userProfile,
      recentStats,
      trends,
      analysis,
      existingGoals
    );
    
    logger.debug('✅ AI generated:', {
      metaGoalTitle: aiResponse.metaGoal.title,
      subGoalsCount: aiResponse.subGoals.length,
      trainingTypesCount: aiResponse.metaGoal.trainingTypes?.length || 0
    });
    
    // Подготавливаем AI context с trainingTypes
    const aiContext = JSON.stringify({
      userGoal: userGoalDescription,
      trainingTypes: aiResponse.metaGoal.trainingTypes || []
    });
    
    const aiTier = aiResponse.metaGoal?.tier || aiResponse.tier;
    const tier = ['legendary', 'epic', 'grand', 'base'].includes(aiTier) ? aiTier : 'base';
    logger.debug(`🏷️ Tier classification: AI returned "${aiTier}" (metaGoal.tier=${aiResponse.metaGoal?.tier}, root.tier=${aiResponse.tier}), stored as "${tier}"`);

    const metaGoalResult = await pool.query(
      `INSERT INTO meta_goals (user_id, title, description, target_date, ai_generated, ai_context, status, tier) 
       VALUES ($1, $2, $3, $4, true, $5, 'active', $6) 
       RETURNING *`,
      [
        userId,
        aiResponse.metaGoal.title,
        aiResponse.metaGoal.description,
        aiResponse.metaGoal.target_date || null,
        aiContext,
        tier
      ]
    );
    
    const metaGoal = metaGoalResult.rows[0];
    logger.debug('✅ Meta goal created:', metaGoal.id);
    
    // Создаем подцели
    const createdSubGoals = [];
    for (const subGoal of aiResponse.subGoals) {
      // Валидация для FTP целей
      let targetValue = subGoal.target_value;
      if (subGoal.goal_type === 'ftp_vo2max') {
        targetValue = 0; // Для FTP целей используем 0 вместо null (target_value будет обновлен позже из vo2max_value)
        
        // Вычисляем VO2max для FTP целей
        const vo2maxValue = await calculateVO2maxForPeriod(userId, subGoal.period || '4w');
        
        const subGoalResult = await pool.query(
          `INSERT INTO goals (
            user_id, meta_goal_id, title, description, target_value, current_value, 
            unit, goal_type, period, hr_threshold, duration_threshold, vo2max_value, 
            priority, reasoning
          ) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10, $11, $12, $13) 
          RETURNING *`,
          [
            userId,
            metaGoal.id,
            subGoal.title,
            subGoal.description,
            targetValue,
            subGoal.unit,
            subGoal.goal_type,
            subGoal.period || '4w',
            subGoal.hr_threshold || 160,
            subGoal.duration_threshold || 120,
            vo2maxValue,
            subGoal.priority || 3,
            subGoal.reasoning || ''
          ]
        );
        createdSubGoals.push(subGoalResult.rows[0]);
      } else {
        // Обычные цели — новые несут `metric`/`source`/start_date/end_date
        // вместо goal_type/period (см. md/GOALS_REDESIGN_PLAN_FINAL.md).
        // goal_type/period оставляем NULL для новых целей — goalCalculator.js
        // ветвится по `metric IS NULL`, а не по наличию goal_type/period.
        const subGoalResult = await pool.query(
          `INSERT INTO goals (
            user_id, meta_goal_id, title, description, target_value, current_value,
            unit, goal_type, period, source, metric, start_date, end_date, priority, reasoning
          ) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING *`,
          [
            userId,
            metaGoal.id,
            subGoal.title,
            subGoal.description,
            targetValue || 0,
            subGoal.unit,
            subGoal.goal_type || null,
            subGoal.period || null,
            subGoal.metric?.source || null,
            subGoal.metric ? JSON.stringify(subGoal.metric) : null,
            subGoal.start_date || null,
            subGoal.end_date || null,
            subGoal.priority || 3,
            subGoal.reasoning || ''
          ]
        );
        createdSubGoals.push(subGoalResult.rows[0]);
      }
    }

    logger.debug(`✅ Created ${createdSubGoals.length} sub-goals`);

    // Пересчитываем прогресс для созданных целей — goalCalculator.js
    // покрывает новые metric-based цели, calculateGoalProgress остаётся
    // legacy fallback для целей без metric (goalCalculator ветвится сам).
    logger.debug('🔄 Recalculating progress for newly created goals...');
    const skillsForNewGoals = await pool.query(
      'SELECT * FROM skills_history WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 1',
      [userId]
    );
    const skillsSnapshotForNewGoals = skillsForNewGoals.rows[0] || null;
    for (const goal of createdSubGoals) {
      try {
        const currentValue = goalCalculator.calculateProgress(goal, {
          activities,
          skillsSnapshot: skillsSnapshotForNewGoals,
          userProfile,
          legacyCalculator: calculateGoalProgress,
        });

        // Обновляем цель с рассчитанным прогрессом
        await pool.query(
          'UPDATE goals SET current_value = $1, updated_at = NOW() WHERE id = $2',
          [currentValue || 0, goal.id]
        );

        logger.debug(`✅ Updated progress for goal "${goal.title}": ${currentValue}`);
      } catch (progressError) {
        logger.warn(`⚠️ Could not calculate progress for goal ${goal.id}:`, progressError.message);
      }
    }
    
    // Перезагружаем цели с обновленным прогрессом
    const updatedGoals = await pool.query(
      'SELECT * FROM goals WHERE meta_goal_id = $1 AND user_id = $2 ORDER BY priority ASC',
      [metaGoal.id, userId]
    );
    
    // Возвращаем полный результат
    res.json({
      metaGoal,
      subGoals: updatedGoals.rows,
      timeline: aiResponse.timeline,
      mainFocus: aiResponse.mainFocus
    });
    
  } catch (error) {
    logger.error({ err: error }, '❌ Error in AI goal generation:');
    res.status(500).json({ error: 'Failed to generate goals', code: 'INTERNAL' });
  }
});

// Update meta goal
app.put('/api/meta-goals/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { title, description, target_date, status } = req.body;
    
    const result = await pool.query(
      `UPDATE meta_goals 
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           target_date = COALESCE($3, target_date),
           status = COALESCE($4, status),
           updated_at = NOW()
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [title, description, target_date, status, id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meta goal not found', code: 'META_GOAL_NOT_FOUND' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error updating meta goal:');
    res.status(500).json({ error: 'Failed to update meta goal', code: 'INTERNAL' });
  }
});

// Delete meta goal (cascade deletes sub-goals)
app.delete('/api/meta-goals/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM meta_goals WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meta goal not found', code: 'META_GOAL_NOT_FOUND' });
    }
    
    logger.debug('🗑️ Meta goal deleted:', id);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting meta goal:');
    res.status(500).json({ error: 'Failed to delete meta goal', code: 'INTERNAL' });
  }
});

// ========================================
// AI COACH — conversational chat (SSE + function calling)
// ========================================
// Tool schemas, the system prompt, and tool execution all live in aiCoach.js
// (see `coach` instantiated near the caches above). This block only owns:
// HTTP/SSE plumbing, conversation persistence, and the tool-calling loop.

function sseSend(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

// List conversations for the current user
app.get('/api/coach/conversations', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await pool.query(
      `SELECT c.*, (SELECT COUNT(*) FROM coach_messages m WHERE m.conversation_id = c.id) AS message_count
       FROM coach_conversations c
       WHERE c.user_id = $1
       ORDER BY c.updated_at DESC
       LIMIT 50`,
      [userId]
    );
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error listing coach conversations:');
    res.status(500).json({ error: 'Failed to list conversations', code: 'INTERNAL' });
  }
});

// Find an existing conversation that already analyzed this Strava activity,
// if any — lets "Discuss with Coach" (RideAnalyticsScreen) re-open the same
// thread instead of spawning a new duplicate every time it's tapped for a
// ride the rider already discussed. Returns `null` (not 404) when there's
// no match — that's the expected/common case, not an error.
app.get('/api/coach/conversations/by-activity/:activityId', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const activityId = req.params.activityId;
    const result = await pool.query(
      `SELECT id, title, created_at, updated_at FROM coach_conversations
       WHERE user_id = $1 AND activity_id = $2
       ORDER BY updated_at DESC LIMIT 1`,
      [userId, activityId]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    logger.error({ err: error }, 'Error checking for existing analysis conversation:');
    res.status(500).json({ error: 'Failed to check for existing conversation', code: 'INTERNAL' });
  }
});

// Get one conversation with its full message history
app.get('/api/coach/conversations/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const convResult = await pool.query(
      'SELECT * FROM coach_conversations WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' });
    }
    const messagesResult = await pool.query(
      'SELECT * FROM coach_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [id]
    );
    res.json({ conversation: convResult.rows[0], messages: messagesResult.rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching coach conversation:');
    res.status(500).json({ error: 'Failed to fetch conversation', code: 'INTERNAL' });
  }
});

// Delete a conversation (cascades to messages)
app.delete('/api/coach/conversations/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM coach_conversations WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting coach conversation:');
    res.status(500).json({ error: 'Failed to delete conversation', code: 'INTERNAL' });
  }
});

// Fixed labels per get_activity_analysis detail angle — deterministic and
// always offered when the data exists, rather than left up to the
// suggestion-generation LLM call (see below). Module-level so both the
// "has the rider already asked for this one?" check and the suggestion
// builder use the exact same strings.
const DETAIL_LABELS = {
  vs_baseline: { en: 'Compare to average', ru: 'Сравнить со средним' },
  similar_ride: { en: 'Similar ride comparison', ru: 'Сравнить с похожим райдом' },
  skills_delta: { en: 'Skills change', ru: 'Изменение навыков' },
};
const DETAIL_LABEL_TO_TYPE = {};
for (const [type, langs] of Object.entries(DETAIL_LABELS)) {
  DETAIL_LABEL_TO_TYPE[langs.en] = type;
  DETAIL_LABEL_TO_TYPE[langs.ru] = type;
}

// Fixed bilingual label for the "Connect Apple Health" suggestion chip —
// see suggestedConnectHealth below. Deliberately NOT added to
// DETAIL_LABEL_TO_TYPE: that map exists to recognize app-generated `detail`
// chips the rider already tapped (to avoid re-offering them), but this chip
// has an `action`, not a `detail`, and re-tapping it just re-opens
// AppleHealthScreen — nothing to dedupe against.
const CONNECT_HEALTH_LABEL = { en: 'Connect Apple Health', ru: 'Подключить Apple Health' };

// Main chat endpoint — SSE stream of tokens / tool calls / suggestions / done
app.post('/api/coach/chat', authMiddleware, aiLimiter, async (req, res) => {
  const userId = req.user.userId;
  let { messages: clientMessages, conversation_id: incomingConversationId, health_context: healthContext } = req.body || {};

  logger.debug(`[coach] ▶ request from user ${userId}, ${clientMessages?.length || 0} messages, conv=${incomingConversationId || 'new'}`);
  // NEVER log `healthContext` itself here or anywhere else in this route —
  // it's on-device Apple Health data that must never touch server logs or
  // Postgres (see src/utils/healthService.ts + APPLE_HEALTH_SPEC.md §9).
  // It's used exactly once below, to build this turn's system prompt, and
  // then discarded along with the rest of the request.

  if (!Array.isArray(clientMessages) || clientMessages.length === 0) {
    logger.debug('[coach] ✖ rejected: no messages array');
    return res.status(400).json({ error: 'messages array is required', code: 'VALIDATION_ERROR' });
  }

  // Drop anything malformed/unexpected before it ever reaches OpenAI or gets
  // persisted — only well-formed user/assistant text turns are valid here.
  clientMessages = clientMessages.filter((m) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string');
  if (clientMessages.length === 0) {
    logger.debug('[coach] ✖ rejected: no valid messages after filtering');
    return res.status(400).json({ error: 'messages array is required', code: 'VALIDATION_ERROR' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  logger.debug('[coach] headers flushed, stream open');

  // NOTE: `req.on('close')` is NOT what we want here — Node fires it as soon
  // as the request body has been fully read, which for a small JSON POST
  // body happens almost instantly (confirmed empirically: ~1ms), long before
  // the response is done. That caused every coach request to immediately
  // look "closed" and bail out before ever calling OpenAI. `res.on('close')`
  // fires when the underlying connection actually goes away — combined with
  // the `res.writableEnded` check, it only counts as a real client abort if
  // we hadn't already finished writing the response ourselves.
  let clientClosed = false;
  let activeStream = null;
  res.on('close', () => {
    if (!res.writableEnded) {
      clientClosed = true;
      logger.debug('[coach] client aborted the connection');
      activeStream?.controller?.abort?.();
    }
  });

  try {
    // Resolve or create the conversation
    let conversationId = incomingConversationId;
    // Only a freshly-created conversation (no id from the client yet) is
    // eligible for the duplicate-analysis redirect below — an ongoing
    // conversation the user is already in shouldn't get yanked out from
    // under them just because a later tool call happens to touch a ride
    // discussed elsewhere.
    const isNewConversation = !conversationId;
    if (!conversationId) {
      conversationId = uuidv4();
      const lastUserMessage = [...clientMessages].reverse().find((m) => m.role === 'user');
      const title = (lastUserMessage?.content || 'New conversation').slice(0, 80);
      await pool.query(
        'INSERT INTO coach_conversations (id, user_id, title) VALUES ($1, $2, $3)',
        [conversationId, userId, title]
      );
    } else {
      const check = await pool.query(
        'SELECT id FROM coach_conversations WHERE id = $1 AND user_id = $2',
        [conversationId, userId]
      );
      if (check.rows.length === 0) {
        sseSend(res, { type: 'error', message: 'Conversation not found' });
        return res.end();
      }
    }

    // Persist the latest user message (the client sends full history each
    // time, but only the newest user turn needs to be written)
    const lastUserMessage = [...clientMessages].reverse().find((m) => m.role === 'user');
    if (lastUserMessage) {
      await pool.query(
        'INSERT INTO coach_messages (id, conversation_id, role, content) VALUES ($1, $2, $3, $4)',
        [uuidv4(), conversationId, 'user', lastUserMessage.content]
      );
    }

    // The client sends full history every turn, so this is enough to know
    // which detail chips the rider has already tapped in THIS conversation —
    // no extra DB round trip needed. Includes the current turn's own
    // message, which is exactly right: if this turn's content IS one of
    // these fixed labels, it's being answered right now and shouldn't be
    // re-offered in this same reply's suggestions either. Exact-string match
    // is safe here because these are app-generated fixed labels, not
    // free-form text — the fragility concerns that rule out string-matching
    // elsewhere in this feature don't apply.
    const alreadyAskedDetails = new Set();
    for (const m of clientMessages) {
      if (m.role === 'user') {
        const type = DETAIL_LABEL_TO_TYPE[m.content];
        if (type) alreadyAskedDetails.add(type);
      }
    }

    // hiddenContext (e.g. an activity id from the "Discuss with Coach"
    // button) is folded into what the MODEL sees here only — the persisted
    // row above and the client's own displayed bubble both use m.content
    // verbatim, so it never surfaces to the user, just to the LLM.
    const conversation = [
      { role: 'system', content: coach.buildSystemPrompt(healthContext) },
      ...clientMessages.map((m) => ({
        role: m.role,
        content: m.hiddenContext
          ? `${m.content}\n\n[App context — do not mention this note to the user: ${m.hiddenContext}]`
          : m.content,
      })),
    ];

    let assistantText = '';
    const toolCallLog = [];

    // Which of vs_baseline/similar_ride/skills_delta did the MOST RECENT
    // get_activity_analysis call actually have available, before any
    // stripping below removes them from what the model/client see? Captured
    // separately from toolCallLog (which may hold the stripped, headline-only
    // version) so the deterministic suggestion chips built after the main
    // loop always know what's available — including on the very first
    // occurrence, which is exactly when we most want to bait the user with
    // them (see fixedSuggestions below).
    let lastAnalysisAngles = null;

    // Set when the model calls suggest_connect_apple_health this turn (see
    // aiCoach.js) — turned into a deterministic "Connect Apple Health" chip
    // below, same pattern as lastAnalysisAngles/fixedSuggestions.
    let suggestedConnectHealth = false;

    // How many times has get_activity_analysis already returned full
    // comparison data earlier in THIS conversation? Relying on the system
    // prompt alone to keep the coach from narrating vs_baseline/similar_ride/
    // skills_delta on the first reply wasn't reliable — models sometimes
    // read out every field they're handed regardless of instructions. So on
    // the first occurrence we strip those fields from the tool result before
    // the model (or the client) ever sees them — it physically can't narrate
    // data it was never given. Mirrors the client-side occurrence counting
    // that gates showAnalysisDetails (ChatMessageBubble/CoachChatScreen).
    let priorAnalysisCount = 0;
    try {
      const priorRows = await pool.query(
        `SELECT tool_calls FROM coach_messages WHERE conversation_id = $1 AND tool_calls IS NOT NULL ORDER BY created_at ASC`,
        [conversationId]
      );
      for (const row of priorRows.rows) {
        const calls = Array.isArray(row.tool_calls) ? row.tool_calls : [];
        for (const c of calls) {
          if (c?.name === 'get_activity_analysis' && c?.result?.activity) priorAnalysisCount++;
        }
      }
    } catch (err) {
      logger.error({ err: err.message }, '[coach] Failed to count prior analyses:');
    }

    // Tool-calling loop: keep going while the model asks for tool calls,
    // capped to avoid a runaway chain of calls in one turn.
    for (let iteration = 0; iteration < 6; iteration++) {
      if (clientClosed) break;

      logger.debug(`[coach] iteration ${iteration}: calling OpenAI (model=${coach.COACH_MODEL})...`);
      let stream;
      try {
        stream = await coach.openai.chat.completions.create({
          model: coach.COACH_MODEL,
          messages: conversation,
          tools: coach.TOOLS,
          stream: true,
        });
        activeStream = stream;
      } catch (createError) {
        logger.error({ err: createError, status: createError.status }, '[coach] ✖ OpenAI chat.completions.create() threw:');
        throw createError;
      }
      logger.debug('[coach] stream object received, awaiting chunks...');

      let turnText = '';
      let chunkCount = 0;
      const pendingToolCalls = []; // { id, name, argsString }

      for await (const chunk of stream) {
        if (clientClosed) break;
        chunkCount++;
        if (chunkCount === 1) logger.debug('[coach] first chunk arrived');
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          turnText += delta.content;
          sseSend(res, { type: 'token', content: delta.content });
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!pendingToolCalls[idx]) {
              pendingToolCalls[idx] = { id: tc.id, name: '', argsString: '' };
            }
            if (tc.id) pendingToolCalls[idx].id = tc.id;
            if (tc.function?.name) pendingToolCalls[idx].name += tc.function.name;
            if (tc.function?.arguments) pendingToolCalls[idx].argsString += tc.function.arguments;
          }
        }
      }
      logger.debug(`[coach] iteration ${iteration} done: ${chunkCount} chunks, ${turnText.length} chars, ${pendingToolCalls.length} tool call(s)`);

      assistantText += turnText;

      if (pendingToolCalls.length === 0) {
        // No tool calls this turn — the model is done responding
        break;
      }

      // Record the assistant's tool-call turn, then execute each tool and
      // feed results back in, per the OpenAI function-calling protocol.
      conversation.push({
        role: 'assistant',
        content: turnText || null,
        tool_calls: pendingToolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.argsString },
        })),
      });

      for (const tc of pendingToolCalls) {
        let args = {};
        try {
          args = tc.argsString ? JSON.parse(tc.argsString) : {};
        } catch (_) {
          args = {};
        }

        // Only the tool name is logged — `args` can carry free-text drawn
        // from the user's own coach messages (S-42, docs/audit/layers/01-server.md).
        logger.debug(`[coach] executing tool "${tc.name}"`);
        sseSend(res, { type: 'tool_call', name: tc.name, args });

        let result;
        try {
          // healthContext passed through ctx (not logged, not persisted — see
          // the NEVER-log comment above) purely so analyze_readiness's
          // executor can hand it back to the client as a tool result without
          // a second round trip; it's the exact same object already used to
          // build this turn's system prompt.
          result = await coach.executeTool(tc.name, args, { userId, conversationId, healthContext });
          logger.debug(`[coach] tool "${tc.name}" done`);
        } catch (toolError) {
          logger.error({ err: toolError }, `[coach] ✖ tool "${tc.name}" failed:`);
          result = { error: toolError.message, code: 'TOOL_ERROR' };
        }

        if (tc.name === 'suggest_connect_apple_health') {
          suggestedConnectHealth = true;
        }

        if (tc.name === 'get_activity_analysis' && result?.activity) {
          // This is a BRAND NEW conversation (e.g. the "Analyse my last
          // ride" welcome suggestion, not RideAnalyticsScreen's "Discuss
          // with Coach" — that flow already dedupes before ever starting a
          // conversation, see GET /api/coach/conversations/by-activity/:id)
          // and the very first analysis in it just resolved to a ride
          // that's already the subject of a DIFFERENT existing conversation.
          // Rather than let two threads about the same ride pile up, abort
          // this one now — delete the conversation/message we just created
          // and tell the client to jump to the existing thread instead.
          if (isNewConversation && priorAnalysisCount === 0) {
            try {
              const dup = await pool.query(
                `SELECT id FROM coach_conversations
                 WHERE user_id = $1 AND activity_id = $2 AND id != $3
                 ORDER BY updated_at DESC LIMIT 1`,
                [userId, result.activity.id, conversationId]
              );
              if (dup.rows.length > 0) {
                const existingId = dup.rows[0].id;
                logger.debug(`[coach] duplicate analysis of activity ${result.activity.id}, redirecting to conversation ${existingId}`);
                sseSend(res, { type: 'redirect', conversation_id: existingId });
                await pool.query('DELETE FROM coach_conversations WHERE id = $1', [conversationId]).catch(() => {});
                return res.end();
              }
            } catch (dupErr) {
              logger.error({ err: dupErr }, '[coach] duplicate analysis check failed:');
            }
          }

          lastAnalysisAngles = {
            vs_baseline: !!result.vs_baseline,
            similar_ride: !!result.similar_ride,
            skills_delta: !!result.skills_delta,
          };
          // Tag this conversation with the activity it ended up analyzing —
          // only the first time (ON CONFLICT-style guard via the WHERE
          // clause), so a later follow-up that happens to reference a
          // different activity id doesn't relabel the whole thread. Fire and
          // forget: this is bookkeeping for future dedup lookups (see
          // GET /api/coach/conversations/by-activity/:id), not on the
          // critical path for this response.
          pool
            .query(
              'UPDATE coach_conversations SET activity_id = $1 WHERE id = $2 AND activity_id IS NULL',
              [result.activity.id, conversationId]
            )
            .catch((e) => logger.error({ err: e.message }, '[coach] Failed to tag conversation with activity_id:'));
          if (priorAnalysisCount === 0) {
            // First occurrence in this conversation — hold back the detail
            // fields at the source. RideScoreCard only needs
            // result.activity.effort_score, which stays.
            const { vs_baseline, similar_ride, skills_delta, ...headline } = result;
            result = headline;
          }
          priorAnalysisCount++;
        }

        sseSend(res, { type: 'tool_result', name: tc.name, result });
        toolCallLog.push({ name: tc.name, args, result, status: 'done' });

        conversation.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
      // loop continues so the model can respond using the tool results
    }

    if (clientClosed) {
      logger.debug('[coach] client closed before suggestions/persist step');
      return res.end();
    }

    logger.debug(`[coach] main loop finished, assistantText=${assistantText.length} chars, generating suggestions...`);

    // "In the same language as the conversation" left the model free to
    // guess and it has been known to just pick a random language (seen
    // returning German suggestions for an all-English conversation) — name
    // the language explicitly instead of trusting that instruction alone.
    // The app only ships en/ru copy, so a simple Cyrillic sniff on the
    // user's own latest message is enough; anything else defaults to English.
    const suggestionLanguage = /[а-яё]/i.test(lastUserMessage?.content || '') ? 'Russian' : 'English';
    const langKey = suggestionLanguage === 'Russian' ? 'ru' : 'en';

    // Deterministic and always shown when the data exists AND the rider
    // hasn't already asked for it in this conversation — rather than left up
    // to the suggestion-generation LLM call (which used to skip them
    // unpredictably and phrase each one differently every time) or kept
    // dangling forever after being answered (see alreadyAskedDetails above).
    // See types/coach.ts AnalysisDetailType and ChatMessageBubble's
    // revealDetail handling for how the tap on one of these maps to exactly
    // one revealed card.
    const fixedSuggestions = [];
    if (lastAnalysisAngles) {
      for (const key of ['vs_baseline', 'similar_ride', 'skills_delta']) {
        if (lastAnalysisAngles[key] && !alreadyAskedDetails.has(key)) {
          fixedSuggestions.push({ label: DETAIL_LABELS[key][langKey], detail: key });
        }
      }
    }
    // `action: 'connect_health'` (rather than `detail`) tells the client to
    // navigate to AppleHealthScreen instead of sending this label as a chat
    // message — see CoachChatScreen.tsx's handleSuggestionPress. Guarded on
    // `!healthContext` defensively: if Health is somehow already connected
    // this turn, don't show a redundant connect button even if the model
    // called the tool.
    if (suggestedConnectHealth && !healthContext) {
      fixedSuggestions.push({ label: CONNECT_HEALTH_LABEL[langKey], action: 'connect_health' });
    }

    // Fill any remaining slots (up to 3 total) with free-form suggestions —
    // this is the ONLY thing left to the LLM's judgment now, and it's
    // explicitly told not to duplicate the comparison angles above.
    let suggestions = [...fixedSuggestions];
    const remaining = 3 - fixedSuggestions.length;
    if (remaining > 0) {
      try {
        const suggestionResp = await coach.openai.chat.completions.create({
          model: coach.COACH_MODEL,
          messages: [
            ...conversation,
            { role: 'assistant', content: assistantText },
            {
              role: 'user',
              content:
                `Suggest ${remaining} follow-up action${remaining > 1 ? 's' : ''} the rider might want next, ` +
                `written in ${suggestionLanguage}, as a JSON array of strings only, no other text. Each one is ` +
                'a tappable button label, NOT a full question or sentence — 2-4 words max, roughly 20-25 ' +
                'characters, title-style (e.g. "Training tips", "Next workout plan", "Nutrition advice"). ' +
                'Never write a complete question like "How can I improve my average speed?" — shorten it to ' +
                'the topic, e.g. "Improve avg speed".' +
                (fixedSuggestions.length > 0
                  ? ' Do NOT suggest comparing to their average, a similar ride, or how skills changed — that is already handled separately.'
                  : ''),
            },
          ],
          response_format: { type: 'json_object' },
        });
        const raw = suggestionResp.choices?.[0]?.message?.content;
        const parsed = raw ? JSON.parse(raw) : null;
        // response_format: json_object guarantees valid JSON but NOT that the
        // model wraps the array under a key literally called "suggestions" —
        // it sometimes picks "questions"/"follow_ups"/etc instead, which used
        // to silently fall through to []. Take whichever top-level value is
        // actually an array instead of assuming the key name.
        let llmSuggestions = [];
        if (Array.isArray(parsed)) {
          llmSuggestions = parsed;
        } else if (parsed && typeof parsed === 'object') {
          const arrayValue = Object.values(parsed).find((v) => Array.isArray(v));
          llmSuggestions = arrayValue || [];
        }
        llmSuggestions = llmSuggestions
          .filter((s) => typeof s === 'string' && s.trim().length > 0)
          .slice(0, remaining)
          .map((label) => ({ label }));
        if (llmSuggestions.length === 0) {
          logger.warn('[coach] suggestions call returned no usable array, raw:', raw);
        }
        suggestions = suggestions.concat(llmSuggestions);
      } catch (suggestionError) {
        logger.warn('Coach suggestions generation failed:', suggestionError.message);
      }
    }

    if (suggestions.length > 0) {
      sseSend(res, { type: 'suggestions', items: suggestions });
    }

    const assistantMessageId = uuidv4();
    await pool.query(
      `INSERT INTO coach_messages (id, conversation_id, role, content, tool_calls, suggestions)
       VALUES ($1, $2, 'assistant', $3, $4, $5)`,
      [
        assistantMessageId,
        conversationId,
        assistantText,
        toolCallLog.length > 0 ? JSON.stringify(toolCallLog) : null,
        suggestions.length > 0 ? JSON.stringify(suggestions) : null,
      ]
    );
    await pool.query('UPDATE coach_conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);

    sseSend(res, { type: 'done', conversation_id: conversationId, message_id: assistantMessageId });
    logger.debug(`[coach] ✔ done, conversation=${conversationId}, message=${assistantMessageId}`);
    res.end();
  } catch (error) {
    logger.error({ err: error, status: error.status }, '[coach] ✖ FATAL error in /api/coach/chat:');
    try {
      sseSend(res, { type: 'error', message: 'Coach is temporarily unavailable, please try again.' });
    } catch (_) { /* stream may already be closed */ }
    res.end();
  }
});

// Функция для обновления целей пользователя
async function updateUserGoals(userId, authHeader) {
  try {
    // Получаем аналитику
    const analyticsResponse = await axios.get(`http://localhost:${PORT}/api/analytics/summary`, {
      headers: { Authorization: authHeader }
    });
    const analytics = analyticsResponse.data.summary;
    
    if (!analytics) {
      return;
    }
    
    // Получаем все цели пользователя
    const goalsResult = await pool.query(
      'SELECT * FROM goals WHERE user_id = $1',
      [userId]
    );
    
    const updatedGoals = [];
    
    for (const goal of goalsResult.rows) {
      let newCurrentValue = goal.current_value;
      
      // Логирование для avg_hr_hills (только при отладке)
      // if (goal.goal_type === 'avg_hr_hills') {
      //   logger.debug('🔴 updateUserGoals processing avg_hr_hills:', {
      //     goalId: goal.id,
      //     currentValue: goal.current_value,
      //     willSkip: 'YES - avg_hr_hills is in continue list'
      //   });
      // }
      
      // Обновляем значения на основе типа цели
      // Для distance целей НЕ обновляем current_value - они считаются на фронтенде
      switch (goal.goal_type) {
        case 'vo2max':
          newCurrentValue = analytics.vo2max || 0;
          break;
        case 'ftp':
          newCurrentValue = analytics.ftp || 0;
          break;
        case 'rides':
          newCurrentValue = analytics.totalRides || 0;
          break;
        case 'distance':
        case 'time':
        case 'elevation':
        case 'pulse':
        case 'avg_hr_flat':
        case 'avg_hr_hills':
        case 'avg_power':
        case 'cadence':
        case 'long_rides':
        case 'intervals':
        case 'recovery':
        case 'ftp_vo2max':
          // Для этих целей оставляем current_value как есть - они считаются на фронтенде
          continue; // Пропускаем обновление этих целей
        case 'avg_per_week':
          newCurrentValue = analytics.avgPerWeek || 0;
          break;
      }
      
      // Обновляем цель только если значение изменилось
      if (newCurrentValue !== goal.current_value) {

        await pool.query(
          'UPDATE goals SET current_value = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
          [newCurrentValue, goal.id, userId]
        );
        updatedGoals.push({ id: goal.id, title: goal.title, oldValue: goal.current_value, newValue: newCurrentValue });
      }
    }
    
    return updatedGoals;
  } catch (err) {
    logger.error({ err }, 'Error auto-updating goals:');
  }
}

// Update goals with current values from analytics (manual endpoint)
app.post('/api/goals/update-current', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Получаем аналитику
    const analyticsResponse = await axios.get(`http://localhost:${PORT}/api/analytics/summary`, {
      headers: { Authorization: req.headers.authorization }
    });
    const analytics = analyticsResponse.data.summary;
    
    if (!analytics) {
      return res.status(400).json({ error: 'No analytics data available', code: 'BAD_REQUEST' });
    }
    
    // Получаем все цели пользователя
    const goalsResult = await pool.query(
      'SELECT * FROM goals WHERE user_id = $1',
      [userId]
    );
    
    const updatedGoals = [];
    
    for (const goal of goalsResult.rows) {
      let newCurrentValue = goal.current_value;
      
      // Обновляем значения на основе типа цели
      // Для distance целей НЕ обновляем current_value - они считаются на фронтенде
      switch (goal.goal_type) {
        case 'vo2max':
          newCurrentValue = analytics.vo2max || 0;
          break;
        case 'ftp':
          newCurrentValue = analytics.ftp || 0;
          break;
        case 'rides':
          newCurrentValue = analytics.totalRides || 0;
          break;
        case 'distance':
        case 'time':
        case 'elevation':
        case 'pulse':
        case 'avg_hr_flat':
        case 'avg_hr_hills':
        case 'avg_power':
        case 'cadence':
        case 'long_rides':
        case 'intervals':
        case 'recovery':
        case 'ftp_vo2max':
          // Для этих целей оставляем current_value как есть - они считаются на фронтенде
          continue; // Пропускаем обновление этих целей
        case 'avg_per_week':
          newCurrentValue = analytics.avgPerWeek || 0;
          break;
      }
      
      // Обновляем цель только если значение изменилось
      if (newCurrentValue !== goal.current_value) {
        const updateResult = await pool.query(
          'UPDATE goals SET current_value = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *',
          [newCurrentValue, goal.id, userId]
        );
        updatedGoals.push(updateResult.rows[0]);
      }
    }
    
    res.json({ 
      success: true, 
      updated: updatedGoals.length,
      goals: updatedGoals 
    });
  } catch (err) {
    logger.error({ err }, 'Error updating goals:');
    res.status(500).json({ error: 'Failed to update goals', code: 'INTERNAL' });
  }
});



// --- Endpoint для привязки Strava к существующему пользователю ---
// Renders the tiny page /link_strava lands on after Strava redirects back.
// It has to work for BOTH ways the web app kicks off the link flow —
// OnboardingModal opens it in a popup, Sidebar/ProfilePage navigate the
// whole tab to it — without the server knowing which one a given request
// came from (the `state` row only carries `client: 'web'|'mobile'`, not
// popup-vs-full-navigation). So the page itself branches at runtime on
// `window.opener`: postMessage + close when it's a popup, otherwise a plain
// redirect to the profile page. Never puts a JWT in the message or URL —
// see docs/audit/layers/01-server.md S-07.
function renderLinkResultPage({ ok, error }) {
  const payload = ok ? { type: 'strava-linked' } : { type: 'strava-linked', ok: false, error: error || 'unknown' };
  const fallbackUrl = ok ? '/profile?strava=linked' : `/profile?strava=error`;
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${ok ? 'Strava Connected' : 'Strava Connection Failed'}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        .container { text-align: center; padding: 40px; border-radius: 10px; background: rgba(255, 255, 255, 0.1); }
        .icon { font-size: 48px; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">${ok ? '✅' : '❌'}</div>
        <h2>${ok ? 'Strava Connected Successfully!' : 'Strava Connection Failed'}</h2>
        <p>${ok ? 'You can now close this window.' : escapeHtml(error || 'Please try again.')}</p>
      </div>
      <script>
        (function () {
          var payload = ${JSON.stringify(payload)};
          if (window.opener) {
            window.opener.postMessage(payload, window.location.origin);
            setTimeout(function () { window.close(); }, 1500);
          } else {
            window.location.href = ${JSON.stringify(fallbackUrl)};
          }
        })();
      </script>
    </body>
    </html>
  `;
}

app.get('/link_strava', async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.status(400).send(renderLinkResultPage({ ok: false, error: 'Missing code or state' }));
  }

  // `state` replaces the old "JWT-as-state" (docs/audit/layers/01-server.md
  // S-07): it's a one-time server-side token minted by
  // GET /api/auth/strava/link-start, carrying THIS user's id, instead of
  // the rider's actual session JWT travelling through Strava's own
  // authorize URL/logs.
  const stateRow = await consumeState(pool, state);
  if (!stateRow || stateRow.purpose !== 'link' || !stateRow.user_id) {
    return res.status(400).send(renderLinkResultPage({ ok: false, error: 'This link expired or is invalid — go back to the app and try again.' }));
  }
  const userId = stateRow.user_id;
  const client = stateRow.client;

  const fail = (error) => {
    if (client === 'mobile') {
      return res.redirect(`bikelab://strava-linked?ok=0&error=${encodeURIComponent(error)}`);
    }
    return res.status(400).send(renderLinkResultPage({ ok: false, error }));
  };

  try {
    // 1. Получаем access_token через Strava OAuth
    const tokenData = await stravaOAuth.exchangeCode(code);
    const access_token = tokenData.access_token;
    const refresh_token = tokenData.refresh_token;
    const expires_at = tokenData.expires_at;

    // 2. Получаем профиль пользователя Strava
    const athlete = await stravaOAuth.getAthlete(access_token);
    const strava_id = athlete.id;
    const email = athlete.email || null;
    const name = athlete.firstname + (athlete.lastname ? ' ' + athlete.lastname : '');
    const avatar = athlete.profile || null;

    // 3. Проверяем, не занят ли этот strava_id (активная связь) или
    // strava_athlete_id (постоянный якорь, переживающий unlink) другим
    // пользователем.
    const existing = await pool.query(
      'SELECT id FROM users WHERE (strava_id = $1 OR strava_athlete_id = $1) AND id != $2',
      [strava_id, userId]
    );
    if (existing.rows.length > 0) {
      return fail('This Strava account is already linked to another user.');
    }

    // 4. Обновляем текущего пользователя. Больше не выдаём новый JWT здесь —
    // клиент, инициировавший линковку, уже залогинен своим существующим
    // токеном, и этой странице/deep-link'у незачем нести токен вообще (см.
    // docs/audit/layers/01-server.md S-07).
    await pool.query(
      'UPDATE users SET strava_id = $1, strava_athlete_id = $1, strava_access_token = $2, strava_refresh_token = $3, strava_expires_at = $4, name = $5, email = COALESCE($6, email), avatar = $7 WHERE id = $8',
      [strava_id, access_token, refresh_token, expires_at, name, email, avatar, userId]
    );

    if (client === 'mobile') {
      return res.redirect('bikelab://strava-linked?ok=1');
    }
    return res.send(renderLinkResultPage({ ok: true }));
  } catch (err) {
    logger.error({ err: err.response?.data || err }, 'Strava link error:');
    return fail('Failed to link Strava account.');
  }
});

// --- Endpoint для отвязки Strava от пользователя ---
app.post('/api/unlink_strava', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  try {
    // Получаем текущий access_token для деавторизации в Strava
    const currentUser = await pool.query('SELECT strava_access_token FROM users WHERE id = $1', [userId]);
    if (currentUser.rows[0]?.strava_access_token) {
      await stravaOAuth.deauthorize(currentUser.rows[0].strava_access_token);
    }

    // Обнуляем strava_id и все связанные поля
    await pool.query(
      'UPDATE users SET strava_id = NULL, strava_access_token = NULL, strava_refresh_token = NULL, strava_expires_at = NULL, avatar = NULL WHERE id = $1',
      [userId]
    );
    // Strava API agreement: data obtained from Strava must be deleted when the
    // athlete deauthorizes. Mirrored activities/bikes go too, plus our caches.
    await pool.query('DELETE FROM synced_activities WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM synced_bikes WHERE user_id = $1', [userId]);
    stravaActivities.invalidate(userId);
    stravaActivities.invalidateBikes(userId);
    // Очищаем серверный кэш Strava activities и велосипедов для этого пользователя
    activitiesCache.delete(userId);
    bikesCache.delete(userId);
    // Получаем обновлённого пользователя
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    // Генерируем новый JWT без strava_id
    const jwtToken = issueSessionToken(user);
    res.json({ token: jwtToken });
  } catch (e) {
    logger.error({ err: e }, 'Unlink Strava error:');
    res.status(500).json({ error: 'Failed to unlink Strava', code: 'INTERNAL' });
  }
});

// --- Endpoint для удаления аккаунта пользователем ---
// Proof-of-concept use of db.js's withTransaction helper (T-1.1) — the
// other manual BEGIN/COMMIT/ROLLBACK blocks in this file are migrated to it
// separately (T-4.2), not as part of introducing it here.
class AccountNotFoundError extends Error {}

app.delete('/api/account', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  try {
    // Деавторизуем атлета в Strava (освобождаем квоту)
    const userResult = await pool.query('SELECT strava_access_token FROM users WHERE id = $1', [userId]);
    if (userResult.rows[0]?.strava_access_token) {
      await stravaOAuth.deauthorize(userResult.rows[0].strava_access_token);
    }

    await withTransaction(async (client) => {
      const deleteQueries = [
        'DELETE FROM activity_meta_goals_progress WHERE user_id = $1',
        'DELETE FROM custom_training_plans WHERE user_id = $1',
        'DELETE FROM generated_weekly_plans WHERE user_id = $1',
        'DELETE FROM checklist WHERE user_id = $1',
        'DELETE FROM ai_analysis_cache WHERE user_id = $1',
        'DELETE FROM bike_component_resets WHERE user_id = $1',
        'DELETE FROM rides WHERE user_id = $1',
        'DELETE FROM goals WHERE user_id = $1',
        'DELETE FROM meta_goals WHERE user_id = $1',
        'DELETE FROM events WHERE user_id = $1',
        'DELETE FROM user_images WHERE user_id = $1',
        'DELETE FROM user_profiles WHERE user_id = $1',
        'DELETE FROM skills_history WHERE user_id = $1',
        'DELETE FROM analytics_snapshots WHERE user_id = $1',
        'DELETE FROM user_achievements WHERE user_id = $1',
        'DELETE FROM users WHERE id = $1'
      ];

      // Any failure here must propagate (withTransaction rolls back on any
      // thrown error) instead of being swallowed per-statement — otherwise a
      // FK violation on one table would silently leave the account only
      // partially deleted.
      let usersDeleteResult;
      for (const query of deleteQueries) {
        const result = await client.query(query, [userId]);
        if (query.startsWith('DELETE FROM users ')) usersDeleteResult = result;
      }

      if (!usersDeleteResult || usersDeleteResult.rowCount === 0) {
        // Thrown (not returned) so withTransaction rolls back instead of
        // committing a no-op delete — caught below and turned into the same
        // 404 the original code returned.
        throw new AccountNotFoundError('User not found');
      }
    });

    // Очищаем серверные кэши
    activitiesCache.delete(userId);
    bikesCache.delete(userId);

    logger.debug(`🗑️ Account deleted: userId=${userId}`);
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    if (error instanceof AccountNotFoundError) {
      return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }
    logger.error({ err: error }, 'Error deleting account:');
    res.status(500).json({ error: 'Failed to delete account', code: 'INTERNAL' });
  }
});


// Small bounded in-memory cache for the (unauthenticated-upstream) Open-Meteo
// calls below — same coordinates/dates are requested repeatedly as riders
// revisit an activity, no need to hit the upstream API every time.
const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000;
const WEATHER_CACHE_MAX = 500;
const weatherCache = new Map();
function getWeatherCache(key) {
  const entry = weatherCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > WEATHER_CACHE_TTL_MS) {
    weatherCache.delete(key);
    return null;
  }
  return entry.data;
}
function setWeatherCache(key, data) {
  if (weatherCache.size >= WEATHER_CACHE_MAX) {
    const oldestKey = weatherCache.keys().next().value;
    if (oldestKey !== undefined) weatherCache.delete(oldestKey);
  }
  weatherCache.set(key, { at: Date.now(), data });
}

// Эндпоинт для получения данных о ветре (прокси для Open-Meteo API)
app.get('/api/weather/wind', authMiddleware, async (req, res) => {
  try {
    const { latitude, longitude, start_date, end_date } = req.query;

    // logger.debug(`🌤️ Запрос данных о ветре: lat=${latitude}, lng=${longitude}, start=${start_date}, end=${end_date}`);

    if (!latitude || !longitude || !start_date || !end_date) {
      // logger.debug(`❌ Отсутствуют обязательные параметры: lat=${latitude}, lng=${longitude}, start=${start_date}, end=${end_date}`);
      return res.status(400).json({ error: 'Missing required parameters', code: 'VALIDATION_ERROR' });
    }

    // Валидация координат
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      // logger.debug(`❌ Некорректные координаты: lat=${latitude}, lng=${longitude}`);
      return res.status(400).json({ error: 'Invalid coordinates', code: 'VALIDATION_ERROR' });
    }

    // Определяем, какой API использовать
    const activityDate = new Date(start_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const activityDateStr = activityDate.toISOString().split('T')[0];
    const threeDaysAgoStr = threeDaysAgo.toISOString().split('T')[0];

    const useForecastAPI = activityDateStr >= threeDaysAgoStr;

    let apiUrl;
    if (useForecastAPI) {
      // Для последних 3 дней используем прогнозный API
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 1);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 3);

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&start_date=${startDateStr}&end_date=${endDateStr}&hourly=windspeed_10m,winddirection_10m&windspeed_unit=ms&timezone=auto`;
    } else {
      // Для более старых дат используем архивный API
      apiUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${start_date}&end_date=${end_date}&hourly=windspeed_10m,winddirection_10m&windspeed_unit=ms`;
    }

    const cached = getWeatherCache(apiUrl);
    if (cached) return res.json(cached);

    const response = await axios.get(apiUrl, { timeout: 8000 });
    setWeatherCache(apiUrl, response.data);
    res.json(response.data);

  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch weather data', code: 'INTERNAL' });
  }
});

// Эндпоинт для получения прогноза погоды
app.get('/api/weather/forecast', authMiddleware, async (req, res) => {
  try {
    const { latitude, longitude } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Missing required parameters', code: 'VALIDATION_ERROR' });
    }

    const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code,uv_index_max&temperature_unit=celsius&wind_speed_unit=ms&precipitation_unit=mm&timezone=auto`;

    const cached = getWeatherCache(apiUrl);
    if (cached) return res.json(cached);

    const response = await axios.get(apiUrl, { timeout: 8000 });
    setWeatherCache(apiUrl, response.data);
    res.json(response.data);

  } catch (error) {
    logger.error({ err: error.message }, 'Weather forecast API error:');
    res.status(500).json({ error: 'Failed to fetch weather forecast', code: 'INTERNAL' });
  }
});

// ===== API ЭНДПОИНТЫ ДЛЯ ТРЕНИРОВОЧНЫХ РЕКОМЕНДАЦИЙ =====

// Получение персонализированного плана тренировок
app.get('/api/training-plan', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const plan = await generatePersonalizedPlan(pool, userId);
    res.json(plan);
  } catch (error) {
    logger.error({ err: error }, 'Error generating training plan:');
    res.status(500).json({ error: 'Failed to generate training plan', code: 'INTERNAL' });
  }
});

// Получение профиля пользователя
app.get('/api/user-profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const profile = await getUserProfile(pool, userId);
    
    // Get user info from users table (name, avatar, etc.)
    const userResult = await pool.query(
      'SELECT id, name, avatar, strava_id, email, is_admin FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];

    // Combine profile data with user info
    const fullProfile = {
      ...profile,
      id: user?.id || userId,
      name: user?.name || null,
      avatar: user?.avatar || null,
      strava_id: user?.strava_id || null,
      email: user?.email || null,
      is_admin: user?.is_admin === true
    };
    
    res.json(fullProfile);
  } catch (error) {
    logger.error({ err: error }, 'Error getting user profile:');
    res.status(500).json({ error: 'Failed to get user profile', code: 'INTERNAL' });
  }
});

// Обновление профиля пользователя
app.put('/api/user-profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const profileData = req.body;
    
    // Валидация данных
    if (profileData.experience_level && !['beginner', 'intermediate', 'advanced'].includes(profileData.experience_level)) {
      return res.status(400).json({ error: 'Invalid experience level', code: 'VALIDATION_ERROR' });
    }
    
    if (profileData.time_available && (profileData.time_available < 1 || profileData.time_available > 10)) {
      return res.status(400).json({ error: 'Time available must be between 1 and 10 hours', code: 'VALIDATION_ERROR' });
    }
    
    // Валидация новых полей онбоардинга
    if (profileData.height && (profileData.height < 100 || profileData.height > 250)) {
      return res.status(400).json({ error: 'Height must be between 100 and 250 cm', code: 'VALIDATION_ERROR' });
    }
    
    if (profileData.weight && (profileData.weight < 30 || profileData.weight > 200)) {
      return res.status(400).json({ error: 'Weight must be between 30 and 200 kg', code: 'VALIDATION_ERROR' });
    }
    
    if (profileData.age && (profileData.age < 10 || profileData.age > 100)) {
      return res.status(400).json({ error: 'Age must be between 10 and 100 years', code: 'VALIDATION_ERROR' });
    }
    
    if (profileData.bike_weight && (profileData.bike_weight < 5 || profileData.bike_weight > 25)) {
      return res.status(400).json({ error: 'Bike weight must be between 5 and 25 kg', code: 'VALIDATION_ERROR' });
    }
    
    const updatedProfile = await updateUserProfile(pool, userId, profileData);
    
    // Update email in users table if provided
    if (profileData.email !== undefined) {
      await pool.query('UPDATE users SET email = $1 WHERE id = $2', [profileData.email, userId]);
    }
    
    // Get Strava info and email from users table
    const userResult = await pool.query('SELECT strava_id, email FROM users WHERE id = $1', [userId]);
    const strava_id = userResult.rows[0]?.strava_id || null;
    const email = userResult.rows[0]?.email || null;
    
    // Combine profile data with Strava info and email
    const fullProfile = {
      ...updatedProfile,
      strava_id: strava_id,
      email: email
    };
    
    res.json(fullProfile);
  } catch (error) {
    logger.error({ err: error }, 'Error updating user profile:');
    res.status(500).json({ error: 'Failed to update user profile', code: 'INTERNAL' });
  }
});

// Завершение онбоардинга
// Функция для создания дефолтных целей при завершении onboarding
async function createDefaultGoals(userId, experienceLevel = 'intermediate') {
  try {
    // Проверяем, есть ли уже цели у пользователя
    const existingGoals = await pool.query('SELECT COUNT(*) FROM goals WHERE user_id = $1', [userId]);
    if (parseInt(existingGoals.rows[0].count) > 0) {
      logger.debug(`User ${userId} already has goals, skipping default goals creation`);
      return;
    }

    // Определяем значения целей по уровню опыта
    const goalValues = {
      beginner: {
        ftp_minutes: 60,
        hr_hills: 150,
        speed_flat: 25,
        distance: 200
      },
      intermediate: {
        ftp_minutes: 120,
        hr_hills: 155,
        speed_flat: 30,
        distance: 400
      },
      advanced: {
        ftp_minutes: 180,
        hr_hills: 160,
        speed_flat: 35,
        distance: 600
      }
    };

    const values = goalValues[experienceLevel] || goalValues.intermediate;

    // Создаем дефолтные цели
    const defaultGoals = [
      {
        title: 'FTP/VO₂max Workouts',
        goal_type: 'ftp_vo2max',
        target_value: values.ftp_minutes,
        unit: 'minutes',
        period: '4w'
      },
      {
        title: 'Average HR on Hills',
        goal_type: 'avg_hr_hills',
        target_value: values.hr_hills,
        unit: 'bpm',
        period: '4w'
      },
      {
        title: 'Average Speed on Flat',
        goal_type: 'speed_flat',
        target_value: values.speed_flat,
        unit: 'km/h',
        period: '4w'
      },
      {
        title: 'Distance',
        goal_type: 'distance',
        target_value: values.distance,
        unit: 'km',
        period: '4w'
      }
    ];

    // Вставляем цели в базу данных
    for (const goal of defaultGoals) {
      await pool.query(
        `INSERT INTO goals (user_id, title, goal_type, target_value, current_value, unit, period, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 0, $5, $6, NOW(), NOW())`,
        [userId, goal.title, goal.goal_type, goal.target_value, goal.unit, goal.period]
      );
    }

    logger.debug(`✅ Created ${defaultGoals.length} default goals for user ${userId} (${experienceLevel})`);
  } catch (error) {
    logger.error({ err: error }, '❌ Error creating default goals:');
    // Не бросаем ошибку, чтобы не прервать onboarding
  }
}

app.post('/api/user-profile/onboarding', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const onboardingData = req.body;
    
    // Если это только skip (только onboarding_completed), пропускаем валидацию
    if (onboardingData.onboarding_completed && Object.keys(onboardingData).length === 1) {
      const completedProfile = await completeOnboarding(pool, userId, onboardingData);
      
      // Создаем дефолтные цели с intermediate уровнем для пользователей, пропустивших onboarding
      await createDefaultGoals(userId, 'intermediate');
      
      res.json(completedProfile);
      return;
    }
    
    // Валидация данных онбоардинга
    if (onboardingData.height && (onboardingData.height < 100 || onboardingData.height > 250)) {
      return res.status(400).json({ error: 'Height must be between 100 and 250 cm', code: 'VALIDATION_ERROR' });
    }
    
    if (onboardingData.weight && (onboardingData.weight < 30 || onboardingData.weight > 200)) {
      return res.status(400).json({ error: 'Weight must be between 30 and 200 kg', code: 'VALIDATION_ERROR' });
    }
    
    if (onboardingData.age && (onboardingData.age < 10 || onboardingData.age > 100)) {
      return res.status(400).json({ error: 'Age must be between 10 and 100 years', code: 'VALIDATION_ERROR' });
    }
    
    if (onboardingData.bike_weight && (onboardingData.bike_weight < 5 || onboardingData.bike_weight > 25)) {
      return res.status(400).json({ error: 'Bike weight must be between 5 and 25 kg', code: 'VALIDATION_ERROR' });
    }
    
    if (onboardingData.experience_level && !['beginner', 'intermediate', 'advanced'].includes(onboardingData.experience_level)) {
      return res.status(400).json({ error: 'Invalid experience level', code: 'VALIDATION_ERROR' });
    }
    
    if (onboardingData.max_hr && (onboardingData.max_hr < 100 || onboardingData.max_hr > 220)) {
      return res.status(400).json({ error: 'Max HR must be between 100 and 220 bpm', code: 'VALIDATION_ERROR' });
    }
    
    if (onboardingData.resting_hr && (onboardingData.resting_hr < 40 || onboardingData.resting_hr > 100)) {
      return res.status(400).json({ error: 'Resting HR must be between 40 and 100 bpm', code: 'VALIDATION_ERROR' });
    }
    
    if (onboardingData.lactate_threshold && (onboardingData.lactate_threshold < 120 || onboardingData.lactate_threshold > 200)) {
      return res.status(400).json({ error: 'Lactate Threshold must be between 120 and 200 bpm', code: 'VALIDATION_ERROR' });
    }
    
    const completedProfile = await completeOnboarding(pool, userId, onboardingData);
    
    // Создаем дефолтные цели для нового пользователя
    if (onboardingData.experience_level) {
      await createDefaultGoals(userId, onboardingData.experience_level);
    }
    
    // Get Strava info from users table
    const userResult = await pool.query('SELECT strava_id FROM users WHERE id = $1', [userId]);
    const strava_id = userResult.rows[0]?.strava_id || null;
    
    // Combine profile data with Strava info
    const fullProfile = {
      ...completedProfile,
      strava_id: strava_id
    };
    
    res.json(fullProfile);
  } catch (error) {
    logger.error({ err: error }, '❌ Error completing onboarding:');
    res.status(500).json({ error: 'Failed to complete onboarding', code: 'INTERNAL' });
  }
});

// Обновление email для пользователей Strava
app.post('/api/user-profile/email', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { email } = req.body;
    
    // Валидация email
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email address is required', code: 'VALIDATION_ERROR' });
    }
    
    // Проверяем, не используется ли уже этот email другим пользователем
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, userId]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'This email is already used by another account', code: 'EMAIL_ALREADY_EXISTS' });
    }
    
    // Обновляем email в таблице users
    await pool.query('UPDATE users SET email = $1 WHERE id = $2', [email, userId]);
    
    // Генерируем новый JWT с обновленным email
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    
    const newToken = issueSessionToken(user);
    
    res.json({ 
      success: true, 
      message: 'Email updated successfully',
      token: newToken
    });
  } catch (error) {
    logger.error({ err: error }, '❌ Error updating email:');
    res.status(500).json({ error: 'Failed to update email', code: 'INTERNAL' });
  }
});

// Получение рекомендаций для конкретной цели
app.get('/api/goals/:goalId/recommendations', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const goalId = parseInt(req.params.goalId);
    
    if (isNaN(goalId)) {
      return res.status(400).json({ error: 'Invalid goal ID', code: 'VALIDATION_ERROR' });
    }
    
    const recommendations = await getGoalSpecificRecommendations(pool, userId, goalId);
    res.json(recommendations);
  } catch (error) {
    logger.error({ err: error }, 'Error getting goal recommendations:');
    if (error.message === 'Goal not found') {
      res.status(404).json({ error: 'Goal not found', code: 'GOAL_NOT_FOUND' });
    } else {
      res.status(500).json({ error: 'Failed to get goal recommendations', code: 'INTERNAL' });
    }
  }
});

// Получение информации о типе тренировки
app.get('/api/training-types/:type', authMiddleware, async (req, res) => {
  try {
    const trainingType = req.params.type;
    const details = getTrainingTypeDetails(trainingType);
    
    if (!details) {
      return res.status(404).json({ error: 'Training type not found', code: 'TRAINING_TYPE_NOT_FOUND' });
    }
    
    res.json(details);
  } catch (error) {
    logger.error({ err: error }, 'Error getting training type details:');
    res.status(500).json({ error: 'Failed to get training type details', code: 'INTERNAL' });
  }
});

// Получение всех доступных типов тренировок
app.get('/api/training-types', authMiddleware, async (req, res) => {
  try {
    const trainingTypes = getAllTrainingTypes();
    res.json(trainingTypes);
  } catch (error) {
    logger.error({ err: error }, 'Error getting training types:');
    res.status(500).json({ error: 'Failed to get training types', code: 'INTERNAL' });
  }
});

// Получение статистики выполнения планов
app.get('/api/training-plan/stats', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const stats = await getPlanExecutionStats(pool, userId);
    res.json(stats);
  } catch (error) {
    logger.error({ err: error }, 'Error getting plan execution stats:');
    res.status(500).json({ error: 'Failed to get plan execution stats', code: 'INTERNAL' });
  }
});

// Сохранение кастомной тренировки
app.post('/api/training-plan/custom', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { dayKey, training } = req.body;
    
    if (!dayKey || !training) {
      return res.status(400).json({ error: 'Missing required fields', code: 'VALIDATION_ERROR' });
    }
    
    const result = await saveCustomTrainingPlan(pool, userId, dayKey, training);
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error saving custom training:');
    res.status(500).json({ error: 'Failed to save custom training', code: 'INTERNAL' });
  }
});

// Удаление кастомной тренировки
app.delete('/api/training-plan/custom/:dayKey', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { dayKey } = req.params;
    
    const result = await deleteCustomTraining(pool, userId, dayKey);
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error deleting custom training:');
    res.status(500).json({ error: 'Failed to delete custom training', code: 'INTERNAL' });
  }
});



// Периодическая очистка кэша AI анализа (каждые 24 часа)
setInterval(async () => {
  try {
    await cleanupOldCache(pool);
  } catch (error) {
    logger.error({ err: error }, 'Ошибка при очистке кэша AI анализа:');
  }
}, 24 * 60 * 60 * 1000).unref(); // 24 часа

// ===============================
// EVENTS MANAGEMENT ENDPOINTS
// ===============================

// GET /api/events - Получить все события пользователя
app.get('/api/events', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await pool.query(
      'SELECT * FROM events WHERE user_id = $1 ORDER BY start_date ASC',
      [userId]
    );
    
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching events:');
    res.status(500).json({ error: 'Failed to fetch events', code: 'INTERNAL' });
  }
});

// POST /api/events - Создать новое событие
app.post('/api/events', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { title, description, link, start_date, background_color } = req.body;
    
    // Валидация
    if (!title || !start_date) {
      return res.status(400).json({ error: 'Title and start_date are required', code: 'VALIDATION_ERROR' });
    }
    
    // Проверяем цвет (должен быть hex формата)
    const colorRegex = /^#[0-9A-Fa-f]{6}$/;
    if (background_color && !colorRegex.test(background_color)) {
      return res.status(400).json({ error: 'Invalid background_color format', code: 'VALIDATION_ERROR' });
    }
    
    const result = await pool.query(
      'INSERT INTO events (user_id, title, description, link, start_date, background_color) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [userId, title, description || null, link || null, start_date, background_color || '#274DD3']
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error creating event:');
    res.status(500).json({ error: 'Failed to create event', code: 'INTERNAL' });
  }
});

// PUT /api/events/:id - Обновить событие
app.put('/api/events/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const eventId = req.params.id;
    const { title, description, link, start_date, background_color } = req.body;
    
    // Проверяем что событие принадлежит пользователю
    const existingEvent = await pool.query(
      'SELECT * FROM events WHERE id = $1 AND user_id = $2',
      [eventId, userId]
    );
    
    if (existingEvent.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    }
    
    // Валидация
    if (!title || !start_date) {
      return res.status(400).json({ error: 'Title and start_date are required', code: 'VALIDATION_ERROR' });
    }
    
    // Проверяем цвет
    const colorRegex = /^#[0-9A-Fa-f]{6}$/;
    if (background_color && !colorRegex.test(background_color)) {
      return res.status(400).json({ error: 'Invalid background_color format', code: 'VALIDATION_ERROR' });
    }
    
    const result = await pool.query(
      'UPDATE events SET title = $1, description = $2, link = $3, start_date = $4, background_color = $5, updated_at = NOW() WHERE id = $6 AND user_id = $7 RETURNING *',
      [title, description || null, link || null, start_date, background_color || '#274DD3', eventId, userId]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error updating event:');
    res.status(500).json({ error: 'Failed to update event', code: 'INTERNAL' });
  }
});

// DELETE /api/events/:id - Удалить событие
app.delete('/api/events/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const eventId = req.params.id;
    
    const result = await pool.query(
      'DELETE FROM events WHERE id = $1 AND user_id = $2 RETURNING *',
      [eventId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    }
    
    res.json({ message: 'Event deleted successfully', event: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting event:');
    res.status(500).json({ error: 'Failed to delete event', code: 'INTERNAL' });
  }
});

// --- ADMIN USERS MANAGEMENT ---

// Получение списка всех пользователей (только для админа)
app.get('/api/admin/users', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const users = await pool.query(`
      SELECT 
        u.id,
        u.email,
        u.email_verified,
        u.strava_id,
        u.strava_access_token IS NOT NULL as has_strava_token,
        u.created_at,
        p.experience_level,
        (SELECT COUNT(*) FROM rides r WHERE r.user_id = u.id) as rides_count,
        (SELECT COUNT(*) FROM goals g WHERE g.user_id = u.id) as goals_count,
        (SELECT COUNT(*) FROM events e WHERE e.user_id = u.id) as events_count
      FROM users u
      LEFT JOIN user_profiles p ON u.id = p.user_id
      ORDER BY u.created_at DESC
    `);
    
    res.json({ users: users.rows });
  } catch (error) {
    logger.error({ err: error }, 'Error getting users:');
    res.status(500).json({ error: 'Failed to get users', code: 'INTERNAL' });
  }
});

// Unlink Strava для конкретного пользователя (только для админа)
app.post('/api/admin/users/:userId/unlink-strava', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Деавторизуем атлета в Strava
    const userResult = await pool.query('SELECT strava_access_token FROM users WHERE id = $1', [userId]);
    if (userResult.rows[0]?.strava_access_token) {
      await stravaOAuth.deauthorize(userResult.rows[0].strava_access_token);
    }
    
    await pool.query(`
      UPDATE users 
      SET 
        strava_access_token = NULL,
        strava_refresh_token = NULL,
        strava_expires_at = NULL,
        strava_id = NULL
      WHERE id = $1
    `, [userId]);
    await pool.query('DELETE FROM synced_activities WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM synced_bikes WHERE user_id = $1', [userId]);
    stravaActivities.invalidate(userId);
    stravaActivities.invalidateBikes(userId);

    res.json({ success: true, message: 'Strava отключен от пользователя' });
  } catch (error) {
    logger.error({ err: error }, 'Error unlinking Strava:');
    res.status(500).json({ error: 'Failed to unlink Strava', code: 'INTERNAL' });
  }
});

// Удаление пользователя со всеми связанными данными (только для админа)
app.delete('/api/admin/users/:userId', authMiddleware, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { userId } = req.params;

    // Деавторизуем атлета в Strava перед удалением
    const userResult = await pool.query('SELECT strava_access_token FROM users WHERE id = $1', [userId]);
    if (userResult.rows[0]?.strava_access_token) {
      await stravaOAuth.deauthorize(userResult.rows[0].strava_access_token);
    }
    
    await client.query('BEGIN');
    
    const deleteQueries = [
      'DELETE FROM activity_meta_goals_progress WHERE user_id = $1',
      'DELETE FROM custom_training_plans WHERE user_id = $1',
      'DELETE FROM generated_weekly_plans WHERE user_id = $1',
      'DELETE FROM checklist WHERE user_id = $1',
      'DELETE FROM ai_analysis_cache WHERE user_id = $1',
      'DELETE FROM bike_component_resets WHERE user_id = $1',
      'DELETE FROM rides WHERE user_id = $1',
      'DELETE FROM goals WHERE user_id = $1',
      'DELETE FROM meta_goals WHERE user_id = $1',
      'DELETE FROM events WHERE user_id = $1',
      'DELETE FROM user_images WHERE user_id = $1',
      'DELETE FROM user_profiles WHERE user_id = $1',
      'DELETE FROM skills_history WHERE user_id = $1',
      'DELETE FROM analytics_snapshots WHERE user_id = $1',
      'DELETE FROM user_achievements WHERE user_id = $1',
      'DELETE FROM users WHERE id = $1'
    ];
    
    let deletedRecords = {};

    // As in DELETE /api/account: any failure must propagate to the outer
    // catch (ROLLBACK), not be swallowed per-statement.
    for (const query of deleteQueries) {
      const result = await client.query(query, [userId]);
      const tableName = query.split('FROM ')[1].split(' WHERE')[0];
      deletedRecords[tableName] = result.rowCount;
    }

    if (!deletedRecords.users) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }

    await client.query('COMMIT');

    // Очищаем серверные кэши
    activitiesCache.delete(userId);
    bikesCache.delete(userId);
    
    res.json({ 
      success: true, 
      message: 'Пользователь удален',
      deletedRecords 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error({ err: error }, 'Error deleting user:');
    res.status(500).json({ error: 'Failed to delete user', code: 'INTERNAL' });
  } finally {
    client.release();
  }
});

// ========================================
// SKILLS HISTORY API - Отслеживание прогресса навыков
// ========================================
const skillsHistoryRoutes = require('./routes/skillsHistory');
app.use('/api/skills-history', skillsHistoryRoutes(pool));

// Oura — health-data source only, see routes/oura.js + ouraService.js.
// Login/account creation is unaffected: this never issues a session JWT.
const ouraRoutes = require('./routes/oura');
app.use('/api/oura', ouraRoutes(pool));

// ========================================
// ANALYTICS SNAPSHOTS API
// ========================================

app.post('/api/analytics-snapshot', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { lastActivityId, power, heart, speed, cadence, vo2max, activitiesCount } = req.body;

    if (!lastActivityId) {
      return res.status(400).json({ error: 'lastActivityId is required', code: 'VALIDATION_ERROR' });
    }

    const existing = await pool.query(
      'SELECT id FROM analytics_snapshots WHERE user_id = $1 AND last_activity_id = $2',
      [userId, lastActivityId]
    );
    if (existing.rows.length > 0) {
      return res.json({ saved: false, reason: 'no_new_data' });
    }

    await pool.query(
      `INSERT INTO analytics_snapshots (
        user_id, snapshot_date, last_activity_id,
        avg_power, max_power, min_power,
        avg_hr, max_hr, min_hr,
        avg_speed, max_speed, min_speed,
        avg_cadence, max_cadence, min_cadence,
        vo2max, activities_count
      ) VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (user_id, snapshot_date) DO UPDATE SET
        last_activity_id = EXCLUDED.last_activity_id,
        avg_power = EXCLUDED.avg_power, max_power = EXCLUDED.max_power, min_power = EXCLUDED.min_power,
        avg_hr = EXCLUDED.avg_hr, max_hr = EXCLUDED.max_hr, min_hr = EXCLUDED.min_hr,
        avg_speed = EXCLUDED.avg_speed, max_speed = EXCLUDED.max_speed, min_speed = EXCLUDED.min_speed,
        avg_cadence = EXCLUDED.avg_cadence, max_cadence = EXCLUDED.max_cadence, min_cadence = EXCLUDED.min_cadence,
        vo2max = EXCLUDED.vo2max, activities_count = EXCLUDED.activities_count,
        created_at = NOW()`,
      [
        userId, lastActivityId,
        power?.avg || null, power?.max || null, power?.min || null,
        heart?.avg || null, heart?.max || null, heart?.min || null,
        speed?.avg || null, speed?.max || null, speed?.min || null,
        cadence?.avg || null, cadence?.max || null, cadence?.min || null,
        vo2max || null, activitiesCount || 0
      ]
    );

    // Same principle as skills_history: we only ever compare "latest vs
    // previous", so there's no reason to keep more than 2 rows per user —
    // trim right after every successful save.
    await pool.query(
      `DELETE FROM analytics_snapshots
       WHERE user_id = $1
         AND id NOT IN (
           SELECT id FROM analytics_snapshots
           WHERE user_id = $1
           ORDER BY snapshot_date DESC
           LIMIT 2
         )`,
      [userId]
    );

    logger.debug(`📸 Analytics snapshot saved for user ${userId}, activity ${lastActivityId}, keeping last 2 snapshots`);
    res.json({ saved: true });
  } catch (err) {
    logger.error({ err }, 'Error saving analytics snapshot:');
    res.status(500).json({ error: 'Failed to save snapshot', code: 'INTERNAL' });
  }
});

app.get('/api/analytics-snapshot/latest', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await pool.query(
      'SELECT * FROM analytics_snapshots WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 1',
      [userId]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    logger.error({ err }, 'Error fetching latest snapshot:');
    res.status(500).json({ error: 'Failed to fetch snapshot', code: 'INTERNAL' });
  }
});

app.get('/api/analytics-snapshot/history', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = Math.min(parseInt(req.query.limit) || 12, 52);
    const result = await pool.query(
      'SELECT * FROM analytics_snapshots WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT $2',
      [userId, limit]
    );
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, 'Error fetching snapshot history:');
    res.status(500).json({ error: 'Failed to fetch history', code: 'INTERNAL' });
  }
});

// ========================================
// ACHIEVEMENTS API
// ========================================

// GET /api/achievements — все определения ачивок (каталог)
app.get('/api/achievements', authMiddleware, async (req, res) => {
  try {
    const achievements = await getAllAchievements(pool);
    res.json(achievements);
  } catch (err) {
    logger.error({ err }, 'Error fetching achievements:');
    res.status(500).json({ error: 'Failed to fetch achievements', code: 'INTERNAL' });
  }
});

// GET /api/achievements/me — ачивки пользователя с прогрессом
app.get('/api/achievements/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const achievements = await getUserAchievements(pool, userId);
    const unlocked = achievements.filter(a => a.unlocked).length;
    res.json({
      achievements,
      stats: {
        total: achievements.length,
        unlocked,
        progress_pct: Math.round((unlocked / achievements.length) * 100),
      },
    });
  } catch (err) {
    logger.error({ err }, 'Error fetching user achievements:');
    res.status(500).json({ error: 'Failed to fetch user achievements', code: 'INTERNAL' });
  }
});

// POST /api/achievements/evaluate — пересчитать ачивки
app.post('/api/achievements/evaluate', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get activities (cache/DB/Strava)
    let activities = [];
    try {
      activities = await stravaActivities.getActivities(userId);
    } catch (err) {
      if (!(err instanceof stravaTokens.StravaNotLinkedError)) throw err;
    }

    const result = await evaluateAchievements(pool, userId, activities);
    logger.debug(`🏆 Achievements evaluated for user ${userId}: ${result.total_unlocked}/${result.total_achievements} unlocked, ${result.newly_unlocked.length} new`);
    res.json(result);
  } catch (err) {
    logger.error({ err }, 'Error evaluating achievements:');
    res.status(500).json({ error: 'Failed to evaluate achievements', code: 'INTERNAL' });
  }
});

app.get('/healthz', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
});

// SPA fallback — для всех остальных маршрутов отдаём index.html
app.get('*', (req, res) => {
  // Пропускаем API запросы
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found', code: 'API_ENDPOINT_NOT_FOUND' });
  }
  
  // Пропускаем /link_strava (должен обрабатываться выше)
  if (req.path === '/link_strava') {
    return res.status(404).send('Strava callback not properly handled');
  }
  
  // Пропускаем запросы к статическим файлам
  if (req.path.includes('.') && !req.path.endsWith('.html')) {
    return res.status(404).send('File not found');
  }
  
  // Для всех остальных запросов возвращаем index.html
  res.sendFile(path.join(__dirname, '../react-spa/dist/index.html'));
});

// Must be registered after all routes but before our own error handler, so
// Sentry captures the error and still forwards it to errorHandler.js below.
Sentry.setupExpressErrorHandler(app);

const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

process.on('unhandledRejection', (r) => {
  Sentry.captureException(r);
  // eslint-disable-next-line no-console -- boot-time/process-level logging, not a request path
  console.error('unhandledRejection', r);
});
process.on('uncaughtException', (e) => {
  Sentry.captureException(e);
  // eslint-disable-next-line no-console -- boot-time/process-level logging, not a request path
  logger.error(e);
  process.exit(1);
});

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

// Startup order (T-1.4, docs/audit/00-AUDIT-AND-PLAN.md, S-29): config is
// already loaded (top of file) → run pending schema migrations → seed
// achievement definitions + prune stale AI cache (data, not schema) →
// app.listen. Previously app.listen ran unconditionally at import time,
// racing an un-awaited schema-migration IIFE further up this file; both are
// now sequenced here.
async function main() {
  if (config.MIGRATE_ON_START) {
    await runMigrations();
  }
  await seedAchievements(pool);
  cleanupOldCache(pool).catch(() => {});
  server = app.listen(PORT, () => logger.debug(`Server running at http://localhost:${PORT}`));
}

// Only boot (migrate → seed → listen) when this file is run directly (`node
// server.js`), not when it's `require()`'d — e.g. by integration tests
// (server/test/integration/setup.js), which need `app` wired up (routes,
// middleware) without also opening a real listening socket or racing
// migrations against their own test-database setup (T-1.7,
// docs/audit/00-AUDIT-AND-PLAN.md).
if (require.main === module) {
  main().catch((err) => {
    logger.error({ err }, '❌ Startup failed:');
    process.exit(1);
  });
}

module.exports = { app, main };
