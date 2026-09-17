// Register/login/verify-email/resend-verification, Strava OAuth
// start/link-start/exchange, and unlink-Strava (T-4.1 domain extraction).
// Moved verbatim from server.js. Mounted at /api — internal paths are
// /auth/strava/start, /auth/strava/link-start, /auth/exchange, /register,
// /verify-email, /resend-verification, /login, /unlink_strava.
const express = require('express');
const router = express.Router();
const logger = require('../lib/logger');
const config = require('../config');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimits');
const { validateBody } = require('../middleware/validate');
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const { LoginBodySchema, RegisterBodySchema, ExchangeBodySchema } = require('@bikelab/shared/types');
const { buildStravaAuthorizeUrl, createState } = require('../lib/oauthState');
const stravaActivities = require('../services/strava/activities');
const { activitiesCache, bikesCache } = stravaActivities;
const authService = require('../services/auth');

patchAsyncRoutes(router);

// STRAVA_CLIENT_SECRET is no longer read here directly — it only ever goes
// into a Strava OAuth token-endpoint request body, and those now live
// exclusively in services/strava/tokens.js and services/strava/oauth.js.
const CLIENT_ID = config.STRAVA_CLIENT_ID;
// Base URL Strava redirects back to (this server), as opposed to
// FRONTEND_URL which is where the SPA/marketing site lives. Same host in
// most deployments today (this server also serves the SPA build), but kept
// distinct so a future split frontend/backend deploy doesn't silently break
// the OAuth redirect_uri.
const BACKEND_BASE = config.BACKEND_BASE;

// Public, rate-limited: mints a fresh one-time `state` and returns the
// Strava authorize URL for the LOGIN flow. Both web and mobile call this
// instead of building the authorize URL themselves (see
// docs/audit/layers/03-react-spa.md W-28 — previously 5 web + 2 mobile call
// sites each picked their own scope/redirect).
router.get('/auth/strava/start', authLimiter, async (req, res) => {
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
router.get('/auth/strava/link-start', authMiddleware, async (req, res) => {
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
router.post('/auth/exchange', authLimiter, validateBody(ExchangeBodySchema), async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Missing code', code: 'BAD_REQUEST' });
  try {
    const { token, user } = await authService.exchangeAuthCode(pool, code);
    res.json({ token, user: { id: user.id, name: user.name, avatar: user.avatar, email: user.email } });
  } catch (err) {
    if (err instanceof authService.InvalidOrExpiredCodeError) {
      return res.status(400).json({ error: 'Invalid or expired code', code: 'BAD_REQUEST' });
    }
    if (err instanceof authService.UserNotFoundError) {
      return res.status(400).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }
    throw err;
  }
});

// Регистрация нового пользователя
router.post('/register', authLimiter, validateBody(RegisterBodySchema), async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const user = await authService.register({ email, password, name });

    res.json({
      success: true,
      message: 'Registration successful. Please check your email to verify your account.',
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (err) {
    if (err instanceof authService.EmailAlreadyExistsError) {
      return res.status(400).json({ error: 'User with this email already exists', code: 'EMAIL_ALREADY_EXISTS' });
    }
    logger.error({ err }, 'Registration error:');
    res.status(500).json({ error: err.message || 'Registration failed', code: 'INTERNAL' });
  }
});

// Подтверждение email
router.get('/verify-email', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: 'Verification token required', code: 'VALIDATION_ERROR' });
  }

  try {
    await authService.verifyEmail(token);
    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    if (error instanceof authService.InvalidVerificationTokenError) {
      return res.status(400).json({ error: 'Invalid verification token', code: 'INVALID_TOKEN' });
    }
    if (error instanceof authService.VerificationTokenExpiredError) {
      return res.status(400).json({ error: 'Verification token has expired', code: 'TOKEN_EXPIRED' });
    }
    logger.error({ err: error }, 'Email verification error:');
    res.status(500).json({ error: 'Email verification failed', code: 'INTERNAL' });
  }
});

// Повторная отправка email подтверждения
router.post('/resend-verification', authLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email required', code: 'VALIDATION_ERROR' });
  }

  try {
    await authService.resendVerification(email);
    res.json({ message: 'Verification email sent successfully' });
  } catch (error) {
    if (error instanceof authService.UserNotFoundError) {
      return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }
    if (error instanceof authService.AlreadyVerifiedError) {
      return res.status(400).json({ error: 'Email is already verified', code: 'ALREADY_VERIFIED' });
    }
    if (error instanceof authService.VerificationEmailFailedError) {
      return res.status(500).json({ error: 'Failed to send verification email', code: 'INTERNAL' });
    }
    logger.error({ err: error }, 'Resend verification error:');
    res.status(500).json({ error: 'Failed to resend verification email', code: 'INTERNAL' });
  }
});

router.post('/login', authLimiter, validateBody(LoginBodySchema), async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required', code: 'VALIDATION_ERROR' });
  try {
    const { token, user } = await authService.login({ email, password });
    // ВАЖНО: включаем strava_id, name, avatar!
    res.json({ token, user: { id: user.id, email: user.email, created_at: user.created_at } });
  } catch (e) {
    if (e instanceof authService.InvalidCredentialsError) {
      return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }
    if (e instanceof authService.EmailNotVerifiedError) {
      // Проверяем верификацию email
      return res.status(403).json({
        error: 'Email not verified. Please check your email and click the verification link.',
        needsVerification: true
      });
    }
    logger.error({ err: e }, 'Login error:');
    res.status(500).json({ error: 'Login failed', code: 'INTERNAL' });
  }
});

// --- Endpoint для отвязки Strava от пользователя ---
router.post('/unlink_strava', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  try {
    const jwtToken = await authService.unlinkStrava(userId, { activitiesCache, bikesCache, stravaActivities });
    res.json({ token: jwtToken });
  } catch (e) {
    logger.error({ err: e }, 'Unlink Strava error:');
    res.status(500).json({ error: 'Failed to unlink Strava', code: 'INTERNAL' });
  }
});

module.exports = router;
