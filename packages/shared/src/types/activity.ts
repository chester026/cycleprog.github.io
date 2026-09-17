import { z } from 'zod';

// Mirrors server/services/strava/activities.js's RAW_FIELDS — the slim list
// of Strava SummaryActivity fields the server actually stores/serves after
// T-1.3 (docs/audit/00-AUDIT-AND-PLAN.md). Permissive: `.passthrough()`
// because Strava's raw API response (and any field a future RAW_FIELDS bump
// adds) may carry more than this, and rejecting an activity outright over an
// unknown extra field would be worse than ignoring it.
export const StravaActivitySchema = z
  .object({
    // Strava activity ids are always numeric on the wire (fits within JS's
    // safe integer range) — BikeLabApp's pre-existing `types/activity.ts`
    // typed this as a plain `number`; kept that way here rather than a
    // union so the ~30 files importing `Activity` don't need touching.
    id: z.number(),
    // Core SummaryActivity fields are always present on Strava's wire format
    // (and BikeLabApp's original `Activity` type relied on that) — required.
    name: z.string(),
    type: z.string(),
    sport_type: z.string().optional(),
    workout_type: z.number().nullable().optional(),
    start_date: z.string(),
    start_date_local: z.string().optional(),
    timezone: z.string().optional(),
    distance: z.number(),
    moving_time: z.number(),
    elapsed_time: z.number(),
    total_elevation_gain: z.number(),
    elev_high: z.number().optional(),
    elev_low: z.number().nullable().optional(),
    average_speed: z.number(),
    max_speed: z.number(),
    average_heartrate: z.number().optional(),
    max_heartrate: z.number().optional(),
    has_heartrate: z.boolean().optional(),
    average_cadence: z.number().optional(),
    average_watts: z.number().optional(),
    max_watts: z.number().optional(),
    weighted_average_watts: z.number().optional(),
    device_watts: z.boolean().nullable().optional(),
    kilojoules: z.number().nullable().optional(),
    average_temp: z.number().optional(),
    suffer_score: z.number().nullable().optional(),
    gear_id: z.string().nullable().optional(),
    start_latlng: z.array(z.number()).nullable().optional(),
    end_latlng: z.array(z.number()).nullable().optional(),
    trainer: z.boolean().optional(),
    commute: z.boolean().optional(),
    manual: z.boolean().optional(),
    private: z.boolean().optional(),
    achievement_count: z.number().nullable().optional(),
    pr_count: z.number().nullable().optional(),
    map: z
      .object({
        id: z.string().optional(),
        summary_polyline: z.string().nullable().optional(),
        resource_state: z.number().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    gear: z
      .object({
        id: z.string().optional(),
        // Core SummaryActivity fields are always present on Strava's wire format
    // (and BikeLabApp's original `Activity` type relied on that) — required.
    name: z.string(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export type StravaActivity = z.infer<typeof StravaActivitySchema>;

// Kept as an alias — BikeLabApp/src/types/activity.ts re-exports this under
// its historic name so import sites don't all need touching in T-2.2.
export type Activity = StravaActivity;
