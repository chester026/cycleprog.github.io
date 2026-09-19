import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react-native';
import {PlannedRidesWidget} from './PlannedRidesWidget';
import {useCalendar} from '../data/hooks/useCalendar';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));

jest.mock('../i18n/dateLocale', () => ({getDateLocale: () => 'en-US'}));

const mockNavigate = jest.fn();
jest.mock('../navigation/hooks', () => ({
  useAppNavigation: () => ({navigate: mockNavigate}),
}));
jest.mock('../data/hooks/useCalendar', () => ({useCalendar: jest.fn()}));

const mockedUseCalendar = useCalendar as jest.Mock;

const daysFromNow = (days: number) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

const ride = (id: number, days: number, title: string) => ({
  id,
  title,
  start_date: daysFromNow(days),
  type: 'planned_ride',
});

describe('PlannedRidesWidget', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('shows the empty state when there are no rides at all', () => {
    mockedUseCalendar.mockReturnValue({data: [], isLoading: false});
    render(<PlannedRidesWidget />);
    expect(screen.getByText('plannedRides.empty')).toBeTruthy();
  });

  it('shows the empty state when every ride is in the past', () => {
    mockedUseCalendar.mockReturnValue({data: [ride(1, -5, 'Gran Fondo')], isLoading: false});
    render(<PlannedRidesWidget />);

    expect(screen.queryByText('Gran Fondo')).toBeNull();
    expect(screen.getByTestId('planned-rides-empty')).toBeTruthy();
  });

  it('opens the Calendar tab from the empty state', () => {
    mockedUseCalendar.mockReturnValue({data: [], isLoading: false});
    render(<PlannedRidesWidget />);

    fireEvent.press(screen.getByTestId('planned-rides-empty'));
    expect(mockNavigate).toHaveBeenCalledWith('CalendarTab', {screen: 'Calendar'});
  });

  it('lists upcoming rides soonest first and drops the past ones', () => {
    mockedUseCalendar.mockReturnValue({
      data: [ride(1, 10, 'Alpine loop'), ride(2, -1, 'Yesterday'), ride(3, 0, 'Today ride')],
      isLoading: false,
    });
    render(<PlannedRidesWidget />);

    expect(screen.queryByText('Yesterday')).toBeNull();
    expect(screen.getByText('Today ride')).toBeTruthy();
    expect(screen.getByText('plannedRides.today')).toBeTruthy();
    expect(screen.getByText('10d')).toBeTruthy();
    expect(screen.queryByTestId('planned-rides-empty')).toBeNull();
  });
});
