import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../ui';
import GaragePage from '../GaragePage';
import { call } from '../../data/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});

vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 1, name: 'Rider' }, isAuthenticated: true, isLoading: false }),
}));

// The ride card is a Leaflet map (no layout engine in jsdom) and the ride
// analysis modal has its own tests — both are reduced to probes here so the
// page test stays about the page's own wiring.
vi.mock('../../components/GarageLastRideCard', () => ({
  default: ({ lastRide, onAnalyze }) => (
    <div data-testid="last-ride-card">
      <span>{lastRide ? lastRide.name : 'No rides yet'}</span>
      <button type="button" onClick={onAnalyze}>Analyze ride</button>
    </div>
  ),
}));
vi.mock('../ride/RideAnalysisModal', () => ({
  default: ({ open, activity }) => (open ? <div role="dialog">Analysis of {activity?.name}</div> : null),
}));
vi.mock('../../components/Footer', () => ({ default: () => null }));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/garage']}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <Routes>
            <Route path="/garage" element={<GaragePage />} />
            <Route path="/analysis" element={<LocationProbe />} />
          </Routes>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const RIDES = [
  { id: 1, name: 'Morning loop', type: 'Ride', start_date: '2026-10-01T08:00:00Z', distance: 42000, average_speed: 8, total_elevation_gain: 300, average_watts: 180, average_heartrate: 140, average_cadence: 85 },
  { id: 2, name: 'Old spin', type: 'Ride', start_date: '2026-09-01T08:00:00Z', distance: 20000, average_speed: 7 },
];

// Every garage block reads through `call`; route by path so unrelated
// blocks (events, checklist, weather) get an empty-but-valid payload.
function mockApi({ activities = RIDES, bikes = [], achievements = [], failActivities = false, pending = false } = {}) {
  call.mockImplementation((def) => {
    switch (def.path) {
      case '/api/activities':
        if (pending) return new Promise(() => {});
        if (failActivities) return Promise.reject(new Error('strava down'));
        return Promise.resolve(activities);
      case '/api/bikes':
        return Promise.resolve(bikes);
      case '/api/achievements/me':
        return Promise.resolve({ achievements });
      case '/api/user-profile':
        return Promise.resolve({ id: 1, weight: 72 });
      case '/api/analytics/summary':
        return Promise.resolve({ summary: { vo2max: 51 } });
      case '/api/analytics-snapshot/history':
        return Promise.resolve([]);
      case '/api/events':
      case '/api/checklist':
      case '/api/rides':
        return Promise.resolve([]);
      case '/api/weather/forecast':
        return Promise.resolve({ daily: null });
      default:
        return Promise.resolve([]);
    }
  });
}

describe('GaragePage', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('shows a labelled skeleton while activities load', () => {
    mockApi({ pending: true });
    renderPage();
    expect(screen.getByRole('status', { name: 'Loading your last ride' })).toBeInTheDocument();
    expect(screen.queryByTestId('last-ride-card')).not.toBeInTheDocument();
  });

  it('renders the section headings, the latest ride and the primary bike once loaded', async () => {
    mockApi({ bikes: [{ id: 7, name: 'Canyon', primary: true, distanceKm: 1200, activitiesCount: 14 }] });
    renderPage();

    expect(await screen.findByText('Morning loop')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bike garage' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'My Rides' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Checklist' })).toBeInTheDocument();
    expect(screen.getByText('Canyon')).toBeInTheDocument();
    expect(screen.getByText('14 rides')).toBeInTheDocument();
    // No achievements → the "Achieves" section is not rendered at all.
    expect(screen.queryByRole('heading', { name: 'Achieves' })).not.toBeInTheDocument();
  });

  it('shows the Achieves section only when the rider has achievements', async () => {
    mockApi({
      achievements: [
        { id: 1, name: 'Century', tier: 'gold', metric: 'distance', threshold: 100000, unlocked: true, unlocked_at: '2026-09-01' },
      ],
    });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Achieves' })).toBeInTheDocument();
    expect(screen.getByText('Century')).toBeInTheDocument();
  });

  it('surfaces a Strava error but still renders the rest of the garage', async () => {
    mockApi({ failActivities: true });
    renderPage();
    expect(await screen.findByText('Could not load your rides from Strava')).toBeInTheDocument();
    expect(screen.getByText('No rides yet')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bike garage' })).toBeInTheDocument();
  });

  it('opens the ride analysis modal for the latest ride', async () => {
    mockApi();
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Analyze ride' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Analysis of Morning loop')).toBeInTheDocument();
  });

  it('navigates to /analysis from the primary bike card', async () => {
    mockApi({ bikes: [{ id: 7, name: 'Canyon', primary: true, distanceKm: 1200 }] });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Canyon/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/analysis');
  });
});
