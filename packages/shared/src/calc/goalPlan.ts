/**
 * A goal's training plan, week by week — what the goal screen draws as a row
 * of bars: how many hours each week of the plan holds, how much of a week
 * that has passed was actually done, where today is, and the next session.
 * The plan is the goal's training sessions in the calendar (`planned_ride`
 * events linked to the goal — the coach's schedule_training_plan writes
 * them); a goal without any has no plan.
 *
 * "Done" is time on the bike: the rider's rides of that week. A session is
 * marked completed in the calendar only by hand, so on its own that mark
 * would leave the weeks of a rider who never ticks it empty; it still
 * counts for a session ridden without a recording — the week takes the
 * larger of the two.
 */
import { addDaysStr, eventDurationMinutes, fmtDate, isValidDateString, parseDateOnly, startOfWeek, type DateString } from '../calendar/dates.js';

const DAYS_PER_WEEK = 7;
const SECONDS_PER_MINUTE = 60;
// Two years of weeks — more than any plan; guards the row of bars against a
// stray session dated far from the rest.
const MAX_WEEKS = 104;

/** The fields of a calendar event the timeline reads. */
export interface PlanEvent {
  id: number | string;
  type: string;
  title: string;
  start_date: string;
  start_time?: string | null;
  end_time?: string | null;
  completed?: boolean | null;
  workout?: { duration_s: number } | null;
}

/** A ride the rider did: its day and its moving time. */
export interface PlanRide {
  date: string;
  minutes: number;
}

export interface PlanWeek {
  /** Monday of the week. */
  start: DateString;
  plannedMin: number;
  /** Minutes ridden that week, or of its sessions marked completed — the larger. */
  doneMin: number;
}

export interface PlanSession {
  id: number | string;
  title: string;
  date: DateString;
}

export interface GoalPlanTimeline {
  weeks: PlanWeek[];
  /** Index of the week today falls in; null before the plan starts and after it ends. */
  currentWeek: number | null;
  /** Where today is: before the first week, inside the plan, or past its last week. */
  phase: 'ahead' | 'running' | 'over';
  /** Index of the heaviest week by planned time (the first of equals). */
  peakWeek: number;
  /** The first session not yet done, today or later. */
  nextSession: PlanSession | null;
  plannedMin: number;
  doneMin: number;
}

const mondayOf = (date: DateString): DateString => fmtDate(startOfWeek(parseDateOnly(date)));

const weeksBetween = (from: DateString, to: DateString): number =>
  Math.round((parseDateOnly(to).getTime() - parseDateOnly(from).getTime()) / (DAYS_PER_WEEK * 24 * 60 * 60 * 1000));

function sessionMinutes(event: PlanEvent): number {
  if (event.workout && event.workout.duration_s > 0) return Math.round(event.workout.duration_s / SECONDS_PER_MINUTE);
  return eventDurationMinutes(event.start_time, event.end_time) ?? 0;
}

/**
 * The timeline of the plan made of `events`, or null when they hold no
 * training session. Weeks run Monday to Sunday, from the first session's
 * week to the last one's — or to the week of `targetDate` (the race) when
 * that is later.
 */
export function goalPlanTimeline(
  events: readonly PlanEvent[],
  opts: { today: DateString; targetDate?: string | null; rides?: readonly PlanRide[] },
): GoalPlanTimeline | null {
  const sessions = events
    .filter((e) => e.type === 'planned_ride')
    .map((e) => ({ event: e, date: e.start_date.slice(0, 10) }))
    .filter((s) => isValidDateString(s.date))
    // Day order; the sort is stable, so sessions of one day keep the order they came in.
    .sort((a, b) => Number(a.date > b.date) - Number(a.date < b.date));
  if (sessions.length === 0) return null;

  const firstMonday = mondayOf(sessions[0].date);
  const target = opts.targetDate?.slice(0, 10);
  const lastDate = sessions[sessions.length - 1].date;
  const endDate = target && isValidDateString(target) && target > lastDate ? target : lastDate;
  const count = Math.min(weeksBetween(firstMonday, mondayOf(endDate)) + 1, MAX_WEEKS);

  const weekOf = (date: DateString): number => weeksBetween(firstMonday, mondayOf(date));
  const plannedMin = new Array<number>(count).fill(0);
  const tickedMin = new Array<number>(count).fill(0);
  const riddenMin = new Array<number>(count).fill(0);
  for (const { event, date } of sessions) {
    const i = weekOf(date);
    if (i >= count) continue;
    const minutes = sessionMinutes(event);
    plannedMin[i] += minutes;
    if (event.completed) tickedMin[i] += minutes;
  }
  for (const ride of opts.rides ?? []) {
    const date = ride.date.slice(0, 10);
    if (!isValidDateString(date)) continue;
    const i = weekOf(date);
    if (i >= 0 && i < count) riddenMin[i] += ride.minutes;
  }
  const weeks: PlanWeek[] = plannedMin.map((planned, i) => ({
    start: addDaysStr(firstMonday, i * DAYS_PER_WEEK),
    plannedMin: planned,
    doneMin: Math.round(Math.max(tickedMin[i], riddenMin[i])),
  }));

  const todayWeek = weekOf(opts.today);
  const phase = todayWeek < 0 ? 'ahead' : todayWeek >= count ? 'over' : 'running';
  const next = sessions.find((s) => !s.event.completed && s.date >= opts.today);

  return {
    weeks,
    currentWeek: phase === 'running' ? todayWeek : null,
    phase,
    peakWeek: weeks.reduce((best, week, i) => (week.plannedMin > weeks[best].plannedMin ? i : best), 0),
    nextSession: next ? { id: next.event.id, title: next.event.title, date: next.date } : null,
    plannedMin: weeks.reduce((sum, week) => sum + week.plannedMin, 0),
    doneMin: weeks.reduce((sum, week) => sum + week.doneMin, 0),
  };
}

/** Whole weeks from `today` to `targetDate`, at least 1; null without a date ahead. */
export function weeksToTarget(today: DateString, targetDate: string | null | undefined): number | null {
  const target = targetDate?.slice(0, 10);
  if (!target || !isValidDateString(target) || target <= today) return null;
  return Math.max(1, weeksBetween(mondayOf(today), mondayOf(target)));
}
