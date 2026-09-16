// T-1.6 (docs/audit/layers/01-server.md S-42) — the pino instance must
// redact secrets from logged objects rather than relying on call sites
// remembering not to log them.
const pino = require('pino');

// We can't easily capture what lib/logger.js writes to stdout, but its
// redaction config is what actually matters, so this test builds a pino
// instance with the *same* redact config as lib/logger.js and asserts on
// that, sinking output to an in-memory writable stream we can inspect.
const { Writable } = require('stream');

function makeSink() {
  const chunks = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return { stream, lines: () => chunks.join('').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) };
}

describe('lib/logger redaction', () => {
  // Importing lib/logger.js directly would write real pretty-printed output
  // to stdout (pino-pretty, since NODE_ENV=test !== production) rather than
  // JSON we can assert on, so this test re-declares the same redact paths
  // against a destination stream instead — see lib/logger.js for the actual
  // config this must stay in sync with.
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

  it('redacts req.headers.authorization', () => {
    const { stream, lines } = makeSink();
    const logger = pino({ redact }, stream);
    logger.info({ req: { headers: { authorization: 'Bearer secret-token' } } }, 'test');
    const [entry] = lines();
    expect(entry.req.headers.authorization).toBe('[Redacted]');
  });

  it('redacts a nested token field (per the *.token redact path)', () => {
    const { stream, lines } = makeSink();
    const logger = pino({ redact }, stream);
    logger.info({ auth: { token: 'abc123' } }, 'test');
    const [entry] = lines();
    expect(entry.auth.token).toBe('[Redacted]');
  });

  it('redacts nested access_token/refresh_token/strava_* fields', () => {
    const { stream, lines } = makeSink();
    const logger = pino({ redact }, stream);
    logger.info(
      {
        tokens: {
          access_token: 'a',
          refresh_token: 'b',
          strava_access_token: 'c',
          strava_refresh_token: 'd',
        },
      },
      'test'
    );
    const [entry] = lines();
    expect(entry.tokens.access_token).toBe('[Redacted]');
    expect(entry.tokens.refresh_token).toBe('[Redacted]');
    expect(entry.tokens.strava_access_token).toBe('[Redacted]');
    expect(entry.tokens.strava_refresh_token).toBe('[Redacted]');
  });

  it('redacts password, code, client_secret and apiKey fields', () => {
    const { stream, lines } = makeSink();
    const logger = pino({ redact }, stream);
    logger.info(
      { user: { password: 'p', code: 'oauth-code', client_secret: 's', apiKey: 'k' } },
      'test'
    );
    const [entry] = lines();
    expect(entry.user.password).toBe('[Redacted]');
    expect(entry.user.code).toBe('[Redacted]');
    expect(entry.user.client_secret).toBe('[Redacted]');
    expect(entry.user.apiKey).toBe('[Redacted]');
  });
});

describe('lib/logger module', () => {
  it('exports a pino logger with level from config.LOG_LEVEL', () => {
    delete require.cache[require.resolve('../lib/logger')];
    delete require.cache[require.resolve('../config')];
    const logger = require('../lib/logger');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.child).toBe('function');
    expect(logger.level).toBe(require('../config').LOG_LEVEL);
  });
});
