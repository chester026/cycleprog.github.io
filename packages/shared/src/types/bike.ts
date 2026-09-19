import { z } from 'zod';

// GET /api/bikes response item — server/services/strava/activities.js's
// getBikes() formattedBikes shape (both the Strava-gear branch and the
// gear-inferred-from-activities fallback branch produce this same shape).
// Replaces BikeLabApp's 4 identical local `interface Bike` declarations
// (BikesWidget.tsx, BikesModal.tsx, BikeGarageScreen.tsx, GarageScreen.tsx).
export const BikeSchema = z
  .object({
    id: z.string(), // Strava gear ids ('b1234…') and the synthetic 'total' — always strings
    name: z.string(),
    distance: z.number().nullable().optional(),
    distanceKm: z.number(),
    primary: z.boolean(),
    resource_state: z.number().nullable().optional(),
    brand_name: z.string().nullable().optional(),
    model_name: z.string().nullable().optional(),
    activitiesCount: z.number(),
  })
  .passthrough();

export type Bike = z.infer<typeof BikeSchema>;

// GET /api/bikes/:bikeId/health per-component entry — server/services/bikes.js's
// computeComponentHealth.
export const BikeHealthComponentSchema = z
  .object({
    id: z.string(),
    healthPercent: z.number(),
    kmSinceReset: z.number(),
    effectiveKm: z.number(),
    baseLifecycle: z.number(),
    remainingKm: z.number(),
    status: z.enum(['good', 'warning', 'attention', 'critical']),
    weightFactor: z.number(),
    styleFactor: z.number(),
    // pg returns TIMESTAMPTZ as a Date object (T-7.1 CONTRACT_VALIDATE_RESPONSES).
    lastResetAt: z.union([z.string(), z.date()]).nullable(),
    lastResetKm: z.number(),
  })
  .passthrough();

export type BikeHealthComponent = z.infer<typeof BikeHealthComponentSchema>;

// GET /api/bikes/:bikeId/health response — server/routes/bikes.js. `riderProfile`
// mirrors @bikelab/shared/calc's determineRiderProfile, except the route's
// own "no skills yet" fallback omits `description` (only profile+emoji) —
// kept optional here to match that actual handler output.
export const BikeHealthSchema = z
  .object({
    bikeId: z.string(),
    totalKm: z.number(),
    riderWeight: z.number(),
    ridingStyle: z
      .object({ climbing: z.number(), sprint: z.number(), power: z.number() })
      .passthrough(),
    riderProfile: z
      .object({ profile: z.string(), description: z.string().optional(), emoji: z.string() })
      .passthrough(),
    components: z.array(BikeHealthComponentSchema),
    overallHealth: z.number(),
    nextService: z.object({ component: z.string(), inKm: z.number() }).passthrough(),
    onboardingCompleted: z.boolean(),
    groupLabels: z.record(z.string(), z.string()),
    componentLabels: z.record(z.string(), z.string()),
  })
  .passthrough();

export type BikeHealth = z.infer<typeof BikeHealthSchema>;
