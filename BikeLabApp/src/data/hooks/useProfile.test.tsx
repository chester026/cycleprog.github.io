import React from 'react';
import {renderHook, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useProfile} from './useProfile';
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

describe('useProfile', () => {
  const clients: QueryClient[] = [];

  function makeWrapper() {
    const queryClient = new QueryClient({
      defaultOptions: {queries: {retry: false}},
    });
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
    // TanStack Query schedules a real (non-`unref`'d) gcTime setTimeout per
    // query — without this, Jest's process never sees an idle event loop
    // and hangs after the last test instead of exiting.
    clients.forEach(c => c.clear());
    clients.length = 0;
  });

  it('goes from loading to data, calling GET /api/user-profile exactly once', async () => {
    const profile = {id: 1, name: 'Rider'};
    mockedApiCall.mockResolvedValueOnce(profile);

    const {result} = renderHook(() => useProfile(), {wrapper: makeWrapper()});

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(profile);
    expect(mockedApiCall).toHaveBeenCalledTimes(1);
    expect(mockedApiCall.mock.calls[0][0]).toMatchObject({method: 'GET', path: '/api/user-profile'});
  });

  it('surfaces a rejected apiFetch as an error state', async () => {
    mockedApiCall.mockRejectedValueOnce(new Error('network down'));

    const {result} = renderHook(() => useProfile(), {wrapper: makeWrapper()});

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
