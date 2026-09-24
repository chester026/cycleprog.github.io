import { z } from 'zod';
import {
  VALID_AGGREGATES,
  VALID_FIELDS,
  VALID_SKILLS,
  VALID_HEALTH_METRICS,
  GOAL_PERIODS,
  META_GOAL_TIERS,
} from '../constants/goalTypes.js';

// Mirrors server/goalCalculator.js's declarative `metric` JSONB column
// (source/aggregate/field/filter) — see md/GOALS_REDESIGN_PLAN_FINAL.md.
// Legacy goals (created before the redesign) have `metric` null/undefined
// and fall back to goal_type/period switch logic (calculateGoalProgress).
export const GoalMetricFilterSchema = z
  .object({
    type_in: z.array(z.string()).optional(),
    min_distance: z.number().optional(),
    max_distance: z.number().optional(),
    min_elevation_rate: z.number().optional(),
    max_elevation_rate: z.number().optional(),
    max_elevation: z.number().optional(),
    min_speed: z.number().optional(),
    max_speed: z.number().optional(),
    min_moving_time: z.number().optional(),
    name_contains: z.array(z.string()).optional(),
  })
  .passthrough()
  .optional();

export const GoalMetricSchema = z
  .object({
    // T-7.1 CONTRACT_VALIDATE_RESPONSES: AI-generated sub-goals
    // (POST /api/meta-goals/ai-generate) persist whatever `source` string
    // the model returns verbatim (repositories/goals.js's
    // metricSubGoalRow/insertAiSubGoalsBatch, aiGoals.js) — never validated
    // against VALID_SOURCES before the INSERT, so real rows can and do
    // carry values outside that enum. Kept as a free string here (was
    // `z.enum(VALID_SOURCES)`) so response validation reflects what's
    // actually stored; VALID_SOURCES itself stays the source of truth for
    // anything that constructs a NEW metric from a known-good source.
    source: z.string(),
    aggregate: z.enum(VALID_AGGREGATES).optional(),
    field: z.enum(VALID_FIELDS).optional(),
    transform: z.number().optional(),
    filter: GoalMetricFilterSchema,
    skill: z.enum(VALID_SKILLS).optional(),
    health_metric: z.enum(VALID_HEALTH_METRICS).optional(),
  })
  .passthrough();

export type GoalMetric = z.infer<typeof GoalMetricSchema>;

export const GoalPaceSchema = z.object({
  daysElapsed: z.number(),
  daysRemaining: z.number(),
  expectedValue: z.number(),
  onTrack: z.boolean(),
  percentDelta: z.number(),
});

export type GoalPace = z.infer<typeof GoalPaceSchema>;

// GET /api/goals / GET /api/meta-goals/:id sub-goal item (server/server.js).
// `current_value`/`percent`/`pace` are always server-computed and fresh —
// clients only render them (see docs/audit/layers/04-cross-layer.md §4.2).
export const GoalSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    user_id: z.union([z.number(), z.string()]).optional(),
    meta_goal_id: z.union([z.number(), z.string()]).nullable().optional(),
    title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    // New-style metric-based sub-goals (POST /api/meta-goals/ai-generate)
    // deliberately leave goal_type NULL (see the DDL comment on the `goals`
    // table) — T-7.1 CONTRACT_VALIDATE_RESPONSES.
    goal_type: z.string().nullable(),
    target_value: z.coerce.number(),
    current_value: z.coerce.number(),
    unit: z.string().nullable().optional(),
    period: z.string().nullable().optional(),
    // Legacy (pre-redesign, goal_type-based) goals have `source` NULL in the
    // DB, not just absent; AI-generated sub-goals can carry a value outside
    // VALID_SOURCES (see GoalMetricSchema.source above) — T-7.1
    // CONTRACT_VALIDATE_RESPONSES.
    source: z.string().nullable().optional(),
    metric: GoalMetricSchema.nullable().optional(),
    // No per-sub-goal start_date/end_date: a sub-goal is a metric of its
    // meta-goal and shares its window ([meta.created_at, meta.target_date]).
    // The columns were dropped in 1758000000009_goal-window-on-meta.sql —
    // they were the metric-model replacement for the older `period` enum,
    // and having two independent deadlines meant extending a goal moved
    // only one of them (owner decision, 21.09).
    percent: z.number().optional(),
    pace: GoalPaceSchema.nullable().optional(),
    metric_name: z.string().nullable().optional(),
    hr_threshold: z.coerce.number().nullable().optional(),
    duration_threshold: z.coerce.number().nullable().optional(),
    vo2max_value: z.coerce.number().nullable().optional(),
    priority: z.coerce.number().nullable().optional(),
    reasoning: z.string().nullable().optional(),
    // T-7.1: pg returns TIMESTAMPTZ columns as Date objects — response
    // validation runs BEFORE res.json's JSON.stringify would turn them into
    // strings, so both shapes must be accepted here.
    created_at: z.union([z.string(), z.date()]).optional(),
    updated_at: z.union([z.string(), z.date()]).optional(),
  })
  .passthrough();

