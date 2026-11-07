/**
 * Activities domain contract (T-7.1, docs/audit/00-AUDIT-AND-PLAN.md T-7.1)
 * — `server/routes/activities.js` (mounted at `/api/activities`) and
 * `server/routes/aiAnalysis.js`'s standalone `POST /api/ai-analysis` (not
 * scoped to one activity, so it lives here rather than under `:id` — see
 * that file's header).
 *
 * `GET /api/activities/:id/streams` returns Strava's per-type stream object
 * (`{heartrate: {data:[...]}, watts: {data:[...]}, ...}` — wide and
 * variable by which sensors the ride had) — kept as a loose record rather
 * than enumerating every possible stream key.
 */
import { z } from 'zod';
import { defineEndpoint } from './define.js';

// `GET /api/activities`/`GET /api/activities/:id` pass whatever
// `stravaActivities.getActivities()`/`getActivity()` return straight
// through (`res.json(activity)`), unmodified — sometimes Strava's raw JSON
// (matches `types/activity.ts`'s `StravaActivitySchema`), sometimes a
// DB-reconstructed fallback (`rowToActivity()` in services/strava/
// activities.js) whose numeric fields are `undefined`/`null` for any NULL
// DB column and which never repopulates `type`/`start_date` when the row
// has no cached `raw` JSON. `StravaActivitySchema`'s required fields don't
// hold for that fallback shape (confirmed by test/integration/
// activities.test.js's happy-path fixtures, which only ever set a handful
// of fields) — `id` is the one thing every shape actually has.
const LooseActivitySchema = z.object({ id: z.union([z.number(), z.string()]) }).passthrough();

// GET /api/activities?limit=&cursor= (S-34 opt-in pagination) — no `limit`
// returns the full unpaginated array (see routes/activities.js header for
// why: existing web/app callers still rely on that until phases 5/6).
const ActivitiesListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(500).optional(),
    cursor: z.string().optional(),
  })
  .passthrough();

const ActivityIdParamsSchema = z.object({ id: z.coerce.number() });

// Strava's streams response, keyed by stream type
// (heartrate/watts/cadence/altitude/velocity_smooth/time/latlng, per
// `key_by_type: true` in services/strava/activities.js's getStreams) — each
// value is `{data: [...], series_type, original_size, resolution}`.
// downsampleStreamsResponse (lib/downsampleStreams.js) preserves this same
// shape, just with shorter `data` arrays, so one schema covers both the
// `?downsample=` and full-resolution responses.
const StravaStreamsResponseSchema = z.record(z.string(), z.unknown());

const FtpIntervalSchema = z.object({
  startSec: z.number(),
  durationSec: z.number(),
  avgHr: z.number(),
});

// `{...result, fromCache}` from services/ftpAnalysis.js's analyzeActivity —
// `result` is @bikelab/shared/calc's FtpAnalysisResult.
const FtpAnalysisResponseSchema = z.object({
  totalMinutes: z.number(),
  totalIntervals: z.number(),
  intervals: z.array(FtpIntervalSchema),
  fromCache: z.boolean(),
});

const MetaGoalContributionSchema = z.object({
  type: z.string(),
  label: z.string(),
  value: z.string(),
});

// services/activities.js's getMetaGoalsProgressForActivity() result item.
const MetaGoalProgressItemSchema = z.object({
  id: z.union([z.number(), z.string()]),
  title: z.string(),
  status: z.string().nullable(),
  // Legacy rows predate the tier column and carry NULL; the card falls back
  // to 'base'.
  tier: z.string().nullable().optional(),
  progress: z.number(),
  progressGain: z.number(),
  contributions: z.array(MetaGoalContributionSchema),
});

// POST /api/ai-analysis body — an arbitrary client-built training summary
// object (routes/aiAnalysis.js just passes it through to
// aiAnalysis.analyzeTraining); routes/activities.js's own `/:id/ai-analysis`
// builds an equivalent summary server-side instead, so there's no shared
// summary shape to reuse here.
const AiAnalysisRequestSchema = z.object({ summary: z.record(z.string(), z.unknown()) }).passthrough();

// GET /api/activities/:id/power-breakdown (docs/plans/ride-power-insights.md)
// — the ride screen's Power block: the per-second breakdown
// (shared/calc ridePowerBreakdown, cached in activity_analysis as
// `ride_power`) plus how it sits against the last 12 weeks of power-meter
// rides (shared/calc ridePowerInsights). `insights` is null when the ride
// has no power meter (`breakdown.source === 'none'`).
const RideSegmentSchema = z.object({
  kind: z.enum(['climb', 'flat', 'descent']),
  start_s: z.number(),
  duration_s: z.number(),
  distance_m: z.number(),
  grade_pct: z.number(),
  avg_w: z.number().nullable(),
  avg_hr: z.number().nullable(),
  avg_speed_kmh: z.number(),
  avg_cadence: z.number().nullable(),
  /** Altitude profile, 24 samples by distance (m). Optional: rows cached before it existed lack it. */
  profile: z.array(z.number()).optional(),
});

const RidePowerBreakdownSchema = z
  .object({
    activity_id: z.number(),
    ftp_w: z.number().nullable().optional(),
    source: z.enum(['meter', 'none']),
    duration_s: z.number(),
    moving_s: z.number().optional(),
    avg_w: z.number().nullable(),
    np_w: z.number().nullable(),
    max_w: z.number().nullable(),
    vi: z.number().nullable(),
    if_: z.number().nullable(),
    tss: z.number().nullable(),
    best_efforts_w: z.record(z.string(), z.number()),
    zones_s: z.array(z.number()),
    segments: z.array(RideSegmentSchema),
    fade: z.object({ first_half_w: z.number(), second_half_w: z.number(), pct: z.number() }).nullable(),
    coasting_pct: z.number().nullable(),
    note: z.string().optional(),
  })
  .passthrough();

