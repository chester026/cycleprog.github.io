import { describe, it, expect } from 'vitest';
import {
  formatRelativeTime,
  formatLocalTime,
  parseFormattedLines,
  buildWelcomeSuggestions,
  buildQuickStartSuggestions,
  buildEntryHiddenContext,
  toAttachedActivity,
  mapPersistedMessages,
  visibleSuggestions,
} from './lib';
import { t } from './copy';

const NOW = new Date('2026-10-16T12:00:00Z').getTime();

describe('formatRelativeTime', () => {
  it('rounds down to the largest unit under a week', () => {
    expect(formatRelativeTime('2026-10-16T11:59:40Z', NOW)).toBe('now');
    expect(formatRelativeTime('2026-10-16T11:35:00Z', NOW)).toBe('25m ago');
    expect(formatRelativeTime('2026-10-16T09:10:00Z', NOW)).toBe('2h ago');
    expect(formatRelativeTime('2026-10-15T10:00:00Z', NOW)).toBe('yesterday');
    expect(formatRelativeTime('2026-10-13T10:00:00Z', NOW)).toBe('3d ago');
  });

  it('falls back to a short date past a week and to empty for garbage', () => {
    expect(formatRelativeTime('2026-10-01T10:00:00Z', NOW)).toBe('Oct 1');
    expect(formatRelativeTime('not a date', NOW)).toBe('');
  });
});

describe('formatLocalTime', () => {
  it('zero-pads hours and minutes in local time', () => {
    const d = new Date(2026, 9, 16, 7, 5);
    expect(formatLocalTime(d.toISOString())).toBe('07:05');
  });
});

describe('parseFormattedLines', () => {
  it('splits bold spans and strips bullet markers', () => {
    expect(parseFormattedLines('Ride **hard** today\n- rest\n* **easy** spin')).toEqual([
      { bullet: false, segments: [{ bold: false, text: 'Ride ' }, { bold: true, text: 'hard' }, { bold: false, text: ' today' }] },
      { bullet: true, segments: [{ bold: false, text: 'rest' }] },
      { bullet: true, segments: [{ bold: true, text: 'easy' }, { bold: false, text: ' spin' }] },
    ]);
  });

  it('keeps an empty message as one empty line and leaves a lone ** pair as text', () => {
    expect(parseFormattedLines('')).toEqual([{ bullet: false, segments: [] }]);
    expect(parseFormattedLines('****')).toEqual([{ bullet: false, segments: [{ bold: false, text: '****' }] }]);
  });
});

describe('suggestion builders', () => {
  it('translates the shared welcome keys to English labels', () => {
    expect(buildWelcomeSuggestions().map((s) => s.label)).toEqual([
      'Training progress',
      'Set a new goal',
      'Analyze last ride',
      'Plan my week',
    ]);
  });

  it('attaches the long prompt only to the total-stats chip', () => {
    const chips = buildQuickStartSuggestions();
    const totals = chips.find((c) => c.label === 'Total stats');
    expect(totals.prompt).toBe(t('coach.suggestTotalStatsPrompt'));
    expect(chips.filter((c) => c.prompt)).toHaveLength(1);
  });

  it('hides the app-only connect_health action chip', () => {
    expect(
      visibleSuggestions([{ label: 'Connect Apple Health', action: 'connect_health' }, { label: 'Plan my week' }]),
    ).toEqual([{ label: 'Plan my week' }]);
    expect(visibleSuggestions(undefined)).toEqual([]);
  });
});

describe('buildEntryHiddenContext', () => {
  it('prefers the activity over the calendar event and returns undefined for neither', () => {
    expect(buildEntryHiddenContext({ activityId: '12', eventId: '3' })).toBe('activity_id: 12');
    expect(buildEntryHiddenContext({ eventId: '3' })).toBe('calendar_event_id: 3');
    expect(buildEntryHiddenContext({})).toBeUndefined();
  });
});

describe('toAttachedActivity', () => {
  it('keeps only the fields the serializer needs', () => {
    const attached = toAttachedActivity({
      id: 1,
      name: 'Hills',
      type: 'Ride',
      start_date: '2026-10-10T08:00:00Z',
      distance: 42000,
      moving_time: 5400,
      total_elevation_gain: 800,
      average_heartrate: 150,
      map: { polyline: 'xyz' },
    });
    expect(attached).toEqual({
      id: 1,
      name: 'Hills',
      type: 'Ride',
      start_date: '2026-10-10T08:00:00Z',
      distance: 42000,
      moving_time: 5400,
      total_elevation_gain: 800,
      average_heartrate: 150,
      average_watts: undefined,
    });
  });
});

describe('mapPersistedMessages', () => {
  it('marks stored tool calls done and normalises dates', () => {
    const [msg] = mapPersistedMessages([
      {
        id: 'm1',
        role: 'assistant',
        content: 'Done',
        tool_calls: [{ name: 'create_goal', result: { ok: true } }],
        suggestions: [{ label: 'Next' }],
        created_at: new Date('2026-10-10T08:00:00Z'),
      },
    ]);
    expect(msg).toEqual({
      id: 'm1',
      role: 'assistant',
      content: 'Done',
      toolCalls: [{ name: 'create_goal', result: { ok: true }, args: {}, status: 'done' }],
      suggestions: [{ label: 'Next' }],
      createdAt: '2026-10-10T08:00:00.000Z',
    });
  });

  it('leaves toolCalls/suggestions undefined when the row has none', () => {
    const [msg] = mapPersistedMessages([
      { id: 'm2', role: 'user', content: 'Hi', tool_calls: null, suggestions: null, created_at: '2026-10-10T08:00:00Z' },
    ]);
    expect(msg.toolCalls).toBeUndefined();
    expect(msg.suggestions).toBeUndefined();
  });
});

describe('copy.t', () => {
  it('interpolates {{vars}} and echoes unknown keys', () => {
    expect(t('coach.attachLimitMessage', { max: 5 })).toBe('You can attach up to 5 activities at once.');
    expect(t('coach.nope')).toBe('coach.nope');
  });
});
