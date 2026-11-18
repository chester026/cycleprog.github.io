// Shared Strava-error -> HTTP-response mapping (T-4.1 domain extraction).
// Moved verbatim from server.js — only used by routes/activities.js
// (GET /api/activities), see that file.
const stravaTokens = require('../services/strava/tokens');
const stravaClient = require('../services/strava/client');
const logger = require('./logger');

// 409, never 401: both clients read a 401 as "the session is dead" and sign
// the rider out. An account without Strava is a normal account
// (docs/plans/auth-providers.md §3.6) — it just has no ride to show here.
function stravaNotLinkedResponse(res) {
  return res.status(409).json({ error: 'Strava is not connected', code: 'STRAVA_NOT_LINKED' });
}

function stravaErrorResponse(res, err, fallbackMessage) {
  if (err instanceof stravaTokens.StravaNotLinkedError) {
    return stravaNotLinkedResponse(res);
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

module.exports = { stravaErrorResponse, stravaNotLinkedResponse };
