import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@bikelab/shared/api';
import { ToastProvider } from '../../ui';
import AccountDangerZone from './AccountDangerZone';
import { call } from '../../data/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});

const login = vi.fn();
const logout = vi.fn();
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ login, logout }) }));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderZone(profile = { email: 'old@example.com' }) {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <Routes>
            <Route path="/profile" element={<AccountDangerZone profile={profile} />} />
            <Route path="/login" element={<LocationProbe />} />
          </Routes>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('AccountDangerZone', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
    login.mockReset().mockResolvedValue(undefined);
    logout.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('prefills the email and rejects an invalid address locally', () => {
    renderZone();
    const input = screen.getByLabelText('Email Address');
    expect(input).toHaveValue('old@example.com');
    fireEvent.change(input, { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change Email' }));
    expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
    expect(call).not.toHaveBeenCalled();
  });

  it('changes the email, swaps in the fresh access token and confirms', async () => {
    call.mockResolvedValue({ success: true, message: 'Check your inbox', token: 'fresh' });
    renderZone();
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'new@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change Email' }));

    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/api/user-profile/email' }),
        { body: { email: 'new@example.com' } },
      ),
    );
    await waitFor(() => expect(login).toHaveBeenCalledWith({ token: 'fresh' }));
    expect(await screen.findByText('Check your inbox')).toBeInTheDocument();
  });

  it('explains a taken email and falls back to a generic message otherwise', async () => {
    call.mockRejectedValueOnce(new ApiError(409, 'conflict', 'EMAIL_TAKEN'));
    renderZone();
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'taken@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change Email' }));
    expect(await screen.findByText('This email is already used by another account.')).toBeInTheDocument();

    call.mockRejectedValueOnce(new Error('500'));
    fireEvent.click(screen.getByRole('button', { name: 'Change Email' }));
    expect(await screen.findByText('Failed to update email. Please try again.')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('deletes the account only after confirming, then logs out and leaves for /login', async () => {
    call.mockResolvedValue({ success: true });
    renderZone();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete account' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(call).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete account' })).getByRole('button', { name: 'Delete account' }));

    await waitFor(() => expect(call).toHaveBeenCalledWith(expect.objectContaining({ method: 'DELETE', path: '/api/account' })));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
  });

  it('keeps the session when deletion fails', async () => {
    call.mockRejectedValue(new Error('500'));
    renderZone();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete account' })).getByRole('button', { name: 'Delete account' }));
    expect(await screen.findByText('Failed to delete account. Please try again.')).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });
});
