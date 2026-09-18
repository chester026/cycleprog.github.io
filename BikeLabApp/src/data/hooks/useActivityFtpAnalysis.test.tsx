import React from 'react';
import {renderHook, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useActivityFtpAnalysis} from './useActivityFtpAnalysis';
import {apiFetch} from '../../utils/api';

jest.mock('../../utils/api', () => ({
  apiFetch: jest.fn(),
}));

const mockedApiFetch = apiFetch as jest.Mock;

describe('useActivityFtpAnalysis', () => {
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

  it('calls GET /api/activities/:id/ftp-analysis', async () => {
    mockedApiFetch.mockResolvedValueOnce({totalMinutes: 12, totalIntervals: 2, hrThreshold: 160, fromCache: true});

    const {result} = renderHook(() => useActivityFtpAnalysis(99), {wrapper: makeWrapper()});
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledWith('/api/activities/99/ftp-analysis');
    expect(result.current.data?.totalMinutes).toBe(12);
  });

  it('stays disabled without an activity id', () => {
    const {result} = renderHook(() => useActivityFtpAnalysis(undefined), {wrapper: makeWrapper()});
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});
