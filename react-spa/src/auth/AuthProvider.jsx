/* eslint-disable react-refresh/only-export-components -- this file is
   deliberately the ONLY place that knows where tokens live (see
   src/auth/README.md): `useAuth`/`AuthProvider` plus the small helper
   exports (`getInMemoryAccessToken`, `setNavigator`,
   `registerLogoutCleanup`) all belong together, not split across files. */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { setAuthHandlers } from '../utils/api';
import { call, userProfile } from '../data/api';

// src/auth — contract (T-6.1). See README.md for the storage decision this
// implements: access token in memory only, refresh token in localStorage.
const REFRESH_TOKEN_KEY = 'bikelab.refreshToken';
// Pre-refresh-token era key (W-24/S-24): plain JWT, no rotation, sitting in
// Storage indefinitely. Migrated once on first load, then deleted for good.
const LEGACY_TOKEN_KEY = 'token';

// Module-level (not React state): every apiFetch call reads the CURRENT
// access token through this, including calls made before any component
// using useAuth() has rendered (e.g. from utils/api.js's own handlers,
// which are wired up by AuthProvider below but must resolve to a live
// value forever after, not a snapshot).
let inMemoryAccessToken = null;
export function getInMemoryAccessToken() {
  return inMemoryAccessToken;
}

// Set by a component that has react-router's `navigate` (see App.jsx) so
// AuthProvider/utils/api.js can redirect on a hard 401 without a
// `window.location.href` full reload (S-uses SPA nav instead).
let navigateFn = null;
export function setNavigator(fn) {
  navigateFn = fn;
}

// The data-layer agent (T-6.2) hasn't landed `src/data/queryClient.js` on
// this branch yet, so AuthProvider can't import `queryClient.clear()`
// directly. Instead it exposes this registry — the data agent calls
// `registerLogoutCleanup(() => queryClient.clear())` once its provider
// mounts, and `logout()` below runs every registered cleanup.
const logoutCleanupFns = [];
export function registerLogoutCleanup(fn) {
  logoutCleanupFns.push(fn);
  return () => {
    const idx = logoutCleanupFns.indexOf(fn);
    if (idx !== -1) logoutCleanupFns.splice(idx, 1);
  };
}

