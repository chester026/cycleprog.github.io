import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react-native';
import {DayList} from './DayList';
import type {DayGroup} from './lib';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));
jest.mock('../../i18n/dateLocale', () => ({getDateLocale: () => 'en-US'}));

function makeActivity(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Morning ride',
    type: 'Ride',
    start_date: '2026-06-15T08:00:00Z',
    distance: 20000,
    moving_time: 3600,
    ...overrides,
  };
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    type: 'planned_ride',
    title: 'Long ride',
    start_date: '2026-06-15',
    source: 'user',
    ...overrides,
  };
}

describe('DayList', () => {
  it('shows the empty state when there are no days and not loading', () => {
    render(
      <DayList
        days={[]}
        loading={false}
        selectedDate="2026-06-15"
        bottomPadding={100}
        onSelectActivity={jest.fn()}
        onSelectEvent={jest.fn()}
      />,
    );
    expect(screen.getByText('calendar.empty')).toBeTruthy();
  });

  it('shows a spinner while loading with no days yet', () => {
    render(
      <DayList
        days={[]}
        loading={true}
        selectedDate="2026-06-15"
        bottomPadding={100}
        onSelectActivity={jest.fn()}
        onSelectEvent={jest.fn()}
      />,
    );
    expect(screen.queryByText('calendar.empty')).toBeNull();
  });

  it('renders an activity row and calls onSelectActivity when tapped', () => {
    const onSelectActivity = jest.fn();
    const days: DayGroup[] = [{date: '2026-06-15', activities: [makeActivity() as any], events: []}];
    render(
      <DayList
        days={days}
        loading={false}
        selectedDate="2026-06-15"
        bottomPadding={100}
        onSelectActivity={onSelectActivity}
        onSelectEvent={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByText('Morning ride'));
    expect(onSelectActivity).toHaveBeenCalledWith(days[0].activities[0]);
  });

  it('renders an event row and calls onSelectEvent when tapped', () => {
    const onSelectEvent = jest.fn();
    const days: DayGroup[] = [{date: '2026-06-15', activities: [], events: [makeEvent() as any]}];
    render(
      <DayList
        days={days}
        loading={false}
        selectedDate="2026-06-15"
        bottomPadding={100}
        onSelectActivity={jest.fn()}
        onSelectEvent={onSelectEvent}
      />,
    );
    fireEvent.press(screen.getByText('Long ride'));
    expect(onSelectEvent).toHaveBeenCalledWith(days[0].events[0]);
  });

  it('shows a checkmark instead of a chevron for a completed event', () => {
    const days: DayGroup[] = [
      {date: '2026-06-15', activities: [], events: [makeEvent({completed: true}) as any]},
    ];
    render(
      <DayList
        days={days}
        loading={false}
        selectedDate="2026-06-15"
        bottomPadding={100}
        onSelectActivity={jest.fn()}
        onSelectEvent={jest.fn()}
      />,
    );
    expect(screen.getByText('✓')).toBeTruthy();
    expect(screen.queryByText('›')).toBeNull();
  });

  // docs/plans/workout-blocks.md: a session the coach wrote with blocks shows
  // its shape on the row; one without blocks is a plain row as before.
  it('shows the workout profile on a session that has blocks, and only there', () => {
    const block = (kind: string, duration_s: number, zone: number) => ({kind, duration_s, zone, target: null, cadence: null, cue: null, rep: null, reps: null});
    const workout = {version: 1, duration_s: 2100, steps: [block('warmup', 900, 2), block('work', 480, 4), block('cooldown', 720, 1)]};
    const days: DayGroup[] = [
      {
        date: '2026-06-15',
        activities: [],
        events: [makeEvent({id: 7, title: '1×8′ @ 240 W', workout}) as any, makeEvent({id: 8, title: 'Easy spin', workout: null}) as any],
      },
    ];
    render(
      <DayList days={days} loading={false} selectedDate="2026-06-15" bottomPadding={100} onSelectActivity={jest.fn()} onSelectEvent={jest.fn()} />,
    );
    expect(screen.getByTestId('event-profile-7')).toBeTruthy();
    expect(screen.queryByTestId('event-profile-8')).toBeNull();
    // A picture on the row, not a second set of buttons inside it.
    expect(screen.queryByTestId('event-profile-7-block-0')).toBeNull();
    // The profile leads the card at its row height; the title is still there under it.
    expect(screen.getByTestId('event-profile-7').props.style).toEqual(expect.arrayContaining([{height: 44}]));
    expect(screen.getByText('1×8′ @ 240 W')).toBeTruthy();
    // The type's colour bar stays on a plain row and is dropped next to a profile.
    expect(screen.queryByTestId('event-accent-7')).toBeNull();
    expect(screen.getByTestId('event-accent-8')).toBeTruthy();
  });
});
