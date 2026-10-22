import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import ExchangeTokenPage from './ExchangeTokenPage';

const login = vi.fn();
const checkOnboardingStatus = vi.fn();
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ login }) }));
vi.mock('../contexts/useOnboarding', () => ({ useOnboarding: () => ({ checkOnboardingStatus }) }));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderPage(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/exchange_token" element={<ExchangeTokenPage />} />
        <Route path="/login" element={<LocationProbe />} />
        <Route path="/garage" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function jsonResponse(body, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body };
}

describe('ExchangeTokenPage', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    login.mockReset().mockResolvedValue(undefined);
    checkOnboardingStatus.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exchanges the one-time code via POST, logs in and lands on the garage', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ token: 'acc', refreshToken: 'ref' }));
    const dispatched = vi.spyOn(window, 'dispatchEvent');
    renderPage('/exchange_token?code=code-1');
    expect(screen.getByText('Processing Strava authorization...')).toBeInTheDocument();

    await waitFor(() => expect(login).toHaveBeenCalledWith({ token: 'acc', refreshToken: 'ref' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/exchange', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ code: 'code-1' }),
    }));
    // The code never travels in the URL of the exchange request.
    expect(fetchMock.mock.calls[0][0]).not.toContain('code-1');
    expect(dispatched).toHaveBeenCalledWith(expect.objectContaining({ type: 'tokenUpdated' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/garage');
  });

  it('does not exchange the same code twice (StrictMode / remount guard)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ token: 'acc', refreshToken: 'ref' }));
    const { unmount } = renderPage('/exchange_token?code=code-2');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    unmount();

    renderPage('/exchange_token?code=code-2');
    // Nothing happens: no second request, no navigation.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Processing Strava authorization...')).toBeInTheDocument();
  });

  it('bounces to /login?error=strava when Strava reported an error', () => {
    renderPage('/exchange_token?error=access_denied');
    expect(screen.getByTestId('location')).toHaveTextContent('/login?error=strava');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('goes back to /login when there is no code at all', () => {
    renderPage('/exchange_token');
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('bounces to /login?error=strava when the exchange is rejected', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'invalid code' }, false));
    renderPage('/exchange_token?code=code-3');
    expect(await screen.findByTestId('location')).toHaveTextContent('/login?error=strava');
    expect(login).not.toHaveBeenCalled();
  });
});
