import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import FTPAnalysis from './FTPAnalysis';
import { call } from '../data/api';
import { queryClient, resetTestQueryClient } from '../data/hooks/__tests__/testUtils';

vi.mock('../data/api', async () => {
  const actual = await vi.importActual('../data/api');
  return { ...actual, call: vi.fn() };
});

const oneRide = [{ id: 1, start_date: '2026-10-01T08:00:00Z' }];

function renderFtp(props = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <FTPAnalysis activities={oneRide} selectedPeriod="4w" userProfile={{}} summary={{ vo2max: 52 }} {...props} />
    </QueryClientProvider>
  );
}

describe('FTPAnalysis', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('shows an explicit empty state instead of a stuck loader when there are no activities', () => {
    renderFtp({ activities: [] });
    expect(screen.getByText(/No rides in this period yet/)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(call).not.toHaveBeenCalled();
  });

  it('renders a skeleton while GET /api/analytics/ftp is in flight', () => {
    call.mockReturnValue(new Promise(() => {}));
    renderFtp();
    expect(screen.getByRole('status', { name: 'Loading FTP analysis' })).toBeInTheDocument();
  });

  it('renders server minutes/intervals and the threshold once loaded', async () => {
    call.mockResolvedValue({
      totalMinutes: 77,
      totalIntervals: 11,
      highIntensitySessions: 4,
      activitiesAnalyzed: 1,
      activitiesSkipped: 0,
      hrThreshold: 168,
      days: 28,
    });
    renderFtp();
    expect(await screen.findByText('77')).toBeInTheDocument();
    expect(screen.getByText('11')).toBeInTheDocument();
    expect(screen.getByText(/Heart rate ≥ 168 bpm/)).toBeInTheDocument();
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/analytics/ftp' }),
      { query: { days: 28 } }
    );
  });

  it('shows an error message when the request fails', async () => {
    call.mockRejectedValue(new Error('Server down'));
    renderFtp();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load FTP analysis: Server down");
  });
});
