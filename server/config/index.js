// Single source of truth for environment configuration (T-1.1, S-14/S-19/S-37,
// docs/audit/00-AUDIT-AND-PLAN.md). Every other module reads config from here
// instead of touching `process.env` directly, so the whole set of variables
// the server depends on is validated fail-fast at boot, in one place.
//
// `require('dotenv').config()` used to run twice in server.js (S-39) and is
// only needed to populate process.env from a local .env file before we read
// it below — it now lives here, once, and nowhere else.
require('dotenv').config({ quiet: true });

const { z } = require('zod');

const nonEmpty = (label) => z.string().min(1, `${label} is required`);

const schema = z
  .object({
    NODE_ENV: z.string().default('development'),
    PORT: z.coerce.number().int().positive().default(8080),

    // Whether server.js runs `migrate.js`'s `runMigrations()` itself before
    // `app.listen` (T-1.4, docs/audit/00-AUDIT-AND-PLAN.md, S-29). Defaults
    // on so nothing changes for existing single-step deploys; set to
    // 'false' when migrations run as their own deploy step (`npm run
    // migrate`) ahead of starting the server, e.g. to avoid every instance
    // in a multi-instance deploy racing to run migrations on boot.
    MIGRATE_ON_START: z
      .string()
      .default('true')
      .transform((v) => v.toLowerCase() !== 'false'),

    // Signs/verifies session + purpose JWTs (lib/jwt.js). Length requirement
    // is tightened further below via .superRefine once NODE_ENV is known —
    // production needs >=32 chars, everywhere else just warns below that.
    JWT_SECRET: nonEmpty('JWT_SECRET'),

    // Session JWT lifetime (lib/jwt.js issueSessionToken) — a jsonwebtoken
    // `expiresIn` string. T-4.5 (S-14): kept at its historical 7d default
    // for now so no currently-deployed client is logged out by this change;
    // phases 5/6 of the auth-hardening plan switch every client onto the
    // new opt-in refresh-token flow (POST /api/auth/refresh) first, and only
    // then does the *default* here drop to something like '1h' — do not
    // shorten this default ahead of that.
    ACCESS_TOKEN_TTL: z.string().default('7d'),

    // Refresh-token TTL in days (services/auth.js issueRefreshToken /
    // rotateRefreshToken) — how long an unused refresh token stays
    // redeemable before it must be re-obtained via a fresh login.
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(60),

    STRAVA_CLIENT_ID: nonEmpty('STRAVA_CLIENT_ID'),
    STRAVA_CLIENT_SECRET: nonEmpty('STRAVA_CLIENT_SECRET'),

    OPENAI_API_KEY: nonEmpty('OPENAI_API_KEY'),
    COACH_MODEL: z.string().default('gpt-4.1-mini'),

    // T-4.4 (audit S-31) — OpenAI cost control. --------------------------
    // Server-side conversation history (routes/coach.js): how many past
    // coach_messages rows to load per turn, and a rough character budget on
    // top of that (oldest dropped first, message-at-a-time — NOT a hard
    // per-message truncation) so a long-running conversation can't balloon
    // the prompt indefinitely even if it's under COACH_HISTORY_MESSAGES.
    // ~4 chars/token is the usual rule of thumb, so 24000 chars is roughly
    // a 6k-token history budget.
    COACH_HISTORY_MESSAGES: z.coerce.number().int().positive().default(30),
    COACH_HISTORY_MAX_CHARS: z.coerce.number().int().positive().default(24000),

    // max_tokens for aiCoach.js's OpenAI calls — the main chat turn
    // (including tool-result follow-ups, same loop/same cap) vs. the
    // separate free-form suggestions call.
    COACH_CHAT_MAX_TOKENS: z.coerce.number().int().positive().default(1200),
    COACH_SUGGESTIONS_MAX_TOKENS: z.coerce.number().int().positive().default(300),

    // Per-user daily token budget (services/aiBudget.js) shared across every
    // OpenAI-backed endpoint (coach chat, ai-analysis, meta-goals ai-generate).
    AI_DAILY_TOKEN_BUDGET: z.coerce.number().int().positive().default(200000),

    // aiGoals.js used to try a hardcoded 3-model fallback chain — replaced
    // with one configured model, failing fast on error. Defaults to the
    // first model of that old chain so behavior is unchanged out of the box.
    OPENAI_GOALS_MODEL: z.string().default('gpt-4o-mini'),

    // Postgres — either DATABASE_URL or the PGHOST-led group works (checked
    // below); individual PG* vars stay optional here so DATABASE_URL-only
    // deployments don't fail parsing.
    PGHOST: z.string().optional(),
    PGUSER: z.string().optional(),
    PGPASSWORD: z.string().optional(),
    PGDATABASE: z.string().optional(),
    PGPORT: z.coerce.number().int().positive().optional(),
    PGSSLMODE: z.string().optional(),
    PGSSLROOTCERT: z.string().optional(),
    DATABASE_URL: z.string().optional(),

    IMAGEKIT_PUBLIC_KEY: z.string().optional(),
    IMAGEKIT_PRIVATE_KEY: z.string().optional(),
    IMAGEKIT_URL_ENDPOINT: z.string().optional(),

    BREVO_API_KEY: z.string().optional(),

    FRONTEND_URL: z.string().default('https://bikelab.app'),
    BACKEND_BASE: z.string().optional(),

    OURA_CLIENT_ID: z.string().optional(),
    OURA_CLIENT_SECRET: z.string().optional(),

    // pino log level (lib/logger.js). Defaults to 'debug' in development,
    // 'info' everywhere else, unless explicitly set.
    LOG_LEVEL: z.string().optional(),

    // Sentry (lib/sentry.js) — error/perf monitoring. Optional: when
    // SENTRY_DSN is unset, Sentry.init is never called and every Sentry call
    // in the app is a documented no-op.
    SENTRY_DSN: z.string().optional(),
    SENTRY_ENV: z.string().optional(),

    // lib/cache.js: when set, every createCache() call is backed by Redis
    // instead of an in-process Map, so more than one server instance shares
    // activities/weather/Strava-rate-limit caches (T-4.3, S-24). Optional —
    // unset means every cache stays in-process, same as before this task.
    REDIS_URL: z.string().optional(),
  })
  .refine((env) => Boolean(env.DATABASE_URL || env.PGHOST), {
    message: 'Either DATABASE_URL or PGHOST must be set',
    path: ['PGHOST'],
  });

