import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react-native';
import type {MetaGoalRide} from '@bikelab/shared/types';
import {GoalRidesSection} from './GoalRidesSection';

jest.mock('../../i18n/dateLocale', () => ({getDateLocale: () => 'en-US'}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string, opts?: {distance?: string}) => (opts?.distance ? `${key}:${opts.distance}` : key)}),
}));

const attached: MetaGoalRide = {
  strava_id: 77,
  name: 'Gran Fondo',
  start_date: '2026-09-30T07:00:00Z',
  distance: 152300,
  moving_time: 21000,
  total_elevation_gain: 2400,
  average_speed: 7.2,
  attached_at: '2026-09-30T20:00:00Z',
};

describe('GoalRidesSection', () => {
  it('lists attached rides, opens one on tap and offers reopen', () => {
    const onRidePress = jest.fn();
    const onReopen = jest.fn();
    render(<GoalRidesSection rides={[attached]} onRidePress={onRidePress} onReopen={onReopen} />);
    expect(screen.getByText('goalDetails.ridesTitle')).toBeTruthy();
    expect(screen.getByText('Gran Fondo')).toBeTruthy();
    expect(screen.getByText('rideRow.meta:152.3')).toBeTruthy();
    fireEvent.press(screen.getByTestId('goal-ride-77'));
    expect(onRidePress).toHaveBeenCalledWith(77);
    fireEvent.press(screen.getByTestId('goal-reopen'));
    expect(onReopen).toHaveBeenCalled();
  });

  it('shows the empty line when no rides were attached', () => {
    render(<GoalRidesSection rides={[]} onRidePress={jest.fn()} onReopen={jest.fn()} />);
    expect(screen.getByText('goalDetails.noAttachedRides')).toBeTruthy();
  });
});
