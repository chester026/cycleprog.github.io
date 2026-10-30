import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../ui';
import IntegrationsCard from './IntegrationsCard';
import { call } from '../../data/api';
import { startStravaLink } from '../../utils/strava';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});
vi.mock('../../utils/strava', () => ({ startStravaLink: vi.fn() }));

function renderCard(profile) {
  const onUnlinked = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <IntegrationsCard profile={profile} onUnlinked={onUnlinked} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { onUnlinked };
}

describe('IntegrationsCard', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
    startStravaLink.mockReset().mockResolvedValue(null);
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('offers to connect when no Strava account is linked (link flow, not login)', async () => {
    renderCard({ strava_id: null });
    expect(screen.queryByText(/Strava account connected/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Connect Strava' }));
    await waitFor(() => expect(startStravaLink).toHaveBeenCalledTimes(1));
  });

  it('unlinks after confirmation and reports back', async () => {
    call.mockResolvedValue({ success: true });
    const { onUnlinked } = renderCard({ strava_id: 77 });
    expect(screen.getByText(/Strava account connected/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Unlink Strava' }));
    const dialog = screen.getByRole('dialog', { name: 'Unlink Strava' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(call).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Unlink Strava' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Unlink Strava' })).getByRole('button', { name: 'Unlink' }));

    await waitFor(() => expect(call).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', path: '/api/unlink_strava' })));
    expect(await screen.findByText('Strava account unlinked successfully!')).toBeInTheDocument();
    expect(onUnlinked).toHaveBeenCalledTimes(1);
  });

  it('toasts on an unlink failure', async () => {
    call.mockRejectedValue(new Error('500'));
    const { onUnlinked } = renderCard({ strava_id: 77 });
    fireEvent.click(screen.getByRole('button', { name: 'Unlink Strava' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Unlink Strava' })).getByRole('button', { name: 'Unlink' }));
    expect(await screen.findByText('Failed to unlink Strava account. Please try again.')).toBeInTheDocument();
    expect(onUnlinked).not.toHaveBeenCalled();
  });
});
