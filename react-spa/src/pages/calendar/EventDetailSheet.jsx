// Event detail sheet (view + edit) — the app's EventDetailSheet on the web
// Sheet primitive. View: type eyebrow, title, goal badge, description, date
// line, then Edit / Delete / Mark done / Ask coach. Edit swaps in EventForm.
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatEventDuration } from '@bikelab/shared/calendar';
import { Sheet } from '../../ui';
import AddToCalendarButton from '../../components/AddToCalendarButton';
import EventForm from './EventForm';
import { eventColor, eventTypeLabel } from './copy';
import { formatLongDate, formValuesFor } from './lib';
import styles from './sheets.module.css';

const SparkleIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
    <path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6L12 2zm6 11l.9 2.6L21.5 16.5l-2.6.9L18 20l-.9-2.6-2.6-.9 2.6-.9L18 13zM5 14l.7 2 2 .7-2 .7L5 19.5l-.7-2.1-2-.7 2-.7L5 14z" />
  </svg>
);

export default function EventDetailSheet({
  event,
  goals,
  saving,
  onClose,
  onSave,
  onToggleCompleted,
  onDelete,
  onAskCoach,
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(null);

  const startEdit = () => {
    setValues(formValuesFor(event.start_date, event));
    setEditing(true);
  };

  const stopEdit = () => {
    setEditing(false);
    setValues(null);
  };

  const handleClose = () => {
    stopEdit();
    onClose();
  };

  const handleSubmit = async (formValues) => {
    const ok = await onSave(formValues);
    if (ok) stopEdit();
  };

  if (!event) return null;

  const duration = formatEventDuration(event.start_time, event.end_time);
  const dateLine = [
    formatLongDate(event.start_date.slice(0, 10)),
    event.start_time ? event.start_time.slice(0, 5) : null,
    duration,
  ]
    .filter(Boolean)
    .join(' · ');

  if (editing && values) {
    return (
      <Sheet open onClose={handleClose} title="Edit event" className={styles.sheet}>
        <EventForm
          values={values}
          goals={goals}
          saving={saving}
          submitLabel="Save"
          onChange={setValues}
          onSubmit={handleSubmit}
          onCancel={stopEdit}
        />
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={handleClose}
      title={event.title}
      subtitle={event.location || undefined}
      className={styles.sheet}
      footer={
        <>
          <div className={styles.actions}>
            <button type="button" className={styles.iconBtn} onClick={startEdit} aria-label="Edit event" title="Edit">
              <span className="material-symbols-outlined" aria-hidden="true">
                edit
              </span>
            </button>
            <button type="button" className={styles.iconBtn} onClick={onDelete} aria-label="Delete event" title="Delete">
              <span className="material-symbols-outlined" aria-hidden="true">
                delete
              </span>
            </button>
            <button
              type="button"
              className={[styles.iconBtn, event.completed ? styles.iconBtnDone : null].filter(Boolean).join(' ')}
              onClick={onToggleCompleted}
              disabled={saving}
              aria-pressed={!!event.completed}
              aria-label={event.completed ? 'Mark as not done' : 'Mark as done'}
              title={event.completed ? 'Mark as not done' : 'Mark as done'}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                check
              </span>
            </button>
            <button type="button" className={styles.askBtn} onClick={() => onAskCoach(event)}>
              <SparkleIcon />
              Ask Coach
            </button>
          </div>
          <AddToCalendarButton events={[event]} compact />
        </>
      }
    >
      <div className={styles.eyebrow}>
        <span className={styles.eyebrowDot} style={{ background: eventColor(event.type) }} aria-hidden="true" />
        {eventTypeLabel(event.type)}
        {event.completed && <span className={styles.doneBadge}>Done</span>}
      </div>
      {event.goal_id != null && event.goal_title && (
        <Link to={`/goals/${event.goal_id}`} className={styles.goalBadge} onClick={handleClose}>
          Goal: {event.goal_title}
        </Link>
      )}
      {event.description && <p className={styles.description}>{event.description}</p>}
      <p className={styles.dateLine}>{dateLine}</p>
    </Sheet>
  );
}
