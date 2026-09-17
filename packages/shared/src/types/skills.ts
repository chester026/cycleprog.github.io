import { z } from 'zod';

// skills_history row / GET /api/skills-history/last|compare|range item
// (server/routes/skillsHistory.js). The six skill scores are always 0-100
// (validated server-side on write) — kept as plain numbers here since a
// read schema shouldn't re-reject data the write path already accepted.
export const SkillsSnapshotSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    user_id: z.union([z.number(), z.string()]).optional(),
    snapshot_date: z.string().optional(),
    climbing: z.coerce.number(),
    sprint: z.coerce.number(),
    endurance: z.coerce.number(),
    tempo: z.coerce.number(),
    power: z.coerce.number(),
    consistency: z.coerce.number(),
    last_activity_id: z.union([z.number(), z.string()]).nullable().optional(),
    created_at: z.string().optional(),
  })
  .passthrough();

export type SkillsSnapshot = z.infer<typeof SkillsSnapshotSchema>;

// POST /api/skills-history request body — same six fields, each validated
// server-side to be a 0-100 number (routes/skillsHistory.js).
export const SkillsHistoryCreateSchema = z.object({
  climbing: z.number().min(0).max(100),
  sprint: z.number().min(0).max(100),
  endurance: z.number().min(0).max(100),
  tempo: z.number().min(0).max(100),
  power: z.number().min(0).max(100),
  consistency: z.number().min(0).max(100),
  last_activity_id: z.union([z.number(), z.string()]).nullable().optional(),
});

export type SkillsHistoryCreateBody = z.infer<typeof SkillsHistoryCreateSchema>;
