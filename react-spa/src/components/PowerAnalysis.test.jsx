import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import PowerAnalysis from './PowerAnalysis';
import { call } from '../data/api';
import { queryClient, resetTestQueryClient } from '../data/hooks/__tests__/testUtils';

vi.mock('../data/api', async () => {
  const actual = await vi.importActual('../data/api');
  return { ...actual, call: vi.fn() };
});
vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

const activities = [
  {
    id: 1, name: 'Flat tempo', start_date: '2026-10-01T08:00:00Z', distance: 40000, moving_time: 3600,
    total_elevation_gain: 100, estimated_power: { avgWatts: 200.4, method: 'estimated', hasWind: true }, average_temp: 21,
  },
  {
    id: 2, name: 'Hill repeats', start_date: '2026-10-05T08:00:00Z', distance: 30000, moving_time: 5400,
    total_elevation_gain: 900, estimated_power: { avgWatts: 260, method: 'measured' }, elev_high: 1450,
  },
  { id: 3, name: 'No estimate', start_date: '2026-10-06T08:00:00Z', distance: 1000, moving_time: 100 },
];

function renderPower(props = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <PowerAnalysis activities={activities} {...props} />
    </QueryClientProvider>,
  );
}

describe('PowerAnalysis', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
    call.mockResolvedValue({ weight: 72, bike_weight: 8 });
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('renders nothing without any power estimates or summary', () => {
    const { container } = renderPower({ activities: [{ id: 9, name: 'Bare' }] });
    expect(container).toBeEmptyDOMElement();
  });

  it('computes the stat cards from the activities that carry a server estimate', () => {
    const onStatsCalculated = vi.fn();
    renderPower({ trend: 7, onStatsCalculated });

    expect(screen.getByText('Average Power (W)').previousSibling).toHaveTextContent('230');
    expect(screen.getByText('+7')).toBeInTheDocument();
    expect(screen.getByText('Maximum Power (W)').previousSibling).toHaveTextContent('260');
    expect(screen.getByText('Minimum Power (W)').previousSibling).toHaveTextContent('200');
    expect(screen.getByText('Activities Analyzed').previousSibling).toHaveTextContent('2');
    expect(screen.getByText('With Power Meter').previousSibling).toHaveTextContent('1');
    expect(screen.getByText('Wind Adjusted').previousSibling).toHaveTextContent('1');
    expect(onStatsCalculated).toHaveBeenCalledWith(
      expect.objectContaining({ avgPower: 230, maxPower: 260, minPower: 200, totalActivities: 2 }),
    );
  });

  it('uses the period summary only as a fallback when no activity has an estimate', () => {
    renderPower({
      activities: [],
      summary: { avg: 180, best: 240, worst: 150, totalActivities: 9, activitiesWithRealPower: 0, activitiesWithWindData: 0 },
    });
    expect(screen.getByText('Average Power (W)').previousSibling).toHaveTextContent('180');
    expect(screen.getByText('Activities Analyzed').previousSibling).toHaveTextContent('9');
    expect(screen.queryByText('With Power Meter')).not.toBeInTheDocument();
    expect(screen.queryByText(/Maximum Power Top/)).toBeInTheDocument();
  });

  it('sorts the best list by power by default and by date on demand, and selects a ride on click', () => {
    renderPower();

    expect(screen.getByRole('heading', { name: 'Maximum Power Top' })).toBeInTheDocument();
    const rows = screen.getAllByRole('button', { name: /W$/ });
    expect(rows[0]).toHaveTextContent('Hill repeats');
    expect(rows[0]).toHaveTextContent('#1');

    // The top ride is selected by default — measured power is labelled as real.
    const detail = screen.getByRole('heading', { level: 4, name: 'Hill repeats' }).parentElement;
    expect(within(detail).getByText('Real Average Power:')).toBeInTheDocument();
    expect(within(detail).getByText('Max Elevation:').nextSibling).toHaveTextContent('1450 m');

    fireEvent.click(screen.getByRole('button', { name: 'Date' }));
    expect(screen.getByRole('heading', { name: 'Recent Activities' })).toBeInTheDocument();
    expect(screen.queryByText('#1')).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('button', { name: /Flat tempo/ }), { key: 'Enter' });
    const flatDetail = screen.getByRole('heading', { level: 4, name: 'Flat tempo' }).parentElement;
    expect(within(flatDetail).getByText('Estimated Power:')).toBeInTheDocument();
    expect(within(flatDetail).getByText('Wind:').nextSibling).toHaveTextContent('Adjusted');
    expect(within(flatDetail).getByText('Temperature:').nextSibling).toHaveTextContent('21°C');
  });

  it('mentions the rider and bike weight from the profile in the estimate note', async () => {
    renderPower();
    expect(await screen.findByText(/rider weight \(72kg \+ bike 8kg\)/)).toBeInTheDocument();
  });
});
