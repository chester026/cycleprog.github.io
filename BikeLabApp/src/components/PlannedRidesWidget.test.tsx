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

// Pinned clock: `daysUntil` in the widget counts local midnights, so a real
// `new Date()` near a DST switch (23/25-hour day) made "10 days" render as
// "11d". Mid-June noon is far from both transitions and from month ends.
const FIXED_NOW = new Date(2026, 5, 10, 12, 0, 0);

const daysFromNow = (days: number) => {
  const date = new Date(FIXED_NOW);
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
  beforeAll(() => {
    jest.useFakeTimers({now: FIXED_NOW});
  });

  afterAll(() => {
    jest.useRealTimers();
  });

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

  // docs/plans/workout-blocks.md: a session with blocks shows its profile in
  // place of the brief; one without keeps the text.
  it('shows the block profile instead of the description on a session that has blocks', () => {
    const block = (kind: string, duration_s: number, zone: number) => ({kind, duration_s, zone, target: null, cadence: null, cue: null, rep: null, reps: null});
    const workout = {version: 1, duration_s: 2100, steps: [block('warmup', 900, 2), block('work', 480, 4), block('cooldown', 720, 1)]};
    mockedUseCalendar.mockReturnValue({
      data: [
        {...ride(1, 2, 'Threshold'), description: 'Warm up, then one effort', workout},
        {...ride(2, 3, 'Coffee ride'), description: 'Easy spin to the cafe', workout: null},
      ],
      isLoading: false,
    });
    render(<PlannedRidesWidget />);

    expect(screen.getByTestId('ride-profile-1')).toBeTruthy();
    expect(screen.queryByText('Warm up, then one effort')).toBeNull();
    // A picture on the card, not buttons inside it.
    expect(screen.queryByTestId('ride-profile-1-block-0')).toBeNull();
    expect(screen.queryByTestId('ride-profile-2')).toBeNull();
    expect(screen.getByText('Easy spin to the cafe')).toBeTruthy();
  });
});
