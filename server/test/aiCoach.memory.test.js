// Unit tests for the coach-memory tools (remember_about_rider/
// forget_about_rider/get_rider_notes) and update_rider_profile, with
// repositories/coachNotes.js, services/userProfile.js and recommendations'
// updateUserProfile stubbed — no real DB connection. Following this repo's
// convention (see test/aiCoach.checklist.test.js): stub a property on the
// already-`require`d module BEFORE requiring aiCoach.js, since Node's
// require cache means aiCoach.js sees the same object as long as it reads
// via property access rather than a destructured copy taken before the
// override.
//
// Real-Postgres end-to-end coverage of GET/POST/PUT/DELETE /api/coach/notes
// (CRUD, ownership, the 30-note cap, the 160-char limit) lives in
// test/integration/coachNotes.test.js per the "SQL changes need real-PG
// integration tests" rule.
const coachNotesRepo = require('../repositories/coachNotes');
const listNotesMock = vi.fn();
const createNoteMock = vi.fn();
const updateNoteMock = vi.fn();
const deleteNoteMock = vi.fn();
coachNotesRepo.listNotes = listNotesMock;
coachNotesRepo.createNote = createNoteMock;
coachNotesRepo.updateNote = updateNoteMock;
coachNotesRepo.deleteNote = deleteNoteMock;

const { ApiError } = require('../lib/apiError');
const userProfileService = require('../services/userProfile');
const validateProfileFieldsMock = vi.fn();
userProfileService.validateProfileFields = validateProfileFieldsMock;

const recommendations = require('../recommendations');
const updateUserProfileMock = vi.fn();
recommendations.updateUserProfile = updateUserProfileMock;

const createCoachModule = require('../aiCoach');