const EffortRowSchema = z.object({
  seconds: z.number(),
  watts: z.number().nullable(),
  best_watts: z.number().nullable(),
  best_activity_id: z.number().nullable(),
  best_date: z.string().nullable(),
  rank: z.number().nullable(),
  total: z.number(),
  pct_of_best: z.number().nullable(),
  gap_w: z.number().nullable(),
  is_pr: z.boolean(),
});

const RidePowerInsightsSchema = z.object({
  intensity: z.enum(['recovery', 'endurance', 'tempo', 'threshold', 'race']).nullable(),
  ftp: z.object({ watts: z.number(), w_per_kg: z.number().nullable(), delta_w: z.number().nullable() }).nullable(),
  highlight: z.object({ seconds: z.number(), rank: z.number(), total: z.number() }).nullable(),
  efforts: z.array(EffortRowSchema),
  recent: z
    .object({
      default_seconds: z.number(),
      options: z.array(
        z.object({
          seconds: z.number(),
          reason: z.enum(['highlight', 'intensity']),
          rides: z.array(z.object({ activity_id: z.number(), date: z.string(), watts: z.number() })),
          ride_w: z.number(),
          avg_prev_w: z.number().nullable(),
          vs_avg_pct: z.number().nullable(),
          rank: z.number(),
          total: z.number(),
        }),
      ),
    })
    .nullable(),
  pacing: z.object({ vi: z.number(), fade_pct: z.number(), kind: z.enum(['even', 'negative', 'faded', 'surgy']) }).nullable(),
  /** Weeks the comparison window covers. */
  weeks: z.number(),
  /** True when the history is partial (Strava fetch budget / rate limit) — ranks may improve on a later open. */
  partial: z.boolean(),
});

const RidePowerBreakdownResponseSchema = z.object({
  breakdown: RidePowerBreakdownSchema,
  insights: RidePowerInsightsSchema.nullable(),
});
export type RidePowerBreakdownResponse = z.infer<typeof RidePowerBreakdownResponseSchema>;
export type RidePowerInsightsDto = z.infer<typeof RidePowerInsightsSchema>;
export type RideSegmentDto = z.infer<typeof RideSegmentSchema>;

export const activities = {
  list: defineEndpoint({
    method: 'GET',
    path: '/api/activities',
    query: ActivitiesListQuerySchema,
    // No `limit` -> the full array (unpaginated); the paginated shape is
    // the same array, just sliced — X-Total-Count/X-Next-Cursor are
    // response headers, not part of the JSON body.
    response: z.array(LooseActivitySchema),
    auth: true,
    summary: 'This user\'s Strava activities (opt-in pagination via ?limit/?cursor, see header comment).',
  }),
  detail: defineEndpoint({
    method: 'GET',
    path: '/api/activities/:id',
    params: ActivityIdParamsSchema,
    response: LooseActivitySchema,
    auth: true,
  }),
  streams: defineEndpoint({
    method: 'GET',
    path: '/api/activities/:id/streams',
    params: ActivityIdParamsSchema,
    // `downsample` is best-effort (lib/downsampleStreams.js's
    // parseDownsampleParam treats anything unparseable as "no downsample"
    // rather than a 400) — kept loose rather than coerced-and-rejected.
    query: z.object({ downsample: z.union([z.string(), z.number()]).optional() }).passthrough(),
    response: StravaStreamsResponseSchema,
    auth: true,
  }),
  ftpAnalysis: defineEndpoint({
    method: 'GET',
    path: '/api/activities/:id/ftp-analysis',
    params: ActivityIdParamsSchema,
    response: FtpAnalysisResponseSchema,
    auth: true,
  }),
  powerBreakdown: defineEndpoint({
    method: 'GET',
    path: '/api/activities/:id/power-breakdown',
    params: ActivityIdParamsSchema,
    response: RidePowerBreakdownResponseSchema,
    auth: true,
  }),
  cacheClear: defineEndpoint({
    method: 'POST',
    path: '/api/activities/cache/clear',
    response: z.object({ success: z.boolean(), message: z.string() }),
    auth: true,
  }),
  aiAnalysis: defineEndpoint({
    method: 'GET',
    path: '/api/activities/:id/ai-analysis',
    params: ActivityIdParamsSchema,
    response: z.object({ analysis: z.string() }),
    auth: true,
    summary: 'Per-activity AI analysis, built server-side from this activity\'s Strava summary (for RN).',
  }),
  metaGoalsProgress: defineEndpoint({
    method: 'GET',
    path: '/api/activities/:id/meta-goals-progress',
    params: ActivityIdParamsSchema,
    response: z.array(MetaGoalProgressItemSchema),
    auth: true,
  }),
  // POST /api/ai-analysis (server/routes/aiAnalysis.js) — not scoped to an
  // activity, mounted at `/api` rather than `/api/activities`.
  analyzeSummary: defineEndpoint({
    method: 'POST',
    path: '/api/ai-analysis',
    body: AiAnalysisRequestSchema,
    response: z.object({ analysis: z.string() }),
    auth: true,
    summary: 'AI analysis for an arbitrary client-built training summary (routes/aiAnalysis.js).',
  }),
};
