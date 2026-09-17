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

const client = createApiClient({
  baseUrl: API_BASE_URL,
  getToken: () => TokenStorage.getToken(),
  onUnauthorized,
  validateResponses: __DEV__,
});

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
// kept in memory only, for the lifetime of the running app.
let _inMemorySessionToken: string | null = null;

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
    try {
      await Keychain.resetGenericPassword({service: KEYCHAIN_SERVICE});
    } catch {
      // ignore — nothing stored
    }
    // Also clear any leftover legacy keys.
    await AsyncStorage.removeItem('token').catch(() => {});
    await AsyncStorage.removeItem('sessionToken').catch(() => {});
  },
};
