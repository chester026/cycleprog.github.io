// Page header: title + "Plan with coach" pill, then the toolbar with the
// period label (click → back to today), ‹ › paging, Month/Week switch and
// the goal filter notice.
import React from 'react';
import { Link } from 'react-router-dom';
import { SegmentedControl } from '../../ui';
import styles from './CalendarHeader.module.css';

const VIEW_OPTIONS = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
];

export default function CalendarHeader({
  periodLabel,
  view,
  isToday,
  goalFilter,
  onPrev,
  onNext,
  onToday,
  onViewChange,
  onPlanWithCoach,
  onNewEvent,
}) {
  return (
    <header className={styles.header}>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Calendar</h1>
        <div className={styles.titleActions}>
          <button type="button" className={styles.ghostBtn} onClick={onNewEvent}>
            + New event
          </button>
          <button type="button" className={styles.pillBtn} onClick={onPlanWithCoach}>
            <span className="material-symbols-outlined" aria-hidden="true">
              auto_awesome
            </span>
            Plan with Coach
          </button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.period}>
          <button type="button" className={styles.navBtn} onClick={onPrev} aria-label={`Previous ${view}`}>
            ‹
          </button>
          <button
            type="button"
            className={styles.periodBtn}
            onClick={onToday}
            disabled={isToday}
            title={isToday ? undefined : 'Back to today'}
          >
            <span className={styles.periodLabel}>{periodLabel}</span>
            {/* Reserved so the toolbar doesn't jump when the hint toggles. */}
            <span className={styles.todayHint}>{isToday ? ' ' : 'Back to today'}</span>
          </button>
          <button type="button" className={styles.navBtn} onClick={onNext} aria-label={`Next ${view}`}>
            ›
          </button>
        </div>
        <SegmentedControl options={VIEW_OPTIONS} value={view} onChange={onViewChange} aria-label="Calendar view" />
      </div>

      {goalFilter && (
        <p className={styles.filterNotice}>
          Showing events for <Link to={`/goals/${goalFilter.id}`}>{goalFilter.title || `goal #${goalFilter.id}`}</Link>.{' '}
          <Link to={goalFilter.clearTo}>Show all</Link>
        </p>
      )}
    </header>
  );
}
