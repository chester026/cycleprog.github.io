import React from 'react';
import {renderHook, waitFor, act} from '@testing-library/react-native';
import {QueryClientProvider} from '@tanstack/react-query';
import {useCompleteMetaGoal, useReopenMetaGoal} from './useCompleteMetaGoal';
import {api} from '../api';
import {queryClient} from '../queryClient';
import {queryKeys} from '../keys';

// Same module mocks as useUpdateMetaGoal.test.tsx (see the comments there).
jest.mock('../api', () => ({
  ...jest.requireActual('@bikelab/shared/api'),
  api: {call: jest.fn()},
}));
jest.mock('../../utils/api', () => ({
  TokenStorage: {getRefreshToken: jest.fn(), removeToken: jest.fn(), setTokens: jest.fn()},
}));

const mockedApiCall = api.call as jest.Mock;

const wrapper: React.FC<{children: React.ReactNode}> = ({children}) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('complete / reopen meta-goal mutations', () => {
  let invalidate: jest.SpyInstance;

  beforeEach(() => {
    mockedApiCall.mockReset();
    mockedApiCall.mockResolvedValue({});
    invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  });

  afterEach(() => invalidate.mockRestore());

  it('posts the chosen activity ids and refreshes goal queries', async () => {
    const {result} = renderHook(() => useCompleteMetaGoal(), {wrapper});
    await act(async () => {
      result.current.mutate({id: '7', activityIds: [11, 12]});
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockedApiCall).toHaveBeenCalledWith(expect.objectContaining({method: 'POST', path: '/api/meta-goals/:id/complete'}), {
      params: {id: 7},
      body: {activity_ids: [11, 12]},
    });
    const keys = invalidate.mock.calls.map(c => c[0].queryKey);
    expect(keys).toEqual(expect.arrayContaining([queryKeys.metaGoals, queryKeys.goals, queryKeys.metaGoalDetail('7')]));
  });

  it('completes without rides with an empty id list', async () => {
    const {result} = renderHook(() => useCompleteMetaGoal(), {wrapper});
    await act(async () => {
      result.current.mutate({id: 7});
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiCall.mock.calls[0][1].body).toEqual({activity_ids: []});
  });

  it('reopens and refreshes goal queries', async () => {
    const {result} = renderHook(() => useReopenMetaGoal(), {wrapper});
    await act(async () => {
      result.current.mutate(7);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiCall).toHaveBeenCalledWith(expect.objectContaining({path: '/api/meta-goals/:id/reopen'}), {params: {id: 7}});
    const keys = invalidate.mock.calls.map(c => c[0].queryKey);
    expect(keys).toEqual(expect.arrayContaining([queryKeys.metaGoals, queryKeys.goals]));
  });
});
