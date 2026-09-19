/**
 * Calendar domain contract (T-7.1) — `server/routes/calendar.js`
 * (`/api/calendar*`, CALENDAR_SPEC.md §2). Distinct from `/api/rides` — see
 * `calendar_events`'s migration comment for why the two coexist.
 */
import { z } from 'zod';
import { defineEndpoint } from './define.js';
import { CalendarEventSchema, CalendarEventCreateSchema, CalendarEventUpdateSchema } from '../../types/calendar.js';

const ListQuerySchema = z
  .object({
    goal_id: z.union([z.string(), z.coerce.number()]).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    type: z.string().optional(),
  })
  .passthrough();

export const calendar = {
  list: defineEndpoint({
    method: 'GET',
    path: '/api/calendar',
    query: ListQuerySchema,
    response: z.array(CalendarEventSchema),
    auth: true,
  }),
  create: defineEndpoint({
    method: 'POST',
    path: '/api/calendar',
    body: CalendarEventCreateSchema,
    response: CalendarEventSchema,
    auth: true,
  }),
  update: defineEndpoint({
    method: 'PUT',
    path: '/api/calendar/:id',
    params: z.object({ id: z.coerce.number() }),
    body: CalendarEventUpdateSchema,
    response: CalendarEventSchema,
    auth: true,
  }),
  remove: defineEndpoint({
    method: 'DELETE',
    path: '/api/calendar/:id',
    params: z.object({ id: z.coerce.number() }),
    response: z.object({ success: z.boolean() }),
    auth: true,
  }),
};
