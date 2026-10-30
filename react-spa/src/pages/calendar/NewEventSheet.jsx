// "New event" sheet for a selected day. Form state is keyed on `date` so
// re-opening for another day starts blank, while typing never resets.
import React, { useState } from 'react';
import { Sheet } from '../../ui';
import EventForm from './EventForm';
import { formatLongDate, formValuesFor } from './lib';
import styles from './sheets.module.css';

export default function NewEventSheet({ date, goals, defaultGoalId, saving, onClose, onCreate }) {
  const [values, setValues] = useState(() => ({ ...formValuesFor(date, null), goalId: defaultGoalId || '' }));

  const handleSubmit = async (formValues) => {
    const ok = await onCreate(formValues);
    if (ok) onClose();
  };

  return (
    <Sheet open onClose={onClose} title="New event" subtitle={formatLongDate(date)} className={styles.sheet}>
      <EventForm
        values={values}
        goals={goals}
        saving={saving}
        submitLabel="Add event"
        onChange={setValues}
        onSubmit={handleSubmit}
        onCancel={onClose}
      />
    </Sheet>
  );
}
