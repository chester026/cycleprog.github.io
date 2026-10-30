# Garmin Connect IQ bridge — Implementation Plan

**Date:** 2026-10-22 · **Scope:** new `packages/garmin-ciq` (Monkey C device app for Edge 1040) + additive backend
`/api/garmin/*` · **Target:** open the BikeLab app on the bike computer and see active goals and what the last ride
did to them, pulled from the same server-computed numbers the phone/web show.

Based on a read of `server/routes/{goals,metaGoals,activities,analyticsSnapshot}.js`, `server/services/{goals,activities}.js`,
`server/middleware/auth.js`, `server/lib/jwt.js`, `packages/shared/src/{calc/goalProgress.ts,types/goal.ts,api/contract/*}`.

## 0. Owner decisions (2026-10-22)

| Topic | Decision |
|---|---|
| App type | **Device app** (launched from the Edge apps menu), not a data field. A data field ("live remaining to goal") is a possible phase 2. |
| Where the Monkey C project lives | `packages/garmin-ciq` — it is the bridge between the app and the bike computer, so it sits next to `packages/shared`. NOT an npm workspace member (no `package.json`); root `workspaces: ["packages/*"]` must be narrowed to `packages/shared` or the folder excluded. |
| Sync lag | "Last ride" = last activity the backend already has (Strava today, Apple Health after the migration). The device shows the ride's date and has a **Refresh** action; no provisional ride upload from the device (keeps one source of activities). |
| Auth | Pairing-code flow + long-lived device JWT. Device never types a token. |
| Backend changes | Additive only: one new route file, one service, one repository, one migration, one contract domain. No renames (LEGACY_MOBILE_COMPAT). |

## Status (2026-10-22)

| Step | State |
|---|---|
| 1 contract `garmin.ts` | ✅ written (`packages/shared/src/api/contract/garmin.ts` + test) — owner: `npm run build -w packages/shared`, `npm test -w packages/shared` |
| 2 server | ✅ written: migration `1758000000015_garmin-devices.sql`, `repositories/garmin.js`, `services/garmin.js`, `middleware/garmin.js`, `routes/garmin.js`, `lib/jwt.js` `issueDeviceToken`, `authMiddleware` aud guard, `config.GARMIN_TOKEN_TTL`; tests `test/garmin.mapHome.test.js`, `test/integration/garmin.test.js` — owner: `npm test -w server` (needs Postgres) |
| 3 confirm-pairing UI in BikeLabApp | ✅ written 2026-10-30: `screens/GarminIntegrationScreen.tsx` (Profile → Integrations → Garmin Edge; deep link `profile/garmin`), hooks `useGarminDevices` / `useConfirmGarminPairing` / `useRemoveGarminDevice`, `BikeGarage/GarminBanner.tsx` (hidden once a device is paired), i18n en/ru — owner: `npm run lint && npm test` in BikeLabApp, check on the iOS simulator |
| 4 Monkey C: Pair + LastRide | ✅ written, **not yet compiled** — owner: open `packages/garmin-ciq` in VS Code, F5 on edge1040, fix whatever the compiler says |
| 5 Goals pages + menu | ✅ runs in the simulator (22–23.10): light theme, brand mark, Garage page (bike km / rides / health, next service, worn parts) |
| 6 Deploy + sideload to the owner's Edge 1040 | ⏳ next |
| 7 Data field (in-ride screen: bike + goals with live remaining) | ⏳ after 6 — separate CIQ app with its own pairing |

