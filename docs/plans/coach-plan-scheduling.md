# Coach: a whole plan into the calendar in one reply

**Date:** 2026-11-19 · **Scope:** the coach writes an 18-week plan well, then cannot put it in the calendar: three to six
sessions per reply, "I will not say it is done" each time, and one reply with 25 sessions and no text at all (owner's
screenshots, 19.11.2026). Scheduling is server only — no app or web release needed; §4 (goal targets, tool pills) came
out of the same test.

## Status

| Step | State |
|---|---|
| 1 `schedule_training_plan` tool (plan by week + weekday, one transaction per call) | ✅ `server/aiCoach.js` |
| 2 Chat loop: 10 rounds, a closing reply when they run out, cut-off calls reported to the model | ✅ `server/routes/coach.js`, `server/lib/openaiResponses.js` |
| 3 `get_calendar` says what lies beyond its window | ✅ |
| 4 Prompt: "Putting a plan in the calendar" | ✅ |
| 5 Tests on real Postgres, model faked | ✅ `server/test/integration/coachTrainingPlan.test.js` |
| 6 Goal targets sized to the goal's length (§4) | ✅ `server/aiGoals.js`, `create_goal` |
| 7 Tool pills as a row of tags (§4) | ✅ shared `toolCallTags`, app `ToolCallCard`, web `ToolCallPill` — not seen on a device |
| 8 Tried with the real model | ⏳ owner — `bench-coach.js --scenarios season` (below), then the same chat in the app |

## 1. What went wrong

The production logs of that chat were not available when this was written, so this is split by how it is known.

**In the code (certain):**

1. **One session = one tool call.** A plan could only go in as a run of `create_calendar_event` calls.
2. **Six rounds per reply, and no closing reply when they ran out.** The loop simply ended: the reply was whatever the
   model had written between its calls, or nothing.
3. **The history the model gets holds the replies' text, not the tool results** — so every turn starts by reading the
   calendar, the goals and the rest again.
4. **`get_calendar` looks 30 days ahead by default** and did not say there was more.

**From the screenshots (inferred):**

- Every stuck reply shows four or five reads (calendar, goals, power profile, profile, knowledge base) before "Adding to
  your calendar", then three to six sessions: with one read per round that is 6 − 4…5 = one or two rounds of sessions, a
  week or two each. The one reply that started with three reads got 25 sessions in — and has no text, which is what a
  loop that ran out of rounds looks like.
- "8 sessions, 27 Nov – 18 Dec" while 24 were in the calendar is the 30-day window.
- Twice the model stopped on its own: a session that came out 67′ against a 65′ headline, and a week 1 that began before
  today.

Not the cause, though it looked like one: the output limit. A session with its brief, blocks and cues is roughly 250
tokens as a `create_calendar_event` call (a sample plan in Russian, o200k count), so about 30 fit under
`COACH_CHAT_MAX_TOKENS` = 8000.

## 2. What changed

**`schedule_training_plan`** — the plan as the coach writes it: `goal_id`, `week1_start` (the Monday of week 1) and
sessions, each `{weeks: [2, 3], weekday: 'thu', title, description, workout_steps}`. The server works out the dates, so
54 dates are no longer the model's arithmetic. A session repeated in several weeks is written once. Per call:

- all-or-nothing, in one transaction; the first unreadable session is named and nothing is created;
- a session already in the calendar (same goal, date and title) is not added twice — a call can be repeated;
- every session carries its blocks: one without `workout_steps` is refused (second bench run, §3);
- days before today are left out and listed (`skipped_past`);
- `replace_existing: true` swaps this goal's not-yet-ridden `planned_ride`s in the covered weeks for the new ones — the
  way to re-plan after an FTP test. Other goals, races, notes and ridden sessions are never touched;
- the model gets totals back (`scheduled`, `weeks`, first/last date, each session's minutes from its blocks), not the
  event rows.

About four weeks per call (~2,300 tokens for three sessions a week); an 18-week plan is five calls.

**Clients see what they already know.** Each scheduled session is streamed and stored as a `create_calendar_event` call
(`presentToolCall` in `aiCoach.js`), so the "added to your calendar" card, the Apple Calendar sync and the calendar
refresh work in every build, the App Store one included.

**The loop** (`routes/coach.js`): `MAX_TOOL_ROUNDS` 6 → 10. When they run out with the model still calling tools, one more
round without tools makes it say what is done and what is left. A round cut at `max_output_tokens` is no longer silent:
calls that were complete are run, the model is told the rest was lost; a call with unreadable arguments gets an error
back instead of running with `{}`.

**Prompt:** a plan goes in whole, in the reply where the rider asked; the plan already written is the plan (no redesign,
no "paste it again"); only the goal and the calendar are read first, in one round; a few minutes off the headline and a
week 1 that began before today are not reasons to stop; no progress notes between calls.

## 3. Checking with the real model

The tests fake the model, so they prove the server side, not that the model now sends the whole plan. From `server/`
(read-only: write tools are simulated, nothing lands in the database):

```
node scripts/bench-coach.js --email <your account> --configs gpt-6-luna:low --scenarios season --out ../bench-season.json
```

Good: the second turn shows `get_goals_progress`, `create_goal`, then `schedule_training_plan` calls whose weeks
reach 18 — the log prints `plan in the calendar: weeks 18/18` and the report carries `planWeeks` — and a reply that
names the count and the dates. If the model still stops early, the log shows at which week and after how many rounds
— that is what to tune next (weeks per call, `MAX_TOOL_ROUNDS`).

**First run (owner, 2026-11-19) — nothing learned about scheduling.** The scenario then asked for "a gran fondo in
18 weeks, 120 km, 2000 m", and the account already had exactly that in the calendar (Gran Fondo Cyprus, 26–28 March,
its plan scheduled to 22 March). The coach asked whether this was the same race and, on "put it all in", answered
that the plan was already there and added nothing — correct, and `schedule_training_plan` was never called. Two
things came out of it:

