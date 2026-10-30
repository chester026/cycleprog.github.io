import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { call } from '../../data/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false, user: { id: 1 }, isAdmin: false }),
  registerLogoutCleanup: () => () => {},
}));
vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});
vi.mock('../../components/charts/TrendChart', () => ({
  default: ({ series }) => <div data-testid="trend-chart" data-name={series[0].name} />,
}));

import RideAnalysisModal from './RideAnalysisModal';

const activity = {
  id: 42,
  name: 'Morning Ride',
  type: 'Ride',
  start_date: '2024-01-08T08:00:00Z',
  distance: 42345,
  moving_time: 5430,
  total_elevation_gain: 512.6,
  average_speed: 7.8,
  max_speed: 12,
  max_heartrate: 180,
};

// 10 minutes at 1 s samples, HR sweeping Z1-Z5 for a 190/60 profile.
const streams = {
  time: { data: Array.from({ length: 600 }, (_, i) => i) },
  heartrate: { data: Array.from({ length: 600 }, (_, i) => 130 + (i % 60)) },
  cadence: { data: Array.from({ length: 600 }, () => 85) },
  velocity_smooth: { data: Array.from({ length: 600 }, () => 7.8) },
};

const profile = { max_hr: 190, resting_hr: 60 };
const goals = [{ id: 7, title: 'Endurance base', status: 'active', tier: 'epic', progress: 55, progressGain: 3, contributions: [] }];

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderModal(props = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/garage']}>
        <Routes>
          <Route path="*" element={<RideAnalysisModal open onClose={() => {}} activity={activity} {...props} />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockApi({ streamsResult = streams, goalsResult = goals } = {}) {
  call.mockImplementation((endpoint) => {
    if (endpoint.path === '/api/user-profile') return Promise.resolve(profile);
    if (endpoint.path === '/api/activities/:id/streams') {
      return streamsResult instanceof Error ? Promise.reject(streamsResult) : Promise.resolve(streamsResult);
    }
    if (endpoint.path === '/api/activities/:id/meta-goals-progress') {
      return goalsResult instanceof Error ? Promise.reject(goalsResult) : Promise.resolve(goalsResult);
    }
    return Promise.reject(new Error(`unexpected call ${endpoint.path}`));
  });
}

describe('RideAnalysisModal', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });
  afterEach(() => resetTestQueryClient());

  it('renders nothing when closed and requests no ride data', () => {
    mockApi();
    renderModal({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // The profile query is app-wide and shared; only the per-ride requests must wait for open.
    const paths = call.mock.calls.map(([endpoint]) => endpoint.path);
    expect(paths).not.toContain('/api/activities/:id/streams');
    expect(paths).not.toContain('/api/activities/:id/meta-goals-progress');
  });

  it('shows the empty state without an activity', () => {
    mockApi();
    renderModal({ activity: null });
    expect(screen.getByText('No ride to analyse yet')).toBeInTheDocument();
  });

  it('loads streams + goal progress and renders header, quality, charts, zones and goals', async () => {
    mockApi();
    renderModal();

    expect(screen.getByRole('dialog', { name: 'Ride Analytics' })).toBeInTheDocument();
    expect(screen.getByText('Morning Ride')).toBeInTheDocument();
    expect(screen.getByText('08.01.2024')).toBeInTheDocument();
    expect(screen.getByText('Ride')).toBeInTheDocument();
    expect(screen.getByText('42.3 km')).toBeInTheDocument();
    expect(screen.getByTestId('streams-loading')).toBeInTheDocument();

    expect(await screen.findByText(/Ride Quality: \d+/)).toBeInTheDocument();
    expect(screen.getByText('HR Zones')).toBeInTheDocument();
    expect(screen.getAllByTestId('trend-chart').map((el) => el.dataset.name)).toEqual(['Speed', 'Heart Rate', 'Cadence']);
    expect(await screen.findByText('Endurance base')).toBeInTheDocument();
    expect(screen.getByText('Epic')).toBeInTheDocument();

    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/activities/:id/streams' }),
      { params: { id: 42 }, query: { downsample: 400 } },
    );
    expect(call).toHaveBeenCalledWith(expect.objectContaining({ path: '/api/activities/:id/meta-goals-progress' }), {
      params: { id: 42 },
    });
  });

  it('shows error states when streams and goal progress fail, but keeps the summary', async () => {
    mockApi({ streamsResult: new Error('boom'), goalsResult: new Error('boom') });
    renderModal();
    expect(await screen.findByText('Could not load ride streams')).toBeInTheDocument();
    expect(await screen.findByText('Could not load goal progress')).toBeInTheDocument();
    expect(screen.getByText('42.3 km')).toBeInTheDocument();
    expect(screen.queryByText(/Ride Quality/)).not.toBeInTheDocument();
  });

  it('"Discuss with Coach" closes the modal and opens the coach with the ride prompt and id', async () => {
    mockApi();
    const onClose = vi.fn();
    renderModal({ onClose });
    await screen.findByText(/Ride Quality/);

    fireEvent.click(screen.getByRole('button', { name: 'Discuss with Coach' }));

    expect(onClose).toHaveBeenCalled();
    const location = screen.getByTestId('location').textContent;
    const params = new URLSearchParams(location.slice('/coach?'.length));
    expect(location.startsWith('/coach?')).toBe(true);
    expect(params.get('prompt')).toBe('Analyse my ride "Morning Ride" from 08.01.2024: 42.3km, 513m elevation, 90 min');
    expect(params.get('activity')).toBe('42');
  });

  it('a goal card closes the modal and navigates to the goal', async () => {
    mockApi();
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(await screen.findByRole('button', { name: /Endurance base/ }));
    expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/goals/7'));
  });
});
