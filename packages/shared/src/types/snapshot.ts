import { z } from 'zod';

const numOrNull = z.coerce.number().nullable().optional();

// GET /api/analytics-snapshot/latest|history item — analytics_snapshots row
// (server/server.js). Field names are camelCase in the POST body but
// snake_case in the stored row/response — see
// docs/audit/layers/04-cross-layer.md §4.9 (this is the one place the API
// mixes casing; kept as-is rather than "fixed" since that's a contract
// change out of scope for T-2.2).
export const AnalyticsSnapshotSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    user_id: z.union([z.number(), z.string()]).optional(),
    snapshot_date: z.string(),
    last_activity_id: z.union([z.number(), z.string()]),
    avg_power: numOrNull,
    max_power: numOrNull,
    min_power: numOrNull,
    avg_hr: numOrNull,
    max_hr: numOrNull,
    min_hr: numOrNull,
    avg_speed: numOrNull,
    max_speed: numOrNull,
    min_speed: numOrNull,
    avg_cadence: numOrNull,
    max_cadence: numOrNull,
    min_cadence: numOrNull,
    vo2max: numOrNull,
    activities_count: z.coerce.number().optional(),
    // analytics_snapshots.created_at is TIMESTAMP — pg returns a JS Date
    // (snapshot_date above is DATE, kept as a string by server/db.js's
    // type-parser override; created_at has no such override) — T-7.1.
    created_at: z.union([z.string(), z.date()]).optional(),
  })
  .passthrough();

export type AnalyticsSnapshot = z.infer<typeof AnalyticsSnapshotSchema>;

// POST /api/analytics-snapshot request body (server/server.js) — note the
// camelCase keys and the nested {avg,max,min} groups, unlike the stored/
// response shape above.
export const AnalyticsSnapshotCreateSchema = z.object({
  lastActivityId: z.union([z.number(), z.string()]),
  power: z.object({ avg: numOrNull, max: numOrNull, min: numOrNull }).optional(),
  heart: z.object({ avg: numOrNull, max: numOrNull, min: numOrNull }).optional(),
  speed: z.object({ avg: numOrNull, max: numOrNull, min: numOrNull }).optional(),
  cadence: z.object({ avg: numOrNull, max: numOrNull, min: numOrNull }).optional(),
  vo2max: numOrNull,
  activitiesCount: z.coerce.number().optional(),
});

export type AnalyticsSnapshotCreateBody = z.infer<typeof AnalyticsSnapshotCreateSchema>;
