// Bikes + garage health endpoints (T-7.1) — server/routes/bikes.js.
import { z } from 'zod';
import { defineEndpoint } from './define.js';
import { BikeSchema, BikeHealthSchema } from '../../types/bike.js';

// Sanity bound, not a product limit: a component with more than this is a typo.
const INITIAL_KM_MAX = 200000;
const InitialKmSchema = z.number().min(0).max(INITIAL_KM_MAX).optional();

export const bikes = {
  // GET /api/bikes — [] when Strava isn't linked (StravaNotLinkedError), not
  // an error.
  list: defineEndpoint({
    method: 'GET',
    path: '/api/bikes',
    response: z.array(BikeSchema),
    auth: true,
  }),

  // GET /api/bikes/:bikeId/health — bikeId is a Strava gear id ('b1234…')
  // or the synthetic 'total', always a string, never coerced.
  health: defineEndpoint({
    method: 'GET',
    path: '/api/bikes/:bikeId/health',
    params: z.object({ bikeId: z.string() }),
    response: BikeHealthSchema,
    auth: true,
  }),

  // PUT /api/bikes/:bikeId/labels — body: { labels: [{ target_type:
  // 'group'|'component', target_key, custom_name }, ...] }; the route itself
  // filters out invalid entries and 400s if nothing valid remains, so the
  // schema here only guards the *shape* clients may send, not that filter.
  updateLabels: defineEndpoint({
    method: 'PUT',
    path: '/api/bikes/:bikeId/labels',
    params: z.object({ bikeId: z.string() }),
    body: z
      .object({
        labels: z.array(
          z
            .object({
              target_type: z.enum(['group', 'component']),
              target_key: z.string(),
              custom_name: z.string(),
            })
            .passthrough()
        ),
      })
      .passthrough(),
    response: z.object({ success: z.boolean(), count: z.number() }).passthrough(),
    auth: true,
  }),

  // POST /api/bikes/:bikeId/components/:component/reset — body is optional;
  // `initial_km` = km the component already had at reset time (a used bike's
  // 15 000 km cassette). Health then reports kmSinceReset = (bike km - resetKm)
  // + initial_km. Omitted = 0, i.e. a new part.
  resetComponent: defineEndpoint({
    method: 'POST',
    path: '/api/bikes/:bikeId/components/:component/reset',
    params: z.object({ bikeId: z.string(), component: z.string() }),
    body: z.object({ initial_km: InitialKmSchema }).passthrough().optional(),
    response: z
      .object({ success: z.boolean(), component: z.string(), resetKm: z.number() })
      .passthrough(),
    auth: true,
    summary:
      'Marks a component replaced at the bike\'s current mileage. Optional body { initial_km }: km the component already had (used bike); health adds it to kmSinceReset.',
  }),

  // POST /api/bikes/:bikeId/onboarding — bulk initial component setup. Each
  // item may carry `initial_km` (same meaning as on the reset endpoint).
  onboarding: defineEndpoint({
    method: 'POST',
    path: '/api/bikes/:bikeId/onboarding',
    params: z.object({ bikeId: z.string() }),
    body: z
      .object({
        resets: z.array(
          z
            .object({ component: z.string(), resetKm: z.number().optional(), initial_km: InitialKmSchema })
            .passthrough()
        ),
      })
      .passthrough(),
    response: z.object({ success: z.boolean(), count: z.number() }).passthrough(),
    auth: true,
  }),
};
