# Garmin Connect as a ride source — Implementation Plan

**Date:** 2026-11-10 · **Scope:** rides recorded on a Garmin device and the health data of a Garmin watch (sleep, HRV,
resting HR, stress, Body Battery) coming INTO BikeLab from Garmin Connect, next to Strava. Additive backend
(`services/garminConnect/*`, three tables, one status endpoint) + a card on the app's Garmin integration screen. **Not** the Connect IQ bridge (`docs/plans/garmin-connect-iq.md`) — that one lets an Edge *show*
BikeLab; the two share a URL prefix and nothing else.

## 0. Owner decisions

| Date | Topic | Decision |
|---|---|---|
| 2026-10 | Why | Strava API Policy §5.3 forbids feeding Strava data to AI. Strava stays for login, the latest ride, total stats and the garage; the coach and analytics need another source. |
| 2026-11-09 | Strava code | **Untouched.** Strava remains the main source of history and every calculation still runs on it. Garmin is added alongside; later each chart supports either source or both. |
| 2026-11-09 | First transport | The owner's **Personal API key** (`GARMIN_API` in `server/.env`) — development only, one account. |
| 2026-11-10 | Model | Build storage and ingest **as it will be for real riders** now, so moving to the Developer Program later replaces the transport, not the architecture. |
| 2026-11-10 | What is stored | Per ride: summary + derived analysis + chart-sized downsample, forever. The per-second recording (FIT) is **not** stored. |
| 2026-11-10 | App | A Garmin item under Integrations: connected for the owner; for other riders the connect UI, disabled until riders can link themselves. |
| 2026-11-10 | Health | Health data is the important half — rides already arrive from Strava. |
| 2026-11-10 | Health in the coach | Garmin **supplements** Apple Health / Oura: they stay the source of sleep, HRV and readiness; Garmin adds Body Battery and stress. Garmin is the recovery source only for a rider with nothing else. |
| 2026-11-10 | Freshness | The rider fetches: the coach shows a **"Get Garmin health data"** chip when the Garmin figures are old; tapping it pulls the latest days and re-asks. For the owner's account that means the Personal API key is set in production. |

## Status (2026-11-10)

| Step | State |
|---|---|
| 1 Personal API client + probe | ✅ `services/garminConnect/personalClient.js`, `lib/zip.js`, `scripts/garmin-probe.js`. Probe run on the owner's account: 14/23 calls answer, no rate limiting, 180 activities back to 2019-03, original FIT files download (1 Hz, power/HR/cadence/GPS). |
| 2 Storage + ingest | ✅ migration `1758000000019_garmin-connect-data.sql`, `repositories/garminConnect.js`, `services/garminConnect/{fit,analyze,ingest}.js`, dependency `@garmin/fitsdk`. |
| 3 Personal-key backfill | ✅ `services/garminConnect/personalSync.js`, `scripts/garmin-sync.js` — owner: `npm install`, `npm run migrate`, then run the script (§5). |
| 4 Status endpoint + app card | ✅ `GET /api/garmin/connect/status` (contract `garmin.connectStatus`), `BikeLabApp` `GarminConnectCard` on the Garmin integration screen, i18n en/ru. |
| 5 Health days: storage, mapping, sync, app card | ✅ migration `1758000000020_garmin-health-days.sql`, `services/garminConnect/{healthColumns,personalHealth}.js`, `personalSync.syncPersonalHealth`, status fields, card rows. **Mapping not yet checked against real values** — the probe recorded shapes only; the sync prints the latest days for comparison with Garmin Connect. Weight is not included. |
| 5b Health → coach / readiness | ✅ `services/garminConnect/{coachHealth,refresh}.js`, `POST /api/garmin/connect/sync`, `aiCoach.js` (`analyze_readiness`, `todayRecovery`, Health section of the prompt), the chip in `routes/coach.js`, shared `coach/cards.ts`, app chip handler + Recovery card rows + Refresh button on the card (§7). Owner: set `GARMIN_API` in the production environment, otherwise no chip is offered and Refresh answers 503. |
| 6 Readers: one activity layer over Strava + Garmin, dedup, per-rider primary source | ⏳ Until then nothing in the app or the coach reads `garmin_activities`. |
| 7 Developer Program: application, OAuth, push webhooks, AI consent screen, attribution | ⏳ needs the owner (§7). |

## 1. Garmin access, as of 2026-11

Garmin reopened its developer program on 2026-10-21 with three tiers. Re-read the current terms before applying — the
summary below is what they said when this was written.

| Tier | Who | Data | Notes |
|---|---|---|---|
| Personal API key | One person, own data | Pull, read-only, the Garmin Connect web paths | Key → 24 h bearer token, no refresh. Not for apps that serve other people; no sharing or sublicensing. |
| Starter | Businesses, free, ~1000 users | **Push only** (webhooks), **no backfill** | OAuth per rider. |
| Enterprise | Paid | Push + backfill | — |

