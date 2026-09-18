import React from 'react';
import {renderHook, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useActivityAiAnalysis} from './useActivityAiAnalysis';
import {apiFetch} from '../../utils/api';

jest.mock('../../utils/api', () => ({
  apiFetch: jest.fn(),
}));

const mockedApiFetch = apiFetch as jest.Mock;

describe('useActivityAiAnalysis', () => {
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

  it('stays disabled by default, even with an activity id (AI budget guard)', () => {
    const {result} = renderHook(() => useActivityAiAnalysis(5), {wrapper: makeWrapper()});
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('fetches GET /api/activities/:id/ai-analysis once enabled', async () => {
    mockedApiFetch.mockResolvedValueOnce({analysis: 'Great ride!'});

    const {result} = renderHook(() => useActivityAiAnalysis(5, {enabled: true}), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledWith('/api/activities/5/ai-analysis');
    expect(result.current.data?.analysis).toBe('Great ride!');
  });
});
