import { z } from 'zod';
import { CALENDAR_EVENT_TYPES } from '../constants/goalTypes.js';

// A structured workout: the session as an ordered list of blocks — warm-up,
// efforts, recoveries, cool-down — the way every training platform and head
// unit represents one (docs/plans/workout-blocks.md). Stored on a
// calendar_events row as `workout` (JSONB, migration 1758000000021) next to
// the title (the headline) and the description (the coach's brief); built
// and validated by `buildWorkout` in src/calendar/workout.ts.
//
// The list is FLAT: "3×8′, 4′ recovery" is six blocks, each knowing its place
// in the set (`rep` / `reps`), so a client draws and labels it without
// expanding anything.
export const WORKOUT_STEP_KINDS = ['warmup', 'work', 'recovery', 'cooldown', 'steady'] as const;
export type WorkoutStepKind = (typeof WORKOUT_STEP_KINDS)[number];

// What the rider holds during a block, in a unit their head unit shows.
export const WorkoutTargetSchema = z.object({
  unit: z.enum(['w', 'bpm']),
  low: z.number().positive(),
  high: z.number().positive(),
});
export type WorkoutTarget = z.infer<typeof WorkoutTargetSchema>;

export const WorkoutStepSchema = z.object({
  kind: z.enum(WORKOUT_STEP_KINDS),
  duration_s: z.number().int().positive(),
  // A block that ends after a distance, not a time (a race plan's climbs and
  // flats — calc/racePlan.ts): metres. `duration_s` is then the estimate
  // everything that draws or sums blocks keeps using; a head unit ends the
  // step on the distance. Absent on ordinary, time-based blocks.
  distance_m: z.number().int().positive().nullable().optional(),
  // Intensity zone 1–7: what the block's height and colour come from. Power
  // zones (Coggan) when the target is watts, the rider's heart-rate zones
  // (1–5) when it is bpm.
  zone: z.number().int().min(1).max(7),
  target: WorkoutTargetSchema.nullable(),
  // Cadence range, rpm.
  cadence: z.object({ low: z.number().positive(), high: z.number().positive() }).nullable(),
  // The coach's cue for this block — one or two sentences on how to ride it.
  cue: z.string().nullable(),
  // 1-based repetition of this block within its set and the set's size
  // ("2 of 3"); both null outside a set.
  rep: z.number().int().positive().nullable(),
  reps: z.number().int().positive().nullable(),
});
export type WorkoutStep = z.infer<typeof WorkoutStepSchema>;

export const WorkoutSchema = z.object({
  version: z.literal(1),
  // Sum of the blocks, seconds.
  duration_s: z.number().int().positive(),
  steps: z.array(WorkoutStepSchema).min(1),
});
export type Workout = z.infer<typeof WorkoutSchema>;

// GET /api/calendar item (server/server.js) — calendar_events row LEFT
// JOINed with meta_goals for `goal_title`.
export const CalendarEventSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    user_id: z.union([z.number(), z.string()]).optional(),
    type: z.enum(CALENDAR_EVENT_TYPES),
    title: z.string(),
    description: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    location_link: z.string().nullable().optional(),
    start_date: z.string(),
    end_date: z.string().nullable().optional(),
    all_day: z.boolean().optional(),
    start_time: z.string().nullable().optional(),
    end_time: z.string().nullable().optional(),
    completed: z.boolean().nullable().optional(),
    source: z.string().optional(),
    goal_id: z.union([z.number(), z.string()]).nullable().optional(),
    goal_title: z.string().nullable().optional(),
    apple_event_id: z.string().nullable().optional(),
    migrated_from_ride_id: z.union([z.number(), z.string()]).nullable().optional(),
    // The session's blocks; null/absent for events that have none (anything
    // that isn't a structured training session, and sessions created before
    // the coach started writing blocks).
    workout: WorkoutSchema.nullable().optional(),
    // TIMESTAMPTZ columns — pg returns a JS Date object, not a string (see
    // server/db.js's type-parser comment; DATE columns above are the
    // exception, kept as strings by that same override). Response
    // validation (CONTRACT_VALIDATE_RESPONSES=1) runs before res.json
    // serializes, so it sees the Date instance — T-7.1.
    created_at: z.union([z.string(), z.date()]).optional(),
    updated_at: z.union([z.string(), z.date()]).optional(),
  })
  .passthrough();

export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

// POST /api/calendar request body — only title/start_date are required
// server-side; an unrecognised `type` silently falls back to
// 'planned_ride' rather than 400ing, so this schema keeps `type` optional/
// any-string too (the server enum-checks it itself).
export const CalendarEventCreateSchema = z
  .object({
    type: z.string().optional(),
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    location_link: z.string().nullable().optional(),
    start_date: z.string().min(1),
    end_date: z.string().nullable().optional(),
    all_day: z.boolean().optional(),
    start_time: z.string().nullable().optional(),
    end_time: z.string().nullable().optional(),
    goal_id: z.union([z.number(), z.string()]).nullable().optional(),
  })
  .passthrough();

export type CalendarEventCreateBody = z.infer<typeof CalendarEventCreateSchema>;

// PUT /api/calendar/:id request body — server whitelists an explicit column
// list and updates only the keys present, so every field here is optional.
export const CalendarEventUpdateSchema = z
  .object({
    type: z.string().optional(),
    title: z.string().optional(),
    description: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    location_link: z.string().nullable().optional(),
    start_date: z.string().optional(),
    end_date: z.string().nullable().optional(),
    all_day: z.boolean().optional(),
    start_time: z.string().nullable().optional(),
    end_time: z.string().nullable().optional(),
    completed: z.boolean().optional(),
    apple_event_id: z.string().nullable().optional(),
    goal_id: z.union([z.number(), z.string()]).nullable().optional(),
  })
  .passthrough();

export type CalendarEventUpdateBody = z.infer<typeof CalendarEventUpdateSchema>;
