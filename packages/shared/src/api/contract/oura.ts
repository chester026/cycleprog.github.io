/**
 * Oura domain contract (T-7.1). Backs `server/routes/oura.js` (mounted as a
 * factory — `module.exports = (pool) => router` — at /api/oura in
 * server.js). Response shapes read off the handlers directly; `latest`
 * mirrors the NUMERIC→Number() coercion GET /status already does so a
 * client never sees a stringified number (pg's NUMERIC columns come back as
 * strings otherwise — see that route's own comment).
 */
import { z } from 'zod';
import { defineEndpoint } from './define.js';

const numOrNull = z.number().nullable();

const OuraLatestSchema = z
  .object({
    day: z.string(),
    readiness_score: z.number().nullable(),
    sleep_score: z.number().nullable(),
    activity_score: z.number().nullable(),
    total_sleep_hours: numOrNull,
    average_hrv: numOrNull,
    resting_heart_rate: numOrNull,
    min_heart_rate: numOrNull,
    stress_high_seconds: z.number().nullable(),
    stress_recovery_high_seconds: z.number().nullable(),
    stress_day_summary: z.string().nullable(),
    resilience_level: z.string().nullable(),
    resilience_sleep_recovery: numOrNull,
    resilience_daytime_recovery: numOrNull,
    resilience_stress: numOrNull,
    spo2_average: numOrNull,
    breathing_disturbance_index: numOrNull,
  })
  .passthrough()
  .nullable();

export const oura = {
  connectState: defineEndpoint({
    method: 'GET',
    path: '/api/oura/connect-state',
    response: z.object({ authUrl: z.string() }),
    auth: true,
  }),

  status: defineEndpoint({
    method: 'GET',
    path: '/api/oura/status',
    response: z.object({
      connected: z.boolean(),
      ouraUserId: z.union([z.string(), z.number()]).nullable(),
      latest: OuraLatestSchema,
    }),
    auth: true,
  }),

  sync: defineEndpoint({
    method: 'POST',
    path: '/api/oura/sync',
    body: z.object({ days: z.coerce.number().optional() }).passthrough(),
    // fetchAndCacheOuraData() short-circuits to {synced: 0, note} when Oura
    // isn't connected, otherwise {synced, days: string[]} — one passthrough
    // schema covers both.
    response: z.object({ synced: z.number(), note: z.string().optional(), days: z.array(z.string()).optional() }),
    auth: true,
  }),

  unlink: defineEndpoint({
    method: 'POST',
    path: '/api/oura/unlink',
    response: z.object({ ok: z.boolean() }),
    auth: true,
  }),
};
