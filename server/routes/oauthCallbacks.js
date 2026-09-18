// Non-/api, browser-facing OAuth callbacks (T-4.1 domain extraction): Apple
// Universal Links, the Strava OAuth LOGIN callback (/exchange_token), the
// Oura OAuth callback (/oura/exchange_token) and the Strava LINK callback
// page (/link_strava). Moved verbatim from server.js — mounted at '/' so
// paths are unchanged. `GET /privacy` and the static/SPA serving stay in
// server.js.
const express = require('express');
const router = express.Router();
const path = require('path');
const escapeHtml = require('escape-html');
const config = require('../config');
const logger = require('../lib/logger');
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const { pool } = require('../db');
const stravaOAuth = require('../services/strava/oauth');
const ouraService = require('../ouraService');
const { verifyPurposeToken } = require('../lib/jwt');
const { consumeState, createAuthCode } = require('../lib/oauthState');
const authService = require('../services/auth');
const { issueSessionToken } = require('../lib/jwt');

patchAsyncRoutes(router);

// Apple Universal Links - раздаём apple-app-site-association с правильными заголовками
router.get('/.well-known/apple-app-site-association', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(path.join(__dirname, '../public/.well-known/apple-app-site-association'));
});

// Также поддержка без .well-known (старые версии iOS)
router.get('/apple-app-site-association', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(path.join(__dirname, '../public/.well-known/apple-app-site-association'));
});

router.get('/exchange_token', async (req, res, next) => {
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
  // LEGACY_MOBILE_COMPAT (config/index.js): the App Store build predates
  // `state` and redirects here with `?mobile=true` only. While the flag is
  // on, that exact shape gets the pre-T-4.x flow: exchange, find-or-create,
  // 7d session JWT, and the old /auth/success page that hands the token to
  // the app via `bikelab://auth?token=`. Login-CSRF protection (S-07) is
  // knowingly waived for this one path for the duration of the overlap.
  if (!state && req.query.mobile === 'true' && config.LEGACY_MOBILE_COMPAT) {
    return legacyMobileExchange(req, res, code);
  }

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

    // 2. Получаем профиль пользователя Strava
    const athlete = await stravaOAuth.getAthlete(tokenData.access_token);

    // 3. Находим или создаём пользователя в базе (id + strava_athlete_id
    // reconciliation — see services/auth.js's findOrCreateStravaUser).
    const user = await authService.findOrCreateStravaUser(athlete, tokenData);

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

async function legacyMobileExchange(req, res, code) {
  try {
    const tokenData = await stravaOAuth.exchangeCode(code);
    const athlete = await stravaOAuth.getAthlete(tokenData.access_token);
    const user = await authService.findOrCreateStravaUser(athlete, tokenData);
    const jwtToken = issueSessionToken(user);
    logger.debug({ userId: user.id }, '📱 [legacy-mobile] Strava login for store build');
    // Separate URL so the one-time Strava `code` leaves the address bar
    // (a refresh of the success page must not re-run the exchange).
    return res.redirect(`/auth/success?token=${encodeURIComponent(jwtToken)}`);
  } catch (err) {
    logger.error({ err: err.response?.data || err.message || err }, '❌ [legacy-mobile] exchange error:');
    return res.status(500).send(`
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
  }
}

// Success page for the store build (LEGACY_MOBILE_COMPAT only) — the same
// markup the old server.js served: an `bikelab://auth?token=` button plus
// the Universal Link fallback. 404s like any unknown path when the flag is
// off.
router.get('/auth/success', (req, res, next) => {
  if (!config.LEGACY_MOBILE_COMPAT) return next();
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) return res.status(400).send('Missing token');

  const urlSchemeLink = `bikelab://auth?token=${encodeURIComponent(token)}`;
  const universalLink = `https://bikelab.app/auth?token=${encodeURIComponent(token)}`;
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Opening BikeLab...</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #fff; text-align: center; padding: 2rem; }
    .logo { font-size: 64px; margin-bottom: 1rem; }
    h1 { font-size: 24px; margin-bottom: 1rem; }
    .button { display: inline-block; background: linear-gradient(135deg, #FF5E00, #FF8033); color: #fff; padding: 20px 60px; border-radius: 16px; text-decoration: none; font-size: 20px; font-weight: 700; margin: 2rem 0; box-shadow: 0 8px 24px rgba(255, 94, 0, 0.4); animation: pulse 2s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
    .note { font-size: 14px; color: #666; margin-top: 2rem; }
  </style>
</head>
<body>
  <div>
    <div class="logo">🚴‍♂️</div>
    <h1>✅ Authorization Successful!</h1>
    <p style="color: #aaa;">Tap the button below to open the app</p>
    <a href="${escapeHtml(urlSchemeLink)}" class="button">🚀 Open BikeLab App</a>
    <p class="note">Tap "Open" when iOS asks to confirm</p>
    <p style="color: #444; font-size: 11px; margin-top: 2rem;">
      If nothing happens, try <a href="${escapeHtml(universalLink)}" style="color: #FF5E00;">this link</a>
    </p>
  </div>
</body>
</html>
  `);
});

// Oura OAuth callback — the ONLY place besides ouraService.js that talks
// to Oura's token endpoint directly. Unlike /exchange_token (Strava) this
// never creates a user or issues a new session JWT: the rider must already
// be logged in (via Strava) before tapping "Connect" in
// OuraIntegrationScreen, and `state` (minted by GET /api/oura/connect-state)
// is how we recover THEIR userId across the redirect round-trip.
router.get('/oura/exchange_token', async (req, res) => {
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
    await authService.connectOura(pool, userId, code, redirectUri);

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

router.get('/link_strava', async (req, res) => {
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

    // 2. Получаем профиль пользователя Strava
    const athlete = await stravaOAuth.getAthlete(tokenData.access_token);

    // 3+4. Проверяем конфликт strava_id/strava_athlete_id с другим
    // пользователем и обновляем текущего (see services/auth.js's
    // linkStravaAccount) — не выдаём новый JWT здесь: клиент,
    // инициировавший линковку, уже залогинен своим существующим токеном
    // (см. docs/audit/layers/01-server.md S-07).
    await authService.linkStravaAccount(userId, athlete, tokenData);

    if (client === 'mobile') {
      return res.redirect('bikelab://strava-linked?ok=1');
    }
    return res.send(renderLinkResultPage({ ok: true }));
  } catch (err) {
    if (err instanceof authService.StravaAlreadyLinkedError) {
      return fail(err.message);
    }
    logger.error({ err: err.response?.data || err }, 'Strava link error:');
    return fail('Failed to link Strava account.');
  }
});

module.exports = router;
