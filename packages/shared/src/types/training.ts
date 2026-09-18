import { z } from 'zod';

// GET /api/training-types / GET /api/training-types/:type item — server/
// recommendations/training-types.json entries, keyed by training type
// (endurance, tempo, intervals, …), with `key` injected by
// getAllTrainingTypes(). Kept permissive: this JSON has free-form nested
// content (benefits/structure/technical_aspects/…) not worth pinning down
// field-by-field for a read-only reference catalog.
export const TrainingTypeSchema = z
  .object({
    key: z.string().optional(),
    name: z.string(),
    description: z.string().optional(),
    intensity: z.string().optional(),
    duration: z.string().optional(),
    cadence: z.string().optional(),
    hr_zones: z.string().optional(),
    goals: z.array(z.string()).optional(),
    benefits: z.array(z.string()).optional(),
    structure: z.record(z.string(), z.unknown()).optional(),
    technical_aspects: z.array(z.string()).optional(),
  })
  .passthrough();

export type TrainingType = z.infer<typeof TrainingTypeSchema>;
