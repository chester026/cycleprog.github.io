import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HeartRateZonesChart from './HeartRateZonesChart';

// T-6/audit follow-up: this chart now renders from GET /api/analytics/
// hr-zones (useHrZonesDistribution) instead of computing the distribution
// itself from per-activity streams — mock apiFetch instead of the streams
// endpoint.
const apiFetchMock = vi.fn();
vi.mock('../utils/api', () => ({
  apiFetch: (...args) => apiFetchMock(...args),
  isApiError: () => false,
}));

const profile = {
  hr_zones: {
    method: 'maxhr',
    basis: { max_hr: 190 },
    zones: [
      { id: 1, key: 'z1', nameKey: 'zones.z1', name: 'Recovery', min: 0, max: 114, color: '#22c55e' },
      { id: 2, key: 'z2', nameKey: 'zones.z2', name: 'Endurance', min: 114, max: 133, color: '#84cc16' },
      { id: 3, key: 'z3', nameKey: 'zones.z3', name: 'Tempo', min: 133, max: 152, color: '#eab308' },
      { id: 4, key: 'z4', nameKey: 'zones.z4', name: 'Threshold', min: 152, max: 171, color: '#f97316' },
      { id: 5, key: 'z5', nameKey: 'zones.z5', name: 'VO2 Max', min: 171, max: null, color: '#ef4444' },
    ],
  },
};

function serverResponse(overrides = {}) {
  return {
    zones: [
      { id: 1, name: 'Recovery', color: '#22c55e', min: 0, max: 114, seconds: 0, percent: 0 },
      { id: 2, name: 'Endurance', color: '#84cc16', min: 114, max: 133, seconds: 0, percent: 0 },
      { id: 3, name: 'Tempo', color: '#eab308', min: 133, max: 152, seconds: 1800, percent: 40 },
      { id: 4, name: 'Threshold', color: '#f97316', min: 152, max: 171, seconds: 2700, percent: 60 },
      { id: 5, name: 'VO2 Max', color: '#ef4444', min: 171, max: null, seconds: 0, percent: 0 },
    ],
    coverage: { total: 2, withStreams: 2, fallback: 0, pending: 0 },
    period: '4w',
    ...overrides,
  };
}

function renderWithClient(ui) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('HeartRateZonesChart', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('shows an empty state without a profile (no local zone computation fallback)', async () => {
    apiFetchMock.mockResolvedValue({ zones: [], coverage: { total: 0, withStreams: 0, fallback: 0, pending: 0 }, period: '4w' });
    renderWithClient(<HeartRateZonesChart activities={[]} profile={null} />);
    expect(await screen.findByText('Not enough data for heart rate zones')).toBeInTheDocument();
  });

  it('renders zone distribution from GET /api/analytics/hr-zones', async () => {
    apiFetchMock.mockResolvedValue(serverResponse());
    renderWithClient(<HeartRateZonesChart activities={[]} profile={profile} />);
    expect(apiFetchMock).toHaveBeenCalledWith('/api/analytics/hr-zones?period=4w');
    expect(await screen.findByText(/Zone 3 \(Tempo\)/)).toBeInTheDocument();
    expect(screen.getByText(/Zone 4 \(Threshold\)/)).toBeInTheDocument();
    // Zones with zero seconds are dropped from the donut, same as before.
    expect(screen.queryByText(/Zone 1 \(Recovery\)/)).not.toBeInTheDocument();
  });

  it('shows the server-derived calculation basis in Settings, not a recomputed age-based value', async () => {
    apiFetchMock.mockResolvedValue(serverResponse());
    renderWithClient(<HeartRateZonesChart activities={[]} profile={profile} />);
    screen.getByRole('button', { name: 'Settings' }).click();
    expect(await screen.findByText('Age-based estimation')).toBeInTheDocument();
    expect(screen.getByText('190 bpm')).toBeInTheDocument();
    expect(screen.queryByText(/220 - age/)).not.toBeInTheDocument();
  });

  it('shows a "still processing" note when coverage.pending > 0', async () => {
    apiFetchMock.mockResolvedValue(serverResponse({ coverage: { total: 22, withStreams: 15, fallback: 7, pending: 7 } }));
    renderWithClient(<HeartRateZonesChart activities={[]} profile={profile} />);
    expect(await screen.findByText(/7 rides still processing/)).toBeInTheDocument();
  });
});
