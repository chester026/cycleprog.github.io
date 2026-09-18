import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDeviceBrand } from '../useDeviceBrand';
import { apiFetch } from '../../../utils/api';
import { resetTestQueryClient, Wrapper } from './testUtils';

vi.mock('../../../utils/api', () => ({
  apiFetch: vi.fn(),
}));

describe('useDeviceBrand', () => {
  beforeEach(() => {
    resetTestQueryClient();
    apiFetch.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('shows without fetching when no brand filter is given', () => {
    const { result } = renderHook(() => useDeviceBrand([{ id: 1 }], []), { wrapper: Wrapper });
    expect(result.current.shouldShow).toBe(true);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('shows and strips the brand name when a matching device is found', async () => {
    apiFetch.mockResolvedValueOnce({ device_name: 'Garmin Edge 830' });

    const { result } = renderHook(() => useDeviceBrand([{ id: 42 }], ['Garmin']), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.shouldShow).toBe(true));
    expect(result.current.deviceName).toBe('Edge 830');
    expect(apiFetch).toHaveBeenCalledWith('/api/activities/42');
  });

  it('hides when none of the checked activities match the brand', async () => {
    apiFetch.mockResolvedValueOnce({ device_name: 'Wahoo Elemnt' });

    const { result } = renderHook(() => useDeviceBrand([{ id: 1 }], ['Garmin']), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.shouldShow).toBe(false));
    expect(result.current.deviceName).toBe('');
  });
});
