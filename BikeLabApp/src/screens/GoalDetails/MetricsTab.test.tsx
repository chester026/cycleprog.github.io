import React from 'react';
import {render, screen} from '@testing-library/react-native';
import type {Goal} from '@bikelab/shared/types';
import {MetricsTab} from './MetricsTab';

// See GoalDetails/lib.test.ts's identical comment.
jest.mock('@kingstinct/react-native-healthkit', () => ({}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 1,
    goal_type: 'distance',
    target_value: 100,
    current_value: 40,
    title: 'Total distance',
    unit: 'km',
    ...overrides,
  } as Goal;
}

describe('MetricsTab', () => {
  it('renders one card per sub-goal with its percentage and current/target', () => {
    render(<MetricsTab subGoals={[makeGoal()]} healthContext={undefined} />);

    expect(screen.getByText('Total distance')).toBeTruthy();
    expect(screen.getByText('40%')).toBeTruthy();
    expect(screen.getByText('40.0 km')).toBeTruthy();
    expect(screen.getByText('100.0 km')).toBeTruthy();
  });

  it('reads a health-source sub-goal from healthContext instead of current_value', () => {
    const goal = makeGoal({
      source: 'health',
      current_value: 0,
      metric: {source: 'health', health_metric: 'resting_hr'},
      target_value: 60,
      title: 'Resting HR',
    });
    const healthContext = {resting_hr_bpm: 48} as any;

    render(<MetricsTab subGoals={[goal]} healthContext={healthContext} />);

    expect(screen.getByText('48.0 km')).toBeTruthy();
  });

  it('shows a pace badge only when the sub-goal has server-computed pace', () => {
    const goal = makeGoal({
      pace: {daysElapsed: 1, daysRemaining: 1, expectedValue: 1, onTrack: true, percentDelta: 0},
    });
    render(<MetricsTab subGoals={[goal]} healthContext={undefined} />);
    expect(screen.getByText('goalDetails.paceOnTrack')).toBeTruthy();
  });

  it('renders nothing when there are no sub-goals', () => {
    render(<MetricsTab subGoals={[]} healthContext={undefined} />);
    expect(screen.queryByText(/km/)).toBeNull();
  });
});
