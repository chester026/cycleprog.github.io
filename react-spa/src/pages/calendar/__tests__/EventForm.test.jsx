import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EventForm from '../EventForm';
import { formValuesFor } from '../lib';

const GOALS = [
  { id: 1, title: 'Gran Fondo' },
  { id: 2, title: 'Everesting' },
];

// Controlled wrapper so typing really flows back through `onChange`.
function Harness({ initial, onSubmit, onCancel, saving = false }) {
  const [values, setValues] = useState(initial);
  return (
    <EventForm values={values} goals={GOALS} saving={saving} submitLabel="Add event" onChange={setValues} onSubmit={onSubmit} onCancel={onCancel} />
  );
}

function renderForm(initial = formValuesFor('2026-10-20', null), props = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(<Harness initial={initial} onSubmit={onSubmit} onCancel={onCancel} {...props} />);
  return { onSubmit, onCancel };
}

describe('EventForm', () => {
  it('lists every event type as a radio with Planned Ride selected by default', () => {
    renderForm();
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.value)).toEqual(['planned_ride', 'rest_day', 'maintenance', 'purchase', 'event', 'note']);
    expect(screen.getByRole('radio', { name: 'Planned Ride' })).toBeChecked();
  });

  it('requires a title and only shows the error after a submit attempt', () => {
    const { onSubmit } = renderForm();
    expect(screen.queryByText('A title is required.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }));
    expect(screen.getByText('A title is required.')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Hill repeats' } });
    expect(screen.queryByText('A title is required.')).not.toBeInTheDocument();
  });

  it('submits the edited values', () => {
    const { onSubmit } = renderForm();
    fireEvent.click(screen.getByRole('radio', { name: 'Maintenance' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Chain swap' } });
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '18:30' } });
    fireEvent.change(screen.getByLabelText('Duration (min)'), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Garage' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'New chain + cassette' } });
    fireEvent.change(screen.getByLabelText('Goal'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }));

    expect(onSubmit).toHaveBeenCalledWith({
      type: 'maintenance',
      title: 'Chain swap',
      date: '2026-10-20',
      startTime: '18:30',
      duration: '45',
      location: 'Garage',
      description: 'New chain + cassette',
      goalId: '2',
    });
  });

  it('keeps duration disabled until a start time is set', () => {
    renderForm();
    expect(screen.getByLabelText('Duration (min)')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '07:00' } });
    expect(screen.getByLabelText('Duration (min)')).not.toBeDisabled();
  });

  it('prefills from an existing event, including the goal and duration', () => {
    const event = {
      type: 'event', title: 'Club race', start_date: '2026-10-25', start_time: '09:00:00', end_time: '11:30:00',
      location: 'Nicosia', description: null, goal_id: 1,
    };
    renderForm(formValuesFor('2026-10-25', event));
    expect(screen.getByRole('radio', { name: 'Event' })).toBeChecked();
    expect(screen.getByLabelText('Title')).toHaveValue('Club race');
    expect(screen.getByLabelText('Start time')).toHaveValue('09:00');
    expect(screen.getByLabelText('Duration (min)')).toHaveValue(150);
    expect(screen.getByLabelText('Goal')).toHaveValue('1');
  });

  it('disables both buttons and shows Saving... while saving; cancel calls back otherwise', () => {
    const { onCancel, onSubmit } = renderForm(undefined, { saving: true });
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'X' } });
    fireEvent.submit(screen.getByLabelText('Title').closest('form'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancel calls back', () => {
    const { onCancel } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
