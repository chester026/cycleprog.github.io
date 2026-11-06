# Coach: per-ride power breakdown + 2 bug fixes

Status: implemented 2026-11-06 (all sections; see git log). Verified: shared 838 tests / 100 % coverage, server 356 unit + 345 integration on real Postgres, app jest + tsc. Owner decision: coach must be able to analyze a single ride
from its per-second streams, without raising Strava API load.

## 0. Strava load budget (why this plan is cheap)

- Strava quota is per APPLICATION: 300 GET / 15 min, 3000 / day (`services/strava/client.js`).
- Streams for one ride = 1 GET. Today the same streams are fetched separately by
  `services/ftpAnalysis.js`, `services/hrZones.js`, `services/powerProfile.js` and
  `GET /api/activities/:id/streams` — up to 4 GETs per ride, none cached.
- Target after this plan: **1 GET per ride, ever** (lazy, on first consumer), everything else
  from cache. Net effect is a reduction, not an increase.

## 1. Raw streams cache (foundation)

New table `activity_streams` (migration `server/migrations/1758000000016_activity-streams.sql`):

```sql
CREATE TABLE IF NOT EXISTS activity_streams (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strava_id  BIGINT  NOT NULL,
  streams    BYTEA   NOT NULL,          -- gzip(JSON of getStreams() response), ~20–60 KB per ride
  keys       TEXT[]  NOT NULL,          -- which streams Strava actually returned (watts may be absent)
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, strava_id)
);
```

- `repositories/activityStreams.js`: `get(userId, stravaId)`, `save(userId, stravaId, streams)`.
  gzip via `zlib.gzipSync` / `gunzipSync`; a 5 h ride (≈18k points × 6 streams) is ~150 KB raw,
  ~25 KB gzipped.
- `services/strava/activities.js#getStreams(userId, id)` becomes cache-through: DB hit → return;
  miss → Strava GET (quota-aware, as now) → save → return. No TTL: a ride's streams never change.
  Keep an explicit `getStreams(userId, id, {force: true})` for the rare re-fetch.
- Nothing else changes for ftpAnalysis / hrZones / powerProfile / the streams route — they call
  the same function and get the cache for free. Keep their per-call fetch budgets
  (`MAX_UNCACHED_STREAM_FETCHES`): they still bound cold-start work.
- Integration test on real Postgres: miss → fetch → hit (Strava client mocked), `force` path,
  user cascade delete.
- Retention (owner decision 2026-11-06): raw rows are deleted 30 days after `fetched_at`
  (`STREAMS_RETENTION_DAYS = 30`, one constant), by the same background pass that runs the
  `estimated_power` enrichment. Derived results in `activity_analysis` are kept forever; a ride
  opened again after 30 days costs one Strava GET, same as the first time. Expected footprint:
  ~100 KB per active user, invisible on the 5 GB plan.
- Storage stays in Postgres (Render disk is ephemeral, Redis is a TTL cache). The repository
  exposes `get/save/deleteOlderThan` only, so a later move of the blob to R2/S3 is a one-file
  swap.

## 2. Ride power breakdown (the coach-facing part)

`packages/shared/src/calc/ridePower.ts` (pure, 100 % coverage like the rest of `calc`):

```ts
export interface RidePowerBreakdown {
  source: 'meter' | 'none';           // 'none' when the watts stream is missing/empty
  duration_s: number;
  avg_w: number; np_w: number; max_w: number;
  vi: number;                          // np / avg
  if_: number | null; tss: number | null;   // null when FTP unknown
  best_efforts_w: { '5s': number; '1m': number; '5m': number; '20m': number; '60m': number | null };
  zones_s: number[];                   // time in Coggan zones Z1..Z7, seconds (null FTP → [])
  segments: Array<{                    // from altitude + velocity: contiguous climb / flat / descent
    kind: 'climb' | 'flat' | 'descent';
    start_s: number; duration_s: number; distance_m: number; grade_pct: number;
    avg_w: number; avg_hr: number | null; avg_speed_kmh: number; avg_cadence: number | null;
  }>;
  fade: { first_half_w: number; second_half_w: number; pct: number };  // pacing / fatigue
  coasting_pct: number;                // share of samples with watts == 0 while moving
}
export function ridePowerBreakdown(streams, opts: { ftp?: number | null }): RidePowerBreakdown
```

- Reuse what exists: `toOneHertz`, `bestEfforts`, `powerZones` from `calc/power.ts` /
  `calc/powerProfile.ts`. NP = 30 s rolling avg → ^4 → mean → ^0.25.
- Segments: grade over a 200 m window centred on each sample, runs classified climb (≥ 3 %) /
  descent (≤ −3 %) / flat; runs shorter than 500 m fold into their neighbour; when more than 12
  remain only the 12 longest are listed, in ride order (merging unrelated hills made meaningless rows).
