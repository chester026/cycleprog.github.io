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
  /**
   * `ftp20` = 95 % of best 20 min; `cp` = critical-power fit over 5–60-min
   * efforts (when it reads higher); `ftp60` = best 60 min; `manual` = set by
   * the rider (profile `ftp_manual`).
   */
  method: z.enum(['ftp20', 'ftp60', 'cp', 'manual']),
  /** The ride that set it; null for a manual value. */
  fromActivityId: z.number().nullable(),
  /** YYYY-MM-DD of that ride, or of the manual entry; null when unknown. */
  date: z.string().nullable(),
  /**
   * The ride-derived estimate when a manual value overrides it, so clients
   * can show "set by you 177 · estimated 160"; absent otherwise.
   */
  estimated: z.object({ watts: z.number(), method: z.enum(['ftp20', 'ftp60', 'cp']) }).nullable().optional(),
  /** The critical-power fit behind the estimate, when the curve supported one. */
  cp: z.object({ cp: z.number(), wPrime: z.number(), durations: z.array(z.number()) }).nullable().optional(),
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