Terms that shape the product (Developer Program agreement): AI processing of Garmin data is allowed with an AI
transparency statement and explicit, withdrawable user consent, with third-party AI platforms declared; Garmin
attribution is required, including on derived data; income from the API needs written permission; a user's data must be
deleted when they disconnect.

Personal API specifics found by the probe: host `personal.connectapi.garmin.com`; token `POST
/personalapitoken-service/personal-api/personal-api-key/token` with `Authorization: ApiKey <key>`; the `Accept` header
must allow more than `application/json` (a strict one gets 406). Not available on the owner's account (404): devices,
power zones, FTP, splits, time in zones, VO2max, training readiness, training status.

## 2. Shape of the solution

```
 personal key (dev)            Developer Program (riders)
 scripts/garmin-sync.js        webhook → download activity file
        │                               │
        └────────── FIT bytes ──────────┘
                        │
        services/garminConnect/ingest.js      ingestActivityFile(userId, {garminActivityId, name}, fit)
          fit.js      FIT → Strava-shaped summary + key_by_type streams
          analyze.js  streams → breakdown, HR histogram, watts histogram, chart
                        │
        repositories/garminConnect.js  →  garmin_connections, garmin_activities
```

Only the top row differs between the two transports.

## 3. Ingest: the FIT file is the common ground

The Personal API and the Developer Program return **different JSON** for the same ride (the first is the Garmin Connect
web gateway). What both hand over unchanged is the original activity file. So everything BikeLab stores is derived from
the FIT file, and the transport supplies only what the file lacks: Garmin's activity id and the ride's name.

- `fit.js` decodes with Garmin's own `@garmin/fitsdk` and returns what the server already speaks: a summary in the
  Strava activity object's names and units, and streams in Strava's `key_by_type` shape (`time` = seconds from the first
  record, so an auto-pause is a gap — the convention the calc layer is written for).
- Ride type comes from the file's `sport` / `sub_sport`: `Ride`, `VirtualRide`, `EBikeRide`; anything else is skipped
  (`not_a_ride`). Files that can't become one ride are skipped with a reason: `not_fit`, `no_session`,
  `multi_session` (multisport), and `no_fit_file` when Garmin's ZIP holds a GPX/TCX original.
- `device_watts` is true when the file has power records: FIT carries no estimated power.
- Garmin's own figures (its NP/TSS/IF, the FTP set on the device, training effect, sensors) go to `provider`, apart from
  BikeLab's.

Checked on three real rides: BikeLab's NP / IF / TSS from the FIT match Garmin's own to within rounding (143 vs 144 W,
0.81 vs 0.811, 71 vs 70.6; 158 vs 158 W, 0.89 vs 0.894, 147 vs 146.2).

Tests use synthetic FIT files written with the SDK's encoder (`server/test/fixtures/fitRide.js`). Real rides are not
checked in: a FIT file is somebody's GPS track.

## 4. Storage model

`garmin_connections` — one row per linked rider: `garmin_user_id` (UNIQUE: one Garmin account feeds one BikeLab
account), `transport` (`personal` | `oauth`), `connected_at`, `last_sync_at`.

`garmin_activities` — one row per ride, PK `(user_id, garmin_activity_id)`:

| Part | Content |
|---|---|
| Summary columns | `type`, `name`, `start_date`, `utc_offset_s`, `distance`, `moving_time`, `elapsed_time`, `total_elevation_gain`, speeds, heart rate, cadence, `average_watts`, `max_watts`, `weighted_average_watts`, `kilojoules`, `device_watts`, `average_temp`, `device_name` — Strava's names and units. |
| `provider` JSONB | Garmin's own numbers for the ride. |
| `analysis` JSONB | The shapes `activity_analysis` caches for Strava rides: `breakdown` (`ridePowerBreakdown`; its `best_efforts_w` is the kind-`power` efforts map), `hr_histogram` (kind `hr_histogram`), plus `power_histogram` — seconds at each watt on moving time. |
| `chart` BYTEA | brotli(JSON) of the streams downsampled to 600 points, for the ride screen's charts and map. |

**No FTP at ingest.** The Strava pipeline recomputes a ride when the rider's FTP moves because it can re-read the
streams; here there is nothing to re-read. The breakdown is stored FTP-free and `analyze.breakdownWithFtp(analysis, ftp)`
rebuilds IF, TSS and time in Coggan zones from NP, moving time and the watts histogram — exactly what
`ridePowerBreakdown(streams, {ftp})` returns (asserted for several FTPs in `test/garminAnalyze.test.js`).

