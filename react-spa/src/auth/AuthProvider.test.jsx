import React, { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth, getInMemoryAccessToken } from './AuthProvider';
import { call } from '../data/api';

// AuthProvider's own boot/logout logic talks to /api/auth/refresh and
// /api/auth/logout with plain `fetch` directly (mirrors ExchangeTokenPage's
// pre-auth calls). `call(userProfile.get)` (GET /api/user-profile) goes
// through the shared api client instead — mocked here (at `src/data/api.js`,
// T-7.1's single import point) so these tests exercise AuthProvider's
// token/storage logic, not the client's own request plumbing (that's
// `@bikelab/shared/api`'s job to test).
vi.mock('../utils/api', () => ({
  setAuthHandlers: vi.fn(),
  isApiError: () => false,
}));
vi.mock('../data/api', () => ({
  call: vi.fn(),
  userProfile: { get: {} },
}));

// Renders the useAuth() values as text so tests can assert on them without
// reaching into module internals.
function Probe() {
  const { isLoading, isAuthenticated, user } = useAuth();
  return (
    <div>
      <div data-testid="isLoading">{String(isLoading)}</div>
      <div data-testid="isAuthenticated">{String(isAuthenticated)}</div>
      <div data-testid="userId">{user?.id ?? ''}</div>
    </div>
  );
}

function jsonResponse(body, ok = true) {
  return {
    ok,
    status: ok ? 200 : 401,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe('AuthProvider', () => {
  let fetchMock;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    call.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('boots unauthenticated when there is no refresh token', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('isLoading').textContent).toBe('false'));

    expect(screen.getByTestId('isAuthenticated').textContent).toBe('false');
    // Never called /api/auth/refresh — there was nothing to refresh with.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
  });

  it('boots authenticated when the refresh call succeeds', async () => {
    localStorage.setItem('bikelab.refreshToken', 'old-refresh-token');
    // 1st fetch: POST /api/auth/refresh; 2nd: the bootstrap's profile probe.
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ token: 'new-access-token', refreshToken: 'new-refresh-token' }))
      .mockResolvedValueOnce(jsonResponse({ id: 42, name: 'Alex', is_admin: false }));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('isLoading').textContent).toBe('false'));

    expect(screen.getByTestId('isAuthenticated').textContent).toBe('true');
    expect(screen.getByTestId('userId').textContent).toBe('42');
    expect(getInMemoryAccessToken()).toBe('new-access-token');
    // Refresh token was rotated.
    expect(localStorage.getItem('bikelab.refreshToken')).toBe('new-refresh-token');
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/refresh', expect.objectContaining({ method: 'POST' }));
  });

  it('drops an expired legacy `token` instead of bouncing to /login (landing must show)', async () => {
    localStorage.setItem('token', 'expired-jwt');
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'expired', code: 'UNAUTHORIZED' }, false));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('isLoading').textContent).toBe('false'));

    expect(screen.getByTestId('isAuthenticated').textContent).toBe('false');
    expect(getInMemoryAccessToken()).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('settles (isLoading → false) under React StrictMode double-mount', async () => {
    // No legacy token, no refresh token → anonymous visitor; must still settle.
    localStorage.clear();
    render(
      <StrictMode>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </StrictMode>
    );
    await waitFor(() => expect(screen.getByTestId('isLoading').textContent).toBe('false'));
    expect(screen.getByTestId('isAuthenticated').textContent).toBe('false');
  });

  it('migrates a legacy `token` key once, then removes it', async () => {
    localStorage.setItem('token', 'legacy-jwt');
    // The legacy token is validated with a direct profile probe before use.
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 7, name: 'Legacy User' }));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('isLoading').textContent).toBe('false'));

    expect(screen.getByTestId('isAuthenticated').textContent).toBe('true');
    expect(screen.getByTestId('userId').textContent).toBe('7');
    expect(getInMemoryAccessToken()).toBe('legacy-jwt');
    // The legacy key must be gone — it's used exactly once.
    expect(localStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('token')).toBeNull();
    // No refresh token was minted from a legacy migration, and no refresh
    // call was needed (the legacy token is used as-is).
    expect(localStorage.getItem('bikelab.refreshToken')).toBeNull();
    // The only network call is the profile probe — no /api/auth/refresh.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/refresh', expect.anything());
  });

  it('logout clears the refresh token from storage', async () => {
    localStorage.setItem('bikelab.refreshToken', 'some-refresh-token');
    call.mockResolvedValue({ id: 1, name: 'Someone' });
    fetchMock.mockImplementation((url) => {
      if (url === '/api/auth/refresh') {
        return Promise.resolve(jsonResponse({ token: 'access-token', refreshToken: 'some-refresh-token' }));
      }
      // /api/auth/logout
      return Promise.resolve(jsonResponse({ success: true }));
    });

    let auth;
    function Capture() {
      auth = useAuth();
      return null;
    }

    render(
      <AuthProvider>
        <Capture />
      </AuthProvider>
    );

    await waitFor(() => expect(auth.isLoading).toBe(false));

    await auth.logout();

    expect(localStorage.getItem('bikelab.refreshToken')).toBeNull();
    expect(getInMemoryAccessToken()).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
