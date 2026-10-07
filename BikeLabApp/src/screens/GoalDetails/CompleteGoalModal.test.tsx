import React from 'react';
import {Alert} from 'react-native';
import {render, screen, fireEvent} from '@testing-library/react-native';
import type {MetaGoal} from '@bikelab/shared/types';
import {CompleteGoalModal} from './CompleteGoalModal';
import type {Activity} from '../../types/activity';

// lib.ts (via healthService) imports the native HealthKit module.
jest.mock('@kingstinct/react-native-healthkit', () => ({}));
jest.mock('../../i18n/dateLocale', () => ({getDateLocale: () => 'en-US'}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string, opts?: {percent?: number}) => (opts?.percent ? `${key}:${opts.percent}` : key)}),
}));
const mockMutate = jest.fn();
jest.mock('../../data/hooks/useCompleteMetaGoal', () => ({
  useCompleteMetaGoal: () => ({mutate: mockMutate}),
}));

const ride = (id: number, start_date: string, km: number): Activity => ({
  id,
  name: `Ride ${id}`,
  type: 'Ride',
  start_date,
  distance: km * 1000,
  moving_time: 3600,
  elapsed_time: 3600,
  total_elevation_gain: 100,
  average_speed: 7,
  max_speed: 10,
});

const goal = {id: 5, title: 'Fondo', status: 'active', created_at: '2026-09-01T10:00:00'} as MetaGoal;
const activities = [ride(1, '2026-09-05T08:00:00', 40), ride(2, '2026-09-08T08:00:00', 120), ride(3, '2026-09-09T08:00:00', 60)];

function setup(overallProgress: number) {
  const onCompleted = jest.fn();
  render(
    <CompleteGoalModal
      visible
      onClose={jest.fn()}
      metaGoal={goal}
      activities={activities}
      overallProgress={overallProgress}
      onCompleted={onCompleted}
    />,
  );
  return {onCompleted};
}

describe('CompleteGoalModal', () => {
  let alertSpy: jest.SpyInstance;
  beforeEach(() => {
    mockMutate.mockReset();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });
  afterEach(() => alertSpy.mockRestore());

  it('completes with the preselected longest ride at any progress, without asking', () => {
    setup(30);
    expect(screen.getByText('goalDetails.completeCta')).toBeTruthy();
    fireEvent.press(screen.getByTestId('picker-confirm'));
    expect(mockMutate.mock.calls[0][0]).toEqual({id: 5, activityIds: [2]});
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('asks "complete anyway" when nothing is selected under 95%', () => {
    setup(60);
    fireEvent.press(screen.getByTestId('picker-ride-2')); // deselect the preselected ride
    expect(screen.getByText('goalDetails.completeWithoutRides')).toBeTruthy();
    fireEvent.press(screen.getByTestId('picker-confirm'));
    expect(mockMutate).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('goalDetails.completeGoal', 'goalDetails.completeAnywayConfirm:60', expect.any(Array));

    const buttons = alertSpy.mock.calls[0][2] as {text: string; onPress?: () => void}[];
    buttons.find(b => b.text === 'goalDetails.completeAnyway')?.onPress?.();
    expect(mockMutate.mock.calls[0][0]).toEqual({id: 5, activityIds: []});
  });

  it('completes directly without rides from 95%', () => {
    setup(95);
    fireEvent.press(screen.getByTestId('picker-ride-2'));
    fireEvent.press(screen.getByTestId('picker-confirm'));
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockMutate.mock.calls[0][0]).toEqual({id: 5, activityIds: []});
  });

  it('opens the celebration after the server accepts', () => {
    const {onCompleted} = setup(95);
    fireEvent.press(screen.getByTestId('picker-confirm'));
    mockMutate.mock.calls[0][1].onSuccess();
    expect(onCompleted).toHaveBeenCalled();
  });
});
