import { describe, expect, it } from 'vitest';
import {
  ChecklistItemSchema,
  ChecklistItemCreateSchema,
  ChecklistItemUpdateSchema,
} from './checklist.js';

describe('ChecklistItemSchema', () => {
  it('parses a realistic GET /api/checklist item', () => {
    const parsed = ChecklistItemSchema.parse({
      id: 1,
      user_id: 42,
      section: 'Bike setup',
      item: 'Check tire pressure',
      checked: true,
      link: null,
    });
    expect(parsed.item).toBe('Check tire pressure');
  });
});

describe('ChecklistItemCreateSchema / UpdateSchema', () => {
  it('accepts a valid create body', () => {
    const parsed = ChecklistItemCreateSchema.parse({ section: 'Bike setup', item: 'x' });
    expect(parsed.section).toBe('Bike setup');
  });

  it('accepts a link-only update', () => {
    const parsed = ChecklistItemUpdateSchema.parse({ link: 'https://example.com' });
    expect(parsed.link).toBe('https://example.com');
  });

  it('rejects a missing item on create', () => {
    const result = ChecklistItemCreateSchema.safeParse({ section: 'Bike setup' });
    expect(result.success).toBe(false);
  });
});
