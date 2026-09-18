import React from 'react';
import {renderHook, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useWeather} from './useWeather';
import {apiFetch} from '../../utils/api';

jest.mock('../../utils/api', () => ({
  apiFetch: jest.fn(),
}));

const mockedApiFetch = apiFetch as jest.Mock;

describe('useWeather', () => {
  const clients: QueryClient[] = [];

  function makeWrapper() {
    const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}});
    clients.push(queryClient);
    const Wrapper: React.FC<{children: React.ReactNode}> = ({children}) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return Wrapper;
  }

  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  afterEach(() => {
    clients.forEach(c => c.clear());
    clients.length = 0;
  });

  it('fetches the forecast for the given coordinates and selects `daily`', async () => {
    const daily = {
      time: ['2024-01-01'],
      temperature_2m_max: [20],
      temperature_2m_min: [10],
      precipitation_sum: [0],
      wind_speed_10m_max: [5],
      weather_code: [0],
    };
    mockedApiFetch.mockResolvedValueOnce({daily});

    const {result} = renderHook(() => useWeather(35.1264, 33.4299), {wrapper: makeWrapper()});
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(daily);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/weather/forecast?latitude=35.1264&longitude=33.4299',
    );
  });
});
