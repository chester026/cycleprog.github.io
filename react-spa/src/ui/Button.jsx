import React from 'react';
import styles from './Button.module.css';

/**
 * Shared button primitive (W-21). Always a real `<button>` so it is
 * keyboard-reachable and activatable via Enter/Space with no extra wiring.
 *
 * - `variant`: `primary` (accent fill — the product's square `.accent-btn`
 *   look), `secondary` (light grey fill, cancel/back on light forms),
 *   `outline` (transparent, accent border), `ghost` (text-only, inherits
 *   colour), `danger`.
 * - `size`: `md` (16px, 12/24 padding — modal footers, page actions) or
 *   `sm` (0.9em, 1em/1.5em padding — inline page buttons).
 * - `block`: stretch to the container width (auth forms).
 */
export default function Button({
  variant = 'secondary',
  size = 'md',
  block = false,
  type = 'button',
  disabled = false,
  className,
  children,
  ...rest
}) {
  const variantClass = styles[variant] || styles.secondary;
  const sizeClass = size === 'sm' ? styles.sm : styles.md;
  return (
    <button
      type={type}
      disabled={disabled}
      className={[styles.button, variantClass, sizeClass, block ? styles.block : null, className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
