// T-6.2: mounted once, outermost, in main.jsx (see this file's export and
// the report handed to the main.jsx owner). Restores the persisted cache on
// load and keeps it in sync afterwards — see queryClient.js for the
// persister/buster and clearQueryCache().
import React from 'react';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, queryPersister, QUERY_PERSIST_BUSTER, clearQueryCache } from './queryClient';
import { registerLogoutCleanup } from '../auth/AuthProvider';

// src/auth (T-6.1) is merged on this branch now — logout() runs every
// registered cleanup, so the query cache is cleared on logout with no
// further wiring needed.
registerLogoutCleanup(clearQueryCache);

export function QueryProvider({ children }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: queryPersister, buster: QUERY_PERSIST_BUSTER }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
