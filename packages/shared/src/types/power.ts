// GET /api/analytics/power-profile response — server/services/powerProfile.js.
// Built only from power-meter rides (Strava `device_watts`), never from
// BikeLab's physics estimate. Efforts are keyed by duration in seconds
// ("5", "60", "300", "1200", "3600"); a duration no ride was long enough for
// is absent.
import { z } from 'zod';

export const PowerEffortSchema = z.object({
  watts: z.number(),
  activityId: z.number(),
  /** ISO date (YYYY-MM-DD) of the ride. */
  date: z.string(),
});

export const PowerZoneSchema = z.object({
  zone: z.number(),
  name: z.string(),
  minW: z.number(),
  maxW: z.number().nullable(),
});

export const PowerFtpSchema = z.object({
  watts: z.number(),
  /** `ftp20` = 95 % of best 20 min; `ftp60` = best 60 min. */
  method: z.enum(['ftp20', 'ftp60']),
  fromActivityId: z.number(),
  date: z.string(),
});

export const PowerProfileResponseSchema = z
  .object({
    weeks: z.number(),
    /** Power-meter rides in the window. */
    ridesWithPower: z.number(),
    /** Of those, rides whose streams went into the numbers (at most ~50 per call; the rest follow on later calls). */
    ridesAnalyzed: z.number(),
    bestEfforts: z.record(z.string(), PowerEffortSchema),
    ftp: PowerFtpSchema.nullable(),
    wPerKg: z.number().nullable(),
    /** Coggan 7 zones; empty when `ftp` is null. */
    zones: z.array(PowerZoneSchema),
    /** Why numbers are missing or partial; null when the profile is complete. */
    note: z.string().nullable(),
  })
  .passthrough();

export type PowerProfileResponse = z.infer<typeof PowerProfileResponseSchema>;
