import React from 'react';
import {renderHook, waitFor} from '@testing-library/react-native';
import {QueryClientProvider} from '@tanstack/react-query';
import {useProfile} from './useProfile';
import {useUpdateProfile} from './useUpdateProfile';
import {apiFetch} from '../../utils/api';
import {queryClient} from '../queryClient';
import {queryKeys} from '../keys';

jest.mock('../../utils/api', () => ({
  apiFetch: jest.fn(),
}));

const mockedApiFetch = apiFetch as jest.Mock;

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
    mockedApiFetch.mockReset();
    queryClient.clear();
  });

  afterEach(() => {
    // Same reasoning as useProfile.test.tsx — clear the gcTime timer this
    // test's query left scheduled, or Jest's process won't exit.
    queryClient.clear();
  });

  it('refetches useProfile with the updated data after a successful mutation', async () => {
    mockedApiFetch.mockResolvedValueOnce({id: 1, name: 'Old Name'});
    const {result: profileResult} = renderHook(() => useProfile(), {wrapper: Wrapper});
    await waitFor(() => expect(profileResult.current.data).toEqual({id: 1, name: 'Old Name'}));

    const {result: mutationResult} = renderHook(() => useUpdateProfile(), {wrapper: Wrapper});

    // onSuccess both sets the cache directly AND invalidates it, so the
    // invalidation's own background refetch hits apiFetch again right
    // after the mutation's PUT — `mockResolvedValue` (not `...Once`)
    // covers both with the same value instead of undefined.
    mockedApiFetch.mockResolvedValue({id: 1, name: 'New Name'});
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
