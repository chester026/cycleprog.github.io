import React, { useState } from 'react';
import { COACH_NOTE_CATEGORIES, COACH_NOTE_MAX_LENGTH, COACH_NOTES_MAX } from '@bikelab/shared/types';
import { useCoachNotes, useCreateCoachNote, useUpdateCoachNote, useDeleteCoachNote } from '../../data/hooks';
import { useConfirm, useToast, ErrorMessage, Loader } from '../../ui';
import styles from './CoachMemoryCard.module.css';

const CATEGORY_LABELS = {
  preference: 'Preference',
  health: 'Health',
  constraint: 'Constraint',
  equipment: 'Equipment',
  goal: 'Goal',
  other: 'Other',
};

/**
 * ProfilePage's "coach memory" section: the short facts (`coach.notes`,
 * `types/coachNotes.ts`) the AI coach remembered about the rider in chat,
 * plus any the rider typed in here directly — both read/edited/deleted
 * through the same list so there is one place to see and prune all of it.
 */
export default function CoachMemoryCard() {
  const { data: notes, isLoading, error } = useCoachNotes();
  const createNote = useCreateCoachNote();
  const updateNote = useUpdateCoachNote();
  const deleteNote = useDeleteCoachNote();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();

  const [draft, setDraft] = useState('');
  const [draftCategory, setDraftCategory] = useState('other');
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');

  const list = notes ?? [];
  const atLimit = list.length >= COACH_NOTES_MAX;

  const handleAdd = async (e) => {
    e.preventDefault();
    const note = draft.trim();
    if (!note || atLimit) return;
    try {
      await createNote.mutateAsync({ note, category: draftCategory });
      setDraft('');
      setDraftCategory('other');
    } catch {
      toast.error('Failed to save note. Please try again.');
    }
  };

  const startEdit = (n) => {
    setEditingId(n.id);
    setEditingText(n.note);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText('');
  };

  const saveEdit = async (id) => {
    const note = editingText.trim();
    if (!note) {
      cancelEdit();
      return;
    }
    try {
      await updateNote.mutateAsync({ id, body: { note } });
      cancelEdit();
    } catch {
      toast.error('Failed to update note. Please try again.');
    }
  };

  const handleDelete = async (n) => {
    const ok = await confirm({
      title: 'Delete note',
      message: `Remove this note from what your coach remembers?\n\n"${n.note}"`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteNote.mutateAsync(n.id);
    } catch {
      toast.error('Failed to delete note. Please try again.');
    }
  };

  return (
    <div className="profile-section">
      <h2>
        What your coach remembers <span className={styles.counter}>{list.length}/{COACH_NOTES_MAX}</span>
      </h2>

      {confirmDialog}

      {isLoading && <Loader />}
      {error && <ErrorMessage>Failed to load coach notes.</ErrorMessage>}

      {!isLoading && !error && (
        <>
          {list.length === 0 ? (
            <p className={styles.empty}>Your coach hasn't remembered anything about you yet.</p>
          ) : (
            <ul className={styles.list}>
              {list.map((n) => (
                <li key={n.id} className={styles.item}>
                  <span className={styles.pill}>{CATEGORY_LABELS[n.category] ?? n.category}</span>

                  {editingId === n.id ? (
                    <input
                      className={styles.editInput}
                      ref={(el) => el?.focus()}
                      value={editingText}
                      maxLength={COACH_NOTE_MAX_LENGTH}
                      aria-label="Edit note"
                      onChange={(e) => setEditingText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(n.id);
                        if (e.key === 'Escape') cancelEdit();
                      }}
                    />
                  ) : (
                    <button type="button" className={styles.noteText} onClick={() => startEdit(n)}>
                      {n.note}
                    </button>
                  )}

                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={() => handleDelete(n)}
                    aria-label="Delete note"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <form className={styles.addForm} onSubmit={handleAdd}>
        <div className={styles.addField}>
          <label htmlFor="coach-note-input">Add note</label>
          <input
            id="coach-note-input"
            type="text"
            value={draft}
            maxLength={COACH_NOTE_MAX_LENGTH}
            placeholder="Prefers morning rides, knee hurts on long climbs…"
            disabled={atLimit}
            onChange={(e) => setDraft(e.target.value)}
          />
          <span className={styles.charCount}>
            {draft.length}/{COACH_NOTE_MAX_LENGTH}
          </span>
        </div>

        <div className={styles.addField}>
          <label htmlFor="coach-note-category">Category</label>
          <select
            id="coach-note-category"
            value={draftCategory}
            disabled={atLimit}
            onChange={(e) => setDraftCategory(e.target.value)}
          >
            {COACH_NOTE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="accent-btn" disabled={!draft.trim() || atLimit || createNote.isPending}>
          Add note
        </button>
      </form>

      {atLimit && <p className={styles.limitHint}>Limit reached — delete a note to add another.</p>}
    </div>
  );
}
