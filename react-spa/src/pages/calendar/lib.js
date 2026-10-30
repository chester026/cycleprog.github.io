// Web-only calendar logic: the `/calendar?date=&goal=&view=` URL contract,
// the event form's values ↔ API body mapping and en-US display formatting.
// Date math lives in @bikelab/shared/calendar.
import {
  fmtDate,
  isValidDateString,
  parseDateOnly,
  eventDurationMinutes,
  timesFromStartAndDuration,
} from '@bikelab/shared/calendar';

export const VIEWS = ['month', 'week'];

/**
 * Reads the page state from the search params. An invalid or missing `date`
 * falls back to today, so a stale deep link still opens a sensible month.
 */
export function parseCalendarSearch(searchParams, now = new Date()) {
  const dateParam = searchParams.get('date');
  const date = isValidDateString(dateParam) ? dateParam : fmtDate(now);
  const goalParam = searchParams.get('goal');
  const goalId = goalParam && /^\d+$/.test(goalParam) ? goalParam : null;
  const viewParam = searchParams.get('view');
  const view = VIEWS.includes(viewParam) ? viewParam : 'month';
  return { date, goalId, view };
}

/** The search string for a state — only non-default values are written. */
export function calendarSearch({ date, goalId, view }) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (goalId) params.set('goal', String(goalId));
  if (view && view !== 'month') params.set('view', view);
  return params;
}

export function formatMonthLabel(dateStr) {
  return parseDateOnly(dateStr).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** "Mon, Jun 15" — the same header the app uses in its Ask-coach prompts. */
export function formatDayHeader(dateStr) {
  return parseDateOnly(dateStr).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "Monday, June 15, 2026" for the detail sheet. */
export function formatLongDate(dateStr) {
  return parseDateOnly(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatWeekday(dateStr) {
  return parseDateOnly(dateStr).toLocaleDateString('en-US', { weekday: 'short' });
}

/** "Jun 15 – 21" / "Jun 29 – Jul 5" / "Dec 29, 2026 – Jan 4, 2027". */
export function formatWeekLabel({ from, to }) {
  const a = parseDateOnly(from);
  const b = parseDateOnly(to);
  const sameYear = a.getFullYear() === b.getFullYear();
  const sameMonth = sameYear && a.getMonth() === b.getMonth();
  const month = (d) => d.toLocaleDateString('en-US', { month: 'short' });
  if (sameMonth) return `${month(a)} ${a.getDate()} – ${b.getDate()}, ${b.getFullYear()}`;
  if (sameYear) return `${month(a)} ${a.getDate()} – ${month(b)} ${b.getDate()}, ${b.getFullYear()}`;
  return `${month(a)} ${a.getDate()}, ${a.getFullYear()} – ${month(b)} ${b.getDate()}, ${b.getFullYear()}`;
}

const DEFAULT_TYPE = 'planned_ride';

/** Form values for a blank event on `date`, or for an existing event. */
export function formValuesFor(date, event) {
  if (!event) {
    return { type: DEFAULT_TYPE, title: '', date, startTime: '', duration: '', location: '', description: '', goalId: '' };
  }
  const duration = eventDurationMinutes(event.start_time, event.end_time);
  return {
    type: event.type || DEFAULT_TYPE,
    title: event.title || '',
    date: event.start_date.slice(0, 10),
    startTime: event.start_time ? event.start_time.slice(0, 5) : '',
    duration: duration == null ? '' : String(duration),
    location: event.location || '',
    description: event.description || '',
    goalId: event.goal_id == null ? '' : String(event.goal_id),
  };
}

/**
 * The POST/PUT body for a set of form values. Duration is edited in minutes
 * and stored as the coach's start_time/end_time pair.
 */
export function bodyFromValues(values) {
  const times = timesFromStartAndDuration(values.startTime || null, Number(values.duration) || null);
  return {
    type: values.type,
    title: values.title.trim(),
    start_date: values.date,
    start_time: times.start_time,
    end_time: times.end_time,
    all_day: times.start_time == null,
    location: values.location.trim() || null,
    description: values.description.trim() || null,
    goal_id: values.goalId ? Number(values.goalId) : null,
  };
}
