import { describe, expect, it } from 'vitest';
import {
  buildIcsCalendar,
  buildIcsEventTimes,
  escapeIcsText,
  foldIcsLine,
  formatIcsUtc,
  icsFileName,
  type IcsEvent,
} from './ics.js';

const NOW = new Date('2026-10-16T09:05:07.123Z');

function event(overrides: Partial<IcsEvent> = {}): IcsEvent {
  return { id: 42, title: 'Tempo ride', start_date: '2026-10-20', ...overrides };
}

function lines(ics: string): string[] {
  return ics.split('\r\n');
}

describe('escapeIcsText', () => {
  it('escapes backslash, semicolon, comma and both newline styles', () => {
    expect(escapeIcsText('a\\b; c, d\ne\r\nf')).toBe('a\\\\b\\; c\\, d\\ne\\nf');
  });
});

describe('formatIcsUtc', () => {
  it('writes a UTC stamp with a Z suffix, zero-padded', () => {
    expect(formatIcsUtc(new Date('2026-01-05T03:04:09Z'))).toBe('20260105T030409Z');
  });
});

describe('foldIcsLine', () => {
  it('leaves a short line alone', () => {
    expect(foldIcsLine('SUMMARY:Short')).toBe('SUMMARY:Short');
  });

  it('folds at 75 octets with a leading space on continuation lines', () => {
    const folded = foldIcsLine(`DESCRIPTION:${'x'.repeat(100)}`);
    const parts = folded.split('\r\n');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toHaveLength(75);
    expect(parts[1].startsWith(' ')).toBe(true);
    // 12 chars of "DESCRIPTION:" + 100 x's = 112 octets: 75 on the first line, the rest after a space.
    expect(parts[1]).toHaveLength(1 + 112 - 75);
    expect(parts[0].slice(12) + parts[1].slice(1)).toBe('x'.repeat(100));
  });

  it('counts UTF-8 octets, so a multi-byte line folds earlier than its character count', () => {
    // 'é' is 2 octets: 40 of them = 80 octets → must fold before 75.
    const folded = foldIcsLine(`SUMMARY:${'é'.repeat(40)}`);
    const parts = folded.split('\r\n');
    expect(parts).toHaveLength(2);
    expect(Buffer.byteLength(parts[0], 'utf8')).toBeLessThanOrEqual(75);
    // A 4-octet emoji is counted as one char but 4 octets.
    const emoji = foldIcsLine(`SUMMARY:${'🚴'.repeat(20)}`);
    for (const part of emoji.split('\r\n')) expect(Buffer.byteLength(part, 'utf8')).toBeLessThanOrEqual(75);
  });
});

