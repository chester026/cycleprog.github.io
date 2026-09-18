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
});
