import React from 'react';
import styles from './IconButton.module.css';

/**
 * Round icon-only button. `aria-label` is required — an icon alone says
 * nothing to a screen reader, so a missing label throws in dev rather than
 * shipping an unnamed control. `icon` is a Material Symbols glyph name or
 * any node (passed as `children`).
 */
export default function IconButton({
  'aria-label': ariaLabel,
  icon,
  size = 'md',
  variant = 'ghost',
  type = 'button',
  className,
  children,
  ...rest
}) {
  if (!ariaLabel) {
    throw new Error('IconButton requires an aria-label');
  }
  return (
    <button
      type={type}
      aria-label={ariaLabel}
      title={rest.title ?? ariaLabel}
      className={[styles.button, styles[size], styles[variant], className].filter(Boolean).join(' ')}
      {...rest}
    >
      {icon ? (
        <span className="material-symbols-outlined" aria-hidden="true">
          {icon}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
