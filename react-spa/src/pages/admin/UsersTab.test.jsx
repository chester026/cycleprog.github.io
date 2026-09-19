import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import UsersTab from './UsersTab';
import { call } from '../../data/api';
import { ToastProvider } from '../../ui';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

// UsersTab reads users via useAdminUsers() (T-6.2/T-6.3) and deletes via
// useDeleteAdminUser() — mock `call` at the hook boundary, same pattern
// as GoalsManager.test.jsx.
vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});

const users = [
  {
    id: 1,
    email: 'rider1@example.com',
    email_verified: true,
    has_strava_token: true,
    strava_id: 555,
    experience_level: 'intermediate',
    rides_count: 12,
    goals_count: 2,
    events_count: 0,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 2,
    email: 'rider2@example.com',
    email_verified: false,
    has_strava_token: false,
    strava_id: null,
    experience_level: null,
    rides_count: 0,
    goals_count: 0,
    events_count: 0,
    created_at: '2024-02-01T00:00:00Z',
  },
];

function renderUsersTab() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <UsersTab />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('UsersTab', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('renders rows from the mocked useAdminUsers() hook', async () => {
    call.mockResolvedValueOnce({ users }); // GET /api/admin/users

    renderUsersTab();

    expect(await screen.findByText('rider1@example.com')).toBeInTheDocument();
    expect(screen.getByText('rider2@example.com')).toBeInTheDocument();
    expect(screen.getByText('Total Users:').nextSibling).toHaveTextContent('2');
  });

  it('asks for confirmation before deleting a user, and does not call the API on cancel', async () => {
    call.mockResolvedValueOnce({ users });

    renderUsersTab();

    await screen.findByText('rider1@example.com');
    call.mockClear();

    fireEvent.click(screen.getAllByTitle('Delete User')[0]);

    expect(await screen.findByText(/WARNING/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(call).not.toHaveBeenCalled());
  });

  it('deletes the user only after the confirm dialog is accepted', async () => {
    call.mockResolvedValueOnce({ users });

    renderUsersTab();

    await screen.findByText('rider1@example.com');

    fireEvent.click(screen.getAllByTitle('Delete User')[0]);
    await screen.findByText(/WARNING/);

    call
      .mockResolvedValueOnce({ deletedRecords: { activities: 3 } }) // DELETE /api/admin/users/1
      .mockResolvedValueOnce({ users: [users[1]] }); // refetch after invalidation

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'DELETE', path: '/api/admin/users/:userId' }),
        { params: { userId: 1 } },
      ),
    );
  });
});
