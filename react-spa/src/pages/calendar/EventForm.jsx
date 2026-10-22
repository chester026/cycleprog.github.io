// Create/edit form for a calendar event (inside NewEventSheet and the
// detail sheet's edit mode). Values ↔ API body live in lib.js
// (formValuesFor / bodyFromValues).
import React, { useId, useState } from 'react';
import { Textarea } from '../../ui';
import { EVENT_TYPES, EVENT_TYPE_LABELS, eventColor } from './copy';
import styles from './EventForm.module.css';

export default function EventForm({ values, goals, saving, submitLabel, onChange, onSubmit, onCancel }) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const titleValid = values.title.trim().length > 0;
  const set = (key) => (e) => onChange({ ...values, [key]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (!titleValid || saving) return;
    onSubmit(values);
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <fieldset className={styles.types}>
        <legend className={styles.label}>Type</legend>
        {EVENT_TYPES.map((type) => {
          const active = values.type === type;
          return (
            <label
              key={type}
              className={[styles.typeChip, active ? styles.typeChipActive : null].filter(Boolean).join(' ')}
              style={{ '--chip-color': eventColor(type) }}
            >
              <input
                type="radio"
                name={`${id}-type`}
                value={type}
                checked={active}
                onChange={set('type')}
                className={styles.radio}
              />
              <span className={styles.typeDot} aria-hidden="true" />
              {EVENT_TYPE_LABELS[type]}
            </label>
          );
        })}
      </fieldset>

      <div className={styles.field}>
        <label htmlFor={`${id}-title`} className={styles.label}>
          Title
        </label>
        <input
          id={`${id}-title`}
          className={styles.input}
          value={values.title}
          onChange={set('title')}
          placeholder="Event title"
          autoComplete="off"
          required
          aria-invalid={touched && !titleValid ? true : undefined}
        />
        {touched && !titleValid && <p className={styles.error}>A title is required.</p>}
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor={`${id}-date`} className={styles.label}>
            Date
          </label>
          <input id={`${id}-date`} type="date" className={styles.input} value={values.date} onChange={set('date')} required />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-time`} className={styles.label}>
            Start time
          </label>
          <input id={`${id}-time`} type="time" className={styles.input} value={values.startTime} onChange={set('startTime')} />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-duration`} className={styles.label}>
            Duration (min)
          </label>
          <input
            id={`${id}-duration`}
            type="number"
            min="0"
            step="5"
            inputMode="numeric"
            className={styles.input}
            value={values.duration}
            onChange={set('duration')}
            placeholder="60"
            disabled={!values.startTime}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor={`${id}-location`} className={styles.label}>
          Location
        </label>
        <input
          id={`${id}-location`}
          className={styles.input}
          value={values.location}
          onChange={set('location')}
          placeholder="Location (optional)"
          autoComplete="off"
        />
      </div>

      <div className={styles.field}>
        <label htmlFor={`${id}-description`} className={styles.label}>
          Description
        </label>
        <Textarea
          id={`${id}-description`}
          className={styles.input}
          value={values.description}
          onChange={set('description')}
          placeholder="Details (optional)"
          minRows={2}
          maxRows={6}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor={`${id}-goal`} className={styles.label}>
          Goal
        </label>
        <select id={`${id}-goal`} className={styles.input} value={values.goalId} onChange={set('goalId')}>
          <option value="">No goal</option>
          {goals.map((goal) => (
            <option key={goal.id} value={String(goal.id)}>
              {goal.title}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className={styles.primary} disabled={saving}>
          {saving ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
