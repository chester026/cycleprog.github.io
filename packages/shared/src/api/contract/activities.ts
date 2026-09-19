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
