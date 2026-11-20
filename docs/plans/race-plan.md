# Race plan from a route file — Implementation Plan

**Date:** 2026-11-12 · **Scope:** the rider attaches the route of a race (GPX or FIT) to a coach message; the coach
plans it — watts for every climb, flat and descent, predicted time, where the anaerobic reserve stands, when to eat
and drink — puts the plan in the calendar, and the rider starts it on the Garmin Edge, where it runs by distance.

## 0. Decisions (owner, 2026-11-12)

| Topic | Decision |
|---|---|
| Scope | The full chain at once: file → plan → calendar → Edge, not a chat-only first version. |
| Blocks on the Edge | End on **distance**, not time: a plan by time drifts off the road at the first group or traffic light. |
| Who computes | The server (`@bikelab/shared` calc). The coach explains and re-plans (bunch / solo, steadier, hotter). |
| Navigation | Not part of the workout: the rider loads the same GPX as a course on the Edge; the two run together. |

## Status

| Step | State |
|---|---|
| 1 Course from a file | ✅ `packages/shared/src/calc/course.ts` (`parseGpx`, `buildCourse`), FIT read in `server/services/racePlans.js` |
| 2 The plan | ✅ `calc/racePlan.ts` (`racePlan`, `raceIntensity`, `speedForPower`), 100 % covered |
| 3 Distance blocks | ✅ `WorkoutStep.distance_m`, `calendar/workoutExport.ts`, `services/garminWorkoutFit.js` (`durationType: 'distance'`) |
| 4 Server | ✅ migration `1758000000022_race-courses.sql`, `repositories/raceCourses.js`, `services/racePlans.js`, `POST /api/race-courses`, coach tools `plan_race` and `create_calendar_event.race_course_id`, prompt "Race plans" |
| 5 App | ✅ paperclip → ride / route file, upload, route pill, `RacePlanCard` in the chat, distance in the calendar's block detail |
| 6 On a device, with the real model, on a real course | ⏳ owner — nothing below was seen on a phone, an Edge or a real GPX yet |

## 1. The course (`calc/course.ts`)

`parseGpx` reads `trkpt` (or `rtept`) with their `ele` and the track's name; a FIT course or activity gives the same
points from its `record` messages (position, altitude, distance). `buildCourse`:

