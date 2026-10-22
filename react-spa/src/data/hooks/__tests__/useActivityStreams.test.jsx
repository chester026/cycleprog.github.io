import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useActivityStreams } from '../useActivityStreams';
import { call } from '../../api';
import { resetTestQueryClient, Wrapper } from './testUtils';

vi.mock('../../api', async () => {
  const actual = await vi.importActual('../../api');
  return { ...actual, call: vi.fn() };
});

describe('useActivityStreams', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });
  afterEach(() => resetTestQueryClient());

  it('fetches GET /api/activities/:id/streams downsampled to 400 points by default', async () => {
    const streams = { heartrate: { data: [140, 150] } };
    call.mockResolvedValueOnce(streams);

    const { result } = renderHook(() => useActivityStreams(42), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(streams);
    expect(call).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET', path: '/api/activities/:id/streams' }), {
      params: { id: 42 },
      query: { downsample: 400 },
    });
  });

  it('asks for full resolution with downsample: null and stays idle without an id', async () => {
    call.mockResolvedValueOnce({});
    const { result } = renderHook(() => useActivityStreams('7', { downsample: null }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(call).toHaveBeenCalledWith(expect.anything(), { params: { id: 7 }, query: {} });

    const idle = renderHook(() => useActivityStreams(undefined), { wrapper: Wrapper });
    expect(idle.result.current.fetchStatus).toBe('idle');
    expect(call).toHaveBeenCalledTimes(1);
  });
});
