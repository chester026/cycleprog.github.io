import React from 'react';
import {renderHook, act} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useRefreshActivities} from './useRefreshActivities';
import {api} from '../api';

// Same shape as the other hook tests here: the typed contract maps come
// from @bikelab/shared/api (no native deps), only `api.call` is mocked.
jest.mock('../api', () => ({
  ...jest.requireActual('@bikelab/shared/api'),
  api: {call: jest.fn()},
}));

const mockedApiCall = api.call as jest.Mock;

describe('useRefreshActivities', () => {
  let queryClient: QueryClient;

  function makeWrapper() {
    queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}});
    const Wrapper: React.FC<{children: React.ReactNode}> = ({children}) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return Wrapper;
  }

  beforeEach(() => {
    mockedApiCall.mockReset().mockResolvedValue({success: true, message: 'ok'});
  });

  it('clears the server activities cache before invalidating the client cache', async () => {
    const order: string[] = [];
    mockedApiCall.mockImplementation(async (def: {path: string}) => {
      order.push(def.path);
      return {success: true, message: 'ok'};
    });

    const {result} = renderHook(() => useRefreshActivities(), {wrapper: makeWrapper()});
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries').mockImplementation(async () => {
      order.push('invalidate');
    });

    await act(() => result.current());

    expect(order).toEqual(['/api/activities/cache/clear', 'invalidate']);
    invalidate.mockRestore();
  });

  it('still invalidates when the cache-clear call fails', async () => {
    mockedApiCall.mockRejectedValue(new Error('offline'));

    const {result} = renderHook(() => useRefreshActivities(), {wrapper: makeWrapper()});
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await act(() => result.current());

    expect(invalidate).toHaveBeenCalled();
    invalidate.mockRestore();
  });
});
