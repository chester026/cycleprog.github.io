import { describe, expect, it } from 'vitest';
import { checklist } from './checklist.js';

describe('checklist contract', () => {
  it('list: response accepts a real GET /api/checklist array', () => {
    const r = checklist.list.response.safeParse([
      { id: 1, user_id: 1, section: 'Tools', item: 'Pump', checked: false, link: null, created_at: new Date() },
    ]);
    expect(r.success).toBe(true);
  });

  it('create: body requires section and item', () => {
    expect(checklist.create.body.safeParse({ item: 'Pump' }).success).toBe(false);
    expect(checklist.create.body.safeParse({ section: 'Tools', item: 'Pump' }).success).toBe(true);
  });

  it('update: body accepts either checked or link', () => {
    expect(checklist.update.body.safeParse({ checked: true }).success).toBe(true);
    expect(checklist.update.body.safeParse({ link: 'https://example.com' }).success).toBe(true);
  });

  it('removeSection: response accepts { success, deletedCount }', () => {
    expect(checklist.removeSection.response.safeParse({ success: true, deletedCount: 3 }).success).toBe(true);
  });
});
