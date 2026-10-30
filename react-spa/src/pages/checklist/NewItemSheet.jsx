// "New item" sheet, opened from a section column's + button.
import React, { useState } from 'react';
import { Sheet } from '../../ui';
import styles from './sheets.module.css';

export default function NewItemSheet({ section, onClose, onAdd }) {
  const [text, setText] = useState('');
  const trimmed = text.trim();

  const submit = (e) => {
    e.preventDefault();
    if (!trimmed) return;
    onAdd(section, trimmed);
    setText('');
  };

  return (
    <Sheet open={section != null} onClose={onClose} title="New item" subtitle={section ? `In ${section}` : undefined}>
      <form className={styles.form} onSubmit={submit}>
        <input
          className={styles.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add new item..."
          aria-label="New item"
          autoComplete="off"
        />
        <button type="submit" className={styles.primary} disabled={!trimmed}>
          Add
        </button>
      </form>
    </Sheet>
  );
}
