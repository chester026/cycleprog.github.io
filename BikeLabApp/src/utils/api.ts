import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import {createApiClient, ApiError as SharedApiError} from '@bikelab/shared/api';
import {API_BASE_URL} from '../config';
import {logger} from '../lib/logger';

export {API_BASE_URL};

const KEYCHAIN_SERVICE = 'bikelab.auth';

// Thrown by apiFetch below for both a real server error body and the
// synthetic 401 "session expired" case, so callers can branch on
// `err.status` / `err.code` instead of guessing from `err.message` text (see
// T-1.5, docs/audit/layers/04-cross-layer.md §5.6). Both old
// (`{ error: 'text' }`) and new (`{ error: 'text', code, details? }`) server
// response shapes are handled — `code`/`details` are simply absent on an old
// one. This is now a thin adapter over the shared client (T-2.3,
// docs/audit/layers/04-cross-layer.md §5.7, §5.8, §6.1 row `api/client.ts`);
// re-exporting the shared class keeps every existing `instanceof ApiError`
// check and every `.status`/`.code`/`.details` access working unchanged.
export const ApiError = SharedApiError;
export type ApiError = SharedApiError;

let _onSessionExpired: (() => void) | null = null;
let _sessionExpiredFiring = false;

export function setSessionExpiredHandler(handler: () => void) {
  _onSessionExpired = handler;
}

async function onUnauthorized(): Promise<void> {
  logger.warn('🔒 Token expired or invalid. Logging out...');

  // Prevent multiple simultaneous session-expired triggers
  if (_sessionExpiredFiring) {
    return;
  }
  _sessionExpiredFiring = true;
  try {
    // Lazy require to avoid a circular import (session.ts imports this
    // file for TokenStorage).
    const {signOut} = require('../auth/session');
    await signOut({reason: 'expired'});
  } finally {
    setTimeout(() => {
      _sessionExpiredFiring = false;
    }, 3000);
  }

  if (_onSessionExpired) {
    _onSessionExpired();
  }
}

// T-4.5 (refresh tokens, docs/audit/layers/04-cross-layer.md §5.6):
// server/routes/auth.js's POST /api/auth/refresh rotates the stored refresh
// token and returns a fresh {token, refreshToken} pair. `onUnauthorized`
// above only fires now when there's no refresh token to try, or the
// refresh call itself fails (expired/revoked) — see RefreshOptions in the
// shared client for the exact rules.
const client = createApiClient({
  baseUrl: API_BASE_URL,
  getToken: () => TokenStorage.getToken(),
  onUnauthorized,
  refresh: {
    getRefreshToken: () => TokenStorage.getRefreshToken(),
    onTokens: (token, refreshToken) => TokenStorage.setTokens(token, refreshToken),
    onRefreshFailed: onUnauthorized,
  },
  validateResponses: __DEV__,
});

// Exposed for src/data/hooks (T-5.1) so those can use @bikelab/shared/api's
// typed `endpoints.ts` helpers (`client.get(..., {schema})`) directly
// instead of re-wrapping `apiFetch`'s untyped `Promise<any>`.
export const apiClient = client;

// Standalone one-shot refresh (T-5.x, coach SSE) — `client` above already
// does this internally for every plain `apiFetch`/`apiClient` call via its
// `refresh` option, but that logic is private to client.ts and only runs
// around a `fetch()` response. `coachSSE.ts` opens its own long-lived
// connection with `react-native-sse` (not `fetch`), so a 401 on THAT stream
// has no `client.request` retry loop to fall into — it needs to trigger the
// same rotate-and-retry itself. Kept intentionally minimal/duplicated rather
// than exporting client.ts's internal `attemptRefresh` (that would mean
// changing the shared, non-owned `client.ts` to expose it, and this is a
// single low-concurrency call site, so the "share one in-flight refresh"
// dedup that client.ts does for many concurrent 401s isn't needed here).
export async function refreshSession(): Promise<string | null> {
  try {
    const refreshToken = await TokenStorage.getRefreshToken();
    if (!refreshToken) return null;

    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({refreshToken}),
    });
    if (!response.ok) return null;

    const text = await response.text();
    if (!text) return null;
    const data = JSON.parse(text) as {token?: string; refreshToken?: string};
    if (!data.token || !data.refreshToken) return null;

    await TokenStorage.setTokens(data.token, data.refreshToken);
    return data.token;
  } catch (e) {
    logger.debug('[api] refreshSession failed:', e);
    return null;
  }
}

