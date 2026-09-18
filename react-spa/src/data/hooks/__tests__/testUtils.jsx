/* eslint-disable react-refresh/only-export-components -- test-only helper file, never HMR'd */
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../queryClient';

// Shared test harness for src/data/hooks.
//
// Every mutation hook (useSaveGoal, useDeleteMetaGoal, etc.) invalidates by
// calling `queryClient.invalidateQueries` on the MODULE-LEVEL singleton
// imported directly from `../queryClient` (not via `useQueryClient()`
// context) — see QueryProvider.jsx, which hands that same singleton to
// `PersistQueryClientProvider` as `client` in production. So tests must
// wrap with that same singleton (retry disabled, cache cleared between
// tests) rather than a fresh QueryClient, or a mutation's invalidation
// would target a client the test's `useQuery` never reads from.
queryClient.setDefaultOptions({
  queries: { retry: false, staleTime: 0, gcTime: Infinity },
  mutations: { retry: false },
});

export { queryClient };

export function resetTestQueryClient() {
  queryClient.clear();
}

export function Wrapper({ children }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
