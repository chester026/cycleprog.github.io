import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../ui';
import GoalDetailPage from '../GoalDetailPage';
import { call } from '../../data/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});

vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 1 }, isAuthenticated: true, isLoading: false }),
}));

// WebGL orb, the training-plan widget and the two goal modals each have
// their own tests; here they are probes so this test is about the page's
// tabs, states and wiring only.
vi.mock('../../components/BlobOrb', () => ({ default: () => null }));
vi.mock('../../components/WeeklyTrainingCalendar', () => ({
  default: ({ mode }) => <div data-testid="weekly-calendar">calendar:{mode}</div>,
}));
vi.mock('../../components/AddGoalModal', () => ({
  default: ({ isOpen, metaGoalId }) => (isOpen ? <div role="dialog">Add goal to {metaGoalId}</div> : null),
}));
vi.mock('../../components/GoalsManager', () => ({
  default: ({ isOpen }) => (isOpen ? <div role="dialog">Goals manager</div> : null),
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderPage(id = 5) {
  return render(
    <MemoryRouter initialEntries={[`/goals/${id}`]}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <Routes>
            <Route path="/goals/:id" element={<GoalDetailPage />} />
            <Route path="/coach" element={<LocationProbe />} />
            <Route path="/calendar" element={<LocationProbe />} />
          </Routes>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const META_GOAL = { id: 5, title: 'Summer century', description: 'Ride 100 km in one go.', status: 'active', tier: 'base', target_date: null };
const SUB_GOALS = [
  { id: 11, title: 'Weekly distance', goal_type: 'distance', current_value: 60, target_value: 80, percent: 75, unit: 'km' },
  { id: 12, title: 'FTP sessions', goal_type: 'ftp_vo2max', current_value: 1, target_value: 60, percent: 10 },
];

function mockApi({ detail, events = [], failDetail = false, pendingEvents = false } = {}) {
  call.mockImplementation((def) => {
    switch (def.path) {
      case '/api/meta-goals/:id':
        if (def.method === 'GET') {
          if (failDetail) return Promise.reject(new Error('boom'));
          return Promise.resolve(detail === undefined ? { metaGoal: META_GOAL, subGoals: SUB_GOALS } : detail);
        }
        return Promise.resolve({ id: 5 });
      case '/api/calendar':
        if (pendingEvents) return new Promise(() => {});
        return Promise.resolve(events);
      case '/api/user-profile':
        return Promise.resolve({ id: 1 });
      default:
        return Promise.resolve([]);
    }
  });
}

describe('GoalDetailPage', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('shows a loader, then the goal with its non-FTP sub-goals and the training recommendations', async () => {
    mockApi();
    renderPage();
    expect(screen.getByRole('status', { name: 'Loading goal details...' })).toBeInTheDocument();

    expect(await screen.findByRole('heading', { level: 1, name: 'Summer century' })).toBeInTheDocument();
    expect(screen.getByText('Weekly distance')).toBeInTheDocument();
    // ftp_vo2max sub-goals are excluded from the board and the average.
    expect(screen.queryByText('FTP sessions')).not.toBeInTheDocument();
    expect(screen.getByText('75')).toBeInTheDocument();
    expect(screen.getByText('Almost There')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Training Recommendations' })).toBeInTheDocument();
    expect(screen.getByTestId('weekly-calendar')).toHaveTextContent('calendar:ai-generated');
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/api/calendar' }),
      { query: { from: undefined, to: undefined, type: undefined, goal_id: '5' } },
    );
  });

  it('shows the error state with a way back when the goal fails to load', async () => {
    mockApi({ failDetail: true });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load goal details');
    fireEvent.click(screen.getByRole('button', { name: /Back to Goals/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/coach');
  });

  it('says "Goal not found" when the server returns no meta-goal', async () => {
    mockApi({ detail: { metaGoal: null, subGoals: [] } });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Goal not found');
  });

  it('offers to add the first sub-goal when there are none', async () => {
    mockApi({ detail: { metaGoal: META_GOAL, subGoals: [] } });
    renderPage();
    expect(await screen.findByText('No sub-goals defined yet.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Training Recommendations' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add Your First Goal' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Add goal to 5');
  });

  it('opens the Add Goal and Manage Goals modals from the tab row', async () => {
    mockApi();
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Summer century' });

    fireEvent.click(screen.getByRole('button', { name: /Add Goal/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Add goal to 5');

    fireEvent.click(screen.getByRole('button', { name: /Manage Goals/ }));
    expect(screen.getByText('Goals manager')).toBeInTheDocument();
  });

  it('shows a schedule-tab empty state that hands off to the coach', async () => {
    mockApi({ events: [] });
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Summer century' });

    fireEvent.click(screen.getByRole('button', { name: 'Scheduled' }));
    expect(await screen.findByText('No sessions scheduled yet')).toBeInTheDocument();
    // The Metrics-only actions disappear on the Scheduled tab.
    expect(screen.queryByRole('button', { name: /Manage Goals/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Ask coach for a plan/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/coach?${new URLSearchParams({ prompt: 'Can you put together a training plan for my goal "Summer century"?' })}`,
    );
  });

  it('lists the linked calendar events sorted by date with a Done badge and a calendar link', async () => {
    mockApi({
      events: [
        { id: 2, title: 'Long ride', start_date: '2026-10-20', type: 'planned_ride', completed: false },
        { id: 1, title: 'Rest', start_date: '2026-10-18', type: 'rest_day', completed: true },
      ],
    });
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Summer century' });
    fireEvent.click(screen.getByRole('button', { name: 'Scheduled' }));

    const link = await screen.findByRole('link', { name: /Open in Calendar/ });
    expect(link).toHaveAttribute('href', '/calendar?goal=5');

    const titles = screen.getAllByText(/^(Long ride|Rest)$/).map((el) => el.textContent);
    expect(titles).toEqual(['Rest', 'Long ride']);
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('shows the Complete CTA at 75 %+ and marks the goal completed after confirming', async () => {
    mockApi();
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Summer century' });

    fireEvent.click(screen.getByRole('button', { name: /Complete$/ }));
    const dialog = screen.getByRole('dialog', { name: 'Mark this goal as completed?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'PUT', path: '/api/meta-goals/:id' }),
        { params: { id: '5' }, body: { status: 'completed' } },
      ),
    );
  });

  it('hides the Complete CTA for a goal that is already completed', async () => {
    mockApi({ detail: { metaGoal: { ...META_GOAL, status: 'completed' }, subGoals: SUB_GOALS } });
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Summer century' });
    expect(screen.queryByRole('button', { name: /Complete$/ })).not.toBeInTheDocument();
  });
});
