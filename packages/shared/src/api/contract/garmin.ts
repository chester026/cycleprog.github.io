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

// The week and one session on the bike computer
// (docs/plans/garmin-edge-workouts.md). Blocks travel as positional arrays,
// not objects: a Connect IQ dictionary costs far more memory per entry than
// an array slot, and a session can have 60 blocks. Nothing in them is ever
// null — 0 / "" stand for "none" — because the device drops nulls before
// caching (Store.mc), which would shift the positions.
export const GARMIN_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Block kinds by code, in this order (index = code).
export const GARMIN_BLOCK_KINDS = ['warmup', 'work', 'recovery', 'cooldown', 'steady'] as const;
// Target units by code: 0 none, 1 watts, 2 bpm.
export const GARMIN_TARGET_UNITS = ['none', 'w', 'bpm'] as const;

// [seconds, zone 1–7, effort 0|1] — enough to draw the profile on a list row.
export const GarminProfileBlockSchema = z.tuple([z.number().int().positive(), z.number().int().min(1).max(7), z.number().int().min(0).max(1)]);

export const GarminWeekSessionSchema = z.object({
  id: z.number(),
  t: z.string(), // title (trimmed)
  min: z.number().int().nonnegative(), // length in minutes, 0 when unknown
  done: z.boolean(),
  // Version of the title + blocks: the device re-downloads the workout file
  // only when this changes.
  u: z.string(),
  b: z.array(GarminProfileBlockSchema), // empty = no blocks, cannot be started
});

export const GarminWeekResponseSchema = z.object({
  v: z.literal(1),
  from: z.string(), // first day, 'YYYY-MM-DD'
  // Days that have a session, in order; the others are left out.
  days: z.array(z.object({ d: z.string(), ev: z.array(GarminWeekSessionSchema) })),
});

export type GarminWeekResponse = z.infer<typeof GarminWeekResponseSchema>;

// [seconds, zone, kind code, rep, reps, unit code, low, high, cadence low,
//  cadence high, cue] — rep/reps 0 outside a set, low/high 0 without a
// target, cue "" without one.
export const GarminSessionBlockSchema = z.tuple([
  z.number().int().positive(),
  z.number().int().min(1).max(7),
  z.number().int().min(0).max(GARMIN_BLOCK_KINDS.length - 1),
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  z.number().int().min(0).max(GARMIN_TARGET_UNITS.length - 1),
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  z.string(),
]);

export const GarminSessionResponseSchema = z.object({
  v: z.literal(1),
  id: z.number(),
  t: z.string(),
  d: z.string(), // 'YYYY-MM-DD'
  min: z.number().int().nonnegative(),
  done: z.boolean(),
  u: z.string(),
  b: z.array(GarminSessionBlockSchema),
});

export type GarminSessionResponse = z.infer<typeof GarminSessionResponseSchema>;

// Garmin Connect as a data SOURCE (docs/plans/garmin-connect-api.md) — the
// opposite direction from everything above: not a bike computer reading
// BikeLab, but the rider's Garmin rides and health data coming into BikeLab.
//
// `transport` says how they arrive: 'personal' is the owner's Personal API
// key (development, one account), 'oauth' the Developer Program link real
// riders will make. `available` is whether a rider can make that link from
// the app right now — false until the OAuth flow exists, and the app keeps
// its connect button disabled while it is.
// The newest Garmin health day's headline figures. `day` is Garmin's
// calendar date ('YYYY-MM-DD'): the sleep and HRV are the night the rider
// woke up from that morning, the rest is that day so far. Every figure is
// null when the watch did not measure it.
export const GarminHealthLatestSchema = z.object({
  day: z.string(),
  sleep_hours: z.number().nullable(),
  sleep_score: z.number().int().nullable(),
  hrv_ms: z.number().nullable(),
  // Garmin's own word: BALANCED, UNBALANCED, LOW, POOR, …
  hrv_status: z.string().nullable(),
  resting_hr: z.number().int().nullable(),
  body_battery_high: z.number().int().nullable(),
  body_battery_low: z.number().int().nullable(),
  stress_avg: z.number().int().nullable(),
});

export const GarminConnectStatusSchema = z.object({
  connected: z.boolean(),
  available: z.boolean(),
  transport: z.enum(['personal', 'oauth']).nullable(),
  connected_at: z.union([z.string(), z.date()]).nullable(),
  last_sync_at: z.union([z.string(), z.date()]).nullable(),
  // Rides ingested from Garmin, and the newest one's start.
  activities: z.number().int().nonnegative(),
  last_activity_at: z.union([z.string(), z.date()]).nullable(),
  // Days of health data (sleep, HRV, resting HR, stress, Body Battery)
  // stored, the newest one ('YYYY-MM-DD'), and its headline figures.
  health_days: z.number().int().nonnegative(),
  last_health_day: z.string().nullable(),
  health_latest: GarminHealthLatestSchema.nullable(),
});

export type GarminConnectStatus = z.infer<typeof GarminConnectStatusSchema>;

// POST /api/garmin/connect/sync — the status after the fetch, plus how many
// health days it brought (0 when the previous fetch was under a minute ago).
export const GarminConnectSyncResponseSchema = GarminConnectStatusSchema.extend({
  synced_days: z.number().int().nonnegative(),
});

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

  // GET /api/garmin/week?from=YYYY-MM-DD — device token only. The planned
  // rides of the seven days starting at `from` (the device's local date),
  // each with its block profile.
  week: defineEndpoint({
    method: 'GET',
    path: '/api/garmin/week',
    query: z.object({ from: z.string().regex(GARMIN_DATE_RE, 'from must be YYYY-MM-DD') }),
    response: GarminWeekResponseSchema,
    auth: true,
  }),

  // GET /api/garmin/sessions/:id — device token only. One session with its
  // blocks in full. Its workout file is GET /api/garmin/sessions/:id/fit
  // (binary, outside the contract).
  session: defineEndpoint({
    method: 'GET',
    path: '/api/garmin/sessions/:id',
    params: z.object({ id: z.coerce.number().int().positive() }),
    response: GarminSessionResponseSchema,
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

  // GET /api/garmin/connect/status — session auth. Whether the rider's
  // Garmin Connect account feeds BikeLab, and how much has come through
  // it, for the Integrations screen.
  connectStatus: defineEndpoint({
    method: 'GET',
    path: '/api/garmin/connect/status',
    response: GarminConnectStatusSchema,
    auth: true,
  }),

  // POST /api/garmin/connect/sync — session auth. The rider asks for their
  // latest Garmin health days now (the coach chat's "Get Garmin health data"
  // chip, the Refresh button on the Garmin screen). 409 GARMIN_NOT_CONNECTED;
  // 503 GARMIN_REFRESH_UNAVAILABLE when this connection can't be refreshed
  // on demand; 429 / 502 when Garmin itself says no.
  connectSync: defineEndpoint({
    method: 'POST',
    path: '/api/garmin/connect/sync',
    response: GarminConnectSyncResponseSchema,
    auth: true,
  }),
};
