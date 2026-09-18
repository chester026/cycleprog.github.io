import React from 'react';
import {renderHook, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useProfile} from './useProfile';
import {apiFetch} from '../../utils/api';

jest.mock('../../utils/api', () => ({
  apiFetch: jest.fn(),
}));

const mockedApiFetch = apiFetch as jest.Mock;

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
    mockedApiFetch.mockReset();
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
    mockedApiFetch.mockResolvedValueOnce(profile);

    const {result} = renderHook(() => useProfile(), {wrapper: makeWrapper()});

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(profile);
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/user-profile');
  });

  it('surfaces a rejected apiFetch as an error state', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('network down'));

    const {result} = renderHook(() => useProfile(), {wrapper: makeWrapper()});

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
