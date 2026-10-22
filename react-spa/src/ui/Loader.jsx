import React from 'react';
import styles from './Loader.module.css';

/**
 * Generic inline spinner (W-21). Distinct from `PageLoadingOverlay` (the
 * full-page overlay in `src/components`), which is built on the same idea
 * but blocks the whole view. `tone` picks the palette: the default `dark`
 * uses the `--ui-*` tokens of dark panels/modals; `light` uses the page
 * tokens from index.css for the light main content.
 */
export default function Loader({ label = 'Loading...', size = 'md', inline = false, tone = 'dark' }) {
  return (
    <div
      role="status"
      aria-label={label}
      className={[styles.wrap, inline ? styles.inline : null, tone === 'light' ? styles.light : null].filter(Boolean).join(' ')}
    >
      <span className={[styles.spinner, styles[size]].join(' ')} aria-hidden="true" />
      {!inline && label && <span className={styles.label}>{label}</span>}
    </div>
  );
}

export function Spinner({ size = 'md' }) {
  return <span className={[styles.spinner, styles[size]].join(' ')} role="status" aria-label="Loading" />;
}
