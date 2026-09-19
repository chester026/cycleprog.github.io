import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../ui';
import EventsManager from '../EventsManager';
import { call } from '../../data/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});

// T-6.3: the ad-hoc `.modal-overlay` markup moved to the shared `src/ui`
// Modal, and delete confirmation moved from window.confirm to useConfirm.
function renderManager(props = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <EventsManager isOpen onClose={() => {}} {...props} />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('EventsManager', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('renders as a dialog and lists events from useEvents()', async () => {
    call.mockResolvedValueOnce([
      { id: 1, title: 'Gran Fondo', start_date: '2024-09-01', background_color: '#274DD3' },
    ]);
    renderManager();

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Events Manager')).toBeInTheDocument();
    expect(await screen.findByText('Gran Fondo')).toBeInTheDocument();
  });

  it('opens the add-event form and validates required fields', async () => {
    call.mockResolvedValueOnce([]);
    renderManager();

    expect(await screen.findByText('No events yet. Add your first trip or competition!')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Add New Event'));
    expect(screen.getByText('Add New Event', { selector: 'h2' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Add Event'));
    expect(await screen.findByText('Event title is required')).toBeInTheDocument();
  });

  it('deletes an event after confirming via the useConfirm dialog', async () => {
    call
      .mockResolvedValueOnce([
        { id: 5, title: 'Old Race', start_date: '2024-01-01', background_color: '#274DD3' },
      ])
      .mockResolvedValueOnce({ success: true }) // DELETE
      .mockResolvedValueOnce([]); // refetch

    renderManager();

    expect(await screen.findByText('Old Race')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Delete'));

    // Two "dialog"s exist at once here (EventsManager's own Modal + the
    // useConfirm ConfirmDialog) — grab the confirm one by its title.
    const confirmDialog = await screen.findByRole('dialog', { name: 'Delete event' });
    fireEvent.click(within(confirmDialog).getByText('Delete'));

    await waitFor(() => {
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'DELETE', path: '/api/events/:id' }),
        { params: { id: 5 } }
      );
    });
  });
});
