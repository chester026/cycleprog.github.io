import React from 'react';
import {renderHook, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useActivities} from './useActivities';
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
    mockedApiCall.mockReset();
  });

  afterEach(() => {
    // See useProfile.test.tsx — clears each test's gcTime timer so Jest's
    // process can exit.
    clients.forEach(c => c.clear());
    clients.length = 0;
  });

  it('goes from loading to data', async () => {
    const activities = [{id: 1, name: 'Morning ride'}];
    mockedApiCall.mockResolvedValueOnce(activities);
    const queryClient = newClient();

    const {result} = renderHook(() => useActivities(), {wrapper: makeWrapper(queryClient)});

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(activities);
  });

  it('does not fetch when disabled, then fetches once enabled', async () => {
    mockedApiCall.mockResolvedValueOnce([{id: 2, name: 'Evening ride'}]);
    const queryClient = newClient();

    const {result, rerender} = renderHook(
      ({enabled}: {enabled: boolean}) => useActivities({enabled}),
      {wrapper: makeWrapper(queryClient), initialProps: {enabled: false}},
    );

    expect(result.current.isLoading).toBe(false);
    expect(mockedApiCall).not.toHaveBeenCalled();

    rerender({enabled: true});

    await waitFor(() => expect(result.current.data).toEqual([{id: 2, name: 'Evening ride'}]));
    expect(mockedApiCall).toHaveBeenCalledTimes(1);
  });

  it('a mutation that invalidates the activities key triggers a refetch with fresh data', async () => {
    mockedApiCall.mockResolvedValueOnce([{id: 1, name: 'Ride A'}]);
    const queryClient = newClient();

    const {result} = renderHook(() => useActivities(), {wrapper: makeWrapper(queryClient)});
    await waitFor(() => expect(result.current.data).toEqual([{id: 1, name: 'Ride A'}]));

    mockedApiCall.mockResolvedValueOnce([{id: 1, name: 'Ride A'}, {id: 2, name: 'Ride B'}]);
    await queryClient.invalidateQueries({queryKey: ['activities']});

    await waitFor(() =>
      expect(result.current.data).toEqual([{id: 1, name: 'Ride A'}, {id: 2, name: 'Ride B'}]),
    );
    expect(mockedApiCall).toHaveBeenCalledTimes(2);
  });
});
