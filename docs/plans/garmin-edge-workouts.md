# Workouts on the Edge — Implementation Plan

**Date:** 2026-11-10 · **Scope:** three things on the bike computer, all built on the blocks the coach already writes
(`docs/plans/workout-blocks.md`) and the paired Edge app (`docs/plans/garmin-connect-iq.md`):

- **A. The week** — the BikeLab app on the Edge lists the sessions of the next seven days with their block profile.
- **B. Send a session to the Edge** — the rider starts a planned session as a native Garmin workout: targets, step
  timer and alerts are the Edge's own.
- **C. Ride screen** — the rider assembles a data screen in the BikeLab phone app; a BikeLab data field draws it during
  the ride.

A and B are built and run on the owner's Edge 1040 against production (2026-11-10): the week shows, Start puts the
session under Training → Workouts and the Edge's Ride button starts it. C is a second Connect IQ app and is
postponed — owner, 2026-11-10: the data fields are not critical, the week and starting a session are what matters.

## 0. Decisions

Owner, 2026-11-10: build A and B now through the Edge app; page order on the Edge — garage, week, last ride's impact
on the goals, the goals (first the week led; changed the same day after seeing it on the device). The rest of the table is as proposed and not objected to.

| Topic | Proposal | Why |
|---|---|---|
| How a session reaches the Edge now | **The Edge pulls it**: BikeLab on the Edge → Week → session → Start. The app downloads a FIT workout from our server and hands it to the Edge's workout player. | Works today with the app already sideloaded and paired; no Garmin programme, no OAuth. |
| Garmin's Training API | **Later**, together with the Developer Program application (`garmin-connect-api.md` step 7). Then sessions also appear in the Garmin Connect calendar and sync to any Garmin device without our app. | Needs approval of a business / organisation and a per-rider Garmin login. |
| "Week" | Seven days starting today (the Edge's local date), first page of the app. | A session is the reason to open the app before a ride. |
| Where the ride screen is assembled | In the **phone app**; the Edge only draws it. | The Edge has no place for a builder, and Garmin's own settings UI works for store apps only. |
| What draws it | **One BikeLab data field** used full-screen, split into cells inside. | A data field is the only Connect IQ app type that runs on the native ride screen. One field instead of several keeps one pairing and one fetch. |
| Cadence target | In the step's note text ("85–95 rpm · cue"), not as a second target. | Whether the Edge honours a second target per step is not checked; the note is plain text. Revisit after the spike. |

## Status

| Step | State |
|---|---|
| 0 Spike | done as the owner's first Start on the real Edge (step 3) |
| 1 Shared export + server | ✅ `packages/shared/src/calendar/workoutExport.ts` (`toDeviceSteps`, 100 % covered), contract `garmin.week` / `garmin.session`, `server/services/garminWorkouts.js`, `garminWorkoutFit.js`, routes `/api/garmin/week`, `/sessions/:id`, `/sessions/:id/fit`, `repositories/calendar.getEvent`; unit + integration tests |
| 2 Edge app: Week page, session view | ✅ `HomeView.mc` page 0, `SessionView.mc`, `Workouts.mc`, strings en/ru — release build compiled and sideloaded by the owner, works on the Edge 1040 |
| 3 Edge app: Start | ✅ download, hand-over, cleanup of old downloads; manifest permission `PersistedContent`. On the Edge 1040 (owner, 2026-11-10): the session lands in Training → Workouts and starts with the Ride button. Still to look at on a ride: how the targets and the step notes read, a start without the phone, the cleanup after the week changes |
| 4 Phone app: hint in the event sheet | ⏳ not asked for yet |
| 5 Data field | ⏸ postponed by the owner |
| 6 Training API | ⏳ with the Developer Program |

As built, where it differs from the sections below: the routes are `/api/garmin/sessions/:id` (not `/workouts`); the
server files are `services/garminWorkouts.js` and `services/garminWorkoutFit.js`; steps carry no `wkt_step_name` — the
Edge labels a step from its intensity, in the rider's own device language; the workout is named "DD.MM headline" so
two sessions with the same headline stay apart; text sent to the device has typographic marks replaced (′ – …). The
file is answered as `application/octet-stream`, which the phone's Garmin Connect app (iOS) passes on to the Edge.

## 1. What Garmin allows (checked 2026-11-10)

| Fact | Source |
|---|---|
| A Connect IQ app can download a `.FIT` file with `Communications.makeWebRequest` and read it back through `PersistedContent`; each item launches through a `System.Intent`. | API docs, `Toybox.PersistedContent` |
| `PersistedContent` (workouts, `getAppWorkouts`, `Workout.toIntent`, `Workout.remove`) lists **Edge 1040 and Edge 1050** as supported; app types: watch app, widget, data field, glance. Permission `PersistedContent`. | API docs |
| A FIT workout file is `file_id` (type workout) + `workout` (`num_valid_steps`) + `workout_step`s. Watts are stored +1000 (325 W → 1325), bpm +100; a repeat is a step after its block (`repeat_until_steps_cmplt`, first step's index, count); `notes` is the text shown to the rider. | FIT SDK, workout file type |
| A data field cannot make a web request itself; its **background service** can, on a temporal event — immediately if none ran in the last 5 minutes, otherwise no more often than every 5 minutes. | Garmin developer forum |
| `Activity.getCurrentWorkoutStep()` / `getNextWorkoutStep()` (API 3.2) give the running workout's step: name, notes, intensity, duration, target. The docs say they throw in a data field; developers report they work there and call the doc a typo. **Check in the spike.** | API docs, forum bug report |
| Settings of a **sideloaded** app cannot be edited from the phone (only by copying a `.SET` file). Store apps, beta included, can. | Garmin developer forum |
| The Training API (workouts → Garmin Connect calendar → device) is in the **Starter** and Enterprise tiers, not in the Personal key. Starter is free, about 1,000 users, for businesses and organisations. | DC Rainmaker, Sahha, Garmin's Training API page |

Not confirmed, to measure in the simulator before relying on it: data-field and background memory on the Edge 1040, the
size limit of data passed from the background service, the longest `notes` the Edge shows, the response `Content-Type`
the FIT download expects, how many Connect IQ fields an Edge 1040 profile takes (older Edges: 10; we need one).

## 2. A — the week on the Edge

**Server** (`routes/garmin.js` → `services/garmin.js`, device token, contract `garmin.week` / `garmin.session`):

- `GET /api/garmin/week?from=YYYY-MM-DD` — planned rides of seven days from the Edge's local date. Short keys, as
  `home`: per day `d`, per session `id`, `t` (title, 40 chars), `min`, `done`, `u` (updated-at, to know when a
  downloaded copy is stale) and `b` — the blocks as `[seconds, zone, effort 0/1]`, enough to draw the profile. Days
  without a session are omitted. A session without blocks comes with `b` empty and cannot be started.
- `GET /api/garmin/sessions/:id` — one session in full for the detail view: per block name ("Effort 2 of 3"), minutes,
  target, cadence, cue (trimmed for device RAM). Fetched when the rider opens it, not with the week.

**Edge app** (`packages/garmin-ciq`): `WeekView` becomes page 0 — day, title, duration and the mini profile with the
phone's colour rule (grey frame, zone colour on the efforts); a done session is greyed. Select opens `SessionView`: the
profile across the screen, the blocks as a scrolling list, **Start** in the menu. The week is cached in
`Application.Storage` like `home`, so it opens without the phone.

## 3. B — start a session as a Garmin workout

**Shared** (`packages/shared/src/calendar/workoutExport.ts`, pure, 100 % covered): `toDeviceSteps(workout)` turns the
stored flat list back into steps and repeats (`rep` / `reps` say which blocks form a set; a set whose repetitions
differ stays flat). One function for the FIT file now and the Training API or a `.zwo` later.

**Server** (`services/garmin/workoutFit.js`, `@garmin/fitsdk` Encoder — already a dependency):

| Block | FIT step |
|---|---|
| `duration_s` | `duration_type` time, value in ms |
| `kind` warmup / work, steady / recovery / cooldown | `intensity` warmup / active / recovery / cooldown |
| `target` watts | `target_type` power, custom low / high = watts + 1000 |
| `target` bpm | `target_type` heart rate, custom low / high = bpm + 100 |
| no target | `target_type` open |
| name, `cadence`, `cue` | `wkt_step_name`; `notes` = cadence · cue |

`GET /api/garmin/sessions/:id/fit` (device token, `uncontracted` — binary). Tests: encode → decode with the SDK and
compare with the blocks; 3×8′ comes out as warm-up, one repeat of two steps, cool-down.

**Edge app:** Start → download → `System.exitTo(workout.toIntent())`, which hands the workout to the Edge's own player
(what exactly the Edge shows at that point is what step 0 finds out). The file also stays under Training → Workouts. The app remembers which session and version it downloaded, does
not download an unchanged one twice, and removes its own workouts older than a week (`getAppWorkouts`, `remove`).
Manifest: add the `PersistedContent` permission.

**Phone app:** in the event sheet, under the blocks, one line for a rider with a paired Edge: "On your Edge: BikeLab →
Week → Start". No button — the phone does not push.

**Later, Training API (step 6):** on create / update / delete of a session with blocks the server publishes it to the
rider's Garmin Connect calendar; a table maps the event to Garmin's workout and schedule ids so a changed session
replaces the old one. Same `toDeviceSteps`. Depends on the Developer Program: the application, the rider's Garmin login,
the consent screen.

## 4. C — the ride screen

**The field** (`packages/garmin-ciq-field`, a second Connect IQ app, type data field, Edge 1040 / 1050): the rider adds
a data screen with one field on the Edge and picks BikeLab. The field splits its area into the cells of the saved
layout and draws them once a second.

**Cells, first set:**

| Group | Cells | From |
|---|---|---|
| Ride | power 3 s, lap power, heart rate, cadence, speed, time, distance, ascent | `Activity.Info` |
| Load | NP, IF, TSS | computed in the field; FTP from our payload |
| Workout | current block (name, target, time left), next block, cue, profile strip with a "you are here" marker, on-target bar | the running Garmin workout (`getCurrentWorkoutStep`) + today's blocks from our payload |
| BikeLab | distance / climbing left to a goal, counting this ride; chain km | payload + `Activity.Info` |

The Workout and BikeLab cells are the reason to have our own field: the block, the coach's line and the goal sit on
one screen next to the numbers the rider chose, instead of on the Edge's separate workout page.

**Builder** (phone app, Garmin screen → "Ride screen"): pick a template (2, 3, 4 or 6 cells, with or without a wide top
cell), pick a cell per slot, see a preview in the Edge's proportions. Stored per rider: table `garmin_field_layouts`,
`GET` / `PUT /api/garmin/field/layout` (session token).

**Field ↔ server:** `GET /api/garmin/field` (device token) → layout, FTP, today's blocks (`[seconds, zone, effort,
low, high]`), goal remainders. Fetched by the field's background service when the field loads and the cache is older
than a few hours; nothing is fetched during the ride.

**Pairing:** the two Connect IQ apps cannot share storage, so the field pairs on its own with the existing code flow:
it shows the six-digit code in its area, the rider confirms it on the phone's Garmin screen as for the Edge app. The
field can only ask the server every 5 minutes, so it picks the confirmation up within that time; attempts from a field
live 30 minutes instead of 10. Once the field is a store app, a "pairing code" setting is the faster way.

## 5. Order

| Step | What | Check |
|---|---|---|
| 0 | Spike: a FIT workout written by hand, served locally, downloaded and started from the Edge app | simulator, then the real Edge: it starts, targets and notes read right |
| 1 | `toDeviceSteps`, FIT encoder, the three endpoints, contract | shared + server tests, integration on Postgres |
| 2 | Edge app: Week, session view | sideload |
| 3 | Edge app: Start, cleanup of old workouts | a real session ridden from the Edge |
| 4 | Phone: the hint line | simulator |
| 5a | Field spike: memory, background fetch, current step | simulator numbers written into §1 |
| 5b | Field pairing, layout endpoints, builder, Ride cells | sideload |
| 5c | Workout and BikeLab cells | a real session ridden with the field |
| 6 | Training API | with the Developer Program |

Steps 0–4 are one piece of work and close the gap with apps that already send workouts to devices. Step 5 stands on
its own and can wait for the store release, which it needs anyway to reach other riders.

## 6. Not in this plan

- Comparing the ride done with the blocks planned (`workout-blocks.md` §5).
- Devices other than Edge 1040 / 1050, and watches.
- Export of a session as a `.fit` / `.zwo` file from the phone — small once `toDeviceSteps` exists, for riders without
  our Edge app.
- The Connect IQ Store listing itself.

## Sources

- Toybox.PersistedContent — https://developer.garmin.com/connect-iq/api-docs/Toybox/PersistedContent.html
- PersistedContent.Workout — https://developer.garmin.com/connect-iq/api-docs/Toybox/PersistedContent/Workout.html
- Activity.WorkoutStepInfo — https://developer.garmin.com/connect-iq/api-docs/Toybox/Activity/WorkoutStepInfo.html
- FIT workout file type — https://developer.garmin.com/fit/articles/file-types/workout.html
- Web request from a data field — https://forums.garmin.com/developer/connect-iq/f/discussion/323518/how-can-i-run-a-webrequest-on-demand-now-from-a-datafield
- Workout step in a data field (doc bug) — https://forums.garmin.com/developer/connect-iq/i/bug-reports/api-doc-for-getcurrentworkoutstep-and-getnextworkoutstep-confusingly-says-exception-thrown-if-called-from-a-data-field-app
- Settings of a sideloaded app — https://forums.garmin.com/developer/connect-iq/f/discussion/429848/solved-settings-connect-iq-app-for-sideloaded-app---is-this-possible/2005057
- Fields per Edge profile — https://forums.garmin.com/developer/connect-iq/f/discussion/223481/where-can-i-find-out-how-many-ciq-datafields-each-device-can-have-per-activity
- Garmin Training API — https://developer.garmin.com/gc-developer-program/training-api
- Developer Program tiers — https://www.dcrainmaker.com/2026/10/garmin-connect-api-revamps-connect-developer.html , https://sahha.ai/blog/garmin-connect-api-reopened-fees/
