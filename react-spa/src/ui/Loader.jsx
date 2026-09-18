import React from 'react';
import styles from './Loader.module.css';

/**
 * Generic inline spinner (W-21). Distinct from `PageLoadingOverlay`
 * (full-page overlay) and `AILoadingSpinner` (AI-specific rotating
 * messages) in `src/components` — this is the small "loading this bit of
 * UI" primitive those two are built on top of conceptually, not a
 * replacement for either (their behaviour is more specific than a plain
 * spinner; see the T-6.3 report for why they were left in place).
 */
export default function Loader({ label = 'Loading...', size = 'md', inline = false }) {
  return (
    <div
      role="status"
      aria-label={label}
      className={[styles.wrap, inline ? styles.inline : null].filter(Boolean).join(' ')}
    >
      <span className={[styles.spinner, styles[size]].join(' ')} aria-hidden="true" />
      {!inline && label && <span className={styles.label}>{label}</span>}
    </div>
  );
}

export function Spinner({ size = 'md' }) {
  return <span className={[styles.spinner, styles[size]].join(' ')} role="status" aria-label="Loading" />;
}
