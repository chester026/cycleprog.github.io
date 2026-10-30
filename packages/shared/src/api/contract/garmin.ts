// Garmin Connect IQ bridge (docs/plans/garmin-connect-iq.md) —
// server/routes/garmin.js, `/api/garmin/*`.
//
// Two token kinds meet here. `pair/start` and `pair/poll` are called by the
// bike computer BEFORE it has any token (so `auth: false`); `pair/confirm`
// is called by the phone/web app with a normal session token; `home` and
// `unpair` are called by the device with the long-lived device JWT the poll
// handed out (`aud: 'garmin'` — see server/lib/jwt.js issueDeviceToken).
//
// The `home` response uses one-letter keys and trimmed strings on purpose:
// it is parsed on a Connect IQ device where a device app has a hard memory
// cap and the JSON is held in memory as a whole. Do not "clean up" the key
// names — they are the wire format the Monkey C app reads
// (packages/garmin-ciq/source/Api.mc).
import { z } from 'zod';
import { defineEndpoint } from './define.js';

export const GARMIN_PAIR_CODE_LENGTH = 6;
export const GARMIN_PAIR_CODE_RE = /^[0-9]{6}$/;

export const GarminPairStartBodySchema = z.object({
  // Connect IQ `System.getDeviceSettings().uniqueIdentifier` — stable per
  // device + app install. Free text, length-capped.
  device_id: z.string().min(1).max(64),
  // e.g. "Edge 1040" (System.getDeviceSettings().partNumber is opaque, so
  // the app sends a label it knows). Optional, display only.
  device_name: z.string().max(64).optional(),
});

export const GarminPairStartResponseSchema = z.object({
  code: z.string().regex(GARMIN_PAIR_CODE_RE),
  poll_key: z.string().min(1),
  // Seconds until the code stops being confirmable.
  expires_in: z.number().int().positive(),
});

export const GarminPairConfirmBodySchema = z.object({
  code: z.string().trim().regex(GARMIN_PAIR_CODE_RE, 'Pairing code is 6 digits'),
});

export const GarminPairPollBodySchema = z.object({
  poll_key: z.string().min(1).max(128),
});

export const GarminPairPollResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }),
  z.object({ status: z.literal('ok'), token: z.string().min(1) }),
]);

export const GarminHomeSubGoalSchema = z.object({
  t: z.string(), // title (trimmed)
  cur: z.number(), // current_value
  tgt: z.number(), // target_value
  u: z.string().nullable(), // unit
  pct: z.number().int(), // 0..100
  d: z.number().int().nullable(), // pace.percentDelta (ahead > 0, behind < 0), null without a deadline
});

export const GarminHomeGoalSchema = z.object({
  id: z.number(),
  t: z.string(),
  pct: z.number().int(), // mean of sub-goal percents, 0..100
  days: z.number().int().nullable(), // days to target_date, null when open-ended
  ok: z.boolean(), // every sub-goal with a pace is onTrack
  subs: z.array(GarminHomeSubGoalSchema),
});

export const GarminHomeImpactSchema = z.object({
  id: z.number(), // meta-goal id
  pct: z.number().int(), // progress after the ride
  gain: z.number().int(), // progress points this ride added
  c: z.array(z.object({ l: z.string(), v: z.string() })), // contributions: label, "+850 m"
});

export const GarminHomeLastRideSchema = z.object({
  id: z.string(),
  n: z.string(), // name (trimmed)
  d: z.string(), // ISO date (YYYY-MM-DD), local to the ride
  km: z.number(), // distance, km, 1 decimal
  m: z.number().int(), // elevation gain, m
  min: z.number().int(), // moving time, minutes
  impact: z.array(GarminHomeImpactSchema),
});

export const GarminHomePartSchema = z.object({
  c: z.string(), // component label (user's custom name or the default)
  pct: z.number().int(), // healthPercent 0..100
  km: z.number().int(), // remainingKm
  s: z.enum(['good', 'warning', 'attention', 'critical']),
});

export const GarminHomeBikeSchema = z.object({
  n: z.string(), // bike name (trimmed)
  km: z.number().int(), // total km on the bike
  r: z.number().int(), // rides on this bike (Strava activitiesCount)
  h: z.number().int(), // overallHealth 0..100
  // next service: label, in km, and that component's status (for the dot)
  next: z
    .object({ c: z.string(), km: z.number().int(), s: z.enum(['good', 'warning', 'attention', 'critical']).optional() })
    .nullable(),
  parts: z.array(GarminHomePartSchema), // most worn first
});

export const GarminHomeResponseSchema = z.object({
  v: z.literal(1),
  at: z.string(), // ISO timestamp the payload was built
  goals: z.array(GarminHomeGoalSchema),
  last: GarminHomeLastRideSchema.nullable(),
  // Primary bike (Strava gear) with component wear — `undefined`/absent on
  // older servers, null when the rider has no bike.
  bike: GarminHomeBikeSchema.nullable().optional(),
});

export type GarminHomeResponse = z.infer<typeof GarminHomeResponseSchema>;

export const garmin = {
  // POST /api/garmin/pair/start — device, no auth. Returns the 6-digit
  // code the rider types into the app, and the key to poll with.
  pairStart: defineEndpoint({
    method: 'POST',
    path: '/api/garmin/pair/start',
    body: GarminPairStartBodySchema,
    response: GarminPairStartResponseSchema,
    auth: false,
  }),

  // POST /api/garmin/pair/confirm — app/web, session auth. Binds the code
  // to the caller; 404 GARMIN_CODE_NOT_FOUND when unknown, expired or
  // already confirmed.
  pairConfirm: defineEndpoint({
    method: 'POST',
    path: '/api/garmin/pair/confirm',
    body: GarminPairConfirmBodySchema,
    response: z.object({ success: z.boolean(), device_name: z.string().nullable() }),
    auth: true,
  }),

  // POST /api/garmin/pair/poll — device, no auth. `pending` until the app
  // confirms; then `ok` + the device token exactly once (the row is consumed);
  // 410 GARMIN_PAIR_GONE afterwards or once expired.
  pairPoll: defineEndpoint({
    method: 'POST',
    path: '/api/garmin/pair/poll',
    body: GarminPairPollBodySchema,
    response: GarminPairPollResponseSchema,
    auth: false,
  }),

  // GET /api/garmin/home — device token only. Everything the device shows.
  home: defineEndpoint({
    method: 'GET',
    path: '/api/garmin/home',
    response: GarminHomeResponseSchema,
    auth: true,
  }),

  // DELETE /api/garmin/pair — device token only. Revokes this device's
  // token (the device forgets it locally too).
  unpair: defineEndpoint({
    method: 'DELETE',
    path: '/api/garmin/pair',
    response: z.object({ success: z.boolean() }),
    auth: true,
  }),

  // GET /api/garmin/devices — session auth. Paired devices for the
  // Settings screen. DELETE /api/garmin/devices/:id revokes one from the phone.
  devices: defineEndpoint({
    method: 'GET',
    path: '/api/garmin/devices',
    response: z.array(
      z.object({
        id: z.number(),
        device_id: z.string(),
        device_name: z.string().nullable(),
        paired_at: z.union([z.string(), z.date()]),
        last_seen_at: z.union([z.string(), z.date()]).nullable(),
      }),
    ),
    auth: true,
  }),
  removeDevice: defineEndpoint({
    method: 'DELETE',
    path: '/api/garmin/devices/:id',
    params: z.object({ id: z.coerce.number() }),
    response: z.object({ success: z.boolean() }),
    auth: true,
  }),
};
