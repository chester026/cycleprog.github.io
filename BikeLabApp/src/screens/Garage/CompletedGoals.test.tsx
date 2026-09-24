import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react-native';
import type {MetaGoal} from '@bikelab/shared/types';
import {CompletedGoals} from './CompletedGoals';
import type {GoalRecap} from '../../components/ShareStudio/goal/recap';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
  }),
}));
jest.mock('../../i18n/dateLocale', () => ({getDateLocale: () => 'en-US'}));

const recap: GoalRecap = {
  start: new Date(2026, 7, 1),
  end: new Date(2026, 8, 5),
  days: 36,
  distanceKm: 1240,
  elevationM: 9000,
  rides: 30,
  movingHours: 50,
  activeDays: 28,
  longestRideKm: 140,
  everests: 1,
};
// Base tier gets no tier pill (same rule as GoalHeader).
const goal = {id: 7, title: 'Summer 1200', status: 'completed', tier: 'epic', created_at: '2026-08-01'} as MetaGoal;

describe('CompletedGoals', () => {
  it('renders nothing without completed goals', () => {
    render(<CompletedGoals items={[]} onOpen={jest.fn()} onShare={jest.fn()} />);
    expect(screen.queryByTestId('garage-completed-goals')).toBeNull();
  });

  it('shows the goal recap and routes open/share', () => {
    const onOpen = jest.fn();
    const onShare = jest.fn();
    render(
      <CompletedGoals
        items={[{goal, recap, completedAt: new Date(2026, 8, 5)}]}
        onOpen={onOpen}
        onShare={onShare}
      />,
    );
    expect(screen.getByText('garage.goals')).toBeTruthy();
    expect(screen.getByText('Summer 1200')).toBeTruthy();
    expect(screen.getByText('goalTier.epic')).toBeTruthy();
    expect(screen.getByText('goalDetails.completed')).toBeTruthy();
    // One grey line under the title: short date · days · rides — no km/m.
    expect(screen.getByText(/^Sep 5 · goalShare\.daysCount.* · 30 goalShare\.ridesUnit/)).toBeTruthy();
    expect(screen.queryByText(/common\.km/)).toBeNull();

    fireEvent.press(screen.getByTestId('garage-goal-share-7'));
    expect(onShare).toHaveBeenCalledWith(goal);
    fireEvent.press(screen.getByText('Summer 1200'));
    expect(onOpen).toHaveBeenCalledWith(goal);
  });

  it('shows only the status pill for a base-tier goal', () => {
    render(
      <CompletedGoals
        items={[{goal: {...goal, tier: 'base'} as MetaGoal, recap, completedAt: new Date(2026, 8, 5)}]}
        onOpen={jest.fn()}
        onShare={jest.fn()}
      />,
    );
    expect(screen.queryByText('goalTier.base')).toBeNull();
    expect(screen.getByText('goalDetails.completed')).toBeTruthy();
  });
});
