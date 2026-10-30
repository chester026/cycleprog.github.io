import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import WeatherBlock from '../WeatherBlock';
import { call } from '../../data/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});

function daily(dateIso, { tmax, tmin, code }) {
  return {
    time: [dateIso],
    temperature_2m_max: [tmax],
    temperature_2m_min: [tmin],
    precipitation_sum: [1.2],
    wind_speed_10m_max: [5],
    weather_code: [code],
  };
}

function renderBlock() {
  return render(
    <QueryClientProvider client={queryClient}>
      <WeatherBlock />
    </QueryClientProvider>,
  );
}

describe('WeatherBlock', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('requests both reference points and renders the coast forecast first', async () => {
    call.mockImplementation((def, { query }) =>
      Promise.resolve({
        daily:
          query.latitude === 35.1264
            ? daily('2026-10-17', { tmax: 27.6, tmin: 18.2, code: 0 })
            : daily('2026-10-17', { tmax: 12.4, tmin: 4.9, code: 71 }),
      }),
    );
    renderBlock();

    expect(await screen.findByText('28°')).toBeInTheDocument();
    expect(screen.getByText('/18°')).toBeInTheDocument();
    expect(screen.getByText('☀️')).toBeInTheDocument();
    expect(screen.getAllByText(/17 Oct/)).toHaveLength(2);
    // UV is optional in the payload.
    expect(screen.getAllByText('UV:')[0].parentElement).toHaveTextContent('—');

    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/weather/forecast' }),
      { query: { latitude: 35.1264, longitude: 33.4299 } },
    );
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/weather/forecast' }),
      { query: { latitude: 34.9333, longitude: 32.8667 } },
    );

    // The mountain tab is rendered too, just hidden until selected.
    const mountainCard = screen.getByText('12°');
    expect(mountainCard).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Mountains' }));
    expect(mountainCard).toBeVisible();
    expect(screen.getByText('28°')).not.toBeVisible();
  });

  it('shows the error message when a forecast request fails', async () => {
    call.mockRejectedValue(new Error('upstream timeout'));
    renderBlock();
    expect(await screen.findByText(/Failed to load weather forecast: upstream timeout/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Coast' })).not.toBeInTheDocument();
  });
});
