import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useHrZonesDistribution } from '../useHrZonesDistribution';
import { call } from '../../api';
import { resetTestQueryClient, Wrapper } from './testUtils';

vi.mock('../../api', async () => {
  const actual = await vi.importActual('../../api');
  return { ...actual, call: vi.fn() };
});

describe('useHrZonesDistribution', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('calls GET /api/analytics/hr-zones with the given period', async () => {
    call.mockResolvedValueOnce({ zones: [], coverage: { total: 0, withStreams: 0, fallback: 0, pending: 0 }, period: '3m' });

    const { result } = renderHook(() => useHrZonesDistribution('3m'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/api/analytics/hr-zones' }),
      { query: { period: '3m' } }
    );
    expect(result.current.data.period).toBe('3m');
  });

  it('does not fetch when period is not given', () => {
    renderHook(() => useHrZonesDistribution(undefined), { wrapper: Wrapper });
    expect(call).not.toHaveBeenCalled();
  });
});
