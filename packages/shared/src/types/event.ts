import { z } from 'zod';

// GET /api/events item — the `events` table (server/server.js). Distinct
// from CalendarEvent/calendar_events — a separate legacy feature
// (docs/audit/00-AUDIT-AND-PLAN.md T-6.4 flags it as a legacy-candidate).
export const EventSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    user_id: z.union([z.number(), z.string()]).optional(),
    title: z.string(),
    description: z.string().nullable().optional(),
    link: z.string().nullable().optional(),
    start_date: z.string(),
    background_color: z.string().nullable().optional(),
    // events.created_at/updated_at are TIMESTAMPTZ (test/fixtures/base-
    // schema.sql) — pg returns a JS Date; response validation runs before
    // res.json serializes it (T-7.1, server/db.js's type-parser comment).
    created_at: z.union([z.string(), z.date()]).optional(),
    updated_at: z.union([z.string(), z.date()]).optional(),
  })
  .passthrough();

export type EventItem = z.infer<typeof EventSchema>;

const hexColor = /^#[0-9A-Fa-f]{6}$/;

// POST /api/events request body.
export const EventCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  link: z.string().nullable().optional(),
  start_date: z.string().min(1),
  background_color: z
    .string()
    .regex(hexColor, 'background_color must be a 6-digit hex color')
    .optional(),
});

export type EventCreateBody = z.infer<typeof EventCreateSchema>;

// PUT /api/events/:id request body — server re-validates the same
// required-fields/color rules as create.
export const EventUpdateSchema = EventCreateSchema;

export type EventUpdateBody = z.infer<typeof EventUpdateSchema>;
