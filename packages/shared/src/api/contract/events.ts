/**
 * Events domain contract (T-7.1) — `server/routes/events.js` (`/api/events*`).
 * Distinct from `/api/calendar` — a separate legacy feature (docs/audit/
 * 00-AUDIT-AND-PLAN.md T-6.4 flags it as a legacy candidate).
 */
import { z } from 'zod';
import { defineEndpoint } from './define.js';
import { EventSchema, EventCreateSchema, EventUpdateSchema } from '../../types/event.js';

export const events = {
  list: defineEndpoint({
    method: 'GET',
    path: '/api/events',
    response: z.array(EventSchema),
    auth: true,
  }),
  create: defineEndpoint({
    method: 'POST',
    path: '/api/events',
    body: EventCreateSchema,
    response: EventSchema,
    auth: true,
  }),
  update: defineEndpoint({
    method: 'PUT',
    path: '/api/events/:id',
    params: z.object({ id: z.coerce.number() }),
    body: EventUpdateSchema,
    response: EventSchema,
    auth: true,
  }),
  // DELETE /api/events/:id returns `{message, event}` (the deleted row),
  // unlike /api/calendar/:id and /api/rides/:id's plain `{success: true}`.
  remove: defineEndpoint({
    method: 'DELETE',
    path: '/api/events/:id',
    params: z.object({ id: z.coerce.number() }),
    response: z.object({ message: z.string(), event: EventSchema }),
    auth: true,
  }),
};
