import React from 'react';
import styles from './Chip.module.css';

/**
 * Pill-shaped action button for suggestion rows and quick starts. Always a
 * real `<button>`. `variant="primary"` draws the blue→purple gradient ring
 * the coach uses to mark the suggestion it most wants the rider to take.
 */
export default function Chip({ variant = 'default', selected = false, className, children, type = 'button', ...rest }) {
  return (
    <button
      type={type}
      className={[styles.chip, styles[variant], selected ? styles.selected : null, className]
        .filter(Boolean)
        .join(' ')}
      aria-pressed={rest.onClick && selected ? true : undefined}
      {...rest}
    >
      <span className={styles.label}>{children}</span>
    </button>
  );
}
