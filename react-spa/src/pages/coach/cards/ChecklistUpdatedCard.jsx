import React from 'react';
import { ACCENT, CoachCard, Eyebrow, FooterLink, IconTile } from './CoachCardChrome';
import { CheckIcon } from './icons';
import { t } from '../copy';
import styles from './cards.module.css';

/**
 * One add_checklist_items / update_checklist_item result (shared
 * `mapChecklistUpdates`): added items under their section, a checked-off
 * item, or a removal. The whole card opens the checklist.
 */
export default function ChecklistUpdatedCard({ summary, onPress }) {
  const accent = summary.type === 'removed' ? ACCENT.gray : ACCENT.green;
  return (
    <CoachCard accent={accent} onPress={onPress} testId="checklist-updated-card">
      <span className={styles.headRow}>
        <IconTile>
          <CheckIcon />
        </IconTile>
        <Eyebrow>{t('coach.checklistUpdatedLabel')}</Eyebrow>
      </span>
      {summary.type === 'added' ? (
        <>
          <span className={styles.title}>{summary.section}</span>
          {summary.items.map((item) => (
            <span key={item.id} className={styles.itemLine}>
              • {item.item}
            </span>
          ))}
        </>
      ) : null}
      {summary.type === 'checked' ? <span className={styles.title}>{t('checklist.checkedOff', { item: summary.item })}</span> : null}
      {summary.type === 'removed' ? <span className={styles.title}>{t('checklist.itemRemoved')}</span> : null}
      <FooterLink label={t('coach.viewChecklist')} />
    </CoachCard>
  );
}
