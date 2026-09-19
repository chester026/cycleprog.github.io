import { z } from 'zod';
import { CALENDAR_EVENT_TYPES } from '../constants/goalTypes.js';

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
