// Shared Strava-error -> HTTP-response mapping (T-4.1 domain extraction).
// Moved verbatim from server.js — only used by routes/activities.js
// (GET /api/activities), see that file.
const stravaTokens = require('../services/strava/tokens');
const stravaClient = require('../services/strava/client');
const logger = require('./logger');

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

module.exports = { stravaErrorResponse };
