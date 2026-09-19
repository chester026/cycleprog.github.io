/**
 * Analytics domain contract (T-7.1) — `server/routes/analytics.js`
 * (`/api/analytics/*`) and `server/routes/analyticsSnapshot.js`
 * (`/api/analytics-snapshot/*`, kept in this file per the T-7.1 task split
 * rather than its own — both are small, closely-related "derived numbers"
 * domains).
 *
 * `GET /api/analytics/summary`'s response is a large, still-evolving
 * aggregate (services/analytics.js's computeAnalyticsSummary) — modeled as
 * a passthrough object with the fields that response always has today
 * rather than enumerating every nested key.
 */
import { z } from 'zod';
import { defineEndpoint } from './define.js';
import { AnalyticsSnapshotSchema, AnalyticsSnapshotCreateSchema } from '../../types/snapshot.js';

// A Date object (period.start/end below are built with `new Date(...)` in
// services/analytics.js, not read from Postgres, but they're still Date
// instances at response-validation time — CONTRACT_VALIDATE_RESPONSES runs
// before res.json serializes) or an ISO string.
const dateish = z.union([z.string(), z.date()]);

const TrainingPlanSchema = z
  .object({
    rides: z.number(),
    km: z.number(),
    long: z.number(),
    intervals: z.number(),
    description: z.string(),
    experienceLevel: z.string(),
    timeAvailable: z.number(),
    timeModifier: z.number(),
    weeklyStructure: z
      .object({
        rides: z.number(),
        volume: z.number(),
        longRides: z.number(),
        intervals: z.number(),
      })
      .passthrough(),
  })
  .passthrough();

const LongestRideStatsSchema = z
  .object({
    distKm: z.number(),
    timeH: z.number(),
    cal: z.number(),
    carbs: z.number(),
    water: z.number(),
    gels: z.number(),
    bars: z.number(),
    name: z.string().nullable().optional(),
    date: dateish.nullable().optional(),
  })
  .passthrough();

// services/analytics.js's computeAnalyticsSummary() — `summary: null` when
// the user has no activities at all in the requested window.
const AnalyticsSummarySchema = z
  .object({
    totalCalories: z.number(),
    totalTimeH: z.number(),
    totalCarbs: z.number(),
    totalWater: z.number(),
    totalRides: z.number(),
    longestRide: LongestRideStatsSchema.nullable(),
    avgPerWeek: z.number(),
    longRidesCount: z.number(),
    intervalsCount: z.number(),
    highIntensityTimeMin: z.number(),
    highIntensityIntervals: z.number(),
    highIntensitySessions: z.number(),
    progress: z
      .object({ rides: z.number(), km: z.number(), long: z.number(), intervals: z.number() })
      .passthrough(),
    plan: TrainingPlanSchema,
    zones: z.object({ z2: z.number(), z3: z.number(), z4: z.number(), other: z.number() }).passthrough(),
    totalKm: z.number(),
    totalElev: z.number(),
    totalMovingHours: z.number(),
    avgSpeed: z.number().nullable(),
    vo2max: z.number().nullable(),
    ftp: z.null(), // estimateFTP() is a stub (`function estimateFTP(acts) { return null; }`) — always null today.
    power: z
      .object({
        avg: z.number().nullable(),
        best: z.number().nullable(),
        worst: z.number().nullable(),
        trend: z.union([z.string(), z.number()]).nullable(),
        totalActivities: z.number(),
        activitiesWithRealPower: z.number(),
        activitiesWithWindData: z.number(),
      })
      .passthrough(),
  })
  .passthrough();

const AnalyticsSummaryResponseSchema = z
  .object({
    summary: AnalyticsSummarySchema.nullable(),
    period: z.object({ start: dateish.nullable(), end: dateish.nullable() }).optional(),
  })
  .passthrough();

// GET /api/analytics/hr-zones's period param — the only enum'd query in
// this domain (services/hrZones.js's periodStart()).
const HrZonesPeriodSchema = z.enum(['4w', '3m', '1y', 'all']);

const HrZoneSchema = z.object({
  id: z.number(),
  name: z.string(),
  color: z.string(),
  min: z.number(),
  max: z.number().nullable(),
  seconds: z.number(),
  percent: z.number(),
});

const HrZonesResponseSchema = z.object({
  zones: z.array(HrZoneSchema),
  coverage: z
    .object({
      total: z.number(),
      withStreams: z.number(),
      fallback: z.number(),
      pending: z.number(),
    })
    .passthrough(),
  period: z.string(),
});

const FtpBatchResponseSchema = z.object({
  totalMinutes: z.number(),
  totalIntervals: z.number(),
  highIntensitySessions: z.number(),
  activitiesAnalyzed: z.number(),
  activitiesSkipped: z.number(),
  hrThreshold: z.number(),
  days: z.number(),
});

const ActivityAnalysisResponseSchema = z.object({
  type: z.string(),
  recommendations: z.array(z.object({ title: z.string(), advice: z.string() })),
});

const AnalyticsSnapshotSaveResponseSchema = z
  .object({
    saved: z.boolean(),
    legacy: z.boolean().optional(),
    reason: z.string().optional(),
  })
  .passthrough();

export const analytics = {
  summary: defineEndpoint({
    method: 'GET',
    path: '/api/analytics/summary',
    query: z.object({ year: z.string().optional(), period: z.string().optional(), userId: z.string().optional() }).passthrough().optional(),
    response: AnalyticsSummaryResponseSchema,
    auth: true,
  }),
  ftp: defineEndpoint({
    method: 'GET',
    path: '/api/analytics/ftp',
    query: z.object({ days: z.coerce.number().int().positive().optional() }).passthrough().optional(),
    response: FtpBatchResponseSchema,
    auth: true,
  }),
  hrZones: defineEndpoint({
    method: 'GET',
    path: '/api/analytics/hr-zones',
    query: z.object({ period: HrZonesPeriodSchema.optional() }).passthrough().optional(),
    response: HrZonesResponseSchema,
    auth: true,
  }),
  activity: defineEndpoint({
    method: 'GET',
    path: '/api/analytics/activity/:id',
    params: z.object({ id: z.coerce.number() }),
    response: ActivityAnalysisResponseSchema,
    auth: true,
  }),
  // Admin-only manual fallback (LEGACY_MOBILE_COMPAT aside) — the server
  // now writes this itself from GET /api/skills (services/analyticsSnapshot.js).
  snapshotCreate: defineEndpoint({
    method: 'POST',
    path: '/api/analytics-snapshot',
    body: AnalyticsSnapshotCreateSchema.partial().passthrough(),
    response: AnalyticsSnapshotSaveResponseSchema,
    auth: true,
    admin: true,
  }),
  snapshotLatest: defineEndpoint({
    method: 'GET',
    path: '/api/analytics-snapshot/latest',
    response: AnalyticsSnapshotSchema.nullable(),
    auth: true,
  }),
  snapshotHistory: defineEndpoint({
    method: 'GET',
    path: '/api/analytics-snapshot/history',
    query: z.object({ limit: z.coerce.number().int().positive().optional() }).passthrough().optional(),
    response: z.array(AnalyticsSnapshotSchema),
    auth: true,
  }),
};
