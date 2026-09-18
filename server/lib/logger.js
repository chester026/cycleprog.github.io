// Single pino logger instance for the whole server (T-1.6,
// docs/audit/layers/01-server.md S-42). Replaces the ~300 emoji-laden
// console.* calls that used to be scattered across server.js/routes/
// services/middleware/lib/recommendations, with none of them levelled,
// correlation-id'd, or redacted.
//
// Level comes from config.LOG_LEVEL (config/index.js defaults it to
// 'debug' in development, 'info' otherwise).
//
// pino-pretty is only required when NODE_ENV !== 'production' — guarded so
// a production deploy that never installs devDependencies (pino-pretty is
// one) can't fail to boot over a missing transport module.
const config = require('../config');

const redact = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    '*.password',
    '*.token',
    '*.access_token',
    '*.refresh_token',
    '*.strava_access_token',
    '*.strava_refresh_token',
    '*.code',
    '*.client_secret',
    '*.apiKey',
  ],
  censor: '[Redacted]',
};

const options = {
  level: config.LOG_LEVEL,
  redact,
};

if (config.NODE_ENV !== 'production') {
  // Only reached outside production, where pino-pretty (a devDependency) is
  // expected to be installed. A production process never evaluates this
  // branch, so it never needs pino-pretty to be present.
  options.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:HH:MM:ss',
      singleLine: true,
      // Request lines are summarised in requestLogger's message; hide the objects.
      ignore: 'pid,hostname,req,res,responseTime,reqId',
    },
  };
}

const pino = require('pino');
const logger = pino(options);

module.exports = logger;
