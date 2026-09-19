// Personal-goals endpoints (T-7.1) — server/routes/goals.js. Meta-goals live
// in ./metaGoals.ts.
import { z } from 'zod';
import { defineEndpoint } from './define.js';
import { GoalSchema, GoalCreateSchema, GoalUpdateSchema } from '../../types/goal.js';

export const goals = {
  // GET /api/goals
  list: defineEndpoint({
    method: 'GET',
    path: '/api/goals',
    response: z.array(GoalSchema),
    auth: true,
    summary: "Current user's goals, with fresh server-computed current_value/percent/pace.",
  }),

  // POST /api/goals
  create: defineEndpoint({
    method: 'POST',
    path: '/api/goals',
    body: GoalCreateSchema,
    response: GoalSchema,
    auth: true,
  }),

  // PUT /api/goals/:id
  update: defineEndpoint({
    method: 'PUT',
    path: '/api/goals/:id',
    params: z.object({ id: z.coerce.number() }),
    body: GoalUpdateSchema,
    response: GoalSchema,
    auth: true,
  }),

  // DELETE /api/goals/:id
  remove: defineEndpoint({
    method: 'DELETE',
    path: '/api/goals/:id',
    params: z.object({ id: z.coerce.number() }),
    response: z.object({ success: z.boolean() }),
    auth: true,
  }),

  // POST /api/goals/recalc-vo2max/:id — `id` is kept as a string param (not
  // coerced): the handler echoes it back verbatim as `goal_id` in the
  // response, and existing clients/tests expect that to stay a string.
  recalcVo2max: defineEndpoint({
    method: 'POST',
    path: '/api/goals/recalc-vo2max/:id',
    params: z.object({ id: z.string() }),
    // `period` is optional — falls back to the goal's own stored period.
    body: z.object({ period: z.string().optional() }).passthrough(),
    response: z
      .object({
        success: z.boolean(),
        goal_id: z.union([z.number(), z.string()]),
        old_vo2max: z.union([z.number(), z.string()]).nullable().optional(),
        vo2max_value: z.coerce.number(),
        updated_goal: GoalSchema,
      })
      .passthrough(),
    auth: true,
  }),

  // POST /api/goals/update-current — admin-only manual/debug fallback (no
  // client calls this any more, GET /api/goals recomputes on every read).
  updateCurrent: defineEndpoint({
    method: 'POST',
    path: '/api/goals/update-current',
    response: z
      .object({
        success: z.boolean(),
        updated: z.number(),
        goals: z.array(GoalSchema),
      })
      .passthrough(),
    auth: true,
    admin: true,
  }),

  // GET /api/goals/:goalId/recommendations
  recommendations: defineEndpoint({
    method: 'GET',
    path: '/api/goals/:goalId/recommendations',
    params: z.object({ goalId: z.coerce.number() }),
    // getGoalRecommendations(goal_type) returns a free-form recommendations
    // object (or null when the goal_type has none) — see
    // server/recommendations/index.js.
    response: z
      .object({
        goal: GoalSchema,
        recommendations: z.unknown().nullable(),
        message: z.string().optional(),
      })
      .passthrough(),
    auth: true,
  }),
};
