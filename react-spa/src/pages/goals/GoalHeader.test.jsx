import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../ui';
import GoalHeader from './GoalHeader';
import { call } from '../../data/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});

const metaGoal = {
  id: 9,
  title: 'Climb Troodos',
  description: 'Reach the summit before winter.',
  tier: 'epic',
  status: 'active',
  target_date: '2030-05-01',
};

function renderHeader(props = {}) {
  const onBack = vi.fn();
  const onDeleted = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <GoalHeader metaGoal={metaGoal} onBack={onBack} onDeleted={onDeleted} {...props} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { onBack, onDeleted };
}

describe('GoalHeader', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('shows title, tier badge, due date, status and description', () => {
    renderHeader();
    expect(screen.getByRole('heading', { level: 1, name: 'Climb Troodos' })).toBeInTheDocument();
    expect(screen.getByText('Epic')).toBeInTheDocument();
    expect(screen.getByText('Due: May 1, 2030')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Reach the summit before winter.')).toBeInTheDocument();
  });

  it('hides the tier badge for base goals and flags a past target date as Expired', () => {
    renderHeader({ metaGoal: { ...metaGoal, tier: 'base', target_date: '2020-01-01', description: null } });
    expect(screen.queryByText('Base')).not.toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.queryByText('Reach the summit before winter.')).not.toBeInTheDocument();
  });

  it('shows Completed and "No deadline" for a finished goal without a date', () => {
    renderHeader({ metaGoal: { ...metaGoal, status: 'completed', target_date: null } });
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('No deadline')).toBeInTheDocument();
  });

  it('calls onBack from the back button', () => {
    const { onBack } = renderHeader();
    fireEvent.click(screen.getByRole('button', { name: /Back to Coach/ }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('saves edits through PUT /api/meta-goals/:id and closes the modal', async () => {
    call.mockResolvedValue({ id: 9 });
    renderHeader();

    fireEvent.click(screen.getByTitle('Edit goal'));
    const dialog = screen.getByRole('dialog', { name: 'Edit Goal' });
    expect(within(dialog).getByLabelText('Title')).toHaveValue('Climb Troodos');

    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Climb Olympus' } });
    fireEvent.change(within(dialog).getByLabelText('Status'), { target: { value: 'archived' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'PUT', path: '/api/meta-goals/:id' }),
        {
          params: { id: 9 },
          body: { title: 'Climb Olympus', description: 'Reach the summit before winter.', target_date: '2030-05-01', status: 'archived' },
        },
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit Goal' })).not.toBeInTheDocument());
  });

  it('toasts and keeps the modal open when saving fails', async () => {
    call.mockRejectedValue(new Error('nope'));
    renderHeader();
    fireEvent.click(screen.getByTitle('Edit goal'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByText('Failed to update goal')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Edit Goal' })).toBeInTheDocument();
  });

  it('deletes only after confirming, then reports back through onDeleted', async () => {
    call.mockResolvedValue({ success: true });
    const { onDeleted } = renderHeader();

    fireEvent.click(screen.getByTitle('Delete goal'));
    const confirmDialog = screen.getByRole('dialog', { name: 'Delete this goal?' });
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Cancel' }));
    expect(call).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Delete goal'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete this goal?' })).getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'DELETE', path: '/api/meta-goals/:id' }),
        { params: { id: 9 } },
      ),
    );
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });
});
