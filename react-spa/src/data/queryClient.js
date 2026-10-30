// T-6.2 (audit W-18, W-19, W-22, W-29, W-33): single TanStack Query client
// replacing the independent localStorage cache mechanisms (utils/cache.js,
// cacheCheckup.js, goalsCache.js, heroImages.js's in-memory cache,
// per-page useState+TTL caches) with one cache, one invalidation model.
// Mirrors BikeLabApp/src/data/queryClient.ts (T-5.1).
import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

export const QUERY_PERSIST_KEY = 'bikelab.query.v1';

// `__BUILD_HASH__` is injected by vite.config.js (git short sha, or the
// build timestamp when git isn't available) — a persisted cache written by
// an older build is discarded rather than hydrated with a shape the new
// build's hooks don't expect. package.json's version never changed between
// deploys, so the old `pkg.version` buster never busted anything.
export const QUERY_PERSIST_BUSTER = __BUILD_HASH__;

// Query-key prefixes that never go to localStorage: coach conversations
// (whole chat transcripts with tool results — large, and sensitive enough
// that a shared device shouldn't keep them past the session) and the admin
// panel's data (another user's rows, only ever read while the admin is on
// that page).
const NON_PERSISTED_KEY_PREFIXES = ['coachConversation', 'admin'];

/** Persister filter: keeps the coach transcripts and admin queries out of localStorage. */
export function shouldDehydrateQuery(query) {
  if (query.state.status !== 'success') return false;
  const head = query.queryKey[0];
  return !(typeof head === 'string' && NON_PERSISTED_KEY_PREFIXES.some((prefix) => head.startsWith(prefix)));
}

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
