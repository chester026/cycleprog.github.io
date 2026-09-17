import { describe, expect, it } from 'vitest';
import {
  CalendarEventSchema,
  CalendarEventCreateSchema,
  CalendarEventUpdateSchema,
} from './calendar.js';

describe('CalendarEventSchema', () => {
  it('parses a realistic GET /api/calendar item (with joined goal_title)', () => {
    const event = {
      id: 5,
      user_id: 42,
      type: 'planned_ride',
      title: 'Long ride',
      description: null,
      location: null,
      location_link: null,
      start_date: '2026-09-20',
      end_date: null,
      all_day: true,
      start_time: null,
      end_time: null,
      completed: false,
      source: 'user',
      goal_id: 7,
      goal_title: 'Sub-3h century',
      apple_event_id: null,
      migrated_from_ride_id: null,
    };
    const parsed = CalendarEventSchema.parse(event);
    expect(parsed.goal_title).toBe('Sub-3h century');
  });

  it('rejects an invalid type enum', () => {
    const result = CalendarEventSchema.safeParse({
      id: 1,
      type: 'not_a_type',
      title: 'x',
      start_date: '2026-09-20',
    });
    expect(result.success).toBe(false);
  });
});

describe('CalendarEventCreateSchema / UpdateSchema', () => {
  it('accepts the minimal required create body', () => {
    const parsed = CalendarEventCreateSchema.parse({ title: 'Rest day', start_date: '2026-09-21' });
    expect(parsed.title).toBe('Rest day');
  });

  it('accepts a partial update', () => {
    const parsed = CalendarEventUpdateSchema.parse({ completed: true });
    expect(parsed.completed).toBe(true);
  });

  it('rejects a missing title on create', () => {
    const result = CalendarEventCreateSchema.safeParse({ start_date: '2026-09-21' });
    expect(result.success).toBe(false);
  });
});
