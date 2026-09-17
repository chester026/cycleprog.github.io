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
