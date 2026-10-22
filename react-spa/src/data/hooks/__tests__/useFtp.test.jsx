import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useFtp } from '../useFtp';
import { call } from '../../api';
import { resetTestQueryClient, Wrapper } from './testUtils';

vi.mock('../../api', async () => {
  const actual = await vi.importActual('../../api');
  return { ...actual, call: vi.fn() };
});

const ftpResponse = {
  totalMinutes: 42,
  totalIntervals: 7,
  highIntensitySessions: 3,
  activitiesAnalyzed: 10,
  activitiesSkipped: 0,
  hrThreshold: 165,
  days: 28,
};

describe('useFtp', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('calls GET /api/analytics/ftp with the given day window', async () => {
    call.mockResolvedValueOnce(ftpResponse);

    const { result } = renderHook(() => useFtp(28), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/api/analytics/ftp' }),
      { query: { days: 28 } }
    );
    expect(result.current.data.totalMinutes).toBe(42);
  });

  it('does not fetch when disabled (rider has no activities)', () => {
    const { result } = renderHook(() => useFtp(28, { enabled: false }), { wrapper: Wrapper });
    expect(call).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });

  it('surfaces a failed request as isError instead of swallowing it', async () => {
    call.mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() => useFtp(92), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error.message).toBe('boom');
  });
});