describe('buildIcsEventTimes', () => {
  it('writes an all-day event with the RFC exclusive DTEND (next day)', () => {
    expect(buildIcsEventTimes(event())).toEqual(['DTSTART;VALUE=DATE:20261020', 'DTEND;VALUE=DATE:20261021']);
  });

  it('spans a multi-day all-day event through the day after end_date', () => {
    expect(buildIcsEventTimes(event({ start_date: '2026-10-30', end_date: '2026-11-01' }))).toEqual([
      'DTSTART;VALUE=DATE:20261030',
      'DTEND;VALUE=DATE:20261102',
    ]);
  });

  it('ignores a time part on start_date and an unparsable end_date', () => {
    expect(buildIcsEventTimes(event({ start_date: '2026-12-31T07:00:00Z', end_date: 'soon' }))).toEqual([
      'DTSTART;VALUE=DATE:20261231',
      'DTEND;VALUE=DATE:20270101',
    ]);
  });

  it('uses start_time/end_time as floating local times', () => {
    expect(buildIcsEventTimes(event({ start_time: '07:00:00', end_time: '08:30' }))).toEqual([
      'DTSTART:20261020T070000',
      'DTEND:20261020T083000',
    ]);
  });

  it('ends a timed event after duration_minutes when end_time is missing', () => {
    expect(buildIcsEventTimes(event({ start_time: '07:00', duration_minutes: 90 }))).toEqual([
      'DTSTART:20261020T070000',
      'DTEND:20261020T083000',
    ]);
  });

  it('defaults a timed event without end_time or a positive duration to one hour', () => {
    expect(buildIcsEventTimes(event({ start_time: '18:15' }))[1]).toBe('DTEND:20261020T191500');
    expect(buildIcsEventTimes(event({ start_time: '18:15', duration_minutes: 0 }))[1]).toBe('DTEND:20261020T191500');
  });

  it('rolls a duration past midnight onto the next day', () => {
    expect(buildIcsEventTimes(event({ start_time: '23:30', duration_minutes: 60 }))).toEqual([
      'DTSTART:20261020T233000',
      'DTEND:20261021T003000',
    ]);
  });

  it('puts end_time of a multi-day timed event on end_date', () => {
    expect(buildIcsEventTimes(event({ end_date: '2026-10-22', start_time: '09:00', end_time: '12:00' }))).toEqual([
      'DTSTART:20261020T090000',
      'DTEND:20261022T120000',
    ]);
  });

  it('treats a malformed start_time as all-day and returns null for a malformed start_date', () => {
    expect(buildIcsEventTimes(event({ start_time: 'morning' }))[0]).toBe('DTSTART;VALUE=DATE:20261020');
    expect(buildIcsEventTimes(event({ start_date: 'next week' }))).toBeNull();
  });
});

describe('buildIcsCalendar', () => {
  it('wraps one VEVENT per event with UID, UTC DTSTAMP and escaped text fields', () => {
    const ics = buildIcsCalendar(
      [
        event({ description: 'Hills; then coffee, 2x', location: 'Troodos' }),
        event({ id: 'abc', title: 'Rest', start_date: '2026-10-21' }),
      ],
      { now: NOW },
    );
    expect(lines(ics)).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//BikeLab//Coach//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:42@bikelab.app',
      'DTSTAMP:20261016T090507Z',
      'DTSTART;VALUE=DATE:20261020',
      'DTEND;VALUE=DATE:20261021',
      'SUMMARY:Tempo ride',
      'DESCRIPTION:Hills\\; then coffee\\, 2x',
      'LOCATION:Troodos',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:abc@bikelab.app',
      'DTSTAMP:20261016T090507Z',
      'DTSTART;VALUE=DATE:20261021',
      'DTEND;VALUE=DATE:20261022',
      'SUMMARY:Rest',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ]);
  });

  it('honours prodId/uidDomain, skips an event without a valid date and stamps with the current time by default', () => {
    const before = Date.now();
    const ics = buildIcsCalendar([event({ start_date: 'bad' }), event()], { prodId: '-//Test//EN', uidDomain: 'test.local' });
    expect(ics).toContain('PRODID:-//Test//EN');
    expect(ics).toContain('UID:42@test.local');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    const stamp = /DTSTAMP:(\d{8}T\d{6})Z/.exec(ics)?.[1] ?? '';
    const stampMs = Date.parse(
      `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`,
    );
    expect(stampMs).toBeGreaterThanOrEqual(before - 1000);
  });

  it('folds long content lines', () => {
    const ics = buildIcsCalendar([event({ description: 'd'.repeat(200) })], { now: NOW });
    for (const line of lines(ics)) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
  });
});

describe('icsFileName', () => {
  it('slugs a single event title and falls back for several or an empty title', () => {
    expect(icsFileName([event({ title: 'Tempo ride — Troodos!' })])).toBe('tempo-ride-troodos.ics');
    expect(icsFileName([event(), event({ id: 2 })])).toBe('bikelab-plan.ics');
    expect(icsFileName([event({ title: '***' })])).toBe('bikelab-event.ics');
  });
});
