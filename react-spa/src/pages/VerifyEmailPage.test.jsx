import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import VerifyEmailPage from './VerifyEmailPage';
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
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/login" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    call.mockReset();
  });

  it('verifies the token from the link and offers the login page', async () => {
    call.mockResolvedValueOnce({ message: 'verified' });
    renderPage('/verify-email?token=abc123');
    expect(screen.getByText('Verifying your email...')).toBeInTheDocument();

    expect(await screen.findByText(/Email verified successfully!/)).toBeInTheDocument();
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/api/verify-email' }),
      { query: { token: 'abc123' } },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Go to Login' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
  });

  it('rejects a link without a token without calling the server', async () => {
    renderPage('/verify-email');
    expect(await screen.findByText(/Invalid verification link/)).toBeInTheDocument();
    expect(call).not.toHaveBeenCalled();
  });

  it('shows a retry hint when the server rejects the token', async () => {
    call.mockRejectedValueOnce(new Error('expired'));
    renderPage('/verify-email?token=old');
    expect(await screen.findByText(/Network error. Please try again./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to Login' })).toBeInTheDocument();
  });
});
