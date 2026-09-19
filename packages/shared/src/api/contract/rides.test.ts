import { describe, expect, it } from 'vitest';
import { rides } from './rides.js';

describe('rides contract', () => {
  it('list accepts a real rides row with Date timestamps', () => {
    const result = rides.list.response.safeParse([
      {
        id: 1,
        user_id: 42,
        title: 'Sunday club ride',
        location: 'Stockholm',
        location_link: null,
        details: null,
        start: new Date('2026-09-01T08:00:00Z'),
        created_at: new Date('2026-08-20T00:00:00Z'),
      },
    ]);
    expect(result.success).toBe(true);
  });

  it('create body tolerates a partial payload (no server-side required-field check)', () => {
    const result = rides.create.body!.safeParse({ title: 'Solo spin' });
    expect(result.success).toBe(true);
  });

  it('import body accepts an array of ride-like objects', () => {
    const result = rides.import.body!.safeParse([
      { title: 'Imported ride', start: '2026-09-01T08:00:00Z' },
    ]);
    expect(result.success).toBe(true);
  });

  it('import body rejects a non-array (the route\'s own 400 case)', () => {
    const result = rides.import.body!.safeParse({ title: 'not an array' });
    expect(result.success).toBe(false);
  });
});
