// Agenda list: one row per day (date column on the left, activity/event
// cards stacked on the right) — the app's DayList. The week view passes all
// seven days so empty ones still offer an "Add" button; the month view's
// side panel passes just the selected day.
import React from 'react';
import { formatEventDuration, formatKm, formatActivityDuration } from '@bikelab/shared/calendar';
import { eventColor, eventTypeLabel } from './copy';
import { formatWeekday } from './lib';
import styles from './DayAgenda.module.css';

export default function DayAgenda({ days, selectedDate, today, onOpenEvent, onOpenActivity, onNewEvent }) {
  return (
    <ol className={styles.list} aria-label="Agenda">
      {days.map((day) => {
        const isToday = day.date === today;
        const isSelected = day.date === selectedDate;
        const isEmpty = day.activities.length === 0 && day.events.length === 0;
        return (
          <li
            key={day.date}
            className={[styles.day, isSelected ? styles.daySelected : null].filter(Boolean).join(' ')}
            data-testid={`agenda-day-${day.date}`}
          >
            <div className={[styles.dateCol, isToday ? styles.dateColToday : null].filter(Boolean).join(' ')}>
              <span className={styles.dayNumber}>{Number(day.date.slice(8, 10))}</span>
              <span className={styles.dayLabel}>{isToday ? 'Today' : formatWeekday(day.date)}</span>
            </div>
            <div className={styles.cards}>
              {day.activities.map((act) => (
                <button
                  key={`act-${act.id}`}
                  type="button"
                  className={[styles.row, styles.rowMuted].join(' ')}
                  onClick={() => onOpenActivity(act)}
                >
                  <span className={[styles.accent, styles.accentMuted].join(' ')} aria-hidden="true" />
                  <span className={styles.rowContent}>
                    <span className={styles.rowTitleMuted}>{act.name}</span>
                    <span className={styles.rowSubtitle}>
                      {formatKm(act.distance)} km · {formatActivityDuration(act.moving_time)}
                    </span>
                  </span>
                  <span className={styles.check} aria-label="Completed ride">
                    ✓
                  </span>
                </button>
              ))}
              {day.events.map((ev) => {
                const duration = formatEventDuration(ev.start_time, ev.end_time);
                const isTodayAction = isToday && !ev.completed;
                const subtitle = [ev.start_time && !ev.completed ? ev.start_time.slice(0, 5) : null, duration, ev.location]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <button
                    key={`ev-${ev.id}`}
                    type="button"
                    className={[
                      styles.row,
                      ev.completed ? styles.rowMuted : null,
                      isTodayAction ? styles.rowToday : null,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => onOpenEvent(ev)}
                    aria-label={`${ev.title}, ${eventTypeLabel(ev.type)}${ev.completed ? ', completed' : ''}`}
                  >
                    <span
                      className={[styles.accent, ev.completed ? styles.accentMuted : null].filter(Boolean).join(' ')}
                      style={ev.completed ? undefined : { background: eventColor(ev.type) }}
                      aria-hidden="true"
                    />
                    <span className={styles.rowContent}>
                      <span className={ev.completed ? styles.rowTitleMuted : styles.rowTitle}>{ev.title}</span>
                      {subtitle && <span className={styles.rowSubtitle}>{subtitle}</span>}
                    </span>
                    {ev.completed ? (
                      <span className={styles.check} aria-hidden="true">
                        ✓
                      </span>
                    ) : (
                      <span className={styles.chevron} aria-hidden="true">
                        ›
                      </span>
                    )}
                  </button>
                );
              })}
              {isEmpty && <p className={styles.empty}>Nothing planned</p>}
              <button type="button" className={styles.addBtn} onClick={() => onNewEvent(day.date)}>
                + Add event
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
