import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../ui';
import TrainingsPage from '../TrainingsPage';
import { call } from '../../data/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});

vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 1 }, isAuthenticated: true, isLoading: false }),
}));

vi.mock('../../components/BlobOrb', () => ({ default: () => null }));
vi.mock('../../components/PartnersLogo', () => ({ default: () => null }));
vi.mock('../../components/Footer', () => ({ default: () => null }));
vi.mock('../ride/RideAnalysisModal', () => ({
  default: ({ open, activity }) => (open ? <div role="dialog">Analysis of {activity?.name}</div> : null),
}));

const RIDES = [
  { id: 1, name: 'Spring classic', type: 'Ride', start_date: '2025-04-10T08:00:00Z', distance: 120000, average_speed: 8 },
  { id: 2, name: 'Autumn spin', type: 'Ride', start_date: '2026-10-02T08:00:00Z', distance: 30000, average_speed: 7 },
  { id: 3, name: 'Trainer session', type: 'VirtualRide', start_date: '2026-10-05T08:00:00Z', distance: 25000, average_speed: 9 },
  { id: 4, name: 'Morning jog', type: 'Run', start_date: '2026-10-06T08:00:00Z', distance: 8000, average_speed: 3 },
];

function mockApi({ activities = RIDES, fail = false, pending = false } = {}) {
  call.mockImplementation((def, input) => {
    switch (def.path) {
      case '/api/activities':
        if (pending) return new Promise(() => {});
        if (fail) return Promise.reject(new Error('strava down'));
        return Promise.resolve(activities);
      case '/api/analytics/summary': {
        const year = input?.query?.year;
        return Promise.resolve({
          summary: year === '2025'
            ? { totalKm: 120, totalElev: 2400, totalMovingHours: 4.2, avgSpeed: 28.8 }
            : { totalKm: 175, totalElev: 3000, totalMovingHours: 6.5, avgSpeed: 27.1 },
        });
      }
      default:
        return Promise.resolve([]);
    }
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <TrainingsPage />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('TrainingsPage', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('shows only bicycle activities grouped by year with the summary totals', async () => {
    mockApi();
    renderPage();

    expect(await screen.findByText('Autumn spin')).toBeInTheDocument();
    expect(screen.getByText('Trainer session')).toBeInTheDocument();
    expect(screen.getByText('Spring classic')).toBeInTheDocument();
    // Runs never make it onto this page.
    expect(screen.queryByText('Morning jog')).not.toBeInTheDocument();
    // Year headers in the table (the year <select> lists them too).
    expect(screen.getAllByText('2026')).toHaveLength(2);
    expect(screen.getAllByText('2025')).toHaveLength(2);

    expect(screen.getByText('Total Distance').parentElement).toHaveTextContent('175');
    expect(screen.getByText('Average Speed').parentElement).toHaveTextContent('27.1');
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/analytics/summary' }),
      { query: { period: undefined, year: 'all' } },
    );
  });

  it('re-queries the summary and narrows the list when a year is selected', async () => {
    mockApi();
    renderPage();
    await screen.findByText('Autumn spin');

    const select = screen.getByRole('combobox', { name: 'Select year' });
    expect(Array.from(select.querySelectorAll('option')).map((o) => o.textContent)).toEqual(['All Years', '2026', '2025']);

    fireEvent.change(select, { target: { value: '2025' } });
    await waitFor(() => expect(screen.getByText('Total Distance').parentElement).toHaveTextContent('120'));
    expect(screen.getByText('Spring classic')).toBeInTheDocument();
    expect(screen.queryByText('Autumn spin')).not.toBeInTheDocument();
  });

  it('filters by name through the filter panel and resets', async () => {
    mockApi();
    renderPage();
    await screen.findByText('Autumn spin');

    // The filter panel starts collapsed.
    fireEvent.click(screen.getByTitle('Collapse/Expand filters'));
    fireEvent.change(screen.getByLabelText('Search by name'), { target: { value: 'trainer' } });
    expect(screen.getByText('Trainer session')).toBeInTheDocument();
    expect(screen.queryByText('Autumn spin')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset Filters' }));
    expect(screen.getByText('Autumn spin')).toBeInTheDocument();
  });

  it('opens the analysis modal for a row', async () => {
    mockApi();
    renderPage();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Analyze' }))[0]);
    expect(screen.getByRole('dialog')).toHaveTextContent(/Analysis of (Trainer session|Autumn spin)/);
  });

  it('shows the error banner and no table when Strava data fails', async () => {
    mockApi({ fail: true });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Error loading Strava data');
    expect(screen.queryByText('No trainings')).not.toBeInTheDocument();
  });

  it('shows the empty table state for a rider with no rides', async () => {
    mockApi({ activities: [] });
    renderPage();
    expect(await screen.findByText('No trainings')).toBeInTheDocument();
    expect(screen.getByText('Total Distance').parentElement).toHaveTextContent('175');
  });
});