function formatIssues(issues) {
  return issues.map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n');
}

function parseConfig(env) {
  const result = schema.safeParse(env);
  if (!result.success) {
    console.error('Invalid environment configuration:\n' + formatIssues(result.error.issues));
    process.exit(1);
  }

  const config = result.data;

  // BACKEND_BASE falls back to FRONTEND_URL (this server's own base URL for
  // Strava/Oura OAuth redirects, as opposed to FRONTEND_URL which is where
  // the SPA/marketing site lives — see server.js's original comment).
  if (!config.BACKEND_BASE) config.BACKEND_BASE = config.FRONTEND_URL;

  const isProduction = config.NODE_ENV === 'production';

  if (!config.LOG_LEVEL) {
    config.LOG_LEVEL = 'info'; // set LOG_LEVEL=debug explicitly for verbose output
  }
  if (!config.SENTRY_ENV) config.SENTRY_ENV = config.NODE_ENV;
  if (isProduction && config.JWT_SECRET.length < 32) {
    console.error(`Invalid environment configuration:\n  - JWT_SECRET: must be at least 32 characters in production`);
    process.exit(1);
  }
  if (!isProduction && config.JWT_SECRET.length < 8) {
    console.error(`Invalid environment configuration:\n  - JWT_SECRET: must be at least 8 characters`);
    process.exit(1);
  }
  if (!isProduction && config.JWT_SECRET.length < 32) {
    console.warn(
      `[config] JWT_SECRET is only ${config.JWT_SECRET.length} characters — fine for ${config.NODE_ENV}, but production requires >=32.`
    );
  }

  return config;
}

const config = parseConfig(process.env);

module.exports = Object.freeze(config);
