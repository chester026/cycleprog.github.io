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

    // Compatibility shim for the BikeLab iOS build that is in the App Store
    // while the refactored build (this branch's BikeLabApp/) sits in
    // TestFlight. That store build (a) starts Strava login with its own
    // authorize URL — redirect_uri `/exchange_token?mobile=true`, no `state`
    // — and expects the session JWT back on an `/auth/success?token=` page
    // that deep-links `bikelab://auth?token=`; (b) POSTs its own numbers to
    // /api/skills-history and /api/analytics-snapshot, which are admin-only
    // since T-3.3. With this on, routes/oauthCallbacks.js serves the old
    // login flow for state-less `?mobile=true` callbacks, and those two
    // POSTs run the server-side computation instead of 403 (the client's
    // numbers are ignored either way). Off by default; set to 'true' on
    // Render only until the new build ships to the store, then remove it
    // and delete the `legacyMobile` branches it guards.
    LEGACY_MOBILE_COMPAT: z
      .string()
      .default('false')
      .transform((v) => v.toLowerCase() === 'true'),

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

    // Garmin Connect IQ device JWT lifetime (lib/jwt.js issueDeviceToken,
    // docs/plans/garmin-connect-iq.md §2.1). Long on purpose: the bike
    // computer cannot re-login by itself. Revocation is per-device via
    // garmin_devices.revoked_at (checked on every /api/garmin request) plus
    // the usual users.token_version bump.
    GARMIN_TOKEN_TTL: z.string().default('365d'),

    // Garmin Connect Personal API key (services/garminConnect/personalClient.js).
    // It reads ONE Garmin account — the owner's — and Garmin's terms rule out
    // serving other people with it. Used by scripts/garmin-probe.js and
    // scripts/garmin-sync.js, and by exactly one request handler: POST
    // /api/garmin/connect/sync (services/garminConnect/refresh.js), which
    // works only for the rider whose connection was made with this key.
    // Without it that endpoint answers 503 and the coach offers no refresh.
    GARMIN_API: z.string().optional(),

    STRAVA_CLIENT_ID: nonEmpty('STRAVA_CLIENT_ID'),
    STRAVA_CLIENT_SECRET: nonEmpty('STRAVA_CLIENT_SECRET'),

    OPENAI_API_KEY: nonEmpty('OPENAI_API_KEY'),
    // Everyone gets the same model (no per-user overrides). It must be enabled on the OpenAI
    // account/tier. Reasoning effort is sent as `reasoning.effort` on the Responses API; a model
    // that rejects it (e.g. gpt-4.1-mini) is retried once without it (lib/openaiResponses.js).
    COACH_MODEL: z.string().default('gpt-6-luna'),
    COACH_REASONING_EFFORT: z.enum(['none', 'low', 'medium', 'high']).default('low'),
    // Per-ride text summary (aiAnalysis.js, GET /api/activities/:id/ai-analysis).
    // Used to be a hardcoded gpt-4.1-nano with `temperature`, which stopped
    // answering (30.10.2026, "AI analysis failed" in both the ride list and
    // the ride screen) — now the coach's model by default, no reasoning
    // (it is a 200-word summary, not a tool loop).
    AI_ANALYSIS_MODEL: z.string().default('gpt-6-luna'),

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

    // max_output_tokens for aiCoach.js's OpenAI calls — the main chat turn
    // (including tool-result follow-ups, same loop/same cap) vs. the
    // separate free-form suggestions call. The chat cap also covers hidden
    // reasoning tokens, so it is far above the visible reply length.
    COACH_CHAT_MAX_TOKENS: z.coerce.number().int().positive().default(8000),
    COACH_SUGGESTIONS_MAX_TOKENS: z.coerce.number().int().positive().default(300),

    // Per-user daily token budget (services/aiBudget.js) shared across every
    // OpenAI-backed endpoint (coach chat, ai-analysis, meta-goals ai-generate).
    // The coach's system prompt + tool schemas alone run ~12k tokens, and one
    // chat turn is 2-4 OpenAI calls (tool round(s) + final reply + the
    // separate suggestions call) — the old 200000 default was only ~5-8
    // turns before "Daily AI budget exceeded" (owner-reported after ~26
    // chats/day, T-? coach-readiness-budget). Raised 10x; recordUsage also
    // now counts cached prompt tokens at their actual (25%) billed weight
    // instead of full price, so a long-running conversation's repeated
    // system-prompt tokens cost less against this budget than they used to.
    AI_DAILY_TOKEN_BUDGET: z.coerce.number().int().positive().default(2000000),

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

    // Sign in with Apple / Google (services/identity/*, docs/plans/
    // auth-providers.md). All optional: a provider whose audience is not
    // configured answers 503 PROVIDER_NOT_CONFIGURED and GET
    // /api/auth/providers tells clients to hide its button.
    //   APPLE_BUNDLE_ID   — `aud` of tokens from the iOS app.
    //   APPLE_SERVICES_ID — `aud` of tokens from the web button.
    //   APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY(_FILE) — the .p8 key
    //     that signs the client secret for Apple's token and revoke
    //     endpoints. Not needed to verify a sign-in; without it no refresh
    //     token is obtained, so an account deletion cannot revoke the grant.
    //     _FILE is a path (local dev), the other the PEM itself (Render).
    //   GOOGLE_CLIENT_IDS — comma-separated OAuth client ids (iOS, web,
    //     Android) accepted as `aud`.
    //   IDENTITY_TOKEN_ENC_KEY — 64 hex chars; encrypts the stored Apple
    //     refresh token (lib/secretBox.js).
    APPLE_BUNDLE_ID: z.string().optional(),
    APPLE_SERVICES_ID: z.string().optional(),
    APPLE_TEAM_ID: z.string().optional(),
    APPLE_KEY_ID: z.string().optional(),
    APPLE_PRIVATE_KEY: z.string().optional(),
    APPLE_PRIVATE_KEY_FILE: z.string().optional(),
    GOOGLE_CLIENT_IDS: z
      .string()
      .default('')
      .transform((v) => v.split(',').map((id) => id.trim()).filter(Boolean)),
    IDENTITY_TOKEN_ENC_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, 'IDENTITY_TOKEN_ENC_KEY must be 64 hex characters (openssl rand -hex 32)')
      .optional(),

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

    // middleware/rateLimits.js authLimiter: login/register/OAuth attempts per
    // IP per 15 min. Raised only by the web e2e suite, whose ~15 specs each
    // log in from one IP.
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
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
