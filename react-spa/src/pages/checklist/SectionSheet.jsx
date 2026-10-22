// Section rename/delete sheet, opened from a column header's pencil. The
// page mounts it with `key={section.section}` so the draft re-seeds per
// section without an effect.
import React, { useState } from 'react';
import { Sheet } from '../../ui';
import styles from './sheets.module.css';

export default function SectionSheet({ section, saving, onClose, onSave, onDelete }) {
  const [name, setName] = useState(section?.section ?? '');
  const trimmed = name.trim();

  const submit = (e) => {
    e.preventDefault();
    if (!trimmed || saving) return;
    onSave(trimmed);
  };

  return (
    <Sheet
      open={section != null}
      onClose={onClose}
      title="Rename section"
      subtitle="Every item in this section moves with it."
      footer={
        <button type="button" className={styles.destructive} onClick={onDelete}>
          Delete section
        </button>
      }
    >
      <form className={styles.form} onSubmit={submit}>
        <input
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Section name (e.g. What to buy)"
          aria-label="Section name"
          autoComplete="off"
        />
        <button type="submit" className={styles.primary} disabled={!trimmed || saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </Sheet>
  );
}
