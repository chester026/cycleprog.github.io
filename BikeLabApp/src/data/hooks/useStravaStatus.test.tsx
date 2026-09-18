import React from 'react';
import {renderHook, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useStravaStatus} from './useStravaStatus';
import {apiFetch} from '../../utils/api';

jest.mock('../../utils/api', () => ({
  apiFetch: jest.fn(),
}));

const mockedApiFetch = apiFetch as jest.Mock;

describe('useStravaStatus', () => {
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

  it('derives connected: false with no strava_id on the profile', async () => {
    mockedApiFetch.mockResolvedValueOnce({id: 1, name: 'Rider'});

    const {result} = renderHook(() => useStravaStatus(), {wrapper: makeWrapper()});

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.status).toEqual({
      connected: false,
      athleteName: 'Rider',
      stravaId: null,
    });
  });

  it('derives connected: true once the profile has a strava_id', async () => {
    mockedApiFetch.mockResolvedValueOnce({id: 1, name: 'Rider', strava_id: 555});

    const {result} = renderHook(() => useStravaStatus(), {wrapper: makeWrapper()});

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.status).toEqual({
      connected: true,
      athleteName: 'Rider',
      stravaId: 555,
    });
  });
});
