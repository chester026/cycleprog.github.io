import React from 'react';
import {PersistQueryClientProvider} from '@tanstack/react-query-persist-client';
import {queryClient, queryPersister, QUERY_PERSIST_BUSTER} from './queryClient';

/**
 * Mounted once, outermost (after ErrorBoundary), in App.tsx. Restores the
 * persisted cache on cold start and keeps it in sync afterwards — see
 * queryClient.ts for the persister/buster and clearQueryCache() (called from
 * signOut()).
 */
export const QueryProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{persister: queryPersister, buster: QUERY_PERSIST_BUSTER}}>
      {children}
    </PersistQueryClientProvider>
  );
};
