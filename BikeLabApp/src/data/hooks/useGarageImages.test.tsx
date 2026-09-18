import React from 'react';
import {renderHook, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useGarageImages} from './useGarageImages';
import {apiFetch} from '../../utils/api';

jest.mock('../../utils/api', () => ({
  apiFetch: jest.fn(),
}));

const mockedApiFetch = apiFetch as jest.Mock;

describe('useGarageImages', () => {
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

  it('calls GET /api/garage/positions exactly once and returns the slots', async () => {
    const images = {right: {url: 'https://cdn/img.jpg', fileId: 'f1', name: 'n'}};
    mockedApiFetch.mockResolvedValueOnce(images);

    const {result} = renderHook(() => useGarageImages(), {wrapper: makeWrapper()});
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(images);
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/garage/positions');
  });
});
