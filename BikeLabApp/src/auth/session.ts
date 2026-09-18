import AsyncStorage from '@react-native-async-storage/async-storage';
import {TokenStorage, apiFetch} from '../utils/api';
import {logger} from '../lib/logger';

// User-scoped AsyncStorage keys/prefixes that must be wiped on sign-out or
// account deletion. Keep this list in sync with every AsyncStorage.setItem
// call in src/ that stores data tied to the signed-in account. Anything NOT
// listed here (e.g. '@app_language') is app-level and survives sign-out.
const USER_SCOPED_KEYS = [
  'activities_cache',
  'bikes_cache',
  'garage_images_cache',
  'analytics_snapshot_latest',
  // powerAnalysis_windCache/powerAnalysis_powerCache removed (T-3.5):
  // PowerAnalysis.tsx no longer computes power or caches it client-side.
  'bikelab_health_cache_v1',
  'weather_data_cache',
];

const USER_SCOPED_PREFIXES = [
  'bikelab_cache_',
  'goals_progress_v2_',
];

// Wave-2 removed keys — add here
// (Phase 5 wave 2: screens/components migrated off their own AsyncStorage
// caches onto TanStack Query. Each agent adds the keys IT removed — none of
// the screens/components in this agent's file list wrote their own
// AsyncStorage cache to begin with, so nothing is added here this pass.
// `bikelab_health_cache_v1` above is healthService.ts's cache — kept, not
// removed, since HealthProvider (src/data/HealthProvider.tsx, a different
// wave-1 file) still owns and reads it.)

type SessionCleanupFn = () => void;

const cleanupRegistry = new Set<SessionCleanupFn>();

/**
 * Register a cleanup function (e.g. a context's clearAll) to be run whenever
 * the session ends. Returns an unregister function — call it on unmount.
 */
export function registerSessionCleanup(fn: SessionCleanupFn): () => void {
  cleanupRegistry.add(fn);
  return () => {
    cleanupRegistry.delete(fn);
  };
}

async function removeUserScopedStorage(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const keysToRemove = allKeys.filter(
      key =>
        USER_SCOPED_KEYS.includes(key) ||
        USER_SCOPED_PREFIXES.some(prefix => key.startsWith(prefix)),
    );
    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
    }
  } catch {
    // best-effort — never block sign-out on a storage error
  }
}

export interface SignOutOptions {
  reason?: 'user' | 'expired' | 'deleted';
}

/**
 * Central sign-out routine: clears the auth token, all registered in-memory
 * app state, user-scoped AsyncStorage caches, and navigates back to Login.
 * Safe to call from anywhere (401 handler, ProfileScreen, etc).
 */
export async function signOut(_opts: SignOutOptions = {}): Promise<void> {
  // Best-effort: revoke the refresh token server-side (T-4.5,
  // server/routes/auth.js POST /api/auth/logout) BEFORE clearing local
  // storage below — otherwise the refresh token we'd send is already gone.
  // Never blocks sign-out on a network error; a token that outlives the
  // session just means the *next* refresh attempt (if any) 401s normally.
  try {
    const refreshToken = await TokenStorage.getRefreshToken();
    if (refreshToken) {
      await apiFetch('/api/auth/logout', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({refreshToken}),
      });
    }
  } catch (err) {
    logger.debug('Best-effort /api/auth/logout failed (ignored):', err);
  }

  await TokenStorage.removeToken();

  cleanupRegistry.forEach(fn => {
    try {
      fn();
    } catch {
      // don't let one bad cleanup fn block the rest
    }
  });

  await removeUserScopedStorage();

  const {resetToLogin} = require('../../App');
  resetToLogin();
}
