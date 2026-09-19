import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../ui';
import MyRidesBlock from '../MyRidesBlock';
import { call } from '../../data/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});

// T-6.3: MyRidesBlock now confirms deletes via useConfirm (a rendered
// dialog, not window.confirm) and reports failures via useToast.
function renderBlock() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MyRidesBlock />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('MyRidesBlock', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('shows the empty state and opens the add-ride modal', async () => {
    call.mockResolvedValueOnce([]);
    renderBlock();

    expect(await screen.findByText('No planned rides yet')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Add Ride'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Add New Ride')).toBeInTheDocument();
  });

  it('lists rides and deletes one after confirming via the useConfirm dialog', async () => {
    call
      .mockResolvedValueOnce([
        { id: 1, title: 'Loop', location: 'Park', start: '2024-06-01T09:00:00Z' },
      ])
      .mockResolvedValueOnce({ success: true }) // DELETE
      .mockResolvedValueOnce([]); // refetch after invalidation

    renderBlock();

    expect(await screen.findByText(/Location: Park/)).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Delete ride'));
    // useConfirm's dialog renders instead of window.confirm.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'DELETE', path: '/api/rides/:id' }),
        { params: { id: 1 } }
      );
    });
  });

  it('opens the edit modal prefilled with the ride being edited', async () => {
    call.mockResolvedValueOnce([
      { id: 2, title: 'Hills', location: 'Trailhead', start: '2024-07-04T09:00:00Z', details: 'Steep' },
    ]);
    renderBlock();

    expect(await screen.findByText(/Location: Trailhead/)).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Edit ride'));

    expect(screen.getByText('Edit Ride')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Hills')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Trailhead')).toBeInTheDocument();
  });
});
