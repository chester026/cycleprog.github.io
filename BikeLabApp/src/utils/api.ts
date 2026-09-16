import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import {API_BASE_URL} from '../config';
import {logger} from '../lib/logger';

export {API_BASE_URL};

const KEYCHAIN_SERVICE = 'bikelab.auth';

let _onSessionExpired: (() => void) | null = null;
let _sessionExpiredFiring = false;

export function setSessionExpiredHandler(handler: () => void) {
  _onSessionExpired = handler;
}

export async function apiFetch(
  url: string,
  options: RequestInit = {},
): Promise<any> {
  const token = await TokenStorage.getToken();

  const headers: Record<string, string> = options.headers
    ? {...(options.headers as Record<string, string>)}
    : {};

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

  let response;
  try {
    response = await fetch(fullUrl, {...options, headers});
  } catch (fetchError) {
    logger.error('❌ Network error:', fetchError);
    throw fetchError;
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));

    if (response.status === 401) {
      logger.warn('🔒 Token expired or invalid. Logging out...');

      // Prevent multiple simultaneous session-expired triggers
      if (!_sessionExpiredFiring) {
        _sessionExpiredFiring = true;
        try {
          // Lazy require to avoid a circular import (session.ts imports this
          // file for TokenStorage).
          const {signOut} = require('../auth/session');
          await signOut({reason: 'expired'});
        } finally {
          setTimeout(() => { _sessionExpiredFiring = false; }, 3000);
        }

        if (_onSessionExpired) {
          _onSessionExpired();
        }
      }

      throw new Error('Session expired. Please log in again.');
    }

    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data;
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

