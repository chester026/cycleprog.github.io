import React from 'react';
import {renderHook, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useBikeOnboarding, useResetBikeComponent} from './useBikeMutations';
import {api} from '../api';

jest.mock('../api', () => ({
  ...jest.requireActual('@bikelab/shared/api'),
  api: {call: jest.fn()},
}));

const mockedApiCall = api.call as jest.Mock;

function Wrapper({children}: {children: React.ReactNode}) {
  const client = new QueryClient({defaultOptions: {mutations: {retry: false}}});
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('bike component mutations', () => {
  beforeEach(() => mockedApiCall.mockReset().mockResolvedValue({success: true}));

  it('sends initial_km on reset only when the part already has km', async () => {
    const {result} = renderHook(() => useResetBikeComponent(), {wrapper: Wrapper});

    await result.current.mutateAsync({bikeId: 'b1', component: 'chain'});
    await result.current.mutateAsync({bikeId: 'b1', component: 'cassette', initialKm: 15000});

    await waitFor(() => expect(mockedApiCall).toHaveBeenCalledTimes(2));
    expect(mockedApiCall.mock.calls[0][1]).toEqual({params: {bikeId: 'b1', component: 'chain'}, body: undefined});
    expect(mockedApiCall.mock.calls[1][1]).toEqual({
      params: {bikeId: 'b1', component: 'cassette'},
      body: {initial_km: 15000},
    });
  });

  it('maps onboarding resets to the contract shape, omitting a zero initial_km', async () => {
    const {result} = renderHook(() => useBikeOnboarding(), {wrapper: Wrapper});

    await result.current.mutateAsync({
      bikeId: 'b1',
      resets: [
        {component: 'chain', resetKm: 100, initialKm: 8000},
        {component: 'saddle', resetKm: 0},
      ],
    });

    expect(mockedApiCall.mock.calls[0][1]).toEqual({
      params: {bikeId: 'b1'},
      body: {
        resets: [
          {component: 'chain', resetKm: 100, initial_km: 8000},
          {component: 'saddle', resetKm: 0},
        ],
      },
    });
  });
});
