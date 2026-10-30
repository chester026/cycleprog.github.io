import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../ui';
import CalendarPage from '../CalendarPage';
import { call } from '../../data/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderPage(url = '/calendar') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <Routes>
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/coach" element={<LocationProbe />} />
          </Routes>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const EVENTS = [
  { id: 1, type: 'planned_ride', title: 'Long ride', start_date: '2026-06-15', completed: false, goal_id: 3, goal_title: 'Fondo' },
  { id: 2, type: 'rest_day', title: 'Rest', start_date: '2026-06-16', completed: false },
];

function mockApi({ events = EVENTS, activities = [], onCreate } = {}) {
  const calls = [];
  call.mockImplementation((def, options) => {
    calls.push({ path: def.path, method: def.method, options });
    if (def.path === '/api/calendar' && def.method === 'GET') {
      const goalId = options?.query?.goal_id;
      return Promise.resolve(goalId ? events.filter((e) => String(e.goal_id) === String(goalId)) : events);
    }
    if (def.path === '/api/calendar' && def.method === 'POST') {
      onCreate?.(options.body);
      return Promise.resolve({ id: 9, ...options.body });
    }
    if (def.path === '/api/activities') return Promise.resolve(activities);
    if (def.path === '/api/meta-goals') return Promise.resolve([{ id: 3, title: 'Fondo', status: 'active' }]);
    return Promise.resolve({ success: true });
  });
  return calls;
}

describe('CalendarPage', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('opens the month of ?date, loads the padded grid range and shows the selected day panel', async () => {
    const calls = mockApi({ activities: [{ id: 5, name: 'Spin', start_date: '2026-06-15T06:00:00Z', distance: 30000, moving_time: 3600 }] });
    renderPage('/calendar?date=2026-06-15');

    expect(await screen.findByRole('grid', { name: 'Month' })).toBeInTheDocument();
    expect(screen.getByText('June 2026')).toBeInTheDocument();
    const listCall = calls.find((c) => c.path === '/api/calendar' && c.method === 'GET');
    expect(listCall.options.query).toMatchObject({ from: '2026-06-01', to: '2026-07-05' });

    const panel = screen.getByRole('complementary', { name: 'Selected day' });
    expect(within(panel).getByRole('heading', { name: 'Mon, Jun 15' })).toBeInTheDocument();
    expect(await within(panel).findByText('Long ride')).toBeInTheDocument();
    expect(within(panel).getByText('30.0 km · 1:00')).toBeInTheDocument();
  });

  it('selecting another day updates ?date, and the week view loads only that week', async () => {
    const calls = mockApi();
    renderPage('/calendar?date=2026-06-15');
    await screen.findByRole('grid', { name: 'Month' });

    fireEvent.click(screen.getByRole('button', { name: '2026-06-16' }));
    const panel = screen.getByRole('complementary', { name: 'Selected day' });
    expect(within(panel).getByRole('heading', { name: 'Tue, Jun 16' })).toBeInTheDocument();
    expect(within(panel).getByText('Rest')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Week' }));
    expect(await screen.findByText('Jun 15 – 21, 2026')).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.some((c) => c.path === '/api/calendar' && c.options.query.from === '2026-06-15' && c.options.query.to === '2026-06-21')).toBe(true),
    );
    expect(screen.getAllByTestId(/agenda-day-/)).toHaveLength(7);
  });

  it('filters by ?goal and offers to show all', async () => {
    const calls = mockApi();
    renderPage('/calendar?date=2026-06-15&goal=3');
    expect(await screen.findByText(/Showing events for/)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Fondo' })).toHaveAttribute('href', '/goals/3');
    await waitFor(() => expect(calls.some((c) => c.path === '/api/calendar' && c.options.query.goal_id === '3')).toBe(true));
    expect(screen.getByRole('link', { name: 'Show all' })).toHaveAttribute('href', '/calendar?date=2026-06-15');
  });

  it('sends "Plan with coach" and a per-event "Ask coach" to the coach page', async () => {
    mockApi();
    renderPage('/calendar?date=2026-06-15');
    await screen.findByRole('grid', { name: 'Month' });

    const panel = screen.getByRole('complementary', { name: 'Selected day' });
    fireEvent.click(await within(panel).findByRole('button', { name: 'Long ride, Planned Ride' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Coach' }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/coach?prompt=Tell+me+more+about+my+planned+ride+%22Long+ride%22+on+Mon%2C+Jun+15+%E2%80%94+what+should+I+focus+on%3F&event=1',
    );
  });

  it('plan with coach deep-links the weekly prompt', async () => {
    mockApi();
    renderPage('/calendar');
    await screen.findByRole('grid', { name: 'Month' });
    fireEvent.click(screen.getByRole('button', { name: 'Plan with Coach' }));
    expect(screen.getByTestId('location')).toHaveTextContent("/coach?prompt=Let%27s+plan+my+training+for+the+upcoming+week");
  });

  it('creates an event for the selected day from the New event sheet', async () => {
    const onCreate = vi.fn();
    mockApi({ onCreate });
    renderPage('/calendar?date=2026-06-18');
    await screen.findByRole('grid', { name: 'Month' });

    fireEvent.click(screen.getByRole('button', { name: '+ New event' }));
    const dialog = await screen.findByRole('dialog', { name: 'New event' });
    expect(within(dialog).getByText('Thursday, June 18, 2026')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Tempo' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add event' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][0]).toMatchObject({ title: 'Tempo', type: 'planned_ride', start_date: '2026-06-18', all_day: true });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New event' })).not.toBeInTheDocument());
  });

  it('shows the error state when the calendar fails to load', async () => {
    call.mockImplementation((def) =>
      def.path === '/api/calendar' ? Promise.reject(new Error('boom')) : Promise.resolve([]),
    );
    renderPage('/calendar');
    expect(await screen.findByText(/Couldn't load the calendar: boom/)).toBeInTheDocument();
  });
});
