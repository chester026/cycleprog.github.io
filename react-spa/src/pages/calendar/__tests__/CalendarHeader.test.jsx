import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CalendarHeader from '../CalendarHeader';

function renderHeader(props = {}) {
  const handlers = {
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onToday: vi.fn(),
    onViewChange: vi.fn(),
    onPlanWithCoach: vi.fn(),
    onNewEvent: vi.fn(),
  };
  render(
    <MemoryRouter>
      <CalendarHeader periodLabel="October 2026" view="month" isToday={false} goalFilter={null} {...handlers} {...props} />
    </MemoryRouter>,
  );
  return handlers;
}

describe('CalendarHeader', () => {
  it('wires the title actions and the period paging', () => {
    const h = renderHeader();
    expect(screen.getByRole('heading', { level: 1, name: 'Calendar' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ New event' }));
    fireEvent.click(screen.getByRole('button', { name: /Plan with Coach/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(h.onNewEvent).toHaveBeenCalledTimes(1);
    expect(h.onPlanWithCoach).toHaveBeenCalledTimes(1);
    expect(h.onPrev).toHaveBeenCalledTimes(1);
    expect(h.onNext).toHaveBeenCalledTimes(1);
  });

  it('offers "Back to today" on the period label only when away from today', () => {
    const h = renderHeader();
    const period = screen.getByRole('button', { name: /October 2026/ });
    expect(period).toHaveTextContent('Back to today');
    expect(period).not.toBeDisabled();
    fireEvent.click(period);
    expect(h.onToday).toHaveBeenCalledTimes(1);
  });

  it('disables the period button when already on today', () => {
    renderHeader({ isToday: true });
    expect(screen.getByRole('button', { name: /October 2026/ })).toBeDisabled();
  });

  it('switches view through the segmented control and labels the arrows by view', () => {
    const h = renderHeader({ view: 'week', periodLabel: 'Oct 12 – 18' });
    expect(screen.getByRole('button', { name: 'Previous week' })).toBeInTheDocument();
    const tabs = screen.getByRole('tablist', { name: 'Calendar view' });
    expect(within(tabs).getByRole('tab', { name: 'Week' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(within(tabs).getByRole('tab', { name: 'Month' }));
    expect(h.onViewChange).toHaveBeenCalledWith('month');
  });

  it('shows the goal filter notice with links to the goal and to clear it', () => {
    renderHeader({ goalFilter: { id: 7, title: 'Gran Fondo', clearTo: '/calendar?view=month' } });
    expect(screen.getByText(/Showing events for/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gran Fondo' })).toHaveAttribute('href', '/goals/7');
    expect(screen.getByRole('link', { name: 'Show all' })).toHaveAttribute('href', '/calendar?view=month');
  });

  it('falls back to "goal #id" when the goal has no title', () => {
    renderHeader({ goalFilter: { id: 7, clearTo: '/calendar' } });
    expect(screen.getByRole('link', { name: 'goal #7' })).toBeInTheDocument();
  });
});
