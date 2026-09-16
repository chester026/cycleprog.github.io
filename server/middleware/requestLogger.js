// pino-http request logger (T-1.6, docs/audit/layers/01-server.md S-42).
// Mounted right after `app.set('trust proxy', 1)` in server.js so every
// downstream request/response is logged with a correlation id, a single
// object per request (no bodies, no raw headers), and a level derived from
// the response status.
const crypto = require('crypto');
const pinoHttp = require('pino-http');
const logger = require('../lib/logger');

const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existing = req.headers['x-request-id'];
    const id = (typeof existing === 'string' && existing.trim()) || crypto.randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  autoLogging: {
    ignore: (req) => req.url === '/healthz',
  },
  // One readable line per request: "GET /api/bikes 304 2ms" (the structured
  // req/res fields are still attached for JSON consumers in production).
  customSuccessMessage: (req, res, responseTime) =>
    `${req.method} ${req.url} ${res.statusCode} ${Math.round(responseTime)}ms`,
  customErrorMessage: (req, res, err) =>
    `${req.method} ${req.url} ${res.statusCode} — ${err ? err.message : 'error'}`,
  // Only method/url/status/duration end up in each log line — no request
  // bodies, no cookies/authorization headers (pino-http would otherwise log
  // full req.headers/res.headers by default). `responseTime` is added
  // automatically by pino-http itself.
  serializers: {
    req: (req) => ({ method: req.method, url: req.url }),
    res: (res) => ({ status: res.statusCode }),
  },
});

module.exports = requestLogger;
