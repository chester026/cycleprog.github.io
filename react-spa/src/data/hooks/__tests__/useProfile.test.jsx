import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useProfile } from '../useProfile';
import { call } from '../../api';
import { resetTestQueryClient, Wrapper } from './testUtils';

// useProfile() is gated on auth — pretend we're signed in.
vi.mock('../../../auth/AuthProvider', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false, user: { id: 1 }, isAdmin: false }),
  registerLogoutCleanup: () => () => {},
}));
vi.mock('../../api', async () => {
  const actual = await vi.importActual('../../api');
  return { ...actual, call: vi.fn() };
});

describe('useProfile', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('goes from loading to data once GET /api/user-profile resolves', async () => {
    const profile = { id: 1, height: 180, weight: 75 };
    call.mockResolvedValueOnce(profile);

    const { result } = renderHook(() => useProfile(), { wrapper: Wrapper });

    // Starts in a loading state with no data yet.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(profile);
    expect(call).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET', path: '/api/user-profile' }));
  });
});
