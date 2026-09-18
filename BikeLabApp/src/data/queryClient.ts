// T-5.1 / A-17 (docs/audit/layers/02-bikelabapp.md): single TanStack Query
// client replacing the 7 independent AsyncStorage cache mechanisms
// (AppDataContext, utils/cache.ts, goalsCache.ts, analyticsSnapshot.ts,
// per-screen useState+TTL caches) with one cache, one invalidation model.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {QueryClient} from '@tanstack/react-query';
import {createAsyncStoragePersister} from '@tanstack/query-async-storage-persister';
import {registerSessionCleanup} from '../auth/session';
// resolveJsonModule import of the app's own package.json — used only for
// its `version` field as the persisted-cache buster.
import pkg from '../../package.json';

export const QUERY_PERSIST_KEY = 'bikelab.query.v1';

// Bumped automatically whenever the app version changes (App Store/Play
// releases bump package.json version) — a persisted cache from an older
// build is discarded rather than hydrated with a shape a new build's hooks
// don't expect.
export const QUERY_PERSIST_BUSTER: string = pkg.version;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min
      gcTime: 24 * 60 * 60 * 1000, // 24 h
      retry: 1,
    },
  },
});

// Shared with App.tsx's PersistQueryClientProvider (via QueryProvider.tsx)
// AND with signOut() below, which must wipe the persisted cache — not just
// the in-memory one — on sign-out (a Keychain-cleared but AsyncStorage-
// cached previous user's activities/goals must not resurface for the next
// login on a shared device).
export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: QUERY_PERSIST_KEY,
});

/** Clears both the in-memory query cache and the persisted copy. */
export async function clearQueryCache(): Promise<void> {
  queryClient.clear();
  await queryPersister.removeClient();
}

// Runs on every signOut() (src/auth/session.ts) via the same
// cleanup-registry every other data-holding module uses (AppDataContext's
// clearAll, etc) — see session.ts's `cleanupRegistry`.
registerSessionCleanup(() => {
  clearQueryCache().catch(() => {
    // best-effort — never block sign-out on a storage error
  });
});
