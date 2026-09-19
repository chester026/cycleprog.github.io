/**
 * Admin domain contract (T-7.1). Backs `server/routes/admin.js` (Strava
 * diagnostics/limits + user management) and `server/routes/adminAiUsage.js`
 * (kept in this same domain file per the task split — both are
 * `requireAdmin` routes with no shared path prefix). Response shapes are
 * read off `server/repositories/admin.js` (DB rows — snake_case, wide,
 * `.passthrough()`ed) and `server/services/strava/client.js#getLimits`.
 */
import { z } from 'zod';
import { defineEndpoint } from './define.js';

const UserIdParamsSchema = z.object({ userId: z.coerce.number().int() });

// getStravaSyncStatusPerUser() rows (repositories/admin.js).
const StravaSyncStatusUserRowSchema = z
  .object({
    user_id: z.union([z.number(), z.string()]),
    email: z.string().nullable(),
    activities: z.number(),
    without_raw: z.number(),
    last_activity: z.union([z.string(), z.date()]).nullable(),
    last_synced_at: z.union([z.string(), z.date()]).nullable(),
  })
  .passthrough();

const StravaSyncStatusTotalsSchema = z
  .object({
    activities: z.number(),
    without_raw: z.number(),
    table_size: z.string().nullable(),
  })
  .passthrough();

// services/strava/client.js#getLimits() — always this shape (defaults fill
// in nulls), used both by GET /api/admin/strava/sync-status and
// GET /api/strava/limits (the latter also falls back to the same all-null
// shape on error, so the schema covers both).
const StravaLimitsSchema = z
  .object({
    limit15min: z.number().nullable(),
    limitDay: z.number().nullable(),
    usage15min: z.number().nullable(),
    usageDay: z.number().nullable(),
    lastUpdate: z.union([z.string(), z.number()]).nullable(),
  })
  .passthrough();

// listUsersForAdmin() rows — wide/joined, kept passthrough.
const AdminUserRowSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    email: z.string().nullable(),
    email_verified: z.boolean().nullable(),
    strava_id: z.union([z.string(), z.number()]).nullable(),
    has_strava_token: z.boolean().nullable(),
    created_at: z.union([z.string(), z.date()]).nullable(),
  })
  .passthrough();

export const admin = {
  syncStatus: defineEndpoint({
    method: 'GET',
    path: '/api/admin/strava/sync-status',
    response: z.object({
      totals: StravaSyncStatusTotalsSchema,
      users: z.array(StravaSyncStatusUserRowSchema),
      strava_limits: StravaLimitsSchema,
    }),
    auth: true,
    admin: true,
  }),

  stravaLimits: defineEndpoint({
    method: 'GET',
    path: '/api/strava/limits',
    // Error path (getLimits() throwing) is a 500 with a different body
    // ({error, code, limits}) — response validation only runs on 2xx
    // (middleware/contract.js), so this schema only needs the success shape.
    response: StravaLimitsSchema,
    auth: true,
    admin: true,
  }),

  refreshStravaLimits: defineEndpoint({
    method: 'POST',
    path: '/api/strava/limits/refresh',
    response: z.object({ success: z.boolean(), message: z.string(), limits: StravaLimitsSchema }),
    auth: true,
    admin: true,
  }),

  listUsers: defineEndpoint({
    method: 'GET',
    path: '/api/admin/users',
    response: z.object({ users: z.array(AdminUserRowSchema) }),
    auth: true,
    admin: true,
  }),

  unlinkUserStrava: defineEndpoint({
    method: 'POST',
    path: '/api/admin/users/:userId/unlink-strava',
    params: UserIdParamsSchema,
    response: z.object({ success: z.boolean(), message: z.string() }),
    auth: true,
    admin: true,
  }),

  removeUser: defineEndpoint({
    method: 'DELETE',
    path: '/api/admin/users/:userId',
    params: UserIdParamsSchema,
    response: z.object({
      success: z.boolean(),
      message: z.string(),
      // Table name → rows deleted (deleteUserCascade) — the table set is
      // internal/evolving, so this stays a plain record rather than a
      // named-key object.
      deletedRecords: z.record(z.string(), z.number()),
    }),
    auth: true,
    admin: true,
  }),

  aiUsage: defineEndpoint({
    method: 'GET',
    path: '/api/admin/ai-usage',
    query: z.object({ days: z.coerce.number().int().positive().optional() }),
    response: z.object({
      days: z.number(),
      users: z.array(z.object({}).passthrough()),
    }),
    auth: true,
    admin: true,
    summary: 'Per-user OpenAI token usage report (server/routes/adminAiUsage.js).',
  }),
};
