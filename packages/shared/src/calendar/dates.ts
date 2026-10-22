/**
 * Pure calendar date math shared by the app's Calendar screen and the web's
 * /calendar page: local YYYY-MM-DD strings, Monday-start weeks, the month
 * grid matrix, grouping activities + events by day, and the start/end-time
 * duration encoding the coach uses for planned sessions.
 *
 * Every date string here is a wall-clock LOCAL date. `toISOString()` is
 * never used: it converts to UTC first, which pushes "today" a day ahead
 * or behind depending on timezone and time of day.
 */

export type DateString = string; // YYYY-MM-DD

export interface DayGroup<A, E> {
  date: DateString;
  activities: A[];
  events: E[];
}

export interface MonthCell {
  date: DateString;
  /** False for the leading/trailing days that pad the grid to full weeks. */
  inMonth: boolean;
}

export interface DateRange {
  from: DateString;
  to: DateString;
}

/** Something with a start date — a Strava activity (ISO timestamp) or a calendar event (date). */
interface Dated {
  start_date?: string | null;
  start_date_local?: string | null;
}

interface Spanning extends Dated {
  end_date?: string | null;
}

const DAYS_PER_WEEK = 7;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

export function fmtDate(d: Date): DateString {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parses "YYYY-MM-DD" as LOCAL midnight (`new Date('YYYY-MM-DD')` would be UTC). */
export function parseDateOnly(dateStr: DateString): Date {
  return new Date(`${dateStr}T00:00:00`);
}

/** True for a well-formed "YYYY-MM-DD" that names a real calendar day. */
export function isValidDateString(value: unknown): value is DateString {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = parseDateOnly(value);
  return !Number.isNaN(d.getTime()) && fmtDate(d) === value;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function addMonths(d: Date, n: number): Date {
  // Anchor on the 1st so Jan 31 + 1 month is February, not March 3.
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export function addDaysStr(dateStr: DateString, n: number): DateString {
  return fmtDate(addDays(parseDateOnly(dateStr), n));
}

/** Monday of the week containing `d` (JS getDay() is Sunday-start). */
export function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0 = Sun .. 6 = Sat
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = addDays(d, diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/** Mon..Sun range of the week containing `dateStr`. */
export function weekRange(dateStr: DateString): DateRange {
  const monday = startOfWeek(parseDateOnly(dateStr));
  return { from: fmtDate(monday), to: fmtDate(addDays(monday, DAYS_PER_WEEK - 1)) };
}

/** The 7 Mon..Sun dates of the week containing `dateStr`. */
export function weekDays(dateStr: DateString): DateString[] {
  const monday = startOfWeek(parseDateOnly(dateStr));
  return Array.from({ length: DAYS_PER_WEEK }, (_, i) => fmtDate(addDays(monday, i)));
}

/**
 * Month grid as rows of 7 cells, Monday-start, padded with the neighbouring
 * months' days so every row is a full week. 4 to 6 rows depending on the
 * month — no fixed 6-row padding, so a short month doesn't carry a row of
 * next-month days.
 */
export function monthMatrix(dateStr: DateString): MonthCell[][] {
  const anchor = parseDateOnly(dateStr);
  const first = startOfMonth(anchor);
  const last = endOfMonth(anchor);
  const month = anchor.getMonth();
  const rows: MonthCell[][] = [];
  let cursor = startOfWeek(first);
  while (cursor <= last) {
    const row: MonthCell[] = [];
    for (let i = 0; i < DAYS_PER_WEEK; i++) {
      row.push({ date: fmtDate(cursor), inMonth: cursor.getMonth() === month });
      cursor = addDays(cursor, 1);
    }
    rows.push(row);
  }
  return rows;
}

/** The full [first cell, last cell] range of `monthMatrix` — what the grid needs loaded. */
export function monthGridRange(dateStr: DateString): DateRange {
  const rows = monthMatrix(dateStr);
  const lastRow = rows[rows.length - 1];
  return { from: rows[0][0].date, to: lastRow[lastRow.length - 1].date };
}

/** Same day-of-month in the neighbouring month, clamped to that month's length. */
export function sameDayNextMonth(dateStr: DateString, direction: -1 | 1): DateString {
  const d = parseDateOnly(dateStr);
  const target = addMonths(d, direction);
  const lastDay = endOfMonth(target).getDate();
  return fmtDate(new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), lastDay)));
}

/**
 * Where "‹ ›" lands when paging by a week: the same weekday in the
 * neighbouring week, unless that week contains today — then today, so
 * paging back to the current week re-selects it rather than, say, Monday.
 */
export function weekPageTarget(dateStr: DateString, direction: -1 | 1, now: Date = new Date()): DateString {
  const target = addDaysStr(dateStr, DAYS_PER_WEEK * direction);
  const todayStr = fmtDate(now);
  const { from, to } = weekRange(target);
  return todayStr >= from && todayStr <= to ? todayStr : target;
}

/** Inclusive [from, to] overlap of two date ranges. */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.from <= b.to && b.from <= a.to;
}

