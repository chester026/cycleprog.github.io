import React from 'react';
import {render, screen} from '@testing-library/react-native';
import {RideStats} from './RideStats';
import type {Activity} from '../../types/activity';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));

const activity = {
  id: 1,
  name: 'Morning Ride',
  distance: 30000,
  moving_time: 3600,
} as unknown as Activity;

describe('RideStats', () => {
  it('renders the ride quality block, HR zones and goal cards', () => {
    render(
      <RideStats
        activity={activity}
        rideDate="08.01.2024"
        rideQuality={{quality: 72, label: 'Well done', advice: 'Strong ride. Keep pushing!'}}
        hrZoneDistribution={[
          {zone: 'Z1', minutes: 5, percent: 10, color: '#000', rangeMin: 0, rangeMax: 120},
          {zone: 'Z2', minutes: 20, percent: 40, color: '#111', rangeMin: 120, rangeMax: 140},
        ]}
        metaGoals={[
          {id: 'g1', title: 'Endurance base', progress: 55, progressGain: 3, contributions: []},
        ]}
      />,
    );

    expect(screen.getByText('Morning Ride')).toBeTruthy();
    expect(screen.getByText('08.01.2024')).toBeTruthy();
    expect(screen.getByText('Well done')).toBeTruthy();
    expect(screen.getByText(/rideAnalytics\.rideQuality72/)).toBeTruthy();
    expect(screen.getByText(/Z1\s*0-120/)).toBeTruthy();
    expect(screen.getByText('Endurance base')).toBeTruthy();
    expect(screen.getByText(/^55%$/)).toBeTruthy();
    expect(screen.getByText(/\+3%/)).toBeTruthy();
  });

  it('shows the empty-goals placeholder when there are no meta goals', () => {
    render(
      <RideStats
        activity={activity}
        rideDate="08.01.2024"
        rideQuality={null}
        hrZoneDistribution={[]}
        metaGoals={[]}
      />,
    );
    expect(screen.getByText('rideAnalytics.noActiveGoals')).toBeTruthy();
  });
});
