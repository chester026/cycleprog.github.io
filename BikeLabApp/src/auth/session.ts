import AsyncStorage from '@react-native-async-storage/async-storage';
import {TokenStorage} from '../utils/api';
import {clearSnapshotCache} from '../utils/analyticsSnapshot';

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
  await TokenStorage.removeToken();

  cleanupRegistry.forEach(fn => {
    try {
      fn();
    } catch {
      // don't let one bad cleanup fn block the rest
    }
  });

  clearSnapshotCache();

  await removeUserScopedStorage();

  const {resetToLogin} = require('../../App');
  resetToLogin();
}