/** The local calendar day an activity or event starts on, or null when it has none. */
export function startDay(item: Dated): DateString | null {
  // Strava's `start_date_local` is the rider's wall-clock day; `start_date`
  // is UTC and would file a late-evening ride under the next day east of UTC.
  const raw = item.start_date_local || item.start_date;
  if (!raw) return null;
  return raw.slice(0, 10);
}

/**
 * Every day an event occupies, clipped to `range`: [start_date, end_date]
 * when it has an end date on or after its start, otherwise just the start
 * day. Multi-day events (a training camp, a race weekend) appear on each
 * day they span.
 */
export function eventDays(event: Spanning, range: DateRange): DateString[] {
  const start = startDay(event);
  if (!start) return [];
  const end = event.end_date && event.end_date.slice(0, 10) >= start ? event.end_date.slice(0, 10) : start;
  if (!rangesOverlap({ from: start, to: end }, range)) return [];
  const days: DateString[] = [];
  let cursor = start < range.from ? range.from : start;
  const last = end > range.to ? range.to : end;
  while (cursor <= last) {
    days.push(cursor);
    cursor = addDaysStr(cursor, 1);
  }
  return days;
}

/**
 * Groups activities and events into one DayGroup per date inside `range`
 * (inclusive), sorted ascending. Only dates that have something are
 * returned — a wider loaded range never leaks neighbouring months' items
 * into the visible one.
 */
export function groupByDay<A extends Dated, E extends Spanning>(
  activities: readonly A[],
  events: readonly E[],
  range: DateRange,
): DayGroup<A, E>[] {
  const map = new Map<DateString, DayGroup<A, E>>();
  const groupFor = (date: DateString) => {
    let group = map.get(date);
    if (!group) {
      group = { date, activities: [], events: [] };
      map.set(date, group);
    }
    return group;
  };

  for (const act of activities) {
    const date = startDay(act);
    if (date && date >= range.from && date <= range.to) groupFor(date).activities.push(act);
  }
  for (const ev of events) {
    for (const date of eventDays(ev, range)) groupFor(date).events.push(ev);
  }

  return Array.from(map.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Which dates have at least one activity or event — the dots under grid days. */
export function datesWithContent<A, E>(days: readonly DayGroup<A, E>[]): Set<DateString> {
  const set = new Set<DateString>();
  for (const d of days) {
    if (d.activities.length || d.events.length) set.add(d.date);
  }
  return set;
}

/** "HH:MM" (or "HH:MM:SS") → minutes since midnight, or null when malformed. */
export function timeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * MINUTES_PER_HOUR + m;
}

/** Minutes since midnight → "HH:MM", wrapping past midnight. */
export function minutesToTime(minutes: number): string {
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(wrapped / MINUTES_PER_HOUR);
  const m = wrapped % MINUTES_PER_HOUR;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Session length in minutes from an event's start/end times, or null when
 * either is missing or the pair is not a positive span. The coach stores a
 * *duration* this way (an anchor start_time plus however long the session
 * takes — see aiCoach.js durationToTimes), so this diffs the two rather
 * than treating them as a real clock appointment.
 */
export function eventDurationMinutes(startTime?: string | null, endTime?: string | null): number | null {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start == null || end == null) return null;
  const diff = end - start;
  return diff > 0 ? diff : null;
}

/** "~45 min", "~1h 30min", "~2h" — null when there is no positive duration. */
export function formatEventDuration(startTime?: string | null, endTime?: string | null): string | null {
  const diff = eventDurationMinutes(startTime, endTime);
  if (diff == null) return null;
  if (diff < MINUTES_PER_HOUR) return `~${diff} min`;
  const h = Math.floor(diff / MINUTES_PER_HOUR);
  const m = diff % MINUTES_PER_HOUR;
  return m ? `~${h}h ${m}min` : `~${h}h`;
}

/**
 * The start_time/end_time pair for a start and a duration — the inverse of
 * `eventDurationMinutes`. No start → no times (an all-day event); a start
 * without a duration keeps start_time only.
 */
export function timesFromStartAndDuration(
  startTime: string | null | undefined,
  durationMinutes: number | null | undefined,
): { start_time: string | null; end_time: string | null } {
  const start = timeToMinutes(startTime);
  if (start == null) return { start_time: null, end_time: null };
  const startStr = minutesToTime(start);
  if (!durationMinutes || durationMinutes <= 0) return { start_time: startStr, end_time: null };
  return { start_time: startStr, end_time: minutesToTime(start + durationMinutes) };
}

/** Metres → "20.5" km with one decimal. */
export function formatKm(meters: number): string {
  return (meters / 1000).toFixed(1);
}

/** Seconds → "1:02" for an hour or more, "25min" below. */
export function formatActivityDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / MINUTES_PER_HOUR);
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}` : `${m}min`;
}
