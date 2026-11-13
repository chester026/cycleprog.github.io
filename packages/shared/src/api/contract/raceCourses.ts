/**
 * Race courses (docs/plans/race-plan.md) — `server/routes/raceCourses.js`.
 * The rider attaches a route file (GPX / FIT) in the coach chat; the server
 * reads it into a stored course and answers this summary, which the app
 * passes to the coach as hidden context (coach/attachments.ts).
 */
import { z } from 'zod';
import { defineEndpoint } from './define.js';

export const RaceCourseSummarySchema = z.object({
  course_id: z.number(),
  name: z.string().nullable(),
  distance_km: z.number(),
  elevation_gain_m: z.number(),
  climbs: z.array(z.object({ at_km: z.number(), length_km: z.number(), grade_pct: z.number(), gain_m: z.number() })),
});
export type RaceCourseSummary = z.infer<typeof RaceCourseSummarySchema>;

export const raceCourses = {
  // POST /api/race-courses — multipart, field `file`. 400 with code
  // COURSE_UNREADABLE / COURSE_TOO_LARGE / COURSE_TOO_SHORT /
  // COURSE_NO_ELEVATION when the file cannot be planned from.
  upload: defineEndpoint({
    method: 'POST',
    path: '/api/race-courses',
    body: z.object({}).passthrough(),
    response: RaceCourseSummarySchema,
    auth: true,
    multipart: true,
  }),
};