describe('aiCoach memory tools', () => {
  let executeTool;
  const userId = 42;

  beforeEach(() => {
    vi.clearAllMocks();
    validateProfileFieldsMock.mockImplementation(() => {}); // passes by default
    const coach = createCoachModule({
      pool: { query: vi.fn() },
      activitiesCache: { get: vi.fn() },
      bikesCache: { get: vi.fn() },
      getBikeComponents: () => [],
    });
    executeTool = coach.executeTool;
  });

  describe('remember_about_rider', () => {
    it('stores a new note under the given category, defaulting source to coach', async () => {
      listNotesMock.mockResolvedValue([]);
      createNoteMock.mockResolvedValue({ id: 1, note: 'Prefers morning rides', category: 'preference', source: 'coach' });

      const result = await executeTool('remember_about_rider', { note: 'Prefers morning rides', category: 'preference' }, { userId });

      expect(createNoteMock).toHaveBeenCalledWith(userId, { note: 'Prefers morning rides', category: 'preference', source: 'coach' });
      expect(result).toEqual({ note: { id: 1, note: 'Prefers morning rides', category: 'preference' } });
    });

    it('defaults to category "other" when none or an invalid one is given', async () => {
      listNotesMock.mockResolvedValue([]);
      createNoteMock.mockResolvedValue({ id: 2, note: 'Trains indoors Nov-Mar', category: 'other', source: 'coach' });

      await executeTool('remember_about_rider', { note: 'Trains indoors Nov-Mar', category: 'not_a_real_category' }, { userId });

      expect(createNoteMock).toHaveBeenCalledWith(userId, { note: 'Trains indoors Nov-Mar', category: 'other', source: 'coach' });
    });

    it('rejects a note over 160 characters without touching the repo', async () => {
      const tooLong = 'x'.repeat(161);
      const result = await executeTool('remember_about_rider', { note: tooLong }, { userId });
      expect(result.error).toMatch(/160 characters/);
      expect(createNoteMock).not.toHaveBeenCalled();
    });

    it('requires a non-empty note', async () => {
      const result = await executeTool('remember_about_rider', { note: '   ' }, { userId });
      expect(result.error).toMatch(/note is required/);
      expect(createNoteMock).not.toHaveBeenCalled();
    });

    it('dedupes against an existing note (case/whitespace-insensitive) instead of creating a near-duplicate', async () => {
      listNotesMock.mockResolvedValue([{ id: 3, note: 'Prefers morning rides', category: 'preference' }]);

      const result = await executeTool('remember_about_rider', { note: '  prefers   MORNING rides ' }, { userId });

      expect(createNoteMock).not.toHaveBeenCalled();
      expect(result).toEqual({ note: { id: 3, note: 'Prefers morning rides', category: 'preference' }, deduped: true });
    });

    it('updates the note in place when replaces_id is given, instead of creating a new one', async () => {
      updateNoteMock.mockResolvedValue({ id: 5, note: 'Left knee hurts on steep climbs now', category: 'health' });

      const result = await executeTool(
        'remember_about_rider',
        { note: 'Left knee hurts on steep climbs now', category: 'health', replaces_id: 5 },
        { userId }
      );

      expect(updateNoteMock).toHaveBeenCalledWith(5, userId, { note: 'Left knee hurts on steep climbs now', category: 'health' });
      expect(createNoteMock).not.toHaveBeenCalled();
      expect(result).toEqual({ note: { id: 5, note: 'Left knee hurts on steep climbs now', category: 'health' } });
    });

    it('reports not_found when replaces_id does not match one of the caller\'s notes', async () => {
      updateNoteMock.mockResolvedValue(null);
      const result = await executeTool('remember_about_rider', { note: 'Something', replaces_id: 999 }, { userId });
      expect(result.error).toBe('not_found');
    });

    it('returns {error: "limit", notes} instead of creating past the cap, so the model can pick one to replace', async () => {
      const existing = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, note: `Note ${i + 1}`, category: 'other' }));
      listNotesMock.mockResolvedValue(existing);

      const result = await executeTool('remember_about_rider', { note: 'One more fact' }, { userId });

      expect(createNoteMock).not.toHaveBeenCalled();
      expect(result.error).toBe('limit');
      expect(result.notes).toHaveLength(30);
      expect(result.notes[0]).toEqual({ id: 1, note: 'Note 1', category: 'other' });
    });
  });

  describe('forget_about_rider', () => {
    it('deletes the note and returns its id and text', async () => {
      deleteNoteMock.mockResolvedValue({ id: 7, note: 'Prefers morning rides' });
      const result = await executeTool('forget_about_rider', { id: 7 }, { userId });
      expect(deleteNoteMock).toHaveBeenCalledWith(7, userId);
      expect(result).toEqual({ deleted: true, id: 7, note: 'Prefers morning rides' });
    });

    it('reports not_found instead of throwing when the note is missing or not the caller\'s', async () => {
      deleteNoteMock.mockResolvedValue(null);
      const result = await executeTool('forget_about_rider', { id: 999 }, { userId });
      expect(result).toEqual({ error: 'not_found', message: 'No note with that id.' });
    });

    it('requires an id', async () => {
      const result = await executeTool('forget_about_rider', {}, { userId });
      expect(result.error).toMatch(/id is required/);
      expect(deleteNoteMock).not.toHaveBeenCalled();
    });
  });

  describe('get_rider_notes', () => {
    it('lists the caller\'s notes, trimmed to id/note/category', async () => {
      listNotesMock.mockResolvedValue([
        { id: 1, note: 'Prefers morning rides', category: 'preference', source: 'coach', user_id: userId, created_at: '2026-01-01' },
      ]);
      const result = await executeTool('get_rider_notes', {}, { userId });
      expect(listNotesMock).toHaveBeenCalledWith(userId);
      expect(result).toEqual({ notes: [{ id: 1, note: 'Prefers morning rides', category: 'preference' }] });
    });
  });

  describe('update_rider_profile', () => {
    it('validates then writes only the whitelisted fields, and returns a compact summary', async () => {
      updateUserProfileMock.mockResolvedValue({
        weight: 72, height: 180, birth_date: '1995-06-15', gender: 'male',
        max_hr: 188, resting_hr: 52, lactate_threshold: 165, experience_level: 'advanced', bike_weight: 8,
        // fields NOT in the whitelist that must never leak through:
        name: 'Should not appear', onboarding_completed: true,
      });

      const result = await executeTool('update_rider_profile', { weight: 72, birth_date: '1995-06-15' }, { userId });

      expect(validateProfileFieldsMock).toHaveBeenCalledWith({ weight: 72, birth_date: '1995-06-15' });
      expect(updateUserProfileMock).toHaveBeenCalledWith({ query: expect.any(Function) }, userId, { weight: 72, birth_date: '1995-06-15' });
      expect(result).toEqual({
        weight: 72, height: 180, birth_date: '1995-06-15',
        age: expect.any(Number), // derived from birth_date, not asserted exactly here
        gender: 'male', max_hr: 188, resting_hr: 52, lactate_threshold: 165,
        experience_level: 'advanced', bike_weight: 8,
      });
    });

    it('ignores fields outside the whitelist entirely (never reaches validation or the write)', async () => {
      updateUserProfileMock.mockResolvedValue({ weight: 70 });
      await executeTool('update_rider_profile', { weight: 70, name: 'Hacker', is_admin: true }, { userId });
      expect(validateProfileFieldsMock).toHaveBeenCalledWith({ weight: 70 });
      expect(updateUserProfileMock).toHaveBeenCalledWith(expect.anything(), userId, { weight: 70 });
    });

    it('requires at least one whitelisted field', async () => {
      const result = await executeTool('update_rider_profile', {}, { userId });
      expect(result.error).toMatch(/at least one field/);
      expect(validateProfileFieldsMock).not.toHaveBeenCalled();
      expect(updateUserProfileMock).not.toHaveBeenCalled();
    });

    it('returns the validation error instead of writing when a field is out of range', async () => {
      validateProfileFieldsMock.mockImplementation(() => {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Weight must be between 30 and 200 kg');
      });

      const result = await executeTool('update_rider_profile', { weight: 1000 }, { userId });

      expect(result).toEqual({ error: 'Weight must be between 30 and 200 kg' });
      expect(updateUserProfileMock).not.toHaveBeenCalled();
    });
  });
});