1. distance along the points (the file's own when every point has one, else haversine); refused under 1 km
   (`too_short`) or when fewer than half the points have an altitude (`no_elevation`);
2. altitude resampled every 25 m, gaps filled from neighbours, smoothed over ±100 m;
3. each sample is climb / flat / descent by the grade over 200 m around it (±3 %); runs under 400 m join the one
   before; more than 18 runs → the shortest joins the neighbour with the closest grade, until 18;
4. segments cover the course end to end (unlike the ride breakdown's "12 longest"): start, length, net grade, gain;
5. a 120-point profile for drawing.

## 2. The plan (`calc/racePlan.ts`)

- **Race level** by length (share of FTP as NP): 1 h 0.92 · 2 h 0.85 · 3 h 0.80 · 4 h 0.76 · 5 h+ 0.72; "steady" −0.07.
- **Level** (owner, 2026-11-13: a 3:33 plan came out at IF 0.87 — on a hilly course the climbs are most of the
  clock, so shares alone asked for threshold work for three hours — and "make it 3:50" could not be planned at all).
  The tables below give the SHAPE; one scale factor on every climb and flat gives the level, solved by bisection:
  without a target the plan's NP equals the race level of its own length; with `target_time_min` the plan takes
  exactly that long. Shares stay within 35–120 % of FTP. A target faster than a race effort allows → the fastest
  plan, `target_reachable: false`; slower than the gentlest plan → the gentlest, also `false`.
- **Level, revised the same day on the real Lefkara file** (73.8 km, 1960 m; FTP 183, 70 kg → race plan 3:55 at
  IF 0.76): the race level is what most riders hold, not a wall. A faster target is planned up to +0.08 IF over
  it and reported in `summary.over_race_level` (3:45 → IF 0.81, +0.04); only past the ceiling is it out of reach
  (the plan is then the one at the ceiling). `climbShare` is a straight line between its knots — steps made the
  plan's time jump, and bisection could not land on 4:00.
- **Splits** (`splits: [{km, minutes_from_start}]`, owner: "first part faster for more margin, the rest slower"): the
  segments are cut at the asked points (within 200 m of an edge → the edge) and each stretch is solved for its own
  time, counted from when the plan actually gets to its start; the stretch after the last split is solved for
  `target_time_min`, or left at the race plan's level. No stretch is asked for more than the ceiling over the race
  level of its own length — such a split is missed and reported (`summary.splits[].ok`). On Lefkara: 36 km in 1:55
  and a 3:45 finish → both met, first part ~98 % on the climbs, the rest ~81–87 %.
- **Per segment:** climb = min(by its own length: ≤3′ 1.15 · ≤8′ 1.08 · ≤20′ 1.00 · ≤40′ 0.95 · longer 0.90; race
  level + 0.25); flat = race level − 0.03 (− 0.15 in a bunch); descent 0.45 (0.30 steeper than −5 %). Range ±5 %,
  rounded to 5 W.
- **Speed** from the power equation (gravity, Crr 0.005, CdA 0.36 — ×0.72 on flats and descents in a bunch — air
  1.2 kg/m³, drivetrain 0.975), capped at 60 km/h. The race's length and the segment shares are settled by iteration.
- **W′:** FTP as CP, W′ from the rider's critical-power fit (else 15 kJ, clamped 8–30 kJ). Above FTP it drains, below
  it recovers (Skiba, τ = 546·e^(−0.01·(CP−P)) + 316). A climb that would take it under 15 % is **eased** to what the
  reserve allows.
- **Fuel:** carbs/h 30 (< 75 min) · 60 (< 2.5 h) · 80, or the rider's number (≤ 120); fluid/h 600, or by temperature
  500 / 650 (≥ 20 °C) / 800 (≥ 28 °C). A feed every 20 min, none in the last 15. A feed that falls on a steep (≥ 4 %)
  climb shorter than 20 min moves to 3 min before it, or to its top; on a longer climb it stays.
- **Blocks:** one per segment, cut where a feed falls inside it (a feed within 300 m of an edge is said at the edge).
  Each has `distance_m`, the estimated `duration_s`, the watts range (none on descents), and a cue in the rider's
  language: "Eat 27 g carbs and drink. Climb 6.1 km at 5.3%. hold 165-185 W".

Summary: time, average speed, NP, IF, TSS, carbs and fluid.

## 3. Server

- `race_courses` — one row per uploaded route: `course` (JSONB), the latest `plan` and its `plan_options`. The file is
  not kept.
  Retention (owner, 2026-11-13): about 20 KB a row; a rider keeps their newest 5 (pruned on upload), and a course
  not uploaded or re-planned for 60 days is deleted by the daily cleanup. A race already in the calendar keeps its
  own copy of the blocks.
- `POST /api/race-courses` (multipart `file`, ≤ 10 MB) → `{course_id, name, distance_km, elevation_gain_m, climbs}`;
  400 `COURSE_UNREADABLE` / `COURSE_TOO_LARGE` / `COURSE_TOO_SHORT` / `COURSE_NO_ELEVATION`.
- `plan_race({course_id, drafting, effort, carbs_g_per_h, temp_c, lang})` — FTP and W′ from the power profile, weight
  from the profile; stores the plan; answers summary, segments, fueling and the profile (no blocks). Errors the model
  can act on: `not_found`, `no_rider_numbers`, `no_plan`.
- `create_calendar_event({…, race_course_id})` — the event's `workout` is the stored plan's blocks.
- **A race in the calendar always has its blocks** (owner, 2026-11-13: the coach filed the race as a plain `event`
  with no blocks). `update_calendar_event({event_id, race_course_id})` attaches the plan to an event that is already
  there; `create_calendar_event` without a course id matches the title against the rider's planned courses
  (`racePlans.matchPlannedCourse`: two shared words, or the course's only one); the prompt has the coach look for the
  race in the calendar first and update it. A race keeps type `event`; the Edge's week now lists `planned_ride`s
  **and** events that carry blocks (`garminWorkouts.isSession`).
- **The route is remembered** (owner, 2026-11-13: the coach asked for the file again on every re-plan — the
  "[Route N]" line rode only on the message the file was attached to). The system prompt now carries "Rider's
  routes": the rider's five latest courses with their course_id, size and whether they are planned
  (`racePlans.routesPromptSection`), and the rule never to ask for a listed file again.
- **Cut-offs:** `plan_race({…, cutoffs: [{km, minutes_from_start}]})` → `cutoffs: [{km, limit_min, eta_min,
  margin_min, ok}]` (`racePlans.checkCutoffs`) — when the plan reaches each limit and the room left; the coach turns
  clock times into minutes from the start and warns under 10 minutes of margin.
- The Edge downloads the session as before (`/api/garmin/sessions/:id/fit`); distance blocks are written as
  `durationType: distance` (centimetres).

## 4. App

- Chat: paperclip → "A ride from your list" / "Route files (GPX, FIT)" → system file picker
  (`@react-native-documents/picker`, **a new native dependency: `npm install` + `pod install`**) → upload → a pill
  "Lefkara Classic · 92 km · 1480 m" → sent with the next message as hidden context
  (`serializeAttachedRoutes`, "[Route N] …").
- Several files at once — the stages of a race: the picker allows a multiple selection, the files are read one after
  another (`useRouteAttachments`), each gets its own pill, up to `MAX_ATTACHED_ROUTES` (5) a message. The coach is
  told they are stages in the order attached, plans each with its own `plan_race` call, and the reply carries a
  `RacePlanCard` per course (`mapRacePlans`). A file that cannot be read is named in one alert at the end and does not
  stop the others.
- `RacePlanCard`: predicted time, distance · gain · speed · bunch/solo, the profile with climbs shaded and feeds
  marked, NP / IF / TSS, the longest climbs, the flats' range, the fuel rule. The climbs are a numbered list in
  riding order — the watts to hold, about how long that takes in whole minutes ("≈ 20 min"), then km · length ·
  grade (and "eased") — and the same numbers stand on the profile over each listed climb (owner, 2026-11-20: a grid
  of two did not say which climb came first, and "20:17" beside a climb read as anything but its duration).
- Calendar: a distance block reads "6.1 km · ≈28 min".

## 5. Known limits

- Wind, road surface, corners and the bunch's own pace are not in the numbers; in a bunch the flats' watts are a
  ceiling, not a script.
- The Edge app's own session view (Connect IQ) still lists blocks by their estimated minutes — it was not changed.
- A plan can come to 30+ blocks; Garmin's limit on workout steps for the Edge 1040 was not checked on the device.
- Cues are English or Russian. Whether the Edge shows Cyrillic in step notes is known only from the coach's ordinary
  sessions.
- One feed rhythm (20 min) for everyone; no caffeine, sodium or bottle count.
- Web: no upload, no card.
