import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EventDetailSheet from '../EventDetailSheet';
import NewEventSheet from '../NewEventSheet';
import { makeEvent } from './fixtures';

const goals = [{ id: 3, title: 'Gran Fondo' }];

function renderSheet(event, handlers = {}) {
  const props = {
    onClose: vi.fn(),
    onSave: vi.fn().mockResolvedValue(true),
    onToggleCompleted: vi.fn(),
    onDelete: vi.fn(),
    onAskCoach: vi.fn(),
    ...handlers,
  };
  render(
    <MemoryRouter>
      <EventDetailSheet event={event} goals={goals} saving={false} {...props} />
    </MemoryRouter>,
  );
  return props;
}

describe('EventDetailSheet', () => {
  it('shows type, goal link, description and the date line with duration', () => {
    renderSheet(
      makeEvent({
        type: 'event',
        title: 'Gran Fondo day',
        description: 'Take it easy the day before.',
        location: 'Riva del Garda',
        start_time: '08:00:00',
        end_time: '13:00:00',
        goal_id: 3,
        goal_title: 'Gran Fondo',
      }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Gran Fondo day' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Event')).toBeInTheDocument();
    expect(screen.getByText('Riva del Garda')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Goal: Gran Fondo' })).toHaveAttribute('href', '/goals/3');
    expect(screen.getByText('Take it easy the day before.')).toBeInTheDocument();
    expect(screen.getByText('Monday, June 15, 2026 · 08:00 · ~5h')).toBeInTheDocument();
    // The footer offers the same browser-side .ics download as the coach's calendar cards.
    expect(screen.getByRole('button', { name: 'Add to calendar (.ics)' })).toBeInTheDocument();
  });

  it('wires toggle, delete and ask-coach actions', () => {
    const event = makeEvent({ completed: true });
    const { onToggleCompleted, onDelete, onAskCoach } = renderSheet(event);
    expect(screen.getByText('Done')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as not done' }));
    expect(onToggleCompleted).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Delete event' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Coach' }));
    expect(onAskCoach).toHaveBeenCalledWith(event);
  });

  it('edits the event and submits the changed values', async () => {
    const { onSave } = renderSheet(makeEvent({ start_time: '09:00:00', end_time: '10:00:00' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit event' }));
    expect(screen.getByRole('dialog', { name: 'Edit event' })).toBeInTheDocument();

    const title = screen.getByLabelText('Title');
    expect(title).toHaveValue('Long ride');
    expect(screen.getByLabelText('Duration (min)')).toHaveValue(60);
    fireEvent.change(title, { target: { value: 'Longer ride' } });
    fireEvent.click(screen.getByLabelText('Maintenance'));
    fireEvent.change(screen.getByLabelText('Goal'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ title: 'Longer ride', type: 'maintenance', goalId: '3', startTime: '09:00', duration: '60' });
    // Back to the view mode after a successful save.
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Long ride' })).toBeInTheDocument());
  });

  it('refuses to save without a title', () => {
    const { onSave } = renderSheet(makeEvent());
    fireEvent.click(screen.getByRole('button', { name: 'Edit event' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('A title is required.')).toBeInTheDocument();
  });
});

describe('NewEventSheet', () => {
  it('creates an event for the day and preselects the filtered goal', async () => {
    const onCreate = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <NewEventSheet date="2026-06-20" goals={goals} defaultGoalId="3" saving={false} onClose={onClose} onCreate={onCreate} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('dialog', { name: 'New event' })).toBeInTheDocument();
    expect(screen.getByText('Saturday, June 20, 2026')).toBeInTheDocument();
    expect(screen.getByLabelText('Goal')).toHaveValue('3');
    expect(screen.getByLabelText('Duration (min)')).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Recovery spin' } });
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '07:30' } });
    fireEvent.change(screen.getByLabelText('Duration (min)'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][0]).toMatchObject({ title: 'Recovery spin', date: '2026-06-20', startTime: '07:30', duration: '45', goalId: '3' });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
