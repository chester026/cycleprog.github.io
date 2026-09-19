// Training-plan endpoints (T-7.1) — server/routes/training.js
// (`/api/training-plan*`, `/api/training-types*`).
import { z } from 'zod';
import { defineEndpoint } from './define.js';
import { TrainingTypeSchema } from '../../types/training.js';

// GET /api/training-plan response — server/services/training.js's
// generatePersonalizedPlan. `plan`/`analysis`/`priorities` come from
// recommendations/training-utils's generateWeeklyPlan (a large,
// AI/rules-generated structure not worth pinning field-by-field), and
// `userProfile` is the user_profiles row — kept loose here on purpose (see
// contract rules: wide/unstable rows get `.passthrough()`/`z.unknown()`).
export const TrainingPlanSchema = z
  .object({
    plan: z.unknown(),
    analysis: z.unknown(),
    priorities: z.unknown(),
    userProfile: z.unknown(),
    // day_key -> custom training override (see getCustomTrainingPlan).
    customPlan: z.record(z.string(), z.unknown()),
    weekStartDate: z.string(),
    isFallbackPlan: z.boolean(),
    fallbackMessage: z.string().nullable(),
  })
  .passthrough();

// GET /api/training-plan/stats response — repositories/training.js's
// getPlanExecutionStats.
export const TrainingPlanStatsSchema = z
  .object({
    totalGoals: z.number(),
    averageProgress: z.number(),
  })
  .passthrough();

export const training = {
  // GET /api/training-plan
  plan: defineEndpoint({
    method: 'GET',
    path: '/api/training-plan',
    response: TrainingPlanSchema,
    auth: true,
  }),

  // GET /api/training-types/:type
  typeDetail: defineEndpoint({
    method: 'GET',
    path: '/api/training-types/:type',
    params: z.object({ type: z.string() }),
    response: TrainingTypeSchema,
    auth: true,
  }),

  // GET /api/training-types
  types: defineEndpoint({
    method: 'GET',
    path: '/api/training-types',
    response: z.array(TrainingTypeSchema),
    auth: true,
  }),

  // GET /api/training-plan/stats
  stats: defineEndpoint({
    method: 'GET',
    path: '/api/training-plan/stats',
    response: TrainingPlanStatsSchema,
    auth: true,
  }),

  // POST /api/training-plan/custom — `training: null` deletes that day's
  // custom entry (see services/training.js's saveCustomTrainingPlan); the
  // route itself 400s when `training` is falsy/missing, so it must be
  // present but may be any of the simple/rest/composite training shapes.
  saveCustom: defineEndpoint({
    method: 'POST',
    path: '/api/training-plan/custom',
    body: z
      .object({
        dayKey: z.string().min(1),
        training: z
          .object({
            type: z.string().optional(),
            name: z.string().optional(),
            details: z.unknown().optional(),
            parts: z.array(z.unknown()).optional(),
          })
          .passthrough(),
      })
      .passthrough(),
    response: z.object({ success: z.boolean() }).passthrough(),
    auth: true,
  }),

  // DELETE /api/training-plan/custom/:dayKey
  deleteCustom: defineEndpoint({
    method: 'DELETE',
    path: '/api/training-plan/custom/:dayKey',
    params: z.object({ dayKey: z.string() }),
    response: z.object({ success: z.boolean() }).passthrough(),
    auth: true,
  }),
};
