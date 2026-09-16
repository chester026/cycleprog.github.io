// Sentry wiring (T-1.6, docs/audit/layers/01-server.md S-42). Only
// initializes when config.SENTRY_DSN is set — with no DSN, Sentry.init is
// never called and @sentry/node's own SDK no-ops every capture/setup call,
// so the server starts and runs exactly as before with zero DSN configured.
//
// Uses @sentry/node's Express integration
// (Sentry.setupExpressErrorHandler(app), documented for v8+ — installed
// major here is 10, see node_modules/@sentry/node/package.json), which must
// be wired in AFTER all routes but BEFORE our own error handler so Sentry
// sees the error first and still forwards it to errorHandler.js.
const Sentry = require('@sentry/node');
const config = require('../config');

if (config.SENTRY_DSN) {
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.SENTRY_ENV,
    tracesSampleRate: 0.1,
    // Render sets RENDER_GIT_COMMIT on deploys; undefined (not set) elsewhere
    // just means Sentry won't tag events with a release.
    release: process.env.RENDER_GIT_COMMIT || undefined,
  });
}

module.exports = Sentry;
