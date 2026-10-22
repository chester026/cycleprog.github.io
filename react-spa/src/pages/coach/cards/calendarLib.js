import { t } from '../copy';

/**
 * Parses the date-only part of `YYYY-MM-DD[T…]` as LOCAL midnight (no `Z`),
 * so a bare calendar date never shifts a day for riders west of UTC — the
 * same trick the app's calendar cards use.
 */
export function parseLocalDate(dateStr) {
  const datePart = dateStr?.split('T')[0];
  const d = new Date(`${datePart}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The date-only part of an event's start, for `/calendar?date=YYYY-MM-DD`. */
export function dateParam(dateStr) {
  return dateStr.split('T')[0];
}

export function formatEventDay(dateStr) {
  const d = parseLocalDate(dateStr);
  return d ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : dateStr;
}

/** "Oct 20" or "Oct 20 – Oct 26" across every event with a parsable date; '' with none. */
export function formatPlanRange(events) {
  const dates = events
    .map((e) => parseLocalDate(e.start_date))
    .filter((d) => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  if (dates.length === 0) return '';
  const fmt = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const first = dates[0];
  const last = dates[dates.length - 1];
  return first.getTime() === last.getTime() ? fmt(first) : `${fmt(first)} – ${fmt(last)}`;
}

/** A goal chip only when every event in the plan supports the same goal; null for a mixed batch. */
export function sharedGoalTitle(events) {
  const titles = Array.from(new Set(events.map((e) => e.goal_title || null)));
  return titles.length === 1 ? titles[0] : null;
}

export function eventTypeLabel(type) {
  const key = `calendar.types.${type}`;
  const label = t(key);
  return label === key ? type : label;
}