export async function apiFetch(
  url: string,
  options: RequestInit = {},
): Promise<any> {
  try {
    return await client.request(url, options);
  } catch (err) {
    if (err instanceof Error && err.name !== 'AbortError') {
      logger.error('❌ API Error:', err.message);
    }
    throw err;
  }
}

// 'token' (remember === true) is persisted in the OS Keychain and survives
// app restarts. 'sessionToken' (remember === false, "don't remember me") is
// kept in memory only, for the lifetime of the running app. The refresh
// token (T-4.5) always follows the access token's own remember/in-memory
// choice, stored under a second Keychain service so a device with an old
// build (no refresh token yet) migrates cleanly — `getRefreshToken()`
// simply returns null until the next login/exchange writes one.
const KEYCHAIN_SERVICE_REFRESH = 'bikelab.auth.refresh';
let _inMemorySessionToken: string | null = null;
let _inMemoryRefreshToken: string | null = null;

// Вспомогательные функции для работы с токенами
export const TokenStorage = {
  async setToken(token: string, remember: boolean = true): Promise<void> {
    if (remember) {
      _inMemorySessionToken = null;
      await Keychain.setGenericPassword('token', token, {service: KEYCHAIN_SERVICE});
    } else {
      _inMemorySessionToken = token;
    }
  },

  /** Stores the access token AND refresh token pair together (T-4.5) — use this on login/exchange/refresh instead of `setToken` alone. */
  async setTokens(token: string, refreshToken: string | undefined | null, remember: boolean = true): Promise<void> {
    await TokenStorage.setToken(token, remember);
    if (!refreshToken) return;
    if (remember) {
      _inMemoryRefreshToken = null;
      await Keychain.setGenericPassword('refreshToken', refreshToken, {service: KEYCHAIN_SERVICE_REFRESH});
    } else {
      _inMemoryRefreshToken = refreshToken;
    }
  },

  async getRefreshToken(): Promise<string | null> {
    if (_inMemoryRefreshToken) {
      return _inMemoryRefreshToken;
    }
    try {
      const credentials = await Keychain.getGenericPassword({service: KEYCHAIN_SERVICE_REFRESH});
      if (credentials && credentials.password) {
        return credentials.password;
      }
    } catch {
      // Keychain unavailable
    }
    return null;
  },

  async getToken(): Promise<string | null> {
    if (_inMemorySessionToken) {
      return _inMemorySessionToken;
    }

    try {
      const credentials = await Keychain.getGenericPassword({service: KEYCHAIN_SERVICE});
      if (credentials && credentials.password) {
        return credentials.password;
      }
    } catch {
      // Keychain unavailable — fall through to the legacy-storage migration below
    }

    // One-time migration: older builds stored the token in AsyncStorage.
    try {
      const legacyToken = await AsyncStorage.getItem('token');
      if (legacyToken) {
        await Keychain.setGenericPassword('token', legacyToken, {service: KEYCHAIN_SERVICE});
        await AsyncStorage.removeItem('token');
        return legacyToken;
      }

      const legacySessionToken = await AsyncStorage.getItem('sessionToken');
      if (legacySessionToken) {
        _inMemorySessionToken = legacySessionToken;
        await AsyncStorage.removeItem('sessionToken');
        return legacySessionToken;
      }
    } catch {
      // no legacy token to migrate
    }

    return null;
  },

  async removeToken(): Promise<void> {
    _inMemorySessionToken = null;
    _inMemoryRefreshToken = null;
    try {
      await Keychain.resetGenericPassword({service: KEYCHAIN_SERVICE});
    } catch {
      // ignore — nothing stored
    }
    try {
      await Keychain.resetGenericPassword({service: KEYCHAIN_SERVICE_REFRESH});
    } catch {
      // ignore — nothing stored
    }
    // Also clear any leftover legacy keys.
    await AsyncStorage.removeItem('token').catch(() => {});
    await AsyncStorage.removeItem('sessionToken').catch(() => {});
  },

  /** Alias for `removeToken` (T-5.1) — clears both the access and refresh token. */
  async clear(): Promise<void> {
    await TokenStorage.removeToken();
  },
};
