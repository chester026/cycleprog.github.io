import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react-native';
import {WeekStrip} from './WeekStrip';

// Mon..Sun for 2026-06-15..21.
const days = Array.from({length: 7}, (_, i) => new Date(2026, 5, 15 + i));

describe('WeekStrip', () => {
  it('renders a day number for every day in the week', () => {
    render(
      <WeekStrip
        days={days}
        selectedDate="2026-06-17"
        datesWithContent={new Set()}
        locale="en-US"
        onSelectDay={jest.fn()}
      />,
    );
    for (const d of days) {
      expect(screen.getByText(String(d.getDate()))).toBeTruthy();
    }
  });

  it('calls onSelectDay with the tapped day\'s YYYY-MM-DD string', () => {
    const onSelectDay = jest.fn();
    render(
      <WeekStrip
        days={days}
        selectedDate="2026-06-17"
        datesWithContent={new Set()}
        locale="en-US"
        onSelectDay={onSelectDay}
      />,
    );
    fireEvent.press(screen.getByText('18'));
    expect(onSelectDay).toHaveBeenCalledWith('2026-06-18');
  });

  it('renders without crashing when a date has content', () => {
    render(
      <WeekStrip
        days={days}
        selectedDate="2026-06-15"
        datesWithContent={new Set(['2026-06-16'])}
        locale="en-US"
        onSelectDay={jest.fn()}
      />,
    );
    expect(screen.getByText('16')).toBeTruthy();
  });
});
