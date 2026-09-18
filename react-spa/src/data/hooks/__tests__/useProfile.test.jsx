import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useProfile } from '../useProfile';
import { apiFetch } from '../../../utils/api';
import { resetTestQueryClient, Wrapper } from './testUtils';

// useProfile() is gated on auth — pretend we're signed in.
vi.mock('../../../auth/AuthProvider', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false, user: { id: 1 }, isAdmin: false }),
  registerLogoutCleanup: () => () => {},
}));
vi.mock('../../../utils/api', () => ({
  apiFetch: vi.fn(),
}));

describe('useProfile', () => {
  beforeEach(() => {
    resetTestQueryClient();
    apiFetch.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('goes from loading to data once GET /api/user-profile resolves', async () => {
    const profile = { id: 1, height: 180, weight: 75 };
    apiFetch.mockResolvedValueOnce(profile);

    const { result } = renderHook(() => useProfile(), { wrapper: Wrapper });

    // Starts in a loading state with no data yet.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(profile);
    expect(apiFetch).toHaveBeenCalledWith('/api/user-profile');
  });
});
