import React from 'react';
import styles from './Button.module.css';

/**
 * Shared button primitive (W-21). Always a real `<button>` element so it's
 * keyboard-reachable and activatable via Enter/Space with no extra wiring.
 */
export default function Button({
  variant = 'secondary', // 'primary' | 'secondary' | 'danger'
  type = 'button',
  disabled = false,
  className,
  children,
  ...rest
}) {
  const variantClass = styles[variant] || styles.secondary;
  return (
    <button
      type={type}
      disabled={disabled}
      className={[styles.button, variantClass, className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
