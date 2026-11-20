import React from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react-native';
import type {MetaGoal} from '@bikelab/shared/types';
import {GoalPlan} from './GoalPlanCard';
import {useCalendar} from '../../data/hooks/useCalendar';
import type {Activity} from '../../types/activity';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
  }),
}));
jest.mock('../../data/hooks/useCalendar', () => ({useCalendar: jest.fn()}));
// lib.ts reaches the native HealthKit module through healthService.
jest.mock('@kingstinct/react-native-healthkit', () => ({}));

const useCalendarMock = useCalendar as jest.Mock;

const goal = (over: Partial<MetaGoal> = {}): MetaGoal =>
  ({id: 7, title: 'Gran Fondo Cyprus Preparation', status: 'active', created_at: '2026-11-01T00:00:00Z', target_date: '2027-03-26', ...over}) as MetaGoal;

const session = (id: number, date: string, minutes: number, completed = false) => ({
  id,
  type: 'planned_ride',
  title: `Session ${id}`,
  start_date: date,
  start_time: '09:00:00',
  end_time: `${String(9 + Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`,
  completed,
});

const ride = (date: string, minutes: number, type = 'Ride') =>
  ({id: Date.parse(date), type, start_date: date, moving_time: minutes * 60}) as unknown as Activity;

function renderPlan(
  metaGoal: MetaGoal,
  handlers: {onOpenCalendar?: () => void; onCreatePlan?: () => void; activities?: Activity[]} = {},
) {
  render(
    <GoalPlan
      metaGoal={metaGoal}
      activities={handlers.activities ?? []}
      locale="en-GB"
      onOpenCalendar={handlers.onOpenCalendar ?? jest.fn()}
      onCreatePlan={handlers.onCreatePlan ?? jest.fn()}
    />,
  );
}

describe('GoalPlan', () => {
  beforeEach(() => {
    // Wednesday of the plan's third week (23 Nov 2026 is a Monday).
    jest.useFakeTimers().setSystemTime(new Date('2026-12-09T10:00:00'));
    useCalendarMock.mockReset();
  });
  afterEach(() => jest.useRealTimers());

  it("asks the goal's own events of the calendar and draws nothing until they are in", () => {
    useCalendarMock.mockReturnValue({data: undefined, isLoading: true});
    renderPlan(goal());
    expect(useCalendarMock).toHaveBeenCalledWith({goalId: 7});
    expect(screen.queryByTestId('goal-plan-card')).toBeNull();
    expect(screen.queryByTestId('goal-plan-create')).toBeNull();
  });

  it('shows the plan week by week: where the rider is, what is done this week, the race and the next session', () => {
    const onOpenCalendar = jest.fn();
    useCalendarMock.mockReturnValue({
      isLoading: false,
      data: [
        session(1, '2026-11-24', 120, true),
        session(2, '2026-12-01', 180, true),
        session(3, '2026-12-08', 120, true),
        session(4, '2026-12-12', 240),
        session(5, '2026-12-15', 60),
        {id: 9, type: 'event', title: 'Gran Fondo Cyprus', start_date: '2027-03-26'},
      ],
    });
    renderPlan(goal(), {onOpenCalendar});

    // 23 Nov → the week of 26 Mar is 18 weeks.
    expect(screen.getByText('goalDetails.planWeekOf {"week":3,"total":18}')).toBeTruthy();
    expect(
      screen.getByText(
        'goalDetails.planDoneThisWeek {"done":"goalDetails.planHours {\\"value\\":\\"2\\"}","planned":"goalDetails.planHours {\\"value\\":\\"6\\"}"}',
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('goal-plan-week-current')).toBeTruthy();
    expect(screen.getAllByTestId(/^goal-plan-week-/)).toHaveLength(18);
    expect(screen.getByTestId('goal-plan-race')).toBeTruthy();

    // Captions are placed once the row of bars has a width (a wide one here:
    // the mocked t() spells every caption out as its key and options).
    expect(screen.queryByText(/planLabelThisWeek/)).toBeNull();
    act(() => {
      fireEvent(screen.getByTestId('goal-plan-bars'), 'layout', {nativeEvent: {layout: {width: 3000, height: 64}}});
    });
    expect(screen.getByText(/planLabelThisWeek/)).toBeTruthy();
    expect(screen.getByText(/planLabelRace/)).toBeTruthy();

    // The next session is the one way to the calendar — no second link beside it.
    expect(screen.getByText('Session 4')).toBeTruthy();
    expect(screen.queryByTestId('goal-plan-calendar')).toBeNull();
    fireEvent.press(screen.getByTestId('goal-plan-next'));
    expect(onOpenCalendar).toHaveBeenCalledTimes(1);
  });

  it("fills the weeks from the rider's rides — nothing has to be ticked in the calendar; a run does not count", () => {
    useCalendarMock.mockReturnValue({
      isLoading: false,
      data: [session(1, '2026-11-24', 120), session(2, '2026-12-01', 180), session(3, '2026-12-08', 120), session(4, '2026-12-12', 240)],
    });
    renderPlan(goal(), {
      activities: [
        ride('2026-11-25T08:00:00Z', 60),
        ride('2026-12-02T08:00:00Z', 200),
        ride('2026-12-08T17:00:00Z', 90),
        ride('2026-12-08T07:00:00Z', 120, 'Run'),
      ],
    });
    const fill = (testID: string) => screen.getByTestId(testID).props.children.props.style.at(-1).height;
    // Week 1: 1 h of 2 h. Week 2: more than planned is a full bar. This week: 1.5 h of 6 h.
    expect(fill('goal-plan-week-0')).toBe('50%');
    expect(fill('goal-plan-week-1')).toBe('100%');
    expect(fill('goal-plan-week-current')).toBe('25%');
    expect(screen.getByText(/planDoneThisWeek.*\\"1\.5\\".*\\"6\\"/)).toBeTruthy();
  });

  it('a finished goal keeps its plan as a summary, without a next session', () => {
    useCalendarMock.mockReturnValue({isLoading: false, data: [session(1, '2026-11-24', 120, true), session(2, '2026-12-12', 240)]});
    const onOpenCalendar = jest.fn();
    renderPlan(goal({status: 'completed', target_date: '2026-12-13'}), {onOpenCalendar});
    expect(screen.getByTestId('goal-plan-card')).toBeTruthy();
    expect(screen.queryByTestId('goal-plan-next')).toBeNull();
    // With no session to show, the foot of the card is the calendar link.
    fireEvent.press(screen.getByTestId('goal-plan-calendar'));
    expect(onOpenCalendar).toHaveBeenCalledTimes(1);
  });

  it('offers to create a plan when an open goal has no sessions, and takes the rider to the coach', () => {
    const onCreatePlan = jest.fn();
    useCalendarMock.mockReturnValue({isLoading: false, data: []});
    renderPlan(goal(), {onCreatePlan});
    expect(screen.queryByTestId('goal-plan-card')).toBeNull();
    // 9 Dec → 26 Mar.
    expect(screen.getByText('goalDetails.planWeeksToGo {"count":15}')).toBeTruthy();
    fireEvent.press(screen.getByTestId('goal-plan-create'));
    expect(onCreatePlan).toHaveBeenCalledTimes(1);
  });

  it('offers nothing for a goal that is completed or past its date and has no plan', () => {
    useCalendarMock.mockReturnValue({isLoading: false, data: []});
    renderPlan(goal({status: 'completed'}));
    expect(screen.queryByTestId('goal-plan-create')).toBeNull();
    renderPlan(goal({target_date: '2026-11-30'}));
    expect(screen.queryByTestId('goal-plan-create')).toBeNull();
  });
});
