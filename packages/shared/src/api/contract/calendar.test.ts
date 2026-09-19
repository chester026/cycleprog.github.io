import { describe, expect, it } from 'vitest';
import { calendar } from './calendar.js';

describe('calendar contract', () => {
  it('list accepts a real calendar_events row (LEFT JOINed goal_title)', () => {
    const result = calendar.list.response.safeParse([
      {
        id: 1,
        user_id: 42,
        type: 'planned_ride',
        title: 'Long ride',
        description: null,
        location: null,
        location_link: null,
        start_date: '2026-09-05',
        end_date: null,
        all_day: true,
        start_time: null,
        end_time: null,
        completed: false,
        source: 'user',
        goal_id: 7,
        goal_title: 'Ride 1000km this year',
        apple_event_id: null,
        migrated_from_ride_id: null,
        created_at: new Date('2026-08-01T00:00:00Z'),
        updated_at: new Date('2026-08-01T00:00:00Z'),
      },
    ]);
    expect(result.success).toBe(true);
  });

  it('create body requires title and start_date', () => {
    expect(calendar.create.body!.safeParse({ title: 'Rest day', start_date: '2026-09-06' }).success).toBe(true);
    expect(calendar.create.body!.safeParse({ title: 'Rest day' }).success).toBe(false);
  });

  it('update body allows every field to be omitted (server whitelists present keys only)', () => {
    expect(calendar.update.body!.safeParse({}).success).toBe(true);
  });
});
