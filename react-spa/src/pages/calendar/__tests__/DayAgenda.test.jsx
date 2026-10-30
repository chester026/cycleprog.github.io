import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import DayAgenda from '../DayAgenda';
import { makeEvent, makeActivity, dayGroup } from './fixtures';

describe('DayAgenda', () => {
  it('lists rides and events per day with duration/location subtitles', () => {
    const onOpenEvent = vi.fn();
    const onOpenActivity = vi.fn();
    render(
      <DayAgenda
        days={[
          dayGroup('2026-06-15', {
            activities: [makeActivity()],
            events: [
              makeEvent({ id: 1, title: 'Intervals', start_time: '18:00:00', end_time: '19:15:00', location: 'Park' }),
              makeEvent({ id: 2, title: 'Rest', type: 'rest_day', completed: true }),
            ],
          }),
          dayGroup('2026-06-16'),
        ]}
        selectedDate="2026-06-15"
        today="2026-06-16"
        onOpenEvent={onOpenEvent}
        onOpenActivity={onOpenActivity}
        onNewEvent={vi.fn()}
      />,
    );

    const monday = screen.getByTestId('agenda-day-2026-06-15');
    expect(within(monday).getByText('Mon')).toBeInTheDocument();
    expect(within(monday).getByText('42.5 km · 1:30')).toBeInTheDocument();
    expect(within(monday).getByText('18:00 · ~1h 15min · Park')).toBeInTheDocument();
    expect(within(monday).getByRole('button', { name: 'Rest, Rest Day, completed' })).toBeInTheDocument();

    fireEvent.click(within(monday).getByRole('button', { name: 'Intervals, Planned Ride' }));
    expect(onOpenEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    fireEvent.click(within(monday).getByText('Morning ride'));
    expect(onOpenActivity).toHaveBeenCalledWith(expect.objectContaining({ id: 100 }));

    const tuesday = screen.getByTestId('agenda-day-2026-06-16');
    expect(within(tuesday).getByText('Today')).toBeInTheDocument();
    expect(within(tuesday).getByText('Nothing planned')).toBeInTheDocument();
  });

  it('offers "Add event" for every day, passing the date', () => {
    const onNewEvent = vi.fn();
    render(
      <DayAgenda
        days={[dayGroup('2026-06-16')]}
        selectedDate="2026-06-16"
        today="2026-06-01"
        onOpenEvent={vi.fn()}
        onOpenActivity={vi.fn()}
        onNewEvent={onNewEvent}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Add event' }));
    expect(onNewEvent).toHaveBeenCalledWith('2026-06-16');
  });
});
