import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import StravaTab from './StravaTab';
import { call } from '../../data/api';
import { ToastProvider } from '../../ui';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});

function renderTab() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <StravaTab />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const LIMITS = { usage15min: 12, limit15min: 200, usageDay: 340, limitDay: 2000, lastUpdate: '2026-10-16T10:00:00Z' };

describe('StravaTab', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('never fetches limits on mount (saves API quota) and says so', () => {
    renderTab();
    expect(screen.getByText(/No data - click update to load/)).toBeInTheDocument();
    expect(call).not.toHaveBeenCalled();
  });

  it('asks for confirmation and does nothing when cancelled', () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Update Limits/ }));
    const dialog = screen.getByRole('dialog', { name: 'Update limits' });
    expect(dialog).toHaveTextContent(/uses Strava API rate limits/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(call).not.toHaveBeenCalled();
  });

  it('reads the stored limits, forces a refresh and shows the refreshed numbers', async () => {
    call.mockImplementation((def) => {
      if (def.path === '/api/strava/limits') return Promise.resolve({ ...LIMITS, usage15min: 5 });
      if (def.path === '/api/strava/limits/refresh') return Promise.resolve({ limits: LIMITS });
      return Promise.reject(new Error(`unexpected ${def.path}`));
    });
    renderTab();

    fireEvent.click(screen.getByRole('button', { name: /Update Limits/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Update' }));

    expect(await screen.findByText('Strava limits updated (API used)')).toBeInTheDocument();
    const calledPaths = call.mock.calls.map(([def]) => `${def.method} ${def.path}`);
    expect(calledPaths).toEqual(['GET /api/strava/limits', 'POST /api/strava/limits/refresh']);

    // The refresh response wins over the GET: usage15min is 12, not 5.
    await waitFor(() => expect(screen.getByText(/15 min:/)).toHaveTextContent('15 min: 12 / 200'));
    expect(screen.getByText(/^Day:/)).toHaveTextContent('Day: 340 / 2000');
    expect(screen.getByText(/Last updated:/)).not.toHaveTextContent('—');
  });

  it('reports the failure in a toast', async () => {
    call.mockRejectedValue(new Error('quota exhausted'));
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Update Limits/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Update' }));
    expect(await screen.findByText('Error getting Strava limits: quota exhausted')).toBeInTheDocument();
  });
});
