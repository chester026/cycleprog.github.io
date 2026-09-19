import React from 'react';
import {renderHook, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useWeather} from './useWeather';
import {api} from '../api';

// Mocks the typed contract entry point (T-7.1) — every hook now calls
// `api.call(def, input)` instead of `apiFetch(url)`. The domain maps
// (`userProfile`, `activities`, ...) come straight from `@bikelab/shared/api`
// (no native deps) rather than `jest.requireActual('../api')`, which would
// also re-run `../api`'s own `import {apiClient} from '../utils/api'` and
// pull in the keychain-backed client / react-native-config — neither
// transpiles under this preset and neither is needed for these tests.
jest.mock('../api', () => ({
  ...jest.requireActual('@bikelab/shared/api'),
  api: {call: jest.fn()},
}));

const mockedApiCall = api.call as jest.Mock;

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
    mockedApiCall.mockReset();
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
    mockedApiCall.mockResolvedValueOnce({daily});

    const {result} = renderHook(() => useWeather(35.1264, 33.4299), {wrapper: makeWrapper()});
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(daily);
    expect(mockedApiCall.mock.calls[0][0]).toMatchObject({method: 'GET', path: '/api/weather/forecast'});
    expect(mockedApiCall.mock.calls[0][1]).toEqual({query: {latitude: 35.1264, longitude: 33.4299}});
  });
});
