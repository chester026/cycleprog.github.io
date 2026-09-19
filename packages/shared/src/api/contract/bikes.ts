// Bikes + garage health endpoints (T-7.1) — server/routes/bikes.js.
import { z } from 'zod';
import { defineEndpoint } from './define.js';
import { BikeSchema, BikeHealthSchema } from '../../types/bike.js';

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

  // POST /api/bikes/:bikeId/components/:component/reset
  resetComponent: defineEndpoint({
    method: 'POST',
    path: '/api/bikes/:bikeId/components/:component/reset',
    params: z.object({ bikeId: z.string(), component: z.string() }),
    response: z
      .object({ success: z.boolean(), component: z.string(), resetKm: z.number() })
      .passthrough(),
    auth: true,
  }),

  // POST /api/bikes/:bikeId/onboarding — bulk initial component setup.
  onboarding: defineEndpoint({
    method: 'POST',
    path: '/api/bikes/:bikeId/onboarding',
    params: z.object({ bikeId: z.string() }),
    body: z
      .object({
        resets: z.array(
          z.object({ component: z.string(), resetKm: z.number().optional() }).passthrough()
        ),
      })
      .passthrough(),
    response: z.object({ success: z.boolean(), count: z.number() }).passthrough(),
    auth: true,
  }),
};
