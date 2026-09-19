import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import GoalsManager from '../GoalsManager';
import { ToastProvider } from '../../ui';
import { call } from '../../data/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

// useProfile() is gated on auth — pretend we're signed in.
vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false, user: { id: 1 }, isAdmin: false }),
  registerLogoutCleanup: () => () => {},
}));
vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});

// GoalsManager reads goals via useGoals()/useProfile() and deletes via
// useDeleteGoal() (T-6.2) instead of its old loadGoals()/loadUserProfile()
// apiFetch calls — this mocks apiFetch at the hook boundary the same way
// the hook tests do. `ToastProvider` wraps it because GoalsManager/GoalList
// call `useToast()` (T-6.3 part 2's window.alert/confirm → ui swap).
function renderGoalsManager(props = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <GoalsManager isOpen onClose={() => {}} {...props} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('GoalsManager', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('renders goals loaded via useGoals() and removes one on delete (confirmed via the ui ConfirmDialog)', async () => {
    const goals = [
      { id: 1, title: 'Ride 300km', goal_type: 'distance', period: '4w', current_value: 100, target_value: 300, unit: 'km', percent: 33 },
    ];

    call
      .mockResolvedValueOnce(goals) // useGoals()
      .mockResolvedValueOnce(null) // useProfile()
      .mockResolvedValueOnce({ success: true }) // DELETE /api/goals/1
      .mockResolvedValueOnce([]); // useGoals() refetch after invalidation

    renderGoalsManager();

    expect(await screen.findByText('Ride 300km')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Delete goal'));

    // GoalList's useConfirm() dialog, not window.confirm — scoped by name
    // since the "Manage Personal Goals" Modal is also open underneath it.
    const dialog = await screen.findByRole('dialog', { name: 'Delete this goal?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByText('Ride 300km')).not.toBeInTheDocument());
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'DELETE', path: '/api/goals/:id' }),
      { params: { id: 1 } }
    );
  });
});
