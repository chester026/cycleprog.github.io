import React from 'react';
import {renderHook, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useGarminConnectStatus} from './useGarminConnectStatus';
import {api} from '../api';

// Same mocking convention as useOuraStatus.test.tsx: the contract maps come
// from @bikelab/shared/api, only the transport is faked.
jest.mock('../api', () => ({
  ...jest.requireActual('@bikelab/shared/api'),
  api: {call: jest.fn()},
}));

const mockedApiCall = api.call as jest.Mock;

describe('useGarminConnectStatus', () => {
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

  it('goes from loading to data, calling GET /api/garmin/connect/status exactly once', async () => {
    const status = {
      connected: true,
      available: false,
      transport: 'personal',
      connected_at: '2026-11-10T08:00:00.000Z',
      last_sync_at: '2026-11-10T08:05:00.000Z',
      activities: 172,
      last_activity_at: '2026-11-08T09:58:38.000Z',
      health_days: 30,
      last_health_day: '2026-11-09',
      health_latest: null,
    };
    mockedApiCall.mockResolvedValueOnce(status);

    const {result} = renderHook(() => useGarminConnectStatus(), {wrapper: makeWrapper()});

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(status);
    expect(mockedApiCall).toHaveBeenCalledTimes(1);
    expect(mockedApiCall.mock.calls[0][0]).toMatchObject({method: 'GET', path: '/api/garmin/connect/status'});
  });
});
