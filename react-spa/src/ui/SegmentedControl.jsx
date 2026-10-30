import React from 'react';
import styles from './SegmentedControl.module.css';

/**
 * Compact pill segmented control — "which section am I in" (Coach / Goals),
 * not a filter. `options` = `[{value, label}]`; renders `role="tablist"`
 * with one `tab` per option so the selected one is announced.
 */
export default function SegmentedControl({ options, value, onChange, 'aria-label': ariaLabel, className }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={[styles.control, className].filter(Boolean).join(' ')}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            className={[styles.segment, active ? styles.active : null].filter(Boolean).join(' ')}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              e.preventDefault();
              const index = options.findIndex((o) => o.value === value);
              const step = e.key === 'ArrowRight' ? 1 : -1;
              const next = options[(index + step + options.length) % options.length];
              onChange(next.value);
            }}
            data-testid={option.testId}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
