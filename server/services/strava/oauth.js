// The `authorization_code` side of Strava OAuth — login (/exchange_token)
// and account linking (/link_strava) exchange a one-time `code` for tokens
// here. This is deliberately separate from tokens.js (which only ever
// refreshes a token this app already has) and from client.js (which talks to
// the REST API for a user who's already linked) — at the moment
// exchangeCode() runs there is no userId yet for a brand-new signup.
const { stravaHttp } = require('../../lib/http');
const config = require('../../config');
const { updateLimitsFromHeaders } = require('./client');
const logger = require('../../lib/logger');

// code -> { access_token, refresh_token, expires_at, athlete }
async function exchangeCode(code) {
  const response = await stravaHttp.post('https://www.strava.com/oauth/token', {
    client_id: config.STRAVA_CLIENT_ID,
    client_secret: config.STRAVA_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
  });
  return response.data;
}

// Only needed right after exchangeCode(), before the athlete has a row we
// could route through client.js's per-user stravaGet.
async function getAthlete(accessToken) {
  const response = await stravaHttp.get('https://www.strava.com/api/v3/athlete', {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 10000,
  });
  await updateLimitsFromHeaders(response.headers);
  return response.data;
}

// Frees up the athlete slot in this app's Strava quota. Best-effort — never
// throws, matches the old inline behaviour.
async function deauthorize(accessToken) {
  try {
    await stravaHttp.post('https://www.strava.com/oauth/deauthorize', null, {
      params: { access_token: accessToken },
    });
    return true;
  } catch (error) {
    logger.error({ err: error.response?.data || error.message }, '⚠️ Strava deauthorization failed:');
    return false;
  }
}

module.exports = { exchangeCode, getAthlete, deauthorize };
