import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import MonthGrid from '../MonthGrid';
import { makeEvent, makeActivity, dayGroup } from './fixtures';

function renderGrid(props = {}) {
  const daysByDate = new Map([
    [
      '2026-06-15',
      dayGroup('2026-06-15', {
        activities: [makeActivity()],
        events: [
          makeEvent({ id: 1, title: 'Long ride' }),
          makeEvent({ id: 2, title: 'Rest', type: 'rest_day', completed: true }),
          makeEvent({ id: 3, title: 'Chain', type: 'maintenance' }),
          makeEvent({ id: 4, title: 'Buy tyres', type: 'purchase' }),
        ],
      }),
    ],
  ]);
  const handlers = { onSelectDate: vi.fn(), onOpenEvent: vi.fn(), onOpenActivity: vi.fn() };
  render(<MonthGrid date="2026-06-15" today="2026-06-17" daysByDate={daysByDate} {...handlers} {...props} />);
  return handlers;
}

describe('MonthGrid', () => {
  it('renders the Monday-start month with padding days, today and the selected day', () => {
    renderGrid();
    const grid = screen.getByRole('grid', { name: 'Month' });
    expect(within(grid).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
    ]);
    expect(screen.getByTestId('calendar-day-2026-06-15')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: '2026-06-17, today' })).toHaveAttribute('aria-current', 'date');
    // July padding cell is present, June 1 is the first cell.
    expect(screen.getByTestId('calendar-day-2026-07-05')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(6); // header + 5 weeks
  });

  it('shows at most three event chips plus an overflow and the ride line', () => {
    const { onOpenEvent, onOpenActivity, onSelectDate } = renderGrid();
    const cell = screen.getByTestId('calendar-day-2026-06-15');
    expect(within(cell).getByTitle('Long ride')).toBeInTheDocument();
    expect(within(cell).getByTitle('Chain')).toBeInTheDocument();
    expect(within(cell).queryByTitle('Buy tyres')).not.toBeInTheDocument();
    expect(within(cell).getByText('42.5 km · Morning ride')).toBeInTheDocument();

    fireEvent.click(within(cell).getByTitle('Long ride'));
    expect(onOpenEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    fireEvent.click(within(cell).getByTitle('Morning ride'));
    expect(onOpenActivity).toHaveBeenCalledWith(expect.objectContaining({ id: 100 }));
    fireEvent.click(within(cell).getByRole('button', { name: '+1 more' }));
    expect(onSelectDate).toHaveBeenCalledWith('2026-06-15');
  });

  it('is keyboard navigable with a single tab stop', () => {
    const { onSelectDate } = renderGrid();
    const selected = screen.getByRole('button', { name: '2026-06-15' });
    expect(selected).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('button', { name: '2026-06-16' })).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(selected, { key: 'ArrowRight' });
    expect(onSelectDate).toHaveBeenLastCalledWith('2026-06-16');
    fireEvent.keyDown(selected, { key: 'ArrowDown' });
    expect(onSelectDate).toHaveBeenLastCalledWith('2026-06-22');
    fireEvent.keyDown(selected, { key: 'ArrowUp' });
    expect(onSelectDate).toHaveBeenLastCalledWith('2026-06-08');
    fireEvent.keyDown(selected, { key: 'End' });
    expect(onSelectDate).toHaveBeenLastCalledWith('2026-06-21');
    fireEvent.keyDown(screen.getByRole('button', { name: '2026-06-21' }), { key: 'Home' });
    expect(onSelectDate).toHaveBeenLastCalledWith('2026-06-15');
    fireEvent.keyDown(selected, { key: 'PageDown' });
    expect(onSelectDate).toHaveBeenLastCalledWith('2026-07-15');
    fireEvent.keyDown(selected, { key: 'PageUp' });
    expect(onSelectDate).toHaveBeenLastCalledWith('2026-05-15');
    fireEvent.keyDown(selected, { key: 'a' });
    expect(onSelectDate).toHaveBeenCalledTimes(7);
  });

  it('moves focus to the newly selected day after a keyboard move', () => {
    const daysByDate = new Map();
    function Harness() {
      const [date, setDate] = React.useState('2026-06-15');
      return (
        <MonthGrid date={date} today="2026-06-17" daysByDate={daysByDate} onSelectDate={setDate} onOpenEvent={vi.fn()} onOpenActivity={vi.fn()} />
      );
    }
    render(<Harness />);
    const start = screen.getByRole('button', { name: '2026-06-15' });
    start.focus();
    fireEvent.keyDown(start, { key: 'ArrowLeft' });
    expect(screen.getByRole('button', { name: '2026-06-14' })).toHaveFocus();
  });
});
