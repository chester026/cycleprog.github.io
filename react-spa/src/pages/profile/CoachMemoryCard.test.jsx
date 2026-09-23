import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../ui';
import CoachMemoryCard from './CoachMemoryCard';
import { call } from '../../data/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});

function renderCard() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <CoachMemoryCard />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function mockApi({ notes = [] } = {}) {
  call.mockImplementation((def) => {
    if (def.method === 'GET' && def.path === '/api/coach/notes') return Promise.resolve(notes);
    return Promise.resolve({});
  });
}

describe('CoachMemoryCard', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('shows the title and a count out of the 30-note cap', async () => {
    mockApi({ notes: [{ id: 1, note: 'Prefers morning rides', category: 'preference', source: 'coach' }] });
    renderCard();

    expect(await screen.findByText('Prefers morning rides')).toBeInTheDocument();
    expect(screen.getByText('What your coach remembers')).toBeInTheDocument();
    expect(screen.getByText('1/30')).toBeInTheDocument();
    expect(screen.getByRole('listitem').textContent).toContain('Preference');
  });

  it('shows a one-line empty state when there are no notes', async () => {
    mockApi({ notes: [] });
    renderCard();

    expect(await screen.findByText("Your coach hasn't remembered anything about you yet.")).toBeInTheDocument();
    expect(screen.getByText('0/30')).toBeInTheDocument();
  });

  it('adds a note with its category via POST /api/coach/notes', async () => {
    mockApi({ notes: [] });
    renderCard();
    await screen.findByText('0/30');

    fireEvent.change(screen.getByLabelText('Add note'), { target: { value: 'Knee hurts on long climbs' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'health' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));

    await waitFor(() => {
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/api/coach/notes' }),
        { body: { note: 'Knee hurts on long climbs', category: 'health' } },
      );
    });
  });

  it('edits a note inline: Enter saves, Escape cancels', async () => {
    mockApi({ notes: [{ id: 7, note: 'Old note text', category: 'other', source: 'user' }] });
    renderCard();

    fireEvent.click(await screen.findByText('Old note text'));
    const editInput = screen.getByLabelText('Edit note');
    fireEvent.change(editInput, { target: { value: 'Updated note text' } });
    fireEvent.keyDown(editInput, { key: 'Enter' });

    await waitFor(() => {
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'PUT', path: '/api/coach/notes/:id' }),
        { params: { id: 7 }, body: { note: 'Updated note text' } },
      );
    });
  });

  it('reverts an inline edit on Escape without saving', async () => {
    mockApi({ notes: [{ id: 7, note: 'Old note text', category: 'other', source: 'user' }] });
    renderCard();

    fireEvent.click(await screen.findByText('Old note text'));
    const editInput = screen.getByLabelText('Edit note');
    fireEvent.change(editInput, { target: { value: 'Something unsaved' } });
    fireEvent.keyDown(editInput, { key: 'Escape' });

    expect(await screen.findByText('Old note text')).toBeInTheDocument();
    expect(call).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'PUT' }), expect.anything());
  });

  it('deletes a note after confirming via the useConfirm dialog', async () => {
    mockApi({ notes: [{ id: 3, note: 'Rides only on weekends', category: 'preference', source: 'coach' }] });
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete note' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete note' });
    fireEvent.click(within(dialog).getByText('Delete'));

    await waitFor(() => {
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'DELETE', path: '/api/coach/notes/:id' }),
        { params: { id: 3 } },
      );
    });
  });
});