**Size.** Measured on real rides: ~11 KB a row (chart ~7.5 KB, analysis 2–3.5 KB), against ~0.3 MB for the FIT file.
The owner's ~170 rides are about 2 MB. At 1000 riders × 300 rides that is ~3 GB — inside the 5 GB plan, but most of it;
if it gets close, the chart is the part to shrink (fewer points, or drop `latlng`).

**Disconnect.** `garmin_activities` references `garmin_connections`, not `users`: deleting the connection row deletes
every ride that came through it, which is what Garmin's terms require. `repositories/garminConnect.deleteConnection`
does it; there is no route for it yet.

`analysis_version` (`analyze.ANALYSIS_VERSION`) marks the calc generation; bumping it makes the sync re-ingest.

### Health days

`garmin_health_days` — one row per rider per day, PK `(user_id, day)`, same cascade from `garmin_connections`.
`day` is Garmin's calendar date: the sleep and HRV on it are the night the rider woke up from that morning, the rest is
that day — the convention `oura_daily_data` uses.

| Group | Columns |
|---|---|
| Sleep | `sleep_seconds`, `deep_` / `light_` / `rem_sleep_seconds`, `awake_seconds`, `nap_seconds`, `sleep_score`, `sleep_avg_hr`, `sleep_avg_stress`, `sleep_respiration`, `spo2_avg` |
| HRV | `hrv_last_night_ms`, `hrv_weekly_avg_ms`, `hrv_status` (Garmin's word: BALANCED, UNBALANCED, LOW, …) |
| Heart rate | `resting_hr`, `min_hr`, `max_hr` |
| Stress | `stress_avg`, `stress_max`, `stress_qualifier`, seconds in rest / low / medium / high |
| Body Battery | `body_battery_high`, `_low`, `_charged`, `_drained` |
| Other | `respiration_avg`, `steps` |

Normalised columns only, no raw payload: the JSON differs per transport and this row is what each maps into
(`healthColumns.js` is the one column list). Everything is nullable — a rider who doesn't sleep in the watch has daytime
figures and no night; a day with nothing measured gets no row. An upsert never blanks a stored figure with a null, so a
sync where one Garmin endpoint failed doesn't erase the sleep an earlier sync stored. A row is ~150 bytes.

Not available on the owner's account, so not stored: Garmin's training readiness, training status and VO2max (404).

## 5. Transports

### Personal key (now)

`scripts/garmin-sync.js` → `personalSync.syncPersonalAccount`: page the activity list, pre-filter ride types, skip
rides already stored at the current analysis version, download the original ZIP, take the `.fit`, ingest. A 429 stops
the run and leaves the rest for the next one; a failed ride is reported and does not stop it.

```
cd server
npm install                 # new dependency: @garmin/fitsdk
npm run migrate             # creates the two tables — in the PRODUCTION database (it is the only one)
node scripts/garmin-sync.js --strava-id <athlete id> --dry-run
node scripts/garmin-sync.js --strava-id <athlete id>
```

`--user-id` / `--email` also select the BikeLab user; `--limit N`, `--force`, `--no-cache`. Downloaded FIT files are
kept in `server/scripts/.garmin-probe/fit/` (git-ignored), so a `--force` after a calc change costs no Garmin calls.
Re-running is the incremental sync: only new rides are fetched.

The same run then syncs health (`personalSync.syncPersonalHealth`): daily summaries, sleep and HRV for the last
`--health-days` (default 30) in four-week chunks, three requests a chunk, mapped by `personalHealth.js`. The window is
always re-fetched — the most recent days are still changing. Each of the three requests fails on its own: an account
without sleep or HRV tracking loses those columns, not the day. The run prints the latest seven days as stored, to be
compared with Garmin Connect. `--only rides` / `--only health` runs one half.

No route and no scheduled job may use the personal key.

### Developer Program (later)

OAuth per rider → `garmin_connections` with `transport: 'oauth'` (token columns arrive with that migration) → Garmin
pushes an activity notification → the server downloads the activity file → the same `ingestActivityFile`. Starter has no
backfill, so a rider's history starts on the day they connect; the personal key cannot be used to backfill other people.
A 30-day raw table (like `activity_streams`) can be added then if a reader turns out to need per-second data.

## 6. Status endpoint and the app

`POST /api/garmin/connect/sync` (session auth) fetches the rider's latest health days — see §7a.

`GET /api/garmin/connect/status` (session auth) →
`{ connected, available, transport, connected_at, last_sync_at, activities, last_activity_at, health_days,
last_health_day, health_latest }` — `health_latest` is the newest health day's headline figures (sleep hours and score,
overnight HRV, resting HR, Body Battery range, average stress).
`available` says whether a rider can link Garmin from the app; it is `false` until the OAuth flow exists
(`services/garminConnect/connection.js`).

