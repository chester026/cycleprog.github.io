// Pure helpers behind the coach pages — no React, no API, unit-tested in
// lib.test.js. Anything numeric or shared with the app lives in
// @bikelab/shared/coach; this file is only the web-specific glue.
import { QUICK_START_SUGGESTION_KEYS, WELCOME_SUGGESTION_KEYS } from '@bikelab/shared/coach';
import { t } from './copy';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'narrow' });
const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

/** "now" / "5m ago" / "3h ago" / "yesterday" / "Oct 3" for a conversation's updated_at. */
export function formatRelativeTime(isoDate, now = Date.now()) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = now - date.getTime();
  if (diffMs < MINUTE_MS) return relativeTime.format(0, 'second');
  if (diffMs < HOUR_MS) return relativeTime.format(-Math.floor(diffMs / MINUTE_MS), 'minute');
  if (diffMs < DAY_MS) return relativeTime.format(-Math.floor(diffMs / HOUR_MS), 'hour');
  if (diffMs < WEEK_MS) return relativeTime.format(-Math.floor(diffMs / DAY_MS), 'day');
  return shortDate.format(date);
}

/** Local-time HH:mm for the budget-exceeded reset moment. */
export function formatLocalTime(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Minimal markdown, same subset the app renders (ChatMessageBubble.tsx
// renderFormatted): **bold** spans and "- "/"* " bullet lines. Returns a
// line model so the component only maps it to elements.
const BULLET_RE = /^\s*[-*]\s+/;
const BOLD_SPLIT_RE = /(\*\*[^*]+\*\*)/g;

/** @returns {{bullet: boolean, segments: {bold: boolean, text: string}[]}[]} */
export function parseFormattedLines(content) {
  const lines = content.length > 0 ? content.split('\n') : [''];
  return lines.map((line) => {
    const bullet = BULLET_RE.test(line);
    const cleaned = bullet ? line.replace(BULLET_RE, '') : line;
    const segments = cleaned
      .split(BOLD_SPLIT_RE)
      .filter((seg) => seg.length > 0)
      .map((seg) =>
        seg.startsWith('**') && seg.endsWith('**') && seg.length > 4
          ? { bold: true, text: seg.slice(2, -2) }
          : { bold: false, text: seg },
      );
    return { bullet, segments };
  });
}

/** The empty-chat welcome chips (also shown before the first reply's suggestions arrive). */
export function buildWelcomeSuggestions() {
  return WELCOME_SUGGESTION_KEYS.map((key) => ({ label: t(key) }));
}

// `prompt`, when present, is what actually gets SENT instead of `label` —
// see QUICK_START_SUGGESTION_KEYS for why the total-stats chip needs one.
export function buildQuickStartSuggestions() {
  return QUICK_START_SUGGESTION_KEYS.map(({ labelKey, promptKey }) => ({
    label: t(labelKey),
    ...(promptKey ? { prompt: t(promptKey) } : {}),
  }));
}

/**
 * Hidden model context for the `/coach?activity=` / `?event=` entry points
 * — the id rides along for the model, never inside the rider's own bubble.
 */
export function buildEntryHiddenContext({ activityId, eventId }) {
  if (activityId) return `activity_id: ${activityId}`;
  if (eventId) return `calendar_event_id: ${eventId}`;
  return undefined;
}

// AttachedActivity is deliberately small — just what the model needs to
// reason about a ride (see @bikelab/shared/coach serializeAttachedActivities).
export function toAttachedActivity(a) {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    start_date: a.start_date,
    distance: a.distance,
    moving_time: a.moving_time,
    total_elevation_gain: a.total_elevation_gain,
    average_heartrate: a.average_heartrate,
    average_watts: a.average_watts,
  };
}

/**
 * Persisted `coach_messages` rows → chat messages. Stored tool_calls have
 * no client status, so they come back 'done' (their results are final).
 */
export function mapPersistedMessages(rows) {
  return rows.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    toolCalls: Array.isArray(m.tool_calls)
      ? m.tool_calls.map((tc) => ({ ...tc, args: tc.args ?? {}, status: 'done' }))
      : undefined,
    suggestions: Array.isArray(m.suggestions) ? m.suggestions : undefined,
    createdAt: typeof m.created_at === 'string' ? m.created_at : new Date(m.created_at).toISOString(),
  }));
}

/** The chips to show under the last reply: the server's, minus the app-only Apple Health action. */
export function visibleSuggestions(items) {
  return (items ?? []).filter((item) => item.action !== 'connect_health');
}
