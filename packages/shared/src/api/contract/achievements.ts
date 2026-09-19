/**
 * Achievements domain contract (T-7.1) — `server/routes/achievements.js`
 * (`/api/achievements/*`, backed by `server/achievements.js`).
 */
import { z } from 'zod';
import { defineEndpoint } from './define.js';
import { UserAchievementsResponseSchema } from '../../types/achievement.js';

// TIMESTAMP columns (created_at on `achievements`, updated_at/unlocked_at on
// `user_achievements`) come back as JS Date objects — response validation
// runs before res.json serializes (server/db.js's type-parser comment).
const dateish = z.union([z.string(), z.date()]);

// The `achievements` table's raw row shape (server/migrations/
// 1758000000001_startup-iife.sql) — GET /api/achievements (getAllAchievements)
// returns these verbatim, no per-user fields. `threshold` is NUMERIC, which
// server/db.js's type parser (OID 1700) already turns into a JS number.
const AchievementDefinitionRowSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    key: z.string(),
    category: z.string(),
    tier: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    metric: z.string(),
    threshold: z.number(),
    condition_type: z.string(),
    sort_order: z.number().nullable(),
    extra: z.record(z.string(), z.unknown()).nullable().optional(),
    created_at: dateish.optional(),
  })
  .passthrough();

// POST /api/achievements/evaluate's `newly_unlocked` — achievements.js's
// evaluateAchievements() joins `user_achievements` onto `achievements`, so
// each row carries the definition columns above plus the per-user ones.
const NewlyUnlockedAchievementSchema = AchievementDefinitionRowSchema.extend({
  achievement_id: z.union([z.number(), z.string()]).optional(),
  current_value: z.number().optional(),
  unlocked: z.boolean().optional(),
  unlocked_at: dateish.nullable().optional(),
  trigger_activity_id: z.union([z.number(), z.string()]).nullable().optional(),
  updated_at: dateish.optional(),
});

const EvaluateResponseSchema = z.object({
  newly_unlocked: z.array(NewlyUnlockedAchievementSchema),
  total_unlocked: z.number(),
  total_achievements: z.number(),
});

export const achievements = {
  list: defineEndpoint({
    method: 'GET',
    path: '/api/achievements',
    response: z.array(AchievementDefinitionRowSchema),
    auth: true,
    summary: 'Achievement catalog (all definitions, no per-user progress).',
  }),
  me: defineEndpoint({
    method: 'GET',
    path: '/api/achievements/me',
    response: UserAchievementsResponseSchema,
    auth: true,
    summary: 'This user\'s achievements with progress.',
  }),
  evaluate: defineEndpoint({
    method: 'POST',
    path: '/api/achievements/evaluate',
    response: EvaluateResponseSchema,
    auth: true,
    summary: 'Recomputes this user\'s achievement progress against their current activities.',
  }),
};
