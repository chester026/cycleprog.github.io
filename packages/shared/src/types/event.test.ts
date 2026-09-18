import { describe, expect, it } from 'vitest';
import { EventSchema, EventCreateSchema } from './event.js';

describe('EventSchema', () => {
  it('parses a realistic GET /api/events item', () => {
    const parsed = EventSchema.parse({
      id: 1,
      user_id: 42,
      title: 'Gran Fondo Cyprus',
      description: 'Annual event',
      link: 'https://example.com',
      start_date: '2026-10-01',
      background_color: '#274DD3',
    });
    expect(parsed.background_color).toBe('#274DD3');
  });
});

describe('EventCreateSchema', () => {
  it('accepts a valid create body', () => {
    const parsed = EventCreateSchema.parse({ title: 'x', start_date: '2026-10-01' });
    expect(parsed.title).toBe('x');
  });

  it('rejects an invalid background_color format', () => {
    const result = EventCreateSchema.safeParse({
      title: 'x',
      start_date: '2026-10-01',
      background_color: 'blue',
    });
    expect(result.success).toBe(false);
  });
});
