import React from 'react';
import { ACCENT, CoachCard, Eyebrow, FooterLink, IconTile } from './CoachCardChrome';
import { TargetIcon } from './icons';
import { t } from '../copy';
import styles from './cards.module.css';

// Tier drives the accent, as in the app (legendary/epic/grand/base).
const TIER_ACCENT = {
  legendary: ACCENT.orange,
  epic: ACCENT.purple,
  grand: ACCENT.blue,
  base: ACCENT.gray,
};

/** Inline confirmation of a successful create_goal; the whole card opens the goal. */
export default function GoalCreatedCard({ goal, onPress }) {
  const accent = TIER_ACCENT[goal.tier || 'base'] || TIER_ACCENT.base;
  return (
    <CoachCard accent={accent} onPress={onPress} testId="goal-created-card">
      <span className={styles.headRow}>
        <IconTile>
          <TargetIcon />
        </IconTile>
        <Eyebrow>{t('coach.goalCreatedLabel')}</Eyebrow>
      </span>
      <span className={styles.title}>{goal.title}</span>
      {goal.description ? <span className={styles.description}>{goal.description}</span> : null}
      <FooterLink label={t('coach.viewDetails')} />
    </CoachCard>
  );
}
