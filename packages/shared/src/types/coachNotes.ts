import { z } from 'zod';

// Coach memory — short facts about the rider the coach learns in
// conversation and that the numeric profile has no field for ("prefers
// morning rides", "knee hurts on long climbs"). Deliberately tiny: one line
// each, a hard cap per user (COACH_NOTES_MAX), so the system prompt stays a
// paragraph and the rider can read and prune the whole list in Profile.
export const COACH_NOTE_MAX_LENGTH = 160;
export const COACH_NOTES_MAX = 30;

export const COACH_NOTE_CATEGORIES = ['preference', 'health', 'constraint', 'equipment', 'goal', 'other'] as const;
export const CoachNoteCategorySchema = z.enum(COACH_NOTE_CATEGORIES);
export type CoachNoteCategory = z.infer<typeof CoachNoteCategorySchema>;

export const CoachNoteSchema = z
  .object({
    id: z.number(),
    note: z.string().min(1).max(COACH_NOTE_MAX_LENGTH),
    category: CoachNoteCategorySchema,
    // 'coach' = remembered during a chat, 'user' = typed in Profile.
    source: z.enum(['coach', 'user']),
    created_at: z.union([z.string(), z.date()]),
    updated_at: z.union([z.string(), z.date()]),
  })
  .passthrough();
export type CoachNote = z.infer<typeof CoachNoteSchema>;

export const CoachNoteCreateSchema = z.object({
  note: z.string().trim().min(1).max(COACH_NOTE_MAX_LENGTH),
  category: CoachNoteCategorySchema.optional(),
});
export type CoachNoteCreateBody = z.infer<typeof CoachNoteCreateSchema>;

export const CoachNoteUpdateSchema = z
  .object({
    note: z.string().trim().min(1).max(COACH_NOTE_MAX_LENGTH).optional(),
    category: CoachNoteCategorySchema.optional(),
  })
  .refine((b) => b.note !== undefined || b.category !== undefined, { message: 'note or category required' });
export type CoachNoteUpdateBody = z.infer<typeof CoachNoteUpdateSchema>;
