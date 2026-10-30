import React from 'react';
import { Chip } from '../../ui';
import styles from './SuggestedActions.module.css';

/**
 * One horizontally scrolling row of chips. The server orders suggestions by
 * relevance, so the first gets the gradient ring. `label` ("Ask for:")
 * scrolls with the chips rather than staying pinned.
 */
export default function SuggestedActions({ items, onPress, disabled = false, label, className }) {
  if (!items || items.length === 0) return null;
  return (
    <div className={[styles.row, className].filter(Boolean).join(' ')} role="group" aria-label={label || 'Suggestions'}>
      {label ? <span className={styles.label}>{label}</span> : null}
      {items.map((item, i) => (
        <Chip
          key={`${i}-${item.label}`}
          variant={i === 0 ? 'primary' : 'default'}
          disabled={disabled}
          onClick={() => onPress(item)}
        >
          {item.label}
        </Chip>
      ))}
    </div>
  );
}