Design deviation from §2.1: pairing attempts and paired devices are one table, `garmin_devices` (a consumed
attempt *is* the device row; `revoked_at` is the per-device kill switch, checked on every `/api/garmin/home`
via the token's `jti`). Device tokens carry `aud: 'garmin'`; `authMiddleware` rejects them everywhere except
routes that opt in with `middleware/garmin.js`.

## 1. What the device shows

Three views, all rendered from one `GET /api/garmin/home` response cached in `Application.Storage`:

1. **Last ride** (start view) — name, date, distance / elevation / moving time; then per affected meta-goal:
   `title · +N%` and its `contributions` (`+850 m`, `+42.3 km`). Source: `services/activities.js
   getMetaGoalsProgressForActivity` (already cached per activity in `activity_meta_goal_progress`).
2. **Goals** — active meta-goals: title, %, days to `target_date`, on-track flag (from `pace.onTrack` of sub-goals /
   mean percent). Up/Down scroll, Enter/tap opens.
3. **Meta-goal** — sub-goals: `current / target unit`, %, `pace.percentDelta`.

Menu/long-press: Refresh · Unpair.

## 2. Backend

### 2.1 Pairing + device token

- Migration `server/migrations/17580000000NN_garmin-pairings.sql`: table `garmin_pairings(code char(6) PK,
  poll_key text unique, user_id int null references users on delete cascade, device_id text, created_at, expires_at,
  consumed_at)`. Codes expire in 10 min; a nightly delete or delete-on-read keeps it small.
- `POST /api/garmin/pair/start` (no auth, rate-limited): body `{device_id, device_name}` → `{code, poll_key, expires_in}`.
  Device shows `code`.
- `POST /api/garmin/pair/confirm` (session auth, from BikeLabApp/web): body `{code}` → binds `user_id`; 404 if unknown/expired.
- `POST /api/garmin/pair/poll` (no auth): body `{poll_key}` → `{status: 'pending'}` or `{status: 'ok', token}` once;
  row is consumed on success. Device polls every 3 s while the code is on screen.
- Token: `lib/jwt.js` gets `issueDeviceToken(user, {aud: 'garmin', device_id})`, TTL `config.GARMIN_TOKEN_TTL`
  (default `365d`), carries `tv` so logout-all / password reset revokes it like any session.
  `authMiddleware` already validates it unchanged. `/api/garmin/*` additionally requires `aud === 'garmin'`
  (small `requireGarminDevice` middleware) so a device token cannot be used against the rest of the API,
  and the rest of the API rejects `aud: 'garmin'` tokens — one line in `authMiddleware`.
- `DELETE /api/garmin/pair` (device token) → bumps nothing global; deletes the pairing row and the device
  revocation list entry (`garmin_devices` can be folded into `garmin_pairings` with `revoked_at`).

### 2.2 Home payload

`GET /api/garmin/home` (device token) → compact JSON, short keys, strings trimmed to 24 chars, at most 5 meta-goals /
6 sub-goals each. Built in `services/garmin.js` from existing services, no new calc:

```json
{ "v": 1, "at": "2026-10-22T09:12:00Z",
  "goals": [{ "id": 12, "t": "Everest this season", "pct": 41, "days": 38, "ok": true,
              "subs": [{ "t": "Elevation", "cur": 3400, "tgt": 8848, "u": "m", "pct": 38, "d": -9 }] }],
  "last": { "id": "123", "n": "Morning Ride", "d": "2026-10-21", "km": 42.3, "m": 850, "min": 95,
            "impact": [{ "id": 12, "pct": 41, "gain": 4, "c": [{ "l": "Elevation", "v": "+850 m" }] }] } }
```

`last` is `null` when the user has no activities (or Strava not linked → treat `StravaNotLinkedError` as empty,
not 401, same as `analytics/hr-zones`). Monkey C memory is the reason for the shape — not a style choice.

### 2.3 Contract + tests

- `packages/shared/src/api/contract/garmin.ts` (+ `.test.ts`), registered in `contract/index.ts`.
- `server/routes/garmin.js` → `services/garmin.js` → `repositories/garmin.js`; mounted in `server.js`.
- Integration tests on real Postgres for the pairing state machine (start → confirm → poll once → second poll 410;
  expiry; wrong user cannot confirm twice; device token rejected on `/api/goals`, session token rejected on `/api/garmin/home`).
- Unit test for the home mapper (trimming, limits, null last).
- `npm -w server run routes` and `contract.inventory.test.js` stay green.

## 3. `packages/garmin-ciq`

```
packages/garmin-ciq/
  manifest.xml          # minSdk per SDK Manager for Edge 1040; permissions: Communications
  monkey.jungle
  resources/            # strings (en, ru), layouts, 1 app icon
  source/
    BikeLabApp.mc       # AppBase: load cache, pick start view
    Api.mc              # makeWebRequest wrapper: base URL, Bearer token, JSON, error → view state
    Store.mc            # Application.Storage: token, device_id, last home payload, fetched_at
    PairView.mc         # shows code, polls /pair/poll
    LastRideView.mc
    GoalsView.mc / GoalDetailView.mc
    MenuDelegate.mc     # Refresh / Unpair
  README.md             # build, sideload, simulator with a mocked phone, API base URL per build (dev/prod)
```

- Base URL compiled in via `monkey.jungle` build variants (`dev` → local tunnel, `prod` → Render).
- Request budget: one `home` call on launch and on Refresh; pairing poll every 3 s only while PairView is shown.
- Errors: no phone → show cached data with "offline · 2h ago"; 401 → drop token, back to PairView.
- No tests framework for Monkey C in CI; the Api/Store mapping is kept thin so the backend tests cover the contract.

## 4. Order

| Step | Where | Check |
|---|---|---|
| 1 contract `garmin.ts` | shared | shared vitest |
| 2 migration + repo + service + route + jwt `aud` | server | integration tests on Postgres |
| 3 confirm-pairing UI | BikeLabApp Settings (web later) | enter code → "Garmin paired" |
| 4 Monkey C skeleton: Pair + LastRide against prod | packages/garmin-ciq | simulator, then sideload `.prg` to `GARMIN/APPS` |
| 5 Goals + GoalDetail + menu | packages/garmin-ciq | sideload |

Step 3 is the one piece the device cannot do without.

## 5. Open / later

- Data field "remaining to goal, live" (sum goals on distance / elevation / moving_time + `Activity.Info`).
- Today's workout from `GET /api/training-plan` as a 4th view.
- Connect IQ Store publication (needs the review process; sideload is enough for the owner).