App: Profile → Integrations → **Garmin** opens the existing screen, now in two halves — `GarminConnectCard` on top
(connected: rides synced, latest ride, health days, last sync, then the newest health day's figures — only the ones
the watch measured; not connected: the connect button, disabled, with a "not open yet" note), and the Edge pairing
below, unchanged.

## 7. Needs the owner

1. **Developer Program application** — on which legal entity; Starter is for businesses.
2. **Commercial use** — income from the API needs Garmin's written permission; decide before paid plans touch Garmin data.
3. **AI consent screen and Garmin attribution** — required before any rider's Garmin data reaches the coach.

## 7a. Health in the coach (built)

**What the coach gets.** `coachHealth.getCoachHealth` reads `garmin_health_days` (never Garmin itself) and returns
`{ days, as_of, stale, can_refresh }`. `analyze_readiness` adds it to its result as `garmin`:

| Rider has | `source` | `garmin.days` carries |
|---|---|---|
| Apple Health (+ Garmin) | `apple_health` | Body Battery, stress only |
| Oura (+ Garmin) | `oura` | Body Battery, stress only |
| Garmin alone | `garmin` | Body Battery, stress, sleep, HRV + status, resting HR |

Two sets of sleep numbers for one night would leave the model to pick, so next to another source Garmin's are withheld
(`coachHealth.supplement`). The feasibility tool's one-line recovery note gets the same addition
("… Garmin: Body Battery 35–91, stress 22."). The prompt's Health section explains how to read the two figures, and that
old figures are flagged in one clause and never with refresh instructions.

**The chip.** `stale` = last fetched from Garmin over 3 h ago (or never). When `analyze_readiness` ran this turn and
`garmin.stale && garmin.can_refresh`, `routes/coach.js` puts `{ label: 'Get Garmin health data', action:
'refresh_garmin_health' }` first in the suggestions — decided from the tool result, not by the model; not for
`client: 'web'`. The chip also comes when the rider asks for a refresh outright ("обнови данные Garmin", "sync my
Garmin"), whatever the age of the data: from the message itself (`coachIntents.isGarminRefreshIntent`), or from the
`suggest_refresh_garmin_health` tool the model calls for phrasings the pattern misses. The tool is offered — and the
prompt mentions a button at all — only for a rider whose data the server can fetch (`coachHealth.getCoachAccess`), so the
coach cannot point at a button that will not appear; and not within two minutes of a fetch, so the app's own "Garmin
data updated" follow-up does not bring it straight back. In the app the chip calls `POST /api/garmin/connect/sync`, then sends a readiness-shaped message
(`coach.garminRefreshedPrompt`, pinned as readiness intent in `server/test/coachIntents.test.js`), so the coach answers
again on fresh rows and the chip does not come back.

**The endpoint.** `POST /api/garmin/connect/sync` → `refresh.refreshHealth`: the last 3 days of health, three Garmin
requests; at most once a minute per rider. It is the one request handler that uses the Personal API key, and it only
serves its owner: the rider's connection must be `transport: 'personal'`, and if the payloads name a different Garmin
account than the connection, nothing is stored (409 `GARMIN_ACCOUNT_MISMATCH`). Other answers: 409
`GARMIN_NOT_CONNECTED`, 503 `GARMIN_REFRESH_UNAVAILABLE` (no key on the server, or an OAuth connection), 429 Garmin's
rate limit, 502 Garmin not answering (an expired key lands here). The Garmin card's **Refresh health data** button calls
the same endpoint.

**Card.** The Recovery card gets two more rows, Body Battery and Stress, under whichever source fills it; for a
Garmin-only rider it is filled from Garmin's sleep / HRV / resting HR, without a score.

**AI consent guard.** `coachHealth.COACH_TRANSPORTS` is `['personal']`: a Developer Program connection is stored but not
read by the coach until the AI consent screen exists (§7.3). Add `'oauth'` there together with that screen.

Fixed on the way: the feasibility note never showed Oura's HRV and resting HR (`todayRecovery` read `average_hrv` /
`resting_heart_rate`, the helper returns `average_hrv_ms` / `resting_heart_rate_bpm`).

## 8. Not done, on purpose

- Nothing reads `garmin_activities` yet — analytics, the ride screen and the coach still run on Strava (step 6).
- No dedup between a Garmin ride and the same ride in Strava (step 6; match on `start_date` and duration).
- No disconnect route or button; no scheduled sync — the personal-key sync is a script run by hand.
- Rides are not refreshed from the app — the chip and the Refresh button fetch health only; rides stay with the script.
- A Garmin-only rider's Recovery card says "Not enough data yet" where the score would be (Garmin has no readiness
  score on this account); no such rider exists yet.
- The web client gets Garmin in the coach's answers but no refresh chip.
- Weight (the account has no recent weigh-ins to check the mapping against).
