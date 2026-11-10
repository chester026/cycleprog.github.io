# Workout blocks on the calendar — Implementation Plan

**Date:** 2026-11-10 · **Scope:** a training session the coach schedules carries its structure — warm-up, each effort
and recovery, cool-down — as blocks. The calendar draws the session's profile; in the event sheet the rider taps a block
and reads what to do in it. Additive: one column, one shared module, two coach tool parameters, three app components.

## 0. Owner decisions (2026-11-10)

| Topic | Decision |
|---|---|
| What | Every workout has a block profile: "3×8′, 4′ recovery" is warm-up, 8 / 4 / 8 / 4 / 8 / 4, cool-down. |
| Calendar | The day's row shows the blocks. |
| Event sheet | Blocks at the top; tapping one shows the details for that block — what to do and how. |
| Who writes them | The coach, when it creates the plan and puts the sessions in the calendar. |

## Status

| Step | State |
|---|---|
| 1 Model + builder | ✅ `packages/shared/src/types/calendar.ts` (`Workout`, `WorkoutStep`), `src/calendar/workout.ts` (`buildWorkout`), 100 % covered |
| 2 Storage | ✅ migration `1758000000021_calendar-event-workout.sql` — `calendar_events.workout` JSONB, NULL for events without blocks |
| 3 Coach | ✅ `workout_steps` on `create_calendar_event` / `update_calendar_event`, "Workout blocks" rules in the prompt, `get_calendar` flags sessions that have blocks |
| 4 App | ✅ `Calendar/WorkoutProfile.tsx`, `WorkoutBlocks.tsx`, `workoutLib.ts`; profile on the day row, tappable section in the event sheet; i18n en/ru; zone palette `colors.workoutZones` |
| 5 Seen on a device, tried with the real model | ⏳ owner — tests cover the code, not how the model fills the blocks or how the screen looks |
| 6 Later | ⏳ see §5 |

## 1. The model

The industry's shape for a structured workout: an ordered list of steps, each with a duration and an intensity target,
with repeats; drawn as bars — width = time, height and colour = intensity. That is what is stored.

```
Workout   { version: 1, duration_s, steps: WorkoutStep[] }
WorkoutStep {
  kind        warmup | work | recovery | cooldown | steady
  duration_s
  zone        1–7   power zone (Coggan) for a watts target, HR zone (1–5) for bpm — height and colour of the block
  target      { unit: 'w' | 'bpm', low, high } | null
  cadence     { low, high } | null      rpm
  cue         the coach's line for this block | null
  rep, reps   place in a set ("2 of 3") | null
}
```

The stored list is **flat**: a set is expanded, and each block knows its repetition. A client draws and labels it
without expanding anything, and the same list can later be turned into a device workout (§5).

## 2. From the coach to the row

The model passes `workout_steps`: items are either a block
`{kind, minutes, zone, watts_low, watts_high, bpm_low, bpm_high, cadence_low, cadence_high, cue}` or a set
`{repeat: 3, steps: [work, recovery]}`. `buildWorkout` treats it as untrusted:

- kept and repaired: missing zone → the kind's usual one, swapped range → put right, one bound → the target on its own,
  unknown kind → `steady`, zone clamped to 1–7, cue trimmed to 240 characters;
- refused with a message the model can act on: no or non-positive `minutes`, a block under 5 s, an empty set, a set
  inside a set, repeat over 30, more than 60 blocks, more than 12 h in total. The event is **not** created or changed —
  the executor returns `{error}` and the model resends.

With blocks, the event's duration is their sum (the stored `start_time`/`end_time` pair), whatever
`duration_minutes` said. `update_calendar_event` with a non-empty list replaces the blocks, with an empty list removes
them, without the parameter leaves them alone. The rider editing the event in the app (`PUT /api/calendar/:id`) never
touches them.

Tool results carry `workout_summary: {minutes, blocks}` instead of the blocks: a 12-session plan echoed back block by
block would be thousands of tokens in every later turn.

The prompt ("Workout blocks", under "Workouts and plans") makes the blocks the third part of a session next to the
headline and the brief, required for every training `planned_ride`: warm-up first and cool-down last, repeats as one
set, an unstructured ride as warm-up / steady / cool-down, the same numbers as the headline, a cue per block in the
rider's language, blocks adding up to the headline's total.

## 3. In the app

- **Day row** (`DayList`): a session with blocks leads with its profile, 44 pt high across the card, the title under
  it, without the event type's colour bar; not interactive; greyed for a completed session.
- **Event sheet** (`EventDetailSheet` → `WorkoutBlocks`): under the title, the profile 76 pt high. Nothing selected: "8
  blocks · 1 h 1 min" and a hint. Tap a block: its name and place in the set ("Effort 2 of 3"), "Block 4 of 8",
  duration · target · zone, when it starts ("from 27:00") · cadence, and the cue. The selected block stays solid, the
  rest fade; tapping it again returns to the summary.
- Colours (owner, 10.11.2026 — at full saturation, and then with every block coloured, a week of sessions made the
  calendar too colourful):
  - colour is kept for the work — `work` and `steady` blocks carry their zone's colour, `colors.workoutZones`, Z1 → Z7:
    grey, blue, green, yellow, orange, red, purple, in softened tones; warm-up, recovery and cool-down are always the
    palette's grey, whatever zone they are ridden in (`workoutLib.blockColor`). Height still shows how hard each block
    is — 40 % of the profile for Z1, 100 % for Z7;
  - an effort block is slightly lighter towards its base (a 25 % white veil, `colors.workoutBlockFade`); grey blocks
    are flat;
  - corners 6 pt on the row, 8 pt in the sheet.

## 4. Not done, on purpose

- **Sessions already in the calendar** have no blocks and show as text, as before. The coach adds blocks when asked to
  update a session; there is no bulk conversion.
- **The rider cannot edit blocks by hand** — the edit form changes title, date, description as before.
- **The "Added to Calendar" card in the chat** does not draw the profile (the blocks are not in the tool result).
- **Web** ignores the new field.

## 5. Later

- Planned load per session (TSS / IF from the watts targets and the rider's FTP).
- Send the workout to the bike computer — planned in `docs/plans/garmin-edge-workouts.md`: the flat list maps onto Garmin's structured-workout steps (Training API,
  Developer Program — `docs/plans/garmin-connect-api.md` §7) and onto a `.fit` / `.zwo` workout file.
- Compare the ride that was done with the blocks that were planned.
