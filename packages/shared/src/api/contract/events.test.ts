import { describe, expect, it } from 'vitest';
import { events } from './events.js';

describe('events contract', () => {
  it('list accepts a real events row', () => {
    const result = events.list.response.safeParse([
      {
        id: 1,
        user_id: 42,
        title: 'Club meetup',
        description: null,
        link: null,
        start_date: '2026-09-10',
        background_color: '#274DD3',
        created_at: new Date('2026-08-01T00:00:00Z'),
        updated_at: new Date('2026-08-01T00:00:00Z'),
      },
    ]);
    expect(result.success).toBe(true);
  });

  it('remove response wraps the deleted row', () => {
    const result = events.remove.response.safeParse({
      message: 'Event deleted successfully',
      event: {
        id: 1,
        title: 'Club meetup',
        start_date: '2026-09-10',
      },
    });
    expect(result.success).toBe(true);
  });

  it('create body rejects an invalid background_color', () => {
    const result = events.create.body!.safeParse({ title: 'Meetup', start_date: '2026-09-10', background_color: 'blue' });
    expect(result.success).toBe(false);
  });
});
