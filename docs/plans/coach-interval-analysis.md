# Interval sessions: work blocks for the coach and the ride screen

**Date:** 2026-11-11 · **Why:** on "Intervals 170-190W" (three even efforts, visible on the power chart) the coach
said the target was "mostly missed" and the execution "cannot be determined from the summary", showed a FADED −13 %
pill and leaked its working ("Wait 170-190 corresponds Z4-ish"). The breakdown had no notion of an effort: only
whole-ride NP/VI, best 5 s…1 h and terrain segments — on a flat interval ride, nothing to read.

## What was wrong → what changed

| Problem | Change |
|---|---|
| No work blocks in the breakdown | `packages/shared/src/calc/rideIntervals.ts` — blocks from per-second power, the repeated set, rests |
| Half-vs-half fade on a ride whose second half is the cool-down | `fade` is null when a set exists; the set carries `fade_pct` (last effort vs first) |
| Nothing to compare with | target = the session planned for that day (`calendar_events.workout`), else the watts in the ride's name (and its "3x8′", as the planned shape) |
| First reply used the summary only | `get_activity_analysis` carries `power {np_w, intensity_factor, tss, structure, intervals_reading}` for power-meter rides |
| The model derived verdicts itself (and leaked the working) | `intervals.reading` — the verdict as plain statements (`intervalFacts`); prompt: judge an interval session by its blocks only; reply = finished answer, never the working |
| Ride screen showed no blocks | "Intervals" card in Power analysis; the same data on the coach's ride-power card |

## The detector (`rideIntervals`)

1. 1 Hz power on elapsed time (a stop = 0 W), smoothed with a 15 s centred mean.
2. Work threshold: with a target — 90 % of its lower bound; otherwise Otsu's two-level split of the smoothed power.
   Work must sit ≥ 30 W and ≥ 25 % above rest, else the ride has no blocks (`intervals: null`). When the work itself
   has two clear levels (tempo warm-up running into the efforts) the upper one is the work. A target nobody got near
   falls back to the ride's own split, so the answer is "3 × 8′ at 140 W against 170–190", not "no intervals".
3. Runs of work — an effort starts at the threshold and lasts until the power falls clearly back towards rest
   (halfway between the threshold and the average of everything under it; without this an effort ridden just above
   the threshold breaks into pieces): dips ≤ 20 s bridged, edges snapped to the raw power, runs < 30 s dropped, 20 longest kept.
4. Per block: start, length, avg/max W, avg/max HR, cadence, `cv_pct` (steadiness of 30 s power), `pct_ftp`,
   `in_target_pct` (share of the block's 30 s power inside the range), `vs_target`, the rest after it.
5. Set: the largest group of blocks within 25 % of each other in length and 15 % in watts (≥ 2 blocks) —
   long efforts (≥ 3 min) whose rests exceed twice their length are not a set unless the ride names a target —
   two climbs half an hour apart are efforts;
   reps, typical length and rest, average, first/last, `fade_pct`, `spread_pct`, `hits` (efforts averaging in range).

`structure` (server, `services/rideAnalysis.js`): `intervals` (a set) · `efforts` (blocks, no set — climbs, surges) ·
`steady` (no blocks).

## Server

- `repositories/ridePlan.js` — ride name + local date; planned sessions of that date that have blocks.
- `services/rideAnalysis.js` — `targetFor` (plan → name → null, never throws); cache `ride_power` v5, keyed on FTP
  **and** target; `forCoach` (drops altitude profiles, adds `structure` and `intervals.reading`);
  `getRidePowerHeadline` for `get_activity_analysis`.
- `aiCoach.js` — tool description, "Interval and structured rides" rules, response-format rules (no working in the
  reply; verdict → numbers → meaning → next step). `routes/coach.js` — chip "How did the intervals go?" when the ride
  is an interval session and the breakdown has not run yet.

## App

- `RideAnalytics/IntervalsCard.tsx` — after the tiles, before "Recent ride": headline "3 × 8:00", pill "3/3 in
  target" (green all / red none) or last-vs-first when there is no target, one bar per block (width = length, height
  = watts, power purple; stray efforts grey), the target as a green band behind the bars, legend "Avg · last vs first
  · rest". Query key `powerBreakdown` v7.
- `components/coach/RidePowerCard.tsx` — "Intervals" section above the best efforts.

## Not done

- The cards draw only the set when there is one; stray efforts stay in the tool result for the coach.
- Block-by-block alignment with the plan (each planned step ↔ the block that rode it) — today the plan gives the
  range, the planned reps and length; the comparison is "planned 3 × 8:00, ridden 3 × 8:00".
- HR-target sessions (bpm blocks) and rides without a power meter: no blocks.
- Efforts shorter than 30 s (sprints, 20/10) are not listed as blocks.
- Web.
- Not yet seen on a device or tried with the real model on the real ride — tests cover the calc, the service, the
  tool payload and the cards.
