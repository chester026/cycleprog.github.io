// Pure date math + grouping for CalendarScreen (T-5.4/T-5.1, audit A-27).
// Extracted verbatim from the old CalendarScreen.tsx so behaviour doesn't
// change — see each function's original comment for the "why".
import type {CalendarEvent} from '@bikelab/shared/types';
import type {Activity} from '../../types/activity';

export interface DayGroup {
  date: string; // YYYY-MM-DD
  activities: Activity[];
  events: CalendarEvent[];
}

export const EVENT_TYPES = ['planned_ride', 'rest_day', 'maintenance', 'purchase', 'event', 'note'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

// "Ask Agent" opens the coach with a question tailored to what kind of
// event this is, rather than one generic prompt for every type.
export const ASK_PROMPT_KEYS: Record<string, string> = {
  planned_ride: 'calendar.askPromptPlannedRide',
  rest_day: 'calendar.askPromptRestDay',
  maintenance: 'calendar.askPromptMaintenance',
  purchase: 'calendar.askPromptPurchase',
  event: 'calendar.askPromptEvent',
  note: 'calendar.askPromptNote',
};

// Local calendar date, NOT toISOString() — that converts to UTC first,
// which pushes "today" a day ahead (or behind) depending on timezone and
// time of day. Every date string in this screen (selectedDate, the week
// strip, "today" comparisons) must be a wall-clock local date.
export function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

// Monday-start week, matching the mockup's Mon..Sun strip (vs JS's
// Sunday-start getDay()).
export function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0 = Sun .. 6 = Sat
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = addDays(d, diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// Parses a "YYYY-MM-DD" (optionally with a trailing "Txx:xx:xx" the caller
// stripped, or not) date-only string as LOCAL midnight, never UTC — see
// fmtDate's comment. Every call site below that turns a date string back
// into a `Date` goes through this instead of `new Date(dateStr)`.
export function parseDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

export function formatDayHeader(dateStr: string, locale: string): string {
  const d = parseDateOnly(dateStr);
  return d.toLocaleDateString(locale, {weekday: 'short', day: 'numeric', month: 'short'});
}

export function isToday(dateStr: string): boolean {
  return dateStr === fmtDate(new Date());
}

export function formatKm(meters: number): string {
  return (meters / 1000).toFixed(1);
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}` : `${m}min`;
}

// The coach only ever stores a *duration* via start_time/end_time (see
// aiCoach.js's durationToTimes) — an arbitrary 09:00 anchor plus however
// many minutes the session takes — so this just diffs the two rather than
// treating them as real clock times.
export function formatEventDuration(startTime?: string | null, endTime?: string | null): string | null {
  if (!startTime || !endTime) return null;
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const diff = toMinutes(endTime) - toMinutes(startTime);
  if (!Number.isFinite(diff) || diff <= 0) return null;
  if (diff < 60) return `~${diff} min`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m ? `~${h}h ${m}min` : `~${h}h`;
}

// Groups activities + events into one DayGroup per date, scoped to exactly
// [from, to] (inclusive) — a wider prefetch buffer used to leak
// neighboring months' activities/events into whichever month the user
// navigated to (Apr/May/Jun all showing up together under "May"), which
// read as a bug rather than smooth scrolling. Sorted ascending by date.
export function groupByDay(activities: Activity[], events: CalendarEvent[], from: Date, to: Date): DayGroup[] {
  const map = new Map<string, DayGroup>();

  activities.forEach(act => {
    const dateStr = act.start_date?.split('T')[0];
    if (!dateStr) return;
    const d = parseDateOnly(dateStr);
    if (d < from || d > to) return;
    if (!map.has(dateStr)) map.set(dateStr, {date: dateStr, activities: [], events: []});
    map.get(dateStr)!.activities.push(act);
  });

  events.forEach(ev => {
    const dateStr = ev.start_date?.split('T')[0];
    if (!dateStr) return;
    const d = parseDateOnly(dateStr);
    if (d < from || d > to) return;
    if (!map.has(dateStr)) map.set(dateStr, {date: dateStr, activities: [], events: []});
    map.get(dateStr)!.events.push(ev);
  });

  return Array.from(map.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}

// The 7 dates (Mon..Sun) around `selectedDate`, for the strip under the
// header.
export function weekStripDaysFor(selectedDate: string): Date[] {
  const start = startOfWeek(parseDateOnly(selectedDate));
  return Array.from({length: 7}, (_, i) => addDays(start, i));
}

// Which dates have any activity or event — drives the small dot under
// each day in the strip. Weeks that straddle a month boundary won't show
// a dot for the spillover days from the neighboring month, since `days`
// is only ever computed for the currently-loaded month.
export function datesWithContentFrom(days: DayGroup[]): Set<string> {
  const set = new Set<string>();
  days.forEach(d => {
    if (d.activities.length || d.events.length) set.add(d.date);
  });
  return set;
}
