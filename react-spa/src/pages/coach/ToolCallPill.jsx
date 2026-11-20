import React from 'react';
import { getToolLabelKey, getToolTagKey } from '@bikelab/shared/coach';
import { Spinner } from '../../ui';
import { t } from './copy';
import styles from './ToolCallPill.module.css';

/**
 * One tag per tool of the reply (shared `toolCallTags`). While its step runs
 * it says what is happening ("Checking your goals…") next to a spinner; once
 * done it shrinks to the short name of what the coach looked at or touched
 * ("Goals") behind a green dot.
 */
export default function ToolCallPill({ name, status }) {
  const done = status === 'done';
  return (
    <span className={styles.pill} data-status={status}>
      {done ? <span className={styles.doneDot} aria-hidden="true" /> : <Spinner size="sm" />}
      <span className={styles.label}>{t(done ? getToolTagKey(name) : getToolLabelKey(name))}</span>
    </span>
  );
}
