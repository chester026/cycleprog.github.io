import React from 'react';
import { getToolLabelKey } from '@bikelab/shared/coach';
import { Spinner } from '../../ui';
import { t } from './copy';
import styles from './ToolCallPill.module.css';

/**
 * One grouped tool step ("Checking your goals…"): spinner while running, a
 * green dot once done. Consecutive same-name calls arrive collapsed by
 * `groupToolCalls`; the count is deliberately not shown — the rider needs to
 * know the step ran, not how many calendar writes it took.
 */
export default function ToolCallPill({ name, status }) {
  const done = status === 'done';
  return (
    <span className={styles.pill} data-status={status}>
      {done ? <span className={styles.doneDot} aria-hidden="true" /> : <Spinner size="sm" />}
      <span className={styles.label}>{t(getToolLabelKey(name))}</span>
    </span>
  );
}
