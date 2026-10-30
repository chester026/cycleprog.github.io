import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import LoginPage from './LoginPage';
import { call } from '../data/api';
import { startStravaLogin } from '../utils/strava';

vi.mock('../data/api', async () => {
  const actual = await vi.importActual('../data/api');
  return { ...actual, call: vi.fn() };
});
vi.mock('../utils/strava', () => ({ startStravaLogin: vi.fn() }));

const login = vi.fn();
vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ login }),
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderPage(url = '/login') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/garage" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function submit(email = 'rider@example.com', password = 'secret123') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
}

describe('LoginPage', () => {
  beforeEach(() => {
    call.mockReset();
    login.mockReset();
    startStravaLogin.mockReset();
  });

  it('logs in through POST /api/login, hands the token pair to AuthProvider and goes to the garage', async () => {
    call.mockResolvedValueOnce({ token: 'access', refreshToken: 'refresh' });
    login.mockResolvedValue(undefined);
    renderPage();

    submit();

    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/api/login' }),
        { body: { email: 'rider@example.com', password: 'secret123' } },
      ),
    );
    await waitFor(() => expect(login).toHaveBeenCalledWith({ token: 'access', refreshToken: 'refresh' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/garage');
  });

  it('shows the server error and stays on the page', async () => {
    call.mockRejectedValueOnce(new Error('Invalid credentials'));
    renderPage();
    submit();
    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign In' })).not.toBeDisabled();
  });

  it('offers to resend the verification email for an unverified account', async () => {
    call.mockResolvedValueOnce({ needsVerification: true }).mockResolvedValueOnce({ message: 'sent' });
    renderPage();
    submit('new@example.com');

    expect(await screen.findByText(/Email not verified/)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Resend Verification Email' }));
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/api/resend-verification' }),
        { body: { email: 'new@example.com' } },
      ),
    );
    expect(await screen.findByText(/Verification email sent!/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resend Verification Email' })).not.toBeInTheDocument();
  });

  it('explains an expired session or a failed Strava sign-in from the query string', () => {
    const { unmount } = renderPage('/login?session_expired=true');
    expect(screen.getByText(/Your session has expired/)).toBeInTheDocument();
    unmount();

    renderPage('/login?error=strava');
    expect(screen.getByText(/Strava sign-in failed or was cancelled/)).toBeInTheDocument();
  });

  it('starts the Strava login and reports when Strava cannot be reached', async () => {
    startStravaLogin.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('offline'));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Strava' }));
    await waitFor(() => expect(startStravaLogin).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Could not reach Strava/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Strava' }));
    expect(await screen.findByText('Could not reach Strava. Please try again.')).toBeInTheDocument();
  });

  it('links to registration and password reset', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute('href', '/register');
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password');
  });
});
