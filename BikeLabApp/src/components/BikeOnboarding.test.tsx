import React from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react-native';
import {BikeOnboarding} from './BikeOnboarding';
import {useBikeOnboarding} from '../data/hooks/useBikeMutations';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));
jest.mock('@react-native-community/slider', () => 'Slider');
jest.mock('../data/hooks/useBikeMutations', () => ({useBikeOnboarding: jest.fn()}));

const TOTAL_KM = 4000;

function renderOnboarding() {
  const mutateAsync = jest.fn().mockResolvedValue({success: true});
  (useBikeOnboarding as jest.Mock).mockReturnValue({mutateAsync, isPending: false});
  const onComplete = jest.fn();
  render(<BikeOnboarding bikeId="b1" bikeName="Road" totalKm={TOTAL_KM} onComplete={onComplete} />);
  return {mutateAsync, onComplete};
}

describe('BikeOnboarding used bike', () => {
  it('hides the per-component km inputs until "Used bike" is switched on', () => {
    renderOnboarding();
    expect(screen.queryByTestId('initial-km-chain')).toBeNull();

    fireEvent(screen.getByTestId('used-bike-switch'), 'valueChange', true);
    expect(screen.getByTestId('initial-km-chain')).toBeTruthy();
  });

  it('sends initial_km input as initialKm per component and 0 for the rest', async () => {
    const {mutateAsync, onComplete} = renderOnboarding();

    fireEvent(screen.getByTestId('used-bike-switch'), 'valueChange', true);
    fireEvent.changeText(screen.getByTestId('initial-km-cassette'), '15000');
    fireEvent.press(screen.getByText('bikeGarage.onboarding.apply'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const {bikeId, resets} = mutateAsync.mock.calls[0][0];
    expect(bikeId).toBe('b1');
    expect(resets.find((r: {component: string}) => r.component === 'cassette')).toEqual({
      component: 'cassette',
      resetKm: 0,
      initialKm: 15000,
    });
    expect(resets.find((r: {component: string}) => r.component === 'chain').initialKm).toBe(0);
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });

  it('ignores typed km once the toggle is off again', async () => {
    const {mutateAsync} = renderOnboarding();

    fireEvent(screen.getByTestId('used-bike-switch'), 'valueChange', true);
    fireEvent.changeText(screen.getByTestId('initial-km-chain'), '9000');
    fireEvent(screen.getByTestId('used-bike-switch'), 'valueChange', false);
    fireEvent.press(screen.getByText('bikeGarage.onboarding.apply'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0].resets.every((r: {initialKm: number}) => r.initialKm === 0)).toBe(true);
  });
});
