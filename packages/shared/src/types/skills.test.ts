import { describe, expect, it } from 'vitest';
import { SkillsSnapshotSchema, SkillsHistoryCreateSchema } from './skills.js';

describe('SkillsSnapshotSchema', () => {
  it('parses a realistic skills_history row', () => {
    const parsed = SkillsSnapshotSchema.parse({
      id: 1,
      user_id: 42,
      snapshot_date: '2026-09-01',
      climbing: 62,
      sprint: 48,
      endurance: 71,
      tempo: 55,
      power: 60,
      consistency: 80,
      last_activity_id: 123456,
    });
    expect(parsed.climbing).toBe(62);
  });
});

describe('SkillsHistoryCreateSchema', () => {
  it('accepts a valid 0-100 skills payload', () => {
    const parsed = SkillsHistoryCreateSchema.parse({
      climbing: 62,
      sprint: 48,
      endurance: 71,
      tempo: 55,
      power: 60,
      consistency: 80,
      last_activity_id: 123456,
    });
    expect(parsed.consistency).toBe(80);
  });

  it('rejects an out-of-range skill value', () => {
    const result = SkillsHistoryCreateSchema.safeParse({
      climbing: 150,
      sprint: 48,
      endurance: 71,
      tempo: 55,
      power: 60,
      consistency: 80,
    });
    expect(result.success).toBe(false);
  });
});
