import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useHrZonesDistribution } from '../useHrZonesDistribution';
import { apiFetch } from '../../../utils/api';
import { resetTestQueryClient, Wrapper } from './testUtils';

vi.mock('../../../utils/api', () => ({
  apiFetch: vi.fn(),
}));

describe('useHrZonesDistribution', () => {
  beforeEach(() => {
    resetTestQueryClient();
    apiFetch.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('calls GET /api/analytics/hr-zones with the given period', async () => {
    apiFetch.mockResolvedValueOnce({ zones: [], coverage: { total: 0, withStreams: 0, fallback: 0, pending: 0 }, period: '3m' });

    const { result } = renderHook(() => useHrZonesDistribution('3m'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(apiFetch).toHaveBeenCalledWith('/api/analytics/hr-zones?period=3m');
    expect(result.current.data.period).toBe('3m');
  });

  it('does not fetch when period is not given', () => {
    renderHook(() => useHrZonesDistribution(undefined), { wrapper: Wrapper });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
