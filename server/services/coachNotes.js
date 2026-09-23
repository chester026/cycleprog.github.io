// Coach memory business logic — the cap/ownership rules above the raw SQL
// in repositories/coachNotes.js. Used by GET/POST/PUT/DELETE /api/coach/notes
// (routes/coach.js), where the rider reads/edits/prunes their own notes.
//
// The coach's own remember_about_rider tool (aiCoach.js) does NOT call
// createNote here: at the cap, a rider adding a note by hand should just be
// told no (409 COACH_NOTES_LIMIT) so they can delete one first, but the
// coach mid-conversation needs to dedupe/merge/pick-one-to-replace instead
// of hard-failing — so that tool talks to repositories/coachNotes.js
// directly and implements its own cap handling (see aiCoach.js's
// remember_about_rider for why).
const { COACH_NOTES_MAX } = require('@bikelab/shared/types');
const { ApiError, notFound } = require('../lib/apiError');
const coachNotesRepo = require('../repositories/coachNotes');

async function listNotes(userId) {
  return coachNotesRepo.listNotes(userId);
}

async function createNote(userId, { note, category }) {
  const existing = await coachNotesRepo.listNotes(userId);
  if (existing.length >= COACH_NOTES_MAX) {
    throw new ApiError(409, 'COACH_NOTES_LIMIT', `Coach notes limit reached (max ${COACH_NOTES_MAX}) — delete one first.`);
  }
  return coachNotesRepo.createNote(userId, { note, category, source: 'user' });
}

async function updateNote(id, userId, patch) {
  const row = await coachNotesRepo.updateNote(id, userId, patch);
  if (!row) throw notFound('NOTE_NOT_FOUND', 'Coach note not found');
  return row;
}

async function deleteNote(id, userId) {
  const row = await coachNotesRepo.deleteNote(id, userId);
  if (!row) throw notFound('NOTE_NOT_FOUND', 'Coach note not found');
  return true;
}

module.exports = { listNotes, createNote, updateNote, deleteNote };