export type Goal = z.infer<typeof GoalSchema>;

// POST /api/goals request body (server/server.js). Numbers may arrive as
// empty strings from web form inputs — the route itself converts '' to 0/
// defaults, so this schema only guards the *types*, not the business
// defaulting, which stays server-side.
export const GoalCreateSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().nullable().optional(),
    // Coerce handles the web form's '' → 0 case for free (Number('') === 0),
    // matching the server's own '' -> 0 fallback (server/server.js POST
    // /api/goals) without needing a separate literal('') branch.
    target_value: z.coerce.number().optional(),
    current_value: z.coerce.number().optional(),
    unit: z.string().optional(),
    goal_type: z.string(),
    period: z.string().optional(),
    hr_threshold: z.coerce.number().optional(),
    duration_threshold: z.coerce.number().optional(),
    meta_goal_id: z.union([z.number(), z.string()]).nullable().optional(),
  })
  .passthrough();

export type GoalCreateBody = z.infer<typeof GoalCreateSchema>;

// PUT /api/goals/:id request body — every field optional (partial update).
export const GoalUpdateSchema = GoalCreateSchema.omit({ meta_goal_id: true }).partial();

export type GoalUpdateBody = z.infer<typeof GoalUpdateSchema>;

// GET /api/meta-goals(/:id) item (server/server.js).
export const MetaGoalSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    user_id: z.union([z.number(), z.string()]).optional(),
    title: z.string(),
    description: z.string().nullable().optional(),
    status: z.enum(['active', 'completed']),
    tier: z.enum(META_GOAL_TIERS).nullable().optional(),
    target_date: z.string().nullable().optional(),
    ai_generated: z.boolean().optional(),
    ai_context: z.unknown().nullable().optional(),
    // pg returns TIMESTAMPTZ as a Date object (see GoalSchema above).
    created_at: z.union([z.string(), z.date()]),
    updated_at: z.union([z.string(), z.date()]).optional(),
    // Set on the active -> completed transition (migration
    // 1758000000011_meta-goal-completed-at.sql), null while active. Older
    // servers don't send it at all — clients fall back to updated_at.
    completed_at: z.union([z.string(), z.date()]).nullable().optional(),
    focus_tags: z.array(z.string()).optional(),
    trainingTypes: z
      .array(
        z
          .object({
            type: z.string(),
            title: z.string(),
            description: z.string(),
            priority: z.number(),
          })
          .passthrough()
      )
      .optional(),
    readyToComplete: z.boolean().optional(),
    // GET /api/meta-goals now returns each meta-goal's sub-goals (with
    // server-computed current_value/percent/pace) inline, so cards don't
    // need a separate N+1 GET /api/goals per row (T-3.4,
    // docs/audit/layers/03-react-spa.md W-33, docs/audit/layers/02-bikelabapp.md
    // A-13). GET /api/meta-goals/:id keeps its own separate `subGoals` field
    // in its response envelope (see MetaGoalDetailSchema below) — this one is
    // specific to the list endpoint.
    sub_goals: z.array(GoalSchema).optional(),
  })
  .passthrough();

export type MetaGoal = z.infer<typeof MetaGoalSchema>;

// GET /api/meta-goals/:id response envelope.
export const MetaGoalDetailSchema = z.object({
  metaGoal: MetaGoalSchema,
  subGoals: z.array(GoalSchema),
});

export type MetaGoalDetail = z.infer<typeof MetaGoalDetailSchema>;

export const GoalPeriodSchema = z.enum(GOAL_PERIODS);
