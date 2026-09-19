import { z } from 'zod';

// GET /api/achievements/me item — server/achievements.js's
// getUserAchievements() shape (achievement definition joined with the
// caller's user_achievements progress row).
export const AchievementSchema = z.object({
  id: z.union([z.number(), z.string()]),
  key: z.string(),
  category: z.string(),
  tier: z.string(),
  name: z.string(),
  description: z.string(),
  icon: z.string(),
  metric: z.string(),
  threshold: z.number(),
  condition_type: z.string(),
  sort_order: z.number().optional(),
  current_value: z.number(),
  unlocked: z.boolean(),
  // user_achievements.unlocked_at is TIMESTAMP — pg returns a JS Date, not
  // a string, and response validation runs before res.json serializes it
  // (T-7.1, server/db.js's type-parser comment).
  unlocked_at: z.union([z.string(), z.date()]).nullable(),
  trigger_activity_id: z.union([z.number(), z.string()]).nullable(),
  progress_pct: z.number(),
});

export type Achievement = z.infer<typeof AchievementSchema>;

export const AchievementTierSchema = z.enum(['silver', 'rare_steel', 'gold']);
export type AchievementTier = z.infer<typeof AchievementTierSchema>;

// GET /api/achievements/me response envelope.
export const UserAchievementsResponseSchema = z.object({
  achievements: z.array(AchievementSchema),
  stats: z.object({
    total: z.number(),
    unlocked: z.number(),
    progress_pct: z.number(),
  }),
});

export type UserAchievementsResponse = z.infer<typeof UserAchievementsResponseSchema>;
