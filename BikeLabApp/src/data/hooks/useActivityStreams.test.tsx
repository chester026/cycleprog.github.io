import React from 'react';
import {renderHook, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useActivityStreams} from './useActivityStreams';
import {apiFetch} from '../../utils/api';

jest.mock('../../utils/api', () => ({
  apiFetch: jest.fn(),
}));

const mockedApiFetch = apiFetch as jest.Mock;

describe('useActivityStreams', () => {
  const clients: QueryClient[] = [];

  function makeWrapper() {
    const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}});
    clients.push(queryClient);
    const Wrapper: React.FC<{children: React.ReactNode}> = ({children}) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return Wrapper;
  }

  beforeEach(() => mockedApiFetch.mockReset());
  afterEach(() => {
    clients.forEach(c => c.clear());
    clients.length = 0;
  });

  it('requests the default ?downsample=400 for a chart-only load', async () => {
    mockedApiFetch.mockResolvedValueOnce({heartrate: {data: [1, 2]}});

    const {result} = renderHook(() => useActivityStreams(42), {wrapper: makeWrapper()});
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledWith('/api/activities/42/streams?downsample=400');
    expect(result.current.data).toEqual({heartrate: {data: [1, 2]}});
  });

  it('requests full resolution when downsample is explicitly null', async () => {
    mockedApiFetch.mockResolvedValueOnce({});

    const {result} = renderHook(() => useActivityStreams(7, {downsample: null}), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledWith('/api/activities/7/streams');
  });

  it('stays disabled without an activity id', () => {
    const {result} = renderHook(() => useActivityStreams(undefined), {wrapper: makeWrapper()});
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});
