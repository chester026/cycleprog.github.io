// Meta-goals endpoints (T-7.1) — server/routes/metaGoals.js. Personal goals
// live in ./goals.ts.
import { z } from 'zod';
import { defineEndpoint } from './define.js';
import { GoalSchema, MetaGoalSchema, MetaGoalDetailSchema, MetaGoalRideSchema } from '../../types/goal.js';

export const metaGoals = {
  // GET /api/meta-goals
  list: defineEndpoint({
    method: 'GET',
    path: '/api/meta-goals',
    response: z.array(MetaGoalSchema),
    auth: true,
    summary: 'Meta-goals with inline sub_goals (server-computed current_value/percent/pace) and trainingTypes.',
  }),

  // GET /api/meta-goals/:id
  detail: defineEndpoint({
    method: 'GET',
    path: '/api/meta-goals/:id',
    params: z.object({ id: z.coerce.number() }),
    response: MetaGoalDetailSchema,
    auth: true,
  }),

  // POST /api/meta-goals
  create: defineEndpoint({
    method: 'POST',
    path: '/api/meta-goals',
    body: z
      .object({
        title: z.string().min(1),
        description: z.string().nullable().optional(),
        target_date: z.string().nullable().optional(),
        ai_generated: z.boolean().optional(),
        ai_context: z.unknown().nullable().optional(),
      })
      .passthrough(),
    response: MetaGoalSchema,
    auth: true,
  }),

  // PUT /api/meta-goals/:id
  update: defineEndpoint({
    method: 'PUT',
    path: '/api/meta-goals/:id',
    params: z.object({ id: z.coerce.number() }),
    body: z
      .object({
        title: z.string().optional(),
        description: z.string().nullable().optional(),
        target_date: z.string().nullable().optional(),
        status: z.enum(['active', 'completed']).optional(),
      })
      .passthrough(),
    response: MetaGoalSchema,
    auth: true,
  }),

  // POST /api/meta-goals/:id/complete — closes the goal and attaches the rides
  // that did it. completed_at: explicit value, else the latest attached ride's
  // start_date, else now. 400 if an activity id isn't one of the user's synced
  // rides; 404 for someone else's / unknown goal.
  complete: defineEndpoint({
    method: 'POST',
    path: '/api/meta-goals/:id/complete',
    params: z.object({ id: z.coerce.number() }),
    body: z
      .object({
        activity_ids: z.array(z.number().int()).optional(),
        completed_at: z.string().optional(),
      })
      .passthrough(),
    response: MetaGoalSchema.extend({ rides: z.array(MetaGoalRideSchema) }),
    auth: true,
  }),

  // POST /api/meta-goals/:id/reopen — status active, completed_at null, rides cleared.
  reopen: defineEndpoint({
    method: 'POST',
    path: '/api/meta-goals/:id/reopen',
    params: z.object({ id: z.coerce.number() }),
    response: MetaGoalSchema,
    auth: true,
  }),

  // GET /api/meta-goals/:id/rides
  rides: defineEndpoint({
    method: 'GET',
    path: '/api/meta-goals/:id/rides',
    params: z.object({ id: z.coerce.number() }),
    response: z.object({ rides: z.array(MetaGoalRideSchema) }),
    auth: true,
  }),

  // DELETE /api/meta-goals/:id — cascade-deletes sub-goals.
  remove: defineEndpoint({
    method: 'DELETE',
    path: '/api/meta-goals/:id',
    params: z.object({ id: z.coerce.number() }),
    response: z.object({ success: z.boolean() }),
    auth: true,
  }),

  // POST /api/meta-goals/ai-generate
  aiGenerate: defineEndpoint({
    method: 'POST',
    path: '/api/meta-goals/ai-generate',
    body: z.object({ userGoalDescription: z.string().min(1) }).passthrough(),
    response: z
      .object({
        metaGoal: MetaGoalSchema,
        subGoals: z.array(GoalSchema),
        // AI-generated free-form fields (see server/aiGoals.js) — not worth
        // pinning down field-by-field.
        timeline: z.unknown().optional(),
        mainFocus: z.unknown().optional(),
      })
      .passthrough(),
    auth: true,
  }),
};
