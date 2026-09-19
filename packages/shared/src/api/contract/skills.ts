/**
 * Skills domain contract (T-7.1) — `server/routes/skills.js` (`GET
 * /api/skills`) and `server/routes/skillsHistory.js`
 * (`/api/skills-history/*`, admin-only fallbacks since T-3.3 — see that
 * file's header).
 */
import { z } from 'zod';
import { defineEndpoint } from './define.js';
import { SkillsSchema, RiderProfileSchema } from '../../calc/skills.js';
import { SkillsSnapshotSchema, SkillsHistoryCreateSchema } from '../../types/skills.js';

const SKILL_KEYS = ['climbing', 'sprint', 'endurance', 'tempo', 'power', 'consistency'] as const;

// services/skills.js's computeTrend() — one signed delta per scale, or null
// per-scale when there was no previous snapshot value for it.
const SkillsTrendSchema = z
  .object(Object.fromEntries(SKILL_KEYS.map((k) => [k, z.number().nullable()])) as Record<(typeof SKILL_KEYS)[number], z.ZodNullable<z.ZodNumber>>)
  .nullable();

const GetSkillsResponseSchema = z.object({
  skills: SkillsSchema,
  riderProfile: RiderProfileSchema,
  confidence: z.number(),
  sampleSize: z.number(),
  lastActivityId: z.union([z.number(), z.string()]).nullable(),
  previous: SkillsSnapshotSchema.nullable(),
  trend: SkillsTrendSchema,
});

// authMiddleware sets req.userId; routes/skillsHistory.js's authenticateUser
// additionally lets the caller pass its own `user_id` — only to check it
// matches the token (403 otherwise), never to filter by a different user.
const UserScopedQuerySchema = z.object({ user_id: z.union([z.string(), z.coerce.number()]).optional() }).passthrough();

// GET /api/skills-history/range?limit= item (repositories/skills.js's
// getRecentSnapshots — a narrower column list than the full skills_history
// row SkillsSnapshotSchema models).
const SkillsRangeLimitItemSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    snapshot_date: z.union([z.string(), z.date()]),
    climbing: z.coerce.number(),
    sprint: z.coerce.number(),
    endurance: z.coerce.number(),
    tempo: z.coerce.number(),
    power: z.coerce.number(),
    consistency: z.coerce.number(),
    created_at: z.union([z.string(), z.date()]).optional(),
  })
  .passthrough();

// GET /api/skills-history/range?start_date&end_date item (getSnapshotsInRange).
const SkillsRangeDateItemSchema = z
  .object({
    snapshot_date: z.union([z.string(), z.date()]),
    climbing: z.coerce.number(),
    sprint: z.coerce.number(),
    endurance: z.coerce.number(),
    tempo: z.coerce.number(),
    power: z.coerce.number(),
    consistency: z.coerce.number(),
  })
  .passthrough();

// Two shapes depending on whether `?limit=` was given (see
// routes/skillsHistory.js's GET /range).
const SkillsRangeResponseSchema = z.union([
  z.array(SkillsRangeLimitItemSchema),
  z.object({
    user_id: z.union([z.number(), z.string()]),
    snapshots: z.array(SkillsRangeDateItemSchema),
  }),
]);

export const skills = {
  get: defineEndpoint({
    method: 'GET',
    path: '/api/skills',
    response: GetSkillsResponseSchema,
    auth: true,
    summary: 'This user\'s 6-scale skills + rider profile, computed server-side (also snapshots skills_history).',
  }),
  historyLast: defineEndpoint({
    method: 'GET',
    path: '/api/skills-history/last',
    query: UserScopedQuerySchema,
    response: SkillsSnapshotSchema,
    auth: true,
  }),
  historyCompare: defineEndpoint({
    method: 'GET',
    path: '/api/skills-history/compare',
    query: UserScopedQuerySchema.extend({ date: z.string() }),
    response: SkillsSnapshotSchema,
    auth: true,
  }),
  // Admin-only manual/debug fallback (LEGACY_MOBILE_COMPAT aside — see
  // routes/skillsHistory.js's header); GET /api/skills is the real write
  // path since T-3.3. `.partial()` because the LEGACY_MOBILE_COMPAT branch
  // accepts a bare `{ user_id }` body and computes the six scores itself.
  historyCreate: defineEndpoint({
    method: 'POST',
    path: '/api/skills-history',
    body: SkillsHistoryCreateSchema.partial().extend({ user_id: z.union([z.string(), z.coerce.number()]).optional() }).passthrough(),
    response: z.object({ success: z.boolean(), legacy: z.boolean().optional() }).passthrough(),
    auth: true,
    admin: true,
  }),
  historyRange: defineEndpoint({
    method: 'GET',
    path: '/api/skills-history/range',
    query: UserScopedQuerySchema.extend({
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      limit: z.string().optional(),
    }),
    response: SkillsRangeResponseSchema,
    auth: true,
  }),
  historyCleanupMonth: defineEndpoint({
    method: 'DELETE',
    path: '/api/skills-history/cleanup-month',
    query: UserScopedQuerySchema,
    response: z
      .object({
        message: z.string(),
        deleted: z.number(),
        kept_snapshot_id: z.union([z.number(), z.string()]).optional(),
      })
      .passthrough(),
    auth: true,
    admin: true,
  }),
};
