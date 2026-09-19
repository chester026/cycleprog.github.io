import React from 'react';
import {renderHook, waitFor} from '@testing-library/react-native';
import {QueryClientProvider} from '@tanstack/react-query';
import {useProfile} from './useProfile';
import {useUpdateProfile} from './useUpdateProfile';
import {api} from '../api';
import {queryClient} from '../queryClient';
import {queryKeys} from '../keys';

// Mocks the typed contract entry point (T-7.1) — every hook now calls
// `api.call(def, input)` instead of `apiFetch(url)`. The domain maps
// (`userProfile`, `activities`, ...) come straight from `@bikelab/shared/api`
// (no native deps) rather than `jest.requireActual('../api')`, which would
// also re-run `../api`'s own `import {apiClient} from '../utils/api'` and
// pull in the keychain-backed client / react-native-config — neither
// transpiles under this preset and neither is needed for these tests.
jest.mock('../api', () => ({
  ...jest.requireActual('@bikelab/shared/api'),
  api: {call: jest.fn()},
}));
// `queryClient.ts` imports `auth/session.ts` (for its own reasons), which
// imports the real `utils/api.ts` for `TokenStorage` — and THAT pulls in
// `config.ts`/`react-native-config`, which doesn't transpile under this
// preset (see the comment above). Mocked minimally, just enough that the
// module graph resolves; nothing in these tests calls into it.
jest.mock('../../utils/api', () => ({
  TokenStorage: {getRefreshToken: jest.fn(), removeToken: jest.fn(), setTokens: jest.fn()},
}));

const mockedApiCall = api.call as jest.Mock;

// useUpdateProfile/useSaveGoal/etc invalidate via the shared `queryClient`
// singleton (src/data/queryClient.ts) rather than the one from
// `useQueryClient()`, so this test — unlike useProfile.test.tsx/
// useActivities.test.tsx — must render against that same singleton to
// observe the invalidation.
function Wrapper({children}: {children: React.ReactNode}) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useUpdateProfile invalidation', () => {
  beforeEach(() => {
    mockedApiCall.mockReset();
    queryClient.clear();
  });

  afterEach(() => {
    // Same reasoning as useProfile.test.tsx — clear the gcTime timer this
    // test's query left scheduled, or Jest's process won't exit.
    queryClient.clear();
  });

  it('refetches useProfile with the updated data after a successful mutation', async () => {
    mockedApiCall.mockResolvedValueOnce({id: 1, name: 'Old Name'});
    const {result: profileResult} = renderHook(() => useProfile(), {wrapper: Wrapper});
    await waitFor(() => expect(profileResult.current.data).toEqual({id: 1, name: 'Old Name'}));

    const {result: mutationResult} = renderHook(() => useUpdateProfile(), {wrapper: Wrapper});

    // onSuccess both sets the cache directly AND invalidates it, so the
    // invalidation's own background refetch calls api.call again right
    // after the mutation's PUT — `mockResolvedValue` (not `...Once`)
    // covers both with the same value instead of undefined.
    mockedApiCall.mockResolvedValue({id: 1, name: 'New Name'});
    await mutationResult.current.mutateAsync({name: 'New Name'});

    // onSuccess both writes the mutation's response straight into the
    // 'profile' cache entry AND invalidates it (the invalidation's
    // background refetch settles a tick later — hence waitFor rather than
    // a synchronous assertion right after mutateAsync resolves).
    // useProfile should reflect the new value without a manual refetch()
    // call from the caller.
    await waitFor(() => expect(profileResult.current.data).toEqual({id: 1, name: 'New Name'}));
    expect(queryClient.getQueryData(queryKeys.profile)).toEqual({id: 1, name: 'New Name'});
  });
});
