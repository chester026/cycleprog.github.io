import React from 'react';
import styles from './ContextBar.module.css';

/** Status strip above the chat input — today only the stream-error banner. */
export default function ContextBar({ error }) {
  if (!error) return null;
  return (
    <div className={styles.error} role="alert">
      {error}
    </div>
  );
}
