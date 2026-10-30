import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../ui';
import EventsHero from '../EventsHero';
import { call } from '../../data/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});

function renderHero() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <EventsHero />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('EventsHero', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('shows a skeleton while events load', () => {
    call.mockReturnValue(new Promise(() => {}));
    renderHero();
    expect(screen.getByRole('status', { name: 'Loading events' })).toBeInTheDocument();
  });

  it('shows an error instead of the empty state when the request fails', async () => {
    call.mockRejectedValue(new Error('offline'));
    renderHero();
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load events: offline");
    expect(screen.queryByText('No upcoming events')).not.toBeInTheDocument();
  });

  it('renders the first event once loaded', async () => {
    call.mockResolvedValue([
      { id: 1, title: 'Gran Fondo', start_date: '2026-09-01', background_color: '#274DD3' },
    ]);
    renderHero();
    expect(await screen.findByText('Gran Fondo')).toBeInTheDocument();
  });
});
