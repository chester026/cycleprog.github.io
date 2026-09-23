import { describe, expect, it } from 'vitest';
import { CoachNoteCreateSchema, CoachNoteSchema, CoachNoteUpdateSchema, COACH_NOTE_MAX_LENGTH } from './coachNotes.js';

describe('coach notes schemas', () => {
  it('accepts a server row (pg Date timestamps)', () => {
    const r = CoachNoteSchema.safeParse({ id: 1, note: 'Prefers morning rides', category: 'preference', source: 'coach', created_at: new Date(), updated_at: new Date() });
    expect(r.success).toBe(true);
  });
  it('rejects an over-long or empty note and an unknown category', () => {
    expect(CoachNoteCreateSchema.safeParse({ note: 'x'.repeat(COACH_NOTE_MAX_LENGTH + 1) }).success).toBe(false);
    expect(CoachNoteCreateSchema.safeParse({ note: '   ' }).success).toBe(false);
    expect(CoachNoteCreateSchema.safeParse({ note: 'ok', category: 'mood' }).success).toBe(false);
  });
  it('update needs at least one field', () => {
    expect(CoachNoteUpdateSchema.safeParse({}).success).toBe(false);
    expect(CoachNoteUpdateSchema.safeParse({ category: 'health' }).success).toBe(true);
  });
});
