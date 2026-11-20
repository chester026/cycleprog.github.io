# Coach chat redesign and the goal's plan card — Implementation Notes

**Date:** 2026-11-19 · **Scope:** the app only (`BikeLabApp`, plus one pure function in `packages/shared`). The web
chat and goal page are not changed. Built from two mockups the owner approved the same day
(`bikelab-coach-chat-final.png`, `bikelab-goal-plan-timeline.png`).

## 0. Decisions (owner, 2026-11-19)

| Topic | Decision |
|---|---|
| Coach reply | No bubble: text on the canvas. Rich cards take the full width of the column. |
| Rider's message | A light tinted note on the right, not a solid blue bubble. |
| Tool badges | Replaced by one quiet line above the reply, with the coach's mark (a small blob). |
| Header | Round buttons left and right, the chat's title in the middle. No plan strip in the chat. |
| To-bottom button | A plain arrow in a circle, no dot. |
| Stays as it is | Suggestion chips, the race plan card and the content of every rich card, the input row, the blob backdrop. |
| Plan timeline | Lives on the goal screen, not in the chat (a chat can be deleted). |
| Timeline bars | Corners rounded by 4 (fully rounded was tried on the phone: short bars turned into dots); the done part of a past week is light grey `#D0D2D9` (not black, not blue); the current week is the accent blue; the caption reads "this week". |
| No plan | The same place shows a "Create a plan" card that opens the coach with the plan request. |
| Goal tabs | "Scheduled" and "Trainings" are removed; "Metrics" stays in the same grey heavy caps, as a heading. |

## Status

| Part | State |
|---|---|
| Chat: reply, note, meta line, rows, header, title sheet, to-bottom | ✅ built, unit-tested |
| Goal: plan card, create-plan card, tabs removed | ✅ built, unit-tested |
| On a phone | ⏳ owner — none of it was seen on a device or a simulator |

## 1. Chat (`src/components/coach`, `src/screens/CoachChat`)

- `ChatMessageBubble`: the rider's note (accent at 9 %, radius 20 with a 6 corner, up to 75 % of the width) and the
  coach's reply (16/25 text, no background). Column inset 20; a note sits 30 below the reply before it, a reply 22
  below the note it answers.
- A note longer than 280 characters or five lines is folded to five lines with "Show all" (`replyBlocks.isLongNote`).
- `replyBlocks.splitReplyBlocks`: a run of two or more `- Label: value` bullets whose value holds a number and fits a
  line is drawn as rows (label left, value right, hairlines). Anything else stays text.
- `ReplyMeta` replaces `ToolCallCard`: the coach's mark and one line beside it — the step in progress while one runs
  ("Checking your calendar…"), otherwise the short names of what the coach looked at ("Calendar, Power profile"),
  otherwise its name.
- `CoachMark` is one small SVG in BlobOrb's colours, always the same element: it turns and breathes while the reply
  is being made and is still once it is done (owner, 2026-11-20: the first version swapped in the real `BlobOrb`, larger,
  for the working state, with typing dots that sat left or right depending on what was beside them — "a different
  blob appears"). The real BlobOrb is a Skia canvas on a running clock and is not mounted in the transcript.
- `CoachCardChrome`: `alignSelf: 'stretch'` instead of `maxWidth: 92%`.
- `ChatHeader`: Back and New chat as 38 px round buttons; the title opens a `FormSheet` — rename
  (`PATCH /api/coach/conversations/:id`, already on the server; `useCoachChat.renameConversation`) and delete.
- `MessageList`: the to-bottom button is 42 px.
- `useCoachChat`: a turn that created, changed or deleted calendar events invalidates the `calendar` queries once,
  when it ends — the goal screen under the chat then shows the new plan.

**Different from the mockup**

- The working state has no progress bar and no "weeks 9–12 of 18": the app is not told how far a plan is while it is
  being scheduled. The line shows the running step.
- The header stays above the transcript as before; messages do not scroll under a frosted bar.
- The rider's note has no attached-file line (attachments travel as hidden context and are not stored with the
  message).

## 2. Goal screen (`src/screens/GoalDetails`)

- `goalPlanTimeline(events, {today, targetDate})` in `packages/shared/src/calc/goalPlan.ts`: the goal's
  `planned_ride` events grouped into Monday–Sunday weeks from the first session's week to the last one's, or to the
  week of the goal's date when that is later. Per week: planned minutes (the session's blocks, else its
  start/end-time duration) and done minutes. Also: the current week, the heaviest week, the next session not yet
  done. Null when the goal has no training session.
- **Done = time on the bike** (owner, 2026-11-19: "so we cannot count this progress?" — the first version counted
  only sessions marked completed, and that mark is set by hand in the calendar, nothing sets it from a ride). A
  week's done minutes are the moving time of the rider's cycling activities of that week (`useActivities`, the day
  as the calendar shows it), or the minutes of its sessions marked completed when that is more — a session ridden
  without a recording still counts. It is hours against hours: a long easy ride fills the bar like the planned
  intervals would; whether the planned session itself was ridden is not judged.
- `GoalPlan` (in `GoalPlanCard.tsx`) reads `useCalendar({goalId})` and shows `GoalPlanCard`, `CreatePlanCard` (an
  open goal without sessions) or nothing (loading; a completed or expired goal without a plan). It sits in
  `GoalHeader`, between the description and the coach banner.
- Bars: height = the week's planned time against the heaviest week; a past week is filled by done / planned; the
  current week is blue (a light blue bar, no outline) and fills as the week is ridden. The dot after the bars is the goal's date.
- Captions under the bars are placed by estimate (`planCardLib.placeCaptions`): "this week", the date ("race" when
  the goal has an `event` in the calendar, otherwise "due"), "start", "peak" — in that order of importance, the
  later ones dropped when they would overlap.
- Layout settled on the phone (owner, 2026-11-19/20): the eyebrow and "Week N of M" are one block on the left, and
  centred against it on the right a grey badge carries the week's hours
  ("1.5 h of 3 h"); the caption under the current bar is just "this week", in the small 10 px caption face; the
  current bar has no outline. There is one way to the calendar, at the foot of the card: the next-session row (with a
  chevron), or a plain "Calendar ›" link when there is no session to show — the link no longer sits in the header.
- `ScheduleTab`, `TrainingsTab` and their helpers (`groupTrainings`, `getScheduleTypeColor`) are deleted with their
  copy.
- The training library went with the Trainings tab (owner, 2026-11-19): `TrainingLibraryModal`,
  `TrainingDetailsModal`, `TrainingCard`, `useTrainingTypes`, their copy and `blob4.png` are deleted.
  `GET /api/training-types` stays on the server — the web and the App Store build still call it.
