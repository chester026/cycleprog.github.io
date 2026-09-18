import React from 'react';
import {renderHook, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useActivityMetaGoalsProgress} from './useActivityMetaGoalsProgress';
import {apiFetch} from '../../utils/api';

jest.mock('../../utils/api', () => ({
  apiFetch: jest.fn(),
}));

const mockedApiFetch = apiFetch as jest.Mock;

describe('useActivityMetaGoalsProgress', () => {
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

  it('calls GET /api/activities/:id/meta-goals-progress and defaults to []', async () => {
    mockedApiFetch.mockResolvedValueOnce(null);

    const {result} = renderHook(() => useActivityMetaGoalsProgress(21), {wrapper: makeWrapper()});
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledWith('/api/activities/21/meta-goals-progress');
    expect(result.current.data).toEqual([]);
  });

  it('stays disabled without an activity id', () => {
    const {result} = renderHook(() => useActivityMetaGoalsProgress(undefined), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});