- the scenario now describes a new goal of its own, dated about nine months ahead (a 200 km marathon, the plan's 18
  weeks starting about five months from the day of the run), and a simulated `create_goal` answers with a goal id so
  the plan can be scheduled under it;
- the first round of that run was a forced `assess_ride_feasibility`: "подготовиться к" matched the pattern for
  "готов к" (`lib/coachIntents.js` — Russian patterns have no word boundary). Both "готов" patterns now match only at
  the start of a word; a plan request is no longer answered with a feasibility check first.

**Second run (owner, 2026-11-19) — the whole plan goes in; what goes in was thin.** On the new scenario:
`weeks 18/18`, 54 sessions in five calls of four weeks, seven rounds of the ten, a closing reply with the count and
the dates, no forced feasibility check. 51 s for the scheduling turn (first text after 50 s), 3.5 cents. Two faults:

- **None of the 54 sessions had blocks** — each was a title, a brief and `duration_minutes`. `workout_steps` was
  optional in the tool, and at low effort the model took the short form. The tool now refuses a session without
  blocks (naming it; the call schedules nothing and is repeated), `workout_steps` and `description` are required in
  its schema, and `duration_minutes` is gone from it. The bench's simulated call checks sessions with the same code
  (`expandPlanSessions`), and reports refused calls.
- **The race was scheduled as the plan's last session** (a `planned_ride` of 480 minutes on the Sunday of week 18).
  The prompt now says the event the plan leads to is not one of its sessions and goes in with
  `create_calendar_event` (type `event`); the refusal above says the same when the race comes without blocks. The
  bench reports `raceAsEvent`.

Not changed: in the first turn the coach created the goal while only asked to write the plan (the scenario opens
with "a new goal of its own").

## 4. From the same test: goal targets and the tool pills

**A goal sized to its length.** The goal created for that plan ran to March with 400 km in total, and 230 W as the
average ride power on an FTP of 183. The goals prompt (`server/aiGoals.js`) sized totals from a four-week average, its
examples carried month-sized numbers (one of them exactly 400 km) and a threshold as a ride average, and FTP reached it
as "unknown". Now:

- `create_goal` takes `target_date` (the event day — no longer left to the goals model) and `planned_hours_per_week`;
- the prompt gets the arithmetic done: one week of the goal (the plan's hours at the rider's speed and climbing per km,
  or their last three months raised by the experience overload), and what the window therefore holds; FTP and the
  average power of a ride are real numbers;
- after the model answers, `fitTargetsToGoal` makes it certain: a plain total (distance, climbing, hours, ride count)
  under 80 % of what the window is expected to hold is raised to it, and an average-power target above 90 % of FTP is
  brought down to a ride average. Filtered sums and counts (long rides, intervals) are left to the prompt; a recovery
  goal keeps a small total;
- the result lists every sub-goal with its id and target, and the coach is told to check them against the plan and
  correct an out-of-scale one itself.

**Tool pills as tags.** A column of five "Checking your …" pills before each answer became one wrapping row of tags
(`toolCallTags` in shared, replacing `groupToolCalls`): one tag per tool for the whole reply; while the step runs it
shows the full label, once done a short name ("Calendar", "Goals", "Calendar · add"). The short names are new copy —
`coach.tool…Tag` in the app's `en.json` / `ru.json` and the web's `copy.js`. Written as object · action, not as past
tense: a tag does not know whether the call succeeded. App and web; needs a client build.

## 5. Left for later

- Each turn re-reads goals and calendar because tool results are not in the history. A one-line "this chat has already
  scheduled N sessions, from … to …" note per turn would remove that.
- Many sessions changed at once without re-sending them (shift the whole plan a week, rescale all watts by a new FTP).
  Today that is `replace_existing` with the sessions sent again.
