import React from 'react';
import {renderHook, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useActivities} from './useActivities';
import {apiFetch} from '../../utils/api';

jest.mock('../../utils/api', () => ({
  apiFetch: jest.fn(),
}));

const mockedApiFetch = apiFetch as jest.Mock;

function makeWrapper(queryClient: QueryClient) {
  const Wrapper: React.FC<{children: React.ReactNode}> = ({children}) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

describe('useActivities', () => {
  const clients: QueryClient[] = [];

  function newClient() {
    const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}});
    clients.push(queryClient);
    return queryClient;
  }

  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  afterEach(() => {
    // See useProfile.test.tsx — clears each test's gcTime timer so Jest's
    // process can exit.
    clients.forEach(c => c.clear());
    clients.length = 0;
  });

  it('goes from loading to data', async () => {
    const activities = [{id: 1, name: 'Morning ride'}];
    mockedApiFetch.mockResolvedValueOnce(activities);
    const queryClient = newClient();

    const {result} = renderHook(() => useActivities(), {wrapper: makeWrapper(queryClient)});

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(activities);
  });

  it('does not fetch when disabled, then fetches once enabled', async () => {
    mockedApiFetch.mockResolvedValueOnce([{id: 2, name: 'Evening ride'}]);
    const queryClient = newClient();

    const {result, rerender} = renderHook(
      ({enabled}: {enabled: boolean}) => useActivities({enabled}),
      {wrapper: makeWrapper(queryClient), initialProps: {enabled: false}},
    );

    expect(result.current.isLoading).toBe(false);
    expect(mockedApiFetch).not.toHaveBeenCalled();

    rerender({enabled: true});

    await waitFor(() => expect(result.current.data).toEqual([{id: 2, name: 'Evening ride'}]));
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });

  it('a mutation that invalidates the activities key triggers a refetch with fresh data', async () => {
    mockedApiFetch.mockResolvedValueOnce([{id: 1, name: 'Ride A'}]);
    const queryClient = newClient();

    const {result} = renderHook(() => useActivities(), {wrapper: makeWrapper(queryClient)});
    await waitFor(() => expect(result.current.data).toEqual([{id: 1, name: 'Ride A'}]));

    mockedApiFetch.mockResolvedValueOnce([{id: 1, name: 'Ride A'}, {id: 2, name: 'Ride B'}]);
    await queryClient.invalidateQueries({queryKey: ['activities']});

    await waitFor(() =>
      expect(result.current.data).toEqual([{id: 1, name: 'Ride A'}, {id: 2, name: 'Ride B'}]),
    );
    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
  });
});
