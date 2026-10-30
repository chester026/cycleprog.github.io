import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../ui';
import RideAddModal from '../RideAddModal';
import { call } from '../../data/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});

function renderModal(props = {}) {
  const onClose = vi.fn();
  const onAdd = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RideAddModal isOpen onClose={onClose} onAdd={onAdd} {...props} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { onClose, onAdd };
}

function fill({ title = 'Sunday loop', location = 'Troodos', date = '2026-11-01', details = '' } = {}) {
  fireEvent.change(screen.getByLabelText('Title *'), { target: { value: title } });
  fireEvent.change(screen.getByLabelText('Location *'), { target: { value: location } });
  fireEvent.change(screen.getByLabelText('Date *'), { target: { value: date } });
  if (details) fireEvent.change(screen.getByLabelText('Description'), { target: { value: details } });
}

describe('RideAddModal', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('validates required fields before posting and clears an error once the field is edited', () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: 'Add New Ride' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByText('Title is required')).toBeInTheDocument();
    expect(screen.getByText('Location is required')).toBeInTheDocument();
    expect(screen.getByText('Date is required')).toBeInTheDocument();
    expect(call).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'X' } });
    expect(screen.queryByText('Title is required')).not.toBeInTheDocument();
  });

  it('creates a ride through POST /api/rides, hands the response to onAdd and closes', async () => {
    call.mockResolvedValue({ id: 10, title: 'Sunday loop' });
    const { onAdd, onClose } = renderModal();
    fill({ details: 'Bring lights' });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/api/rides' }),
        { body: { title: 'Sunday loop', location: 'Troodos', date: '2026-11-01', details: 'Bring lights', start: '2026-11-01' } },
      ),
    );
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ id: 10, title: 'Sunday loop' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('prefills and PUTs when editing an existing ride', async () => {
    call.mockResolvedValue({ id: 3 });
    const ride = { id: 3, title: 'Hills', location: 'Trailhead', start: '2026-07-04T09:00:00Z', details: 'Steep' };
    renderModal({ ride });

    expect(screen.getByRole('dialog', { name: 'Edit Ride' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title *')).toHaveValue('Hills');
    expect(screen.getByLabelText('Date *')).toHaveValue('2026-07-04');
    expect(screen.getByLabelText('Description')).toHaveValue('Steep');

    fireEvent.change(screen.getByLabelText('Location *'), { target: { value: 'New trailhead' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'PUT', path: '/api/rides/:id' }),
        { params: { id: 3 }, body: { title: 'Hills', location: 'New trailhead', date: '2026-07-04', details: 'Steep', start: '2026-07-04' } },
      ),
    );
  });

  it('toasts on failure and keeps the dialog open', async () => {
    call.mockRejectedValue(new Error('500'));
    const { onClose } = renderModal();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Error adding ride')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Add New Ride' })).toBeInTheDocument();
  });

  it('cancel resets and closes without saving', () => {
    const { onClose } = renderModal();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(call).not.toHaveBeenCalled();
  });
});
