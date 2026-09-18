// T-6.2 (audit W-18, W-19, W-22, W-29, W-33): single TanStack Query client
// replacing the independent localStorage cache mechanisms (utils/cache.js,
// cacheCheckup.js, goalsCache.js, heroImages.js's in-memory cache,
// per-page useState+TTL caches) with one cache, one invalidation model.
// Mirrors BikeLabApp/src/data/queryClient.ts (T-5.1).
import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import pkg from '../../package.json';

export const QUERY_PERSIST_KEY = 'bikelab.query.v1';

// Bumped whenever package.json's version changes — a persisted cache from an
// older build is discarded rather than hydrated with a shape a new build's
// hooks don't expect.
export const QUERY_PERSIST_BUSTER = pkg.version;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min
      gcTime: 24 * 60 * 60 * 1000, // 24 h
      retry: 1,
    },
  },
});

// Shared with QueryProvider.jsx's PersistQueryClientProvider AND with
// clearQueryCache() below, which must wipe the persisted copy — not just the
// in-memory one — on logout (a stale cached previous user's activities/goals
// must not resurface for the next login on a shared device).
export const queryPersister = createSyncStoragePersister({
  storage: window.localStorage,
  key: QUERY_PERSIST_KEY,
});

/** Clears both the in-memory query cache and the persisted copy. Call on logout. */
export function clearQueryCache() {
  queryClient.clear();
  queryPersister.removeClient();
}