- Output is a few hundred bytes — that is what the LLM gets, never the raw arrays.

`services/rideAnalysis.js` (or inside `services/powerProfile.js`):
`getRidePowerBreakdown(userId, stravaId)` → `activity_analysis` kind `'ride_power'` hit → return;
miss → `getStreams` (cached, §1) → `ridePowerBreakdown(streams, {ftp})` → save → return.
FTP comes from `powerProfile.getPowerProfile(userId)` when available (cached too), else null.

Note on `estimated_power` rides (no meter): watts stream is absent from Strava, so
`source: 'none'` and the tool returns only the segment table with speed/HR/grade — still useful
(climb-by-climb speed and HR), and the coach is told it is not a power analysis.

## 3. Coach tool

`aiCoach.js`: new tool `get_ride_power_breakdown({ activity_id })`.

- Description: "Per-ride analysis from the ride's per-second power/HR/altitude streams: NP, IF,
  TSS, VI, time in power zones, best efforts, climb-by-climb watts/HR/speed, pacing fade.
  Call when the rider asks HOW a specific ride went (pacing, climbs, zones, 'did I go out too
  hard'), after get_activity_analysis. Quote its numbers; never estimate them."
- Executor: `get_ride_power_breakdown` → `services/rideAnalysis.getRidePowerBreakdown`. Errors
  (Strava rate limit, no streams) return `{source:'none', note}` like other tools, never throw.
- System prompt (near the get_activity_analysis paragraph): on a pacing/climb/zone question call
  this tool; on `source:'none'` say the ride has no power meter data and use the segment speeds/HR.
- Suggestion chips: after the first ride analysis add "How did I pace the climbs?" so the tool
  gets used.
- Contract: no new HTTP route (tool-only). If the app later wants the same card, add
  `activities.powerBreakdown` to `packages/shared/src/api/contract/activities.ts` + route +
  hook, in that order.
- Tests: `server/test/aiCoach.ridePower.test.js` (executor with mocked service),
  shared calc unit tests with a synthetic 1 h stream (known NP/zones), integration test for the
  cache path.

## 4. Bug fix: Strava login drops the refresh token

`BikeLabApp/src/navigation/deepLinks.ts:135` — `const {token} = await api.call(auth.exchange…)`
then `TokenStorage.setToken(token, true)`. The response also carries `refreshToken`
(`ExchangeResponseWithRefreshSchema`) and it is discarded, so a Strava-login session has no
refresh token and dies when the JWT expires (email login uses `setTokens`, LoginScreen.tsx:107).

Fix: `const {token, refreshToken} = …; await TokenStorage.setTokens(token, refreshToken, true);`
Update `deepLinks.test.ts` to assert both are stored.

Diagnosis for the "link expired or was already used" alert still needs Render logs: the alert
fires on ANY exchange failure (network, 429 from `authLimiter` = 10 auth requests / IP / 15 min,
each Strava attempt costs 2). Improvement in the same change: include `error.status` / server
`code` in the alert body (`login.stravaExchangeFailed` keeps the friendly text, append
`(${status})`), so the next failure is self-diagnosing.

## 5. Bug fix: goal speed shows m/s (4.7 instead of 16.9 km/h)

`goalProgress.ts:194` applies `metric.transform || 1`; the AI is only *asked* to add
`transform: 3.6` (`aiGoals.js:219`) and skipped it for a climbing-speed goal → `current_value`
is raw `average_speed` in m/s.

Fix (deterministic, model-independent):
- `packages/shared/src/calc/goalProgress.ts`: `export function impliedTransform(field, unit)`:
  `average_speed|max_speed` + `km/h` → 3.6; `distance` + `km` → 0.001; `moving_time` + `h` →
  1/3600, + `min` → 1/60; `total_elevation_gain` + `km` → 0.001; otherwise 1.
- `calculateActivityProgress`: `transform = metric.transform ?? impliedTransform(field, goal.unit)`.
  (`??`, not `||`, so an explicit transform always wins.)
- Normalise on write as well, so stored metrics are self-describing: in `aiGoals.js` validation
  and in `aiCoach.js#create_goal`, when `metric.transform` is missing set it to
  `impliedTransform(metric.field, unit)`.
- One-off migration `1758000000017_goal-transform-backfill.sql`: for `goals` rows whose
  `metric->>'source'='activity'`, no `transform`, and (field, unit) in the table above, set
  `metric = metric || jsonb_build_object('transform', <value>)`. Recompute is automatic — progress
  is computed on read.
- Unit tests for `impliedTransform` + a goalProgress case with unit `km/h` and no transform.

## Order of work

1. §5 (smallest, user-visible today) → 2. §4 → 3. §1 → 4. §2 → 5. §3.
Each step is its own commit; CI gate from CLAUDE.md after each.
