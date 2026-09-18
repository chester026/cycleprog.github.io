import React from 'react';
import {renderHook, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useUpdateMetaGoal} from './useUpdateMetaGoal';
import {apiFetch} from '../../utils/api';

jest.mock('../../utils/api', () => ({
  apiFetch: jest.fn(),
}));

const mockedApiFetch = apiFetch as jest.Mock;

describe('useUpdateMetaGoal', () => {
  const clients: QueryClient[] = [];

  function makeWrapper() {
    const queryClient = new QueryClient({
      defaultOptions: {queries: {retry: false}, mutations: {retry: false}},
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

  it('PUTs /api/meta-goals/:id with the given body', async () => {
    mockedApiFetch.mockResolvedValueOnce({id: 7, status: 'completed'});

    const {result} = renderHook(() => useUpdateMetaGoal(), {wrapper: makeWrapper()});

    result.current.mutate({id: 7, body: {status: 'completed'}});

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockedApiFetch).toHaveBeenCalledWith('/api/meta-goals/7', {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({status: 'completed'}),
    });
  });
});
