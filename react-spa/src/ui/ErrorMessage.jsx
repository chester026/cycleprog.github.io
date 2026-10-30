import React from 'react';
import styles from './ErrorMessage.module.css';

/**
 * The one error block for web UI (W-21). Replaced seven page-local
 * `.error-message` classes that each defined slightly different colours
 * and spacing; `inline` is the small field-level variant rendered under an
 * input. Renders nothing for an empty message so callers can pass
 * `error?.message` directly.
 */
export default function ErrorMessage({ children, inline = false, className }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className={[styles.error, inline ? styles.inline : null, className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
