import React from 'react';
import { ACCENT, CoachCard, Eyebrow, FooterLink, IconTile } from './CoachCardChrome';
import { CalendarIcon } from './icons';
import { eventTypeLabel, formatEventDay } from './calendarLib';
import { t } from '../copy';
import styles from './cards.module.css';

// Event type drives the accent, as in the app.
const TYPE_ACCENT = {
  planned_ride: ACCENT.blue,
  rest_day: ACCENT.gray,
  maintenance: ACCENT.amber,
  purchase: ACCENT.green,
  event: ACCENT.orange,
  note: ACCENT.purple,
};

/** The detailed card for a turn that created exactly one calendar event. */
export default function CalendarEventCreatedCard({ event, onPress }) {
  const accent = TYPE_ACCENT[event.type] || TYPE_ACCENT.planned_ride;
  return (
    <CoachCard accent={accent} onPress={onPress} testId="calendar-event-created-card">
      <span className={styles.headRow}>
        <IconTile>
          <CalendarIcon />
        </IconTile>
        <Eyebrow>{t('coach.calendarEventCreatedLabel')}</Eyebrow>
      </span>
      <span className={styles.title}>{event.title}</span>
      <span className={styles.meta}>
        {eventTypeLabel(event.type)} · {formatEventDay(event.start_date)}
        {event.location ? ` · ${event.location}` : ''}
      </span>
      {event.description ? <span className={styles.description}>{event.description}</span> : null}
      {event.goal_title ? <span className={styles.goalChip}>{t('coach.supportsGoal', { goal: event.goal_title })}</span> : null}
      <FooterLink label={t('coach.viewInCalendar')} />
    </CoachCard>
  );
}
