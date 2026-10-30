import React from 'react';
import { ACCENT, CoachCard, Eyebrow, FooterLink, IconTile } from './CoachCardChrome';
import { CheckIcon } from './icons';
import { t } from '../copy';
import styles from './cards.module.css';

/** Inline confirmation of a successful complete_goal; the whole card opens the goal. */
export default function GoalCompletedCard({ goal, onPress }) {
  return (
    <CoachCard accent={ACCENT.green} onPress={onPress} testId="goal-completed-card">
      <span className={styles.headRow}>
        <IconTile>
          <CheckIcon />
        </IconTile>
        <Eyebrow>{t('coach.goalCompletedLabel')}</Eyebrow>
      </span>
      <span className={styles.title}>{goal.title}</span>
      {goal.ridesCount > 0 ? (
        <span className={styles.description}>{t('coach.goalCompletedRides', { count: goal.ridesCount })}</span>
      ) : null}
      <FooterLink label={t('coach.viewDetails')} />
    </CoachCard>
  );
}
