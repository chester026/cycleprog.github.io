import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NewEventSheet from '../NewEventSheet';

function renderSheet({ created = true, ...props } = {}) {
  const onClose = vi.fn();
  const onCreate = vi.fn().mockResolvedValue(created);
  render(<NewEventSheet date="2026-10-20" goals={[{ id: 3, title: 'Gran Fondo' }]} defaultGoalId="" saving={false} onClose={onClose} onCreate={onCreate} {...props} />);
  return { onClose, onCreate };
}

describe('NewEventSheet', () => {
  it('opens a labelled dialog for the day with a blank form', () => {
    renderSheet();
    const dialog = screen.getByRole('dialog', { name: 'New event' });
    expect(dialog).toHaveTextContent('Tuesday, October 20, 2026');
    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-20');
    expect(screen.getByLabelText('Goal')).toHaveValue('');
  });

  it('preselects the goal the calendar is filtered by', () => {
    renderSheet({ defaultGoalId: 3 });
    expect(screen.getByLabelText('Goal')).toHaveValue('3');
  });

  it('creates the event and closes when the parent reports success', async () => {
    const { onCreate, onClose } = renderSheet();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Easy spin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ title: 'Easy spin', date: '2026-10-20' })));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('stays open when creation fails', async () => {
    const { onCreate, onClose } = renderSheet({ created: false });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Easy spin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'New event' })).toBeInTheDocument();
  });

  it('closes from Cancel and from Escape', () => {
    const { onClose } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
