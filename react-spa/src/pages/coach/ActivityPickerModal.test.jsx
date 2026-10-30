import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../ui';
import ActivityPickerModal from './ActivityPickerModal';
import { call } from '../../data/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});

function ride(id, dayOfOct, name = `Ride ${id}`) {
  return { id, name, start_date: `2026-10-${String(dayOfOct).padStart(2, '0')}T08:00:00Z`, distance: 42195, moving_time: 5400, total_elevation_gain: 512.4 };
}

function renderPicker(props = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ActivityPickerModal open onClose={onClose} onConfirm={onConfirm} {...props} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { onConfirm, onClose, unmount };
}

describe('ActivityPickerModal', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('does not fetch while closed', () => {
    renderPicker({ open: false });
    expect(call).not.toHaveBeenCalled();
  });

  it('lists rides newest first with a formatted summary and attaches the checked ones', async () => {
    call.mockResolvedValue([ride(1, 3, 'Older'), ride(2, 10, 'Newer'), { ...ride(3, 1), name: '' }]);
    const { onConfirm } = renderPicker();
    expect(screen.getByRole('status', { name: 'Loading activities...' })).toBeInTheDocument();

    const items = await screen.findAllByRole('listitem');
    expect(items.map((li) => within(li).getByRole('checkbox').id)).toEqual(['coach-pick-2', 'coach-pick-1', 'coach-pick-3']);
    expect(items[0]).toHaveTextContent('Newer');
    expect(items[0]).toHaveTextContent('Sat, Oct 10 · 42.2 km · 1h30 · 512 m↑');
    expect(items[2]).toHaveTextContent('Untitled ride');

    const attach = screen.getByRole('button', { name: 'Attach (0)' });
    expect(attach).toBeDisabled();
    fireEvent.click(within(items[0]).getByRole('checkbox'));
    fireEvent.click(within(items[2]).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Attach (2)' }));
    expect(onConfirm).toHaveBeenCalledWith([expect.objectContaining({ id: 2 }), expect.objectContaining({ id: 3 })]);
  });

  it('pre-selects the already attached ids', async () => {
    call.mockResolvedValue([ride(1, 3), ride(2, 10)]);
    renderPicker({ preselectedIds: [1] });
    expect(await screen.findByRole('checkbox', { name: /Ride 1/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Ride 2/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Attach (1)' })).not.toBeDisabled();
  });

  it('caps the selection at the shared maximum with a toast', async () => {
    call.mockResolvedValue([1, 2, 3, 4, 5, 6].map((i) => ride(i, i)));
    renderPicker();
    const boxes = await screen.findAllByRole('checkbox');
    boxes.forEach((box) => fireEvent.click(box));
    expect(await screen.findByText('You can attach up to 5 activities at once.')).toBeInTheDocument();
    expect(boxes.filter((b) => b.checked)).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Attach (5)' })).toBeInTheDocument();
  });

  it('shows the empty and error states', async () => {
    call.mockResolvedValueOnce([]);
    const { unmount } = renderPicker();
    expect(await screen.findByText('No activities synced yet')).toBeInTheDocument();
    unmount();
    resetTestQueryClient();

    call.mockRejectedValueOnce(new Error('boom'));
    renderPicker();
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load your activities.');
  });
});
