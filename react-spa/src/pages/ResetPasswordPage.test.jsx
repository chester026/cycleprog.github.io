import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ApiError } from '@bikelab/shared/api';
import ResetPasswordPage from './ResetPasswordPage';
import { call } from '../data/api';

vi.mock('../data/api', async () => {
  const actual = await vi.importActual('../data/api');
  return { ...actual, call: vi.fn() };
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderPage(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function submit(password, repeat = password) {
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Repeat new password'), { target: { value: repeat } });
  fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    call.mockReset();
  });

  it('refuses to render the form without a token and points at forgot-password', () => {
    renderPage('/reset-password');
    expect(screen.getByText('Invalid or missing reset link.')).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password');
  });

  it('rejects mismatched passwords before touching the server', () => {
    renderPage('/reset-password?token=t1');
    submit('newpass1', 'newpass2');
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(call).not.toHaveBeenCalled();
  });

  it('posts token + password and then offers the login page', async () => {
    call.mockResolvedValueOnce({ message: 'ok' });
    renderPage('/reset-password?token=t1');
    submit('newpass1');

    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/api/reset-password' }),
        { body: { token: 't1', password: 'newpass1' } },
      ),
    );
    expect(await screen.findByText(/Password reset successful!/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Login' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
  });

  it('translates INVALID_TOKEN into a friendly message and shows other errors verbatim', async () => {
    call.mockRejectedValueOnce(new ApiError(400, 'Bad token', 'INVALID_TOKEN'));
    renderPage('/reset-password?token=stale');
    submit('newpass1');
    expect(await screen.findByText('This reset link is invalid or has expired.')).toBeInTheDocument();

    call.mockRejectedValueOnce(new Error('Password too short'));
    submit('short');
    expect(await screen.findByText('Password too short')).toBeInTheDocument();
  });
});
