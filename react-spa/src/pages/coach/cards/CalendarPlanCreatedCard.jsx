import React from 'react';
import { ACCENT, CoachCard, Eyebrow, FooterLink, IconTile } from './CoachCardChrome';
import { CheckIcon } from './icons';
import { formatPlanRange, sharedGoalTitle } from './calendarLib';
import { t } from '../copy';
import styles from './cards.module.css';

/**
 * One summary card for a turn that created several events ("plan my week")
 * — stacking a near-identical card per event was clutter, not information.
 */
export default function CalendarPlanCreatedCard({ events, onPress }) {
  const rangeLabel = formatPlanRange(events);
  const goalTitle = sharedGoalTitle(events);
  return (
    <CoachCard accent={ACCENT.blue} onPress={onPress} testId="calendar-plan-created-card">
      <span className={styles.headRow}>
        <IconTile>
          <CheckIcon />
        </IconTile>
        <Eyebrow>{t('coach.calendarPlanCreatedLabel')}</Eyebrow>
      </span>
      <span className={styles.title}>{t('coach.calendarPlanCreatedTitle', { count: events.length })}</span>
      {rangeLabel ? <span className={styles.meta}>{rangeLabel}</span> : null}
      {goalTitle ? <span className={styles.goalChip}>{t('coach.supportsGoal', { goal: goalTitle })}</span> : null}
      <FooterLink label={t('coach.viewInCalendar')} />
    </CoachCard>
  );
}
