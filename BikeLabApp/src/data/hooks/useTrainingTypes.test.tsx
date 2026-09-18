import React from 'react';
import {renderHook, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useTrainingTypes} from './useTrainingTypes';
import {apiFetch} from '../../utils/api';

jest.mock('../../utils/api', () => ({
  apiFetch: jest.fn(),
}));

const mockedApiFetch = apiFetch as jest.Mock;

describe('useTrainingTypes', () => {
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
    clients.forEach(c => c.clear());
    clients.length = 0;
  });

  it('fetches GET /api/training-types exactly once', async () => {
    const types = [{key: 'endurance', name: 'Endurance'}];
    mockedApiFetch.mockResolvedValueOnce(types);

    const {result} = renderHook(() => useTrainingTypes(), {wrapper: makeWrapper()});

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(types);
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/training-types');
  });

  it('does not fetch while enabled=false, e.g. a closed modal', async () => {
    const {result} = renderHook(() => useTrainingTypes(false), {wrapper: makeWrapper()});

    expect(result.current.isLoading).toBe(false);
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});
