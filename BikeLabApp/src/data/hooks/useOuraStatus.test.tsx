import React from 'react';
import {renderHook, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useOuraStatus} from './useOuraStatus';
import {apiFetch} from '../../utils/api';

jest.mock('../../utils/api', () => ({
  apiFetch: jest.fn(),
}));

const mockedApiFetch = apiFetch as jest.Mock;

describe('useOuraStatus', () => {
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

  it('goes from loading to data, calling GET /api/oura/status exactly once', async () => {
    const status = {connected: true, ouraUserId: 'abc', latest: null};
    mockedApiFetch.mockResolvedValueOnce(status);

    const {result} = renderHook(() => useOuraStatus(), {wrapper: makeWrapper()});

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(status);
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/oura/status');
  });
});
