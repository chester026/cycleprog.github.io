// "Add section" sheet. A section can't exist without at least one item
// (sections are just a column on checklist rows), so it takes both the
// section name and its first item.
import React, { useState } from 'react';
import { Sheet } from '../../ui';
import styles from './sheets.module.css';

export default function NewSectionSheet({ open, saving, onClose, onAdd }) {
  const [section, setSection] = useState('');
  const [item, setItem] = useState('');
  const canSubmit = !!section.trim() && !!item.trim() && !saving;

  const reset = () => {
    setSection('');
    setItem('');
  };

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onAdd(section.trim(), item.trim());
    reset();
  };

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} title="Add section" subtitle="Give it a name and its first item.">
      <form className={styles.form} onSubmit={submit}>
        <input
          className={styles.input}
          value={section}
          onChange={(e) => setSection(e.target.value)}
          placeholder="Section name (e.g. What to buy)"
          aria-label="Section name"
          autoComplete="off"
        />
        <input
          className={styles.input}
          value={item}
          onChange={(e) => setItem(e.target.value)}
          placeholder="First item (e.g. Bicycle)"
          aria-label="First item"
          autoComplete="off"
        />
        <button type="submit" className={styles.primary} disabled={!canSubmit}>
          {saving ? 'Adding...' : 'Add'}
        </button>
      </form>
    </Sheet>
  );
}
