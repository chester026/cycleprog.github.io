/**
 * RFC 5545 iCalendar builder for exporting calendar events as a `.ics`
 * file — the web's substitute for the app's Apple Calendar sync. Pure
 * string work, no Date-library: one VEVENT per event, CRLF line endings,
 * 75-octet line folding, TEXT escaping and a UTC DTSTAMP.
 *
 * Event times are the rider's LOCAL wall-clock time as the server stores
 * them (`start_time`/`end_time` as HH:MM[:SS], no zone), so timed events
 * are written as floating local times (no `Z`) — the importing calendar
 * puts them at that hour wherever the rider is, which is what a "7:00
 * ride" means. Only DTSTAMP, which RFC 5545 requires in UTC, carries a `Z`.
 */

export interface IcsEvent {
  /** Stable id for the UID; events re-imported with the same UID update in place. */
  id: number | string;
  title: string;
  description?: string | null;
  location?: string | null;
  /** `YYYY-MM-DD` (a trailing `T…` time part is ignored). */
  start_date: string;
  /** Inclusive last day of a multi-day event, `YYYY-MM-DD`. */
  end_date?: string | null;
  /** Local `HH:MM` or `HH:MM:SS`; absent = all-day. */
  start_time?: string | null;
  end_time?: string | null;
  /** Used for DTEND when `end_time` is missing. */
  duration_minutes?: number | null;
}

export interface IcsOptions {
  /** PRODID — identifies the generator; defaults to BikeLab's. */
  prodId?: string;
  /** UID host part, `<id>@<uidDomain>`. */
  uidDomain?: string;
  /** DTSTAMP source, defaults to the current time. */
  now?: Date;
}

export const DEFAULT_TIMED_EVENT_DURATION_MINUTES = 60;
const ICS_LINE_MAX_OCTETS = 75;
const MINUTES_PER_DAY = 24 * 60;
const CRLF = '\r\n';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** TEXT value escaping (RFC 5545 §3.3.11): backslash, semicolon, comma, newlines. */
export function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

const utf8 = new TextEncoder();

function utf8Length(char: string): number {
  return utf8.encode(char).length;
}

/**
 * Folds one content line at 75 octets (RFC 5545 §3.1), continuation lines
 * starting with a single space. Counts UTF-8 octets, not characters, so a
 * multi-byte title never produces an over-long line.
 */
export function foldIcsLine(line: string): string {
  const out: string[] = [];
  let current = '';
  let octets = 0;
  // The continuation line's leading space counts toward its 75 octets.
  let limit = ICS_LINE_MAX_OCTETS;
  for (const char of line) {
    const size = utf8Length(char);
    if (octets + size > limit) {
      out.push(current);
      current = ' ';
      octets = 1;
      limit = ICS_LINE_MAX_OCTETS;
    }
    current += char;
    octets += size;
  }
  out.push(current);
  return out.join(CRLF);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function parseDate(value: string): DateParts | null {
  const match = DATE_RE.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function parseTimeMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = TIME_RE.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatDate(parts: DateParts): string {
  return `${parts.year}${pad2(parts.month)}${pad2(parts.day)}`;
}

// Date arithmetic through Date.UTC so month/year rollovers are handled by
// the engine; the parts are read straight back as UTC so no zone shifts
// the calendar day.
function addDays(parts: DateParts, days: number): DateParts {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function formatLocalDateTime(parts: DateParts, minutes: number): string {
  const dayOffset = Math.floor(minutes / MINUTES_PER_DAY);
  const inDay = minutes - dayOffset * MINUTES_PER_DAY;
  return `${formatDate(addDays(parts, dayOffset))}T${pad2(Math.floor(inDay / 60))}${pad2(inDay % 60)}00`;
}

/** `YYYYMMDDTHHMMSSZ` — the UTC stamp format DTSTAMP requires. */
export function formatIcsUtc(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`
  );
}

/**
 * DTSTART/DTEND lines for one event. All-day events use `VALUE=DATE` with
 * the RFC's exclusive DTEND (the day after the last day). Timed events end
 * at `end_time`, else `start_time + duration_minutes`, else an hour later.
 * A multi-day timed event ends at `end_time` on `end_date`.
 */
export function buildIcsEventTimes(event: IcsEvent): string[] | null {
  const start = parseDate(event.start_date);
  if (!start) return null;
  const lastDay = (event.end_date && parseDate(event.end_date)) || start;
  const startMinutes = parseTimeMinutes(event.start_time);

  if (startMinutes === null) {
    return [`DTSTART;VALUE=DATE:${formatDate(start)}`, `DTEND;VALUE=DATE:${formatDate(addDays(lastDay, 1))}`];
  }

  const endMinutes = parseTimeMinutes(event.end_time);
  let end: string;
  if (endMinutes !== null) {
    end = formatLocalDateTime(lastDay, endMinutes);
  } else {
    const duration =
      event.duration_minutes != null && event.duration_minutes > 0
        ? event.duration_minutes
        : DEFAULT_TIMED_EVENT_DURATION_MINUTES;
    end = formatLocalDateTime(start, startMinutes + duration);
  }
  return [`DTSTART:${formatLocalDateTime(start, startMinutes)}`, `DTEND:${end}`];
}

function buildVEvent(event: IcsEvent, stamp: string, uidDomain: string): string[] | null {
  const times = buildIcsEventTimes(event);
  if (!times) return null;
  const lines = ['BEGIN:VEVENT', `UID:${event.id}@${uidDomain}`, `DTSTAMP:${stamp}`, ...times, `SUMMARY:${escapeIcsText(event.title)}`];
  if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  lines.push('END:VEVENT');
  return lines;
}

/**
 * A complete VCALENDAR with one VEVENT per event; events whose start date
 * is unparsable are skipped. Returns the text ready to write to a `.ics`
 * file (`text/calendar`).
 */
export function buildIcsCalendar(events: readonly IcsEvent[], options: IcsOptions = {}): string {
  const stamp = formatIcsUtc(options.now ?? new Date());
  const uidDomain = options.uidDomain ?? 'bikelab.app';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${options.prodId ?? '-//BikeLab//Coach//EN'}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const event of events) {
    const vevent = buildVEvent(event, stamp, uidDomain);
    if (vevent) lines.push(...vevent);
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join(CRLF) + CRLF;
}

/**
 * A safe download name: the single event's title (or `bikelab-plan` for
 * several), lower-cased, non-alphanumerics collapsed to dashes.
 */
export function icsFileName(events: readonly IcsEvent[]): string {
  const base = events.length === 1 ? events[0].title : 'bikelab-plan';
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'bikelab-event'}.ics`;
}
