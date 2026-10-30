import React from 'react';
import { ACCENT, CoachCard, Eyebrow, FooterLink, IconTile } from './CoachCardChrome';
import { NoteIcon } from './icons';
import { t } from '../copy';
import styles from './cards.module.css';

/**
 * One remember_about_rider / forget_about_rider result (shared
 * `mapMemoryUpdates`); the whole card opens the Profile's Coach memory tab,
 * where the same notes are read and edited by hand.
 */
export default function CoachMemoryCard({ update, onPress }) {
  const accent = update.type === 'forgotten' ? ACCENT.gray : ACCENT.blue;
  const titleKey = update.type === 'remembered' ? 'coach.memoryRemembered' : 'coach.memoryForgot';
  return (
    <CoachCard accent={accent} onPress={onPress} testId="coach-memory-card">
      <span className={styles.headRow}>
        <IconTile>
          <NoteIcon />
        </IconTile>
        <Eyebrow>{t('coach.memoryUpdatedLabel')}</Eyebrow>
      </span>
      <span className={styles.titleCompact}>{t(titleKey, { note: update.note })}</span>
      <FooterLink label={t('coach.viewMemory')} />
    </CoachCard>
  );
}
