import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDeviceBrand } from '../useDeviceBrand';
import { call } from '../../api';
import { resetTestQueryClient, Wrapper } from './testUtils';

vi.mock('../../api', async () => {
  const actual = await vi.importActual('../../api');
  return { ...actual, call: vi.fn() };
});

describe('useDeviceBrand', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('shows without fetching when no brand filter is given', () => {
    const { result } = renderHook(() => useDeviceBrand([{ id: 1 }], []), { wrapper: Wrapper });
    expect(result.current.shouldShow).toBe(true);
    expect(call).not.toHaveBeenCalled();
  });

  it('shows and strips the brand name when a matching device is found', async () => {
    call.mockResolvedValueOnce({ device_name: 'Garmin Edge 830' });

    const { result } = renderHook(() => useDeviceBrand([{ id: 42 }], ['Garmin']), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.shouldShow).toBe(true));
    expect(result.current.deviceName).toBe('Edge 830');
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/api/activities/:id' }),
      { params: { id: 42 } }
    );
  });

  it('hides when none of the checked activities match the brand', async () => {
    call.mockResolvedValueOnce({ device_name: 'Wahoo Elemnt' });

    const { result } = renderHook(() => useDeviceBrand([{ id: 1 }], ['Garmin']), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.shouldShow).toBe(false));
    expect(result.current.deviceName).toBe('');
  });
});
