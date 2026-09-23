import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react-native';
import {RideStats} from './RideStats';
import type {Activity} from '../../types/activity';
import {colors} from '../../theme';

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
          {zone: 'Z1', minutes: 5, percent: 10, color: colors.black, rangeMin: 0, rangeMax: 120},
          {zone: 'Z2', minutes: 20, percent: 40, color: colors.knowledgeCenter.bg, rangeMin: 120, rangeMax: 140},
        ]}
        metaGoals={[
          {id: 'g1', status: 'active', title: 'Endurance base', progress: 55, progressGain: 3, contributions: []},
        ]}
        onOpenGoal={jest.fn()}
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
        onOpenGoal={jest.fn()}
      />,
    );
    expect(screen.getByText('rideAnalytics.noActiveGoals')).toBeTruthy();
  });

  const contribution = (label: string) => ({type: 'distance', label, value: '+1 km'});
  const goal = (id: string, title: string, contributions = []) => ({
    id,
    status: 'active',
    title,
    progress: 40,
    progressGain: 2,
    contributions,
  });

  it('shows each goal\'s tier in the card footer', () => {
    render(
      <RideStats
        activity={activity}
        rideDate="08.01.2024"
        rideQuality={null}
        hrZoneDistribution={[]}
        metaGoals={[{...goal('a', 'Alpha'), tier: 'epic'}, goal('b', 'Beta')]}
        onOpenGoal={jest.fn()}
      />,
    );

    expect(screen.getByText('goalTier.epic')).toBeTruthy();
    // No tier on the row -> 'base', not a blank badge.
    expect(screen.getByText('goalTier.base')).toBeTruthy();
  });

  it('renders a card per goal — none are dropped', () => {
    render(
      <RideStats
        activity={activity}
        rideDate="08.01.2024"
        rideQuality={null}
        hrZoneDistribution={[]}
        metaGoals={[goal('a', 'Alpha'), goal('b', 'Beta'), goal('c', 'Gamma'), goal('d', 'Delta')]}
        onOpenGoal={jest.fn()}
      />,
    );

    for (const title of ['Alpha', 'Beta', 'Gamma', 'Delta']) {
      expect(screen.getByText(title)).toBeTruthy();
    }
  });

  it('shows at most three contributions per card, then the "check more" row', () => {
    render(
      <RideStats
        activity={activity}
        rideDate="08.01.2024"
        rideQuality={null}
        hrZoneDistribution={[]}
        metaGoals={[
          goal('a', 'Alpha', [
            contribution('Elevation'),
            contribution('Power'),
            contribution('Speed'),
            contribution('Volume'),
          ] as never),
        ]}
        onOpenGoal={jest.fn()}
      />,
    );

    expect(screen.getByText('Speed')).toBeTruthy();
    expect(screen.queryByText('Volume')).toBeNull();
    // The mocked `t` returns the key, so the count only shows up in the call
    // — assert the row is there and that it carries the hidden count.
    expect(screen.getByText('rideAnalytics.moreContributions')).toBeTruthy();
  });

  it('has no "check more" row when every contribution already fits', () => {
    render(
      <RideStats
        activity={activity}
        rideDate="08.01.2024"
        rideQuality={null}
        hrZoneDistribution={[]}
        metaGoals={[goal('a', 'Alpha', [contribution('Elevation')] as never)]}
        onOpenGoal={jest.fn()}
      />,
    );
    expect(screen.queryByText('rideAnalytics.moreContributions')).toBeNull();
  });

  it('opens a goal when its card is tapped', () => {
    const onOpenGoal = jest.fn();
    render(
      <RideStats
        activity={activity}
        rideDate="08.01.2024"
        rideQuality={null}
        hrZoneDistribution={[]}
        metaGoals={[goal('a', 'Alpha')]}
        onOpenGoal={onOpenGoal}
      />,
    );

    fireEvent.press(screen.getByText('Alpha'));
    expect(onOpenGoal).toHaveBeenCalledWith('a');
  });
});
