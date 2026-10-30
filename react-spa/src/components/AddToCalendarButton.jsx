import React from 'react';
import { buildIcsCalendar, icsFileName } from '@bikelab/shared/calendar';
import styles from './AddToCalendarButton.module.css';

const LABEL = 'Add to calendar (.ics)';
const LABEL_COUNT = 'Add {{count}} events to calendar (.ics)';
const HINT = 'Downloads a file your calendar app can import.';

/**
 * Web substitute for the app's Apple Calendar sync: downloads the given
 * events as one `.ics` file (shared RFC 5545 builder), generated in the
 * browser as a Blob — no server call. Used under the coach's calendar cards
 * (once per turn, not per event card) and in the calendar's event sheet.
 * `compact` drops the hint line for tight footers.
 */
export default function AddToCalendarButton({ events, compact = false, className }) {
  if (events.length === 0) return null;

  const handleDownload = () => {
    const blob = new Blob([buildIcsCalendar(events)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = icsFileName(events);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const label = events.length > 1 ? LABEL_COUNT.replace('{{count}}', String(events.length)) : LABEL;

  return (
    <div className={[styles.wrap, compact ? styles.compact : null, className].filter(Boolean).join(' ')}>
      <button type="button" className={styles.button} onClick={handleDownload} data-testid="add-to-calendar-button">
        {label}
      </button>
      {!compact && <p className={styles.hint}>{HINT}</p>}
    </div>
  );
}