function readRefreshToken() {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeRefreshToken(refreshToken) {
  try {
    if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } catch {
    // localStorage may be unavailable (private mode, quota); refresh just
    // won't survive a reload — not fatal for the current session.
  }
}

function clearRefreshToken() {
  try {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // ignore
  }
}

function readLegacyToken() {
  try {
    return localStorage.getItem(LEGACY_TOKEN_KEY) || sessionStorage.getItem(LEGACY_TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

function clearLegacyToken() {
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    // ignore
  }
  try {
    sessionStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    // ignore
  }
}

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

// One shared session bootstrap (see the effect in AuthProvider): legacy
// token migration, or a single refresh-token exchange. Resolves to {token}
// or null; never throws.
let bootstrapPromise = null;

// GET /api/user-profile with an explicit token (bypasses the api client so a
// 401 here never triggers its refresh/onUnauthorized machinery — we're the
// ones deciding whether this token is any good). Returns the profile or null.
async function probeProfile(token) {
  try {
    const res = await fetch('/api/user-profile', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function bootstrapSession() {
  inMemoryAccessToken = null;
  const legacyToken = readLegacyToken();
  if (legacyToken) {
    // Use it once as the access token so current users aren't logged out by
    // this migration, then remove it — nothing reads the legacy key again.
    // It may well be expired (7-day JWT from before the migration): validate
    // it first, otherwise HomeRoute would think we're authenticated, bounce
    // to /garage, get a 401 there and land on /login?session_expired — the
    // landing page would never show for a returning visitor.
    clearLegacyToken();
    const profile = await probeProfile(legacyToken);
    if (!profile) return null;
    inMemoryAccessToken = legacyToken;
    return { token: legacyToken, profile };
  }

  const refreshToken = readRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) throw new Error('refresh failed');
    const data = await res.json();
    if (!data.token || !data.refreshToken) throw new Error('bad refresh response');
    inMemoryAccessToken = data.token;
    writeRefreshToken(data.refreshToken);
    return { token: data.token, profile: await probeProfile(data.token) };
  } catch {
    inMemoryAccessToken = null;
    clearRefreshToken();
    return null;
  }
}

export function AuthProvider({ children }) {
  const [accessToken, setAccessTokenState] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  // Avoids setState-after-unmount warnings from the boot effect's async work.
  const mountedRef = useRef(true);
  useEffect(() => {
    // Re-arm on every (re)mount: React StrictMode runs mount → cleanup → mount
    // on the same instance, so a cleanup-only effect would leave this false
    // forever and every `if (mountedRef.current)` guard below would skip its
    // setState — including setIsLoading(false) → the app hangs on "Loading…".
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setTokenPair = useCallback((token, refreshToken) => {
    inMemoryAccessToken = token || null;
    setAccessTokenState(token || null);
    if (refreshToken) writeRefreshToken(refreshToken);
  }, []);

  const clearAuthState = useCallback(() => {
    inMemoryAccessToken = null;
    setAccessTokenState(null);
    setUser(null);
    clearRefreshToken();
  }, []);

  const fetchProfile = useCallback(async () => {
    try {
      const profile = await call(userProfile.get);
      if (mountedRef.current) setUser(profile || null);
    } catch {
      if (mountedRef.current) setUser(null);
    }
  }, []);

  // login({ token, refreshToken }) — called by LoginPage / ExchangeTokenPage
  // once the server has answered. Fetches the profile so `user`/`isAdmin`
  // are available right away (README contract).
  const login = useCallback(async ({ token, refreshToken }) => {
    setTokenPair(token, refreshToken);
    await fetchProfile();
  }, [setTokenPair, fetchProfile]);

  // logout() — best-effort revoke, then clear everything locally regardless
  // of whether the network call succeeds (a dead server must never keep the
  // user "logged in" client-side).
  const logout = useCallback(async () => {
    const refreshToken = readRefreshToken();
    clearAuthState();
    logoutCleanupFns.forEach((fn) => {
      try {
        fn();
      } catch {
        // one agent's cleanup failing must not block the others'
      }
    });
    if (refreshToken) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        // best effort — token is already gone locally either way
      }
    }
  }, [clearAuthState]);

  // Re-fetch /api/user-profile without touching tokens — used after
  // server-side profile changes that don't mint a new JWT (e.g. linking
  // Strava), where components used to re-decode a JWT that never changed.
  const refreshProfile = useCallback(() => fetchProfile(), [fetchProfile]);

  // Wires the shared api client's 401/refresh handling to this provider.
  // See utils/api.js `setAuthHandlers` — the client itself has no idea
  // where tokens live, only that these callbacks exist.
  useEffect(() => {
    setAuthHandlers({
      getToken: getInMemoryAccessToken,
      getRefreshToken: readRefreshToken,
      onTokens: (token, refreshToken) => setTokenPair(token, refreshToken),
      onRefreshFailed: () => {
        if (!inMemoryAccessToken && !readRefreshToken()) return;
        clearAuthState();
        if (navigateFn) navigateFn('/login?session_expired=true', { replace: true });
      },
      onUnauthorized: () => {
        // A 401 on a request that never carried a token is not an expired
        // session — it's an anonymous visitor (landing page) hitting a
        // protected route. Only a real session can expire.
        if (!inMemoryAccessToken) return;
        clearAuthState();
        if (navigateFn) navigateFn('/login?session_expired=true', { replace: true });
      },
    });
  }, [setTokenPair, clearAuthState]);

  // Boot sequence (T-6.1): legacy-token migration, then the silent
  // refresh-token bootstrap. `isLoading` stays true until this settles so
  // ProtectedRoute never flashes /login for an authenticated user.
  useEffect(() => {
    // React StrictMode (dev) mounts → unmounts → mounts every effect. Two
    // concurrent POST /api/auth/refresh with the SAME refresh token trip the
    // server's reuse detection (the first rotates it, the second is "reuse of
    // a revoked token" → the whole family is revoked → two 401s in the log
    // and "Your session has expired" on /login). Share one in-flight
    // bootstrap across mounts so the refresh token is presented once.
    if (!bootstrapPromise) {
      bootstrapPromise = bootstrapSession().finally(() => {
        bootstrapPromise = null;
      });
    }
    bootstrapPromise.then((result) => {
      if (!mountedRef.current) return;
      if (result?.token) {
        setAccessTokenState(result.token);
        if (result.profile) setUser(result.profile);
      }
      setIsLoading(false);
    });
    // Runs once per mount; the shared promise makes concurrent mounts safe.
  }, []);

  const value = {
    user,
    isAdmin: Boolean(user?.is_admin),
    isAuthenticated: Boolean(accessToken),
    isLoading,
    login,
    logout,
    refreshProfile,
    getAccessToken: getInMemoryAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
