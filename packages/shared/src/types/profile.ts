import { z } from 'zod';

// Canonical HR/profile field names (docs/audit/layers/04-cross-layer.md §4.3,
// docs/audit/layers/02-bikelabapp.md A-06): `max_hr`, `resting_hr`,
// `lactate_threshold` — NOT `max_heart_rate`/`max_heartrate`/
// `resting_heartrate`/`lthr`, which several client screens used to read and
// which are never present on the wire. Importing this type is what makes
// that bug impossible by construction going forward.

const numOrNull = z.coerce.number().nullable().optional();

// `hr_zones` (T-3.1, docs/audit/layers/04-cross-layer.md §4.4): derived by
// the server from the profile via `computeHrZones` (packages/shared/src/
// calc/hrZones.ts) — never accepted from a client. Shape mirrors `HrZones`.
const HrZoneBandSchema = z.object({
  id: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  key: z.enum(['z1', 'z2', 'z3', 'z4', 'z5']),
  nameKey: z.string(),
  name: z.string(),
  min: z.number(),
  max: z.number().nullable(),
  color: z.string(),
});

export const HrZonesSchema = z
  .object({
    method: z.enum(['lthr', 'karvonen', 'maxhr']),
    basis: z.object({
      max_hr: z.number(),
      resting_hr: z.number().optional(),
      lactate_threshold: z.number().optional(),
    }),
    zones: z.array(HrZoneBandSchema),
  })
  .nullable()
  .optional();

// GET /api/user-profile response shape: `getUserProfile` (server/
// recommendations/index.js) merged with `id/name/avatar/strava_id/email/
// is_admin` from the `users` table (server/server.js's GET handler).
export const UserProfileSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    name: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
    strava_id: z.union([z.string(), z.number()]).nullable().optional(),
    email: z.string().nullable().optional(),
    is_admin: z.boolean().optional(),

    experience_level: z.string().nullable().optional(),
    time_available: numOrNull,
    workouts_per_week: numOrNull,
    // These are all nullable DB columns (unset for a brand-new profile row,
    // not defaulted at the SQL level) — T-7.1's CONTRACT_VALIDATE_RESPONSES
    // run against a real fresh-user row caught the missing `.nullable()`.
    show_recommendations: z.boolean().nullable().optional(),
    preferred_training_types: z.array(z.string()).nullable().optional(),
    preferred_days: z.array(z.string()).nullable().optional(),
    seasonal_preferences: z.record(z.string(), z.unknown()).nullable().optional(),

    height: numOrNull,
    weight: numOrNull,
    age: numOrNull,
    bike_weight: numOrNull,
    hr_zones: HrZonesSchema,
    max_hr: numOrNull,
    resting_hr: numOrNull,
    lactate_threshold: numOrNull,
    gender: z.string().nullable().optional(),
    onboarding_completed: z.boolean().nullable().optional(),
  })
  .passthrough();

export type UserProfile = z.infer<typeof UserProfileSchema>;

// PUT /api/user-profile request body. Tolerant of what clients send TODAY:
// the web ProfilePage submits the whole profile incl. a client-computed
// `hr_zones` (a pre-T-3.1 habit); the app's individual settings screens
// (TrainingSettingsScreen, PersonalInfoScreen, HRZonesScreen, …) each PUT a
// partial object with only the fields that screen owns. `.partial()` +
// coercion covers both without breaking either. `hr_zones` is omitted here
// because it is derived-only (T-3.1): the schema no longer describes it as
// an accepted field, and the route handler additionally strips it from the
// body before merging, so a stray/bogus client `hr_zones` is always ignored.
export const UserProfileUpdateSchema = UserProfileSchema.omit({
  id: true,
  strava_id: true,
  is_admin: true,
  hr_zones: true,
}).partial();

export type UserProfileUpdate = z.infer<typeof UserProfileUpdateSchema>;

// POST /api/user-profile/onboarding request body. Two legitimate shapes:
// the skip case (`{onboarding_completed: true}` alone — server.js checks
// `Object.keys(onboardingData).length === 1`) and the full onboarding
// payload. A single partial+passthrough schema covers both; the "exactly
// one key" skip-detection stays server-side, unchanged, since it is business
// logic rather than a shape constraint.
export const OnboardingBodySchema = z
  .object({
    height: numOrNull,
    weight: numOrNull,
    age: numOrNull,
    bike_weight: numOrNull,
    experience_level: z.string().optional(),
    gender: z.string().nullable().optional(),
    // `hr_zones` intentionally not accepted (T-3.1): derived server-side,
    // stripped from the body by the route regardless of what's sent here.
    max_hr: numOrNull,
    resting_hr: numOrNull,
    lactate_threshold: numOrNull,
    onboarding_completed: z.boolean().optional(),
  })
  .passthrough();

export type OnboardingBody = z.infer<typeof OnboardingBodySchema>;
