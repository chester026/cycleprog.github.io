import React from 'react';
import {renderHook, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useActivityStreams} from './useActivityStreams';
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

  beforeEach(() => mockedApiCall.mockReset());
  afterEach(() => {
    clients.forEach(c => c.clear());
    clients.length = 0;
  });

  it('requests the default ?downsample=400 for a chart-only load', async () => {
    mockedApiCall.mockResolvedValueOnce({heartrate: {data: [1, 2]}});

    const {result} = renderHook(() => useActivityStreams(42), {wrapper: makeWrapper()});
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedApiCall.mock.calls[0][0]).toMatchObject({method: 'GET', path: '/api/activities/:id/streams'});
    expect(mockedApiCall.mock.calls[0][1]).toEqual({params: {id: 42}, query: {downsample: 400}});
    expect(result.current.data).toEqual({heartrate: {data: [1, 2]}});
  });

  it('requests full resolution when downsample is explicitly null', async () => {
    mockedApiCall.mockResolvedValueOnce({});

    const {result} = renderHook(() => useActivityStreams(7, {downsample: null}), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedApiCall.mock.calls[0][1]).toEqual({params: {id: 7}, query: {}});
  });

  it('stays disabled without an activity id', () => {
    const {result} = renderHook(() => useActivityStreams(undefined), {wrapper: makeWrapper()});
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedApiCall).not.toHaveBeenCalled();
  });
});
