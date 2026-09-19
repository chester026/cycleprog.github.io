import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import LastRideBanner from '../LastRideBanner';
import { call } from '../../data/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});

function renderBanner() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LastRideBanner />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LastRideBanner', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('renders nothing while there is no Ride/VirtualRide activity', async () => {
    call.mockResolvedValueOnce([{ id: 1, type: 'Run', start_date: '2026-01-01' }]);
    renderBanner();
    expect(await screen.findByText(/no ride/i).catch(() => null)).toBeFalsy();
    expect(document.getElementById('last-ride-banner')).toBeNull();
  });

  it('shows the most recent Ride/VirtualRide from useActivities()', async () => {
    call.mockResolvedValueOnce([
      { id: 1, type: 'Ride', start_date: '2026-01-01T00:00:00Z', distance: 10000, average_speed: 5, average_heartrate: 140, average_cadence: 80 },
      { id: 2, type: 'VirtualRide', start_date: '2026-02-01T00:00:00Z', distance: 20000, average_speed: 6, average_heartrate: 150, average_cadence: 85 },
      { id: 3, type: 'Run', start_date: '2026-03-01T00:00:00Z' },
    ]);

    renderBanner();

    expect(await screen.findByText('20.0 km')).toBeInTheDocument();
  });
});
