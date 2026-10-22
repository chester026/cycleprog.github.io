import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../ui';
import MetaGoalRow from '../MetaGoalRow';
import { call } from '../../data/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});

const metaGoal = {
  id: 4,
  title: 'Gran Fondo ready',
  description: 'Finish a 160 km event. Then celebrate! Maybe twice.',
  status: 'active',
  target_date: '2030-09-01',
  sub_goals: [
    { id: 1, goal_type: 'distance', percent: 90 },
    { id: 2, goal_type: 'elevation', percent: 70 },
    // FTP goals never count toward the average.
    { id: 3, goal_type: 'ftp_vo2max', percent: 0 },
  ],
};

function renderRow(props = {}) {
  const onClick = vi.fn();
  const onStatusChange = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MetaGoalRow metaGoal={metaGoal} onClick={onClick} onStatusChange={onStatusChange} {...props} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { onClick, onStatusChange };
}

describe('MetaGoalRow', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('shows the title, the first sentence of the description and the averaged progress', () => {
    renderRow();
    expect(screen.getByRole('heading', { name: 'Gran Fondo ready' })).toBeInTheDocument();
    expect(screen.getByText('Finish a 160 km event.')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
    expect(screen.queryByText('Expired')).not.toBeInTheDocument();
  });

  it('opens the goal on click and keyboard, but not from the complete button', async () => {
    call.mockResolvedValue({ id: 4 });
    const { onClick, onStatusChange } = renderRow();
    const row = screen.getByRole('button', { name: /Gran Fondo ready/ });
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByTitle('Complete'));
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'PUT', path: '/api/meta-goals/:id' }),
        { params: { id: 4 }, body: expect.objectContaining({ id: 4, status: 'completed' }) },
      ),
    );
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledTimes(1));
    // stopPropagation: completing does not open the row.
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('toasts when completing fails', async () => {
    call.mockRejectedValue(new Error('500'));
    const { onStatusChange } = renderRow();
    fireEvent.click(screen.getByTitle('Complete'));
    expect(await screen.findByText('Failed to update goal status')).toBeInTheDocument();
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('shows the Completed badge and hides the complete button for a finished goal', () => {
    renderRow({ metaGoal: { ...metaGoal, status: 'completed' } });
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.queryByTitle('Complete')).not.toBeInTheDocument();
  });

  it('flags an active goal past its target date as Expired', () => {
    renderRow({ metaGoal: { ...metaGoal, target_date: '2020-01-01', sub_goals: [] } });
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });
});
