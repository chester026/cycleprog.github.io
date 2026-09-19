/**
 * Rides domain contract (T-7.1) — `server/routes/rides.js` (`/api/rides*`),
 * user-entered/imported rides. Distinct from `/api/calendar` — see
 * `repositories/rides.js`'s header.
 */
import { z } from 'zod';
import { defineEndpoint } from './define.js';

// `rides` table (server/test/fixtures/base-schema.sql) — `start`/`created_at`
// are TIMESTAMPTZ, so pg returns JS Date objects (response validation runs
// before res.json serializes — server/db.js's type-parser comment).
const dateish = z.union([z.string(), z.date()]);

const RideSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    user_id: z.union([z.number(), z.string()]).nullable().optional(),
    title: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    location_link: z.string().nullable().optional(),
    details: z.string().nullable().optional(),
    start: dateish.nullable().optional(),
    created_at: dateish.optional(),
  })
  .passthrough();

// POST /api/rides / PUT /api/rides/:id body — the handler inserts/updates
// whatever's given with no required-field check of its own (every rides
// column but `id` is nullable), so every field here is optional.
const RideWriteBodySchema = z
  .object({
    title: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    locationLink: z.string().nullable().optional(),
    details: z.string().nullable().optional(),
    start: z.union([z.string(), z.date()]).nullable().optional(),
  })
  .passthrough();

// POST /api/rides/import body — an array of ride-like objects; each row's
// `start` is required to be a parseable date (checked in the handler, not
// here — S-28's batch-import-must-not-partially-land guard needs the exact
// per-row error message it already produces).
const RideImportBodySchema = z.array(RideWriteBodySchema);

export const rides = {
  list: defineEndpoint({
    method: 'GET',
    path: '/api/rides',
    response: z.array(RideSchema),
    auth: true,
  }),
  create: defineEndpoint({
    method: 'POST',
    path: '/api/rides',
    body: RideWriteBodySchema,
    response: RideSchema,
    auth: true,
  }),
  update: defineEndpoint({
    method: 'PUT',
    path: '/api/rides/:id',
    params: z.object({ id: z.coerce.number() }),
    body: RideWriteBodySchema,
    response: RideSchema,
    auth: true,
  }),
  remove: defineEndpoint({
    method: 'DELETE',
    path: '/api/rides/:id',
    params: z.object({ id: z.coerce.number() }),
    response: z.object({ success: z.boolean() }),
    auth: true,
  }),
  import: defineEndpoint({
    method: 'POST',
    path: '/api/rides/import',
    body: RideImportBodySchema,
    response: z.object({ success: z.boolean(), imported: z.number() }),
    auth: true,
  }),
};
