import React from 'react';
import {render, screen, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {ScheduleTab} from './ScheduleTab';
import {api} from '../../data/api';

// See GoalDetails/lib.test.ts's identical comment.
jest.mock('@kingstinct/react-native-healthkit', () => ({}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));
// Mocked from `@bikelab/shared/api` directly, not `jest.requireActual('../../data/api')`
// — see useProfile.test.tsx for why.
jest.mock('../../data/api', () => ({
  ...jest.requireActual('@bikelab/shared/api'),
  api: {call: jest.fn()},
}));

const mockedApiCall = api.call as jest.Mock;

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}});
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('ScheduleTab', () => {
  beforeEach(() => {
    mockedApiCall.mockReset();
  });

  it('requests GET /api/calendar?goal_id=<goalId> and renders the events sorted by date', async () => {
    mockedApiCall.mockResolvedValueOnce([
      {id: 2, type: 'planned_ride', title: 'Long ride', start_date: '2026-07-01', completed: false},
      {id: 1, type: 'rest_day', title: 'Rest', start_date: '2026-06-01', completed: true},
    ]);

    renderWithClient(<ScheduleTab goalId={99} locale="en-US" onViewCalendar={() => {}} />);

    await waitFor(() => expect(screen.getByText('Rest')).toBeTruthy());
    expect(screen.getByText('Long ride')).toBeTruthy();
    expect(screen.getByText('goalDetails.done')).toBeTruthy();
    expect(mockedApiCall.mock.calls[0][0]).toMatchObject({method: 'GET', path: '/api/calendar'});
    expect(mockedApiCall.mock.calls[0][1]).toEqual({
      query: {from: undefined, to: undefined, type: undefined, goal_id: 99},
    });
  });

  it('shows the empty state when there are no scheduled events', async () => {
    mockedApiCall.mockResolvedValueOnce([]);

    renderWithClient(<ScheduleTab goalId={1} locale="en-US" onViewCalendar={() => {}} />);

    await waitFor(() => expect(screen.getByText('goalDetails.noScheduled')).toBeTruthy());
  });
});
