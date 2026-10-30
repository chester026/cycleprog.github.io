import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Sidebar from '../Sidebar';
import { startStravaLink } from '../../utils/strava';

const authState = { user: null, isLoading: false, logout: vi.fn(), refreshProfile: vi.fn() };
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => authState }));
vi.mock('../../utils/strava', () => ({ startStravaLink: vi.fn() }));
// The last-ride banner reads the activities query; it has its own test.
vi.mock('../LastRideBanner', () => ({ default: () => <div data-testid="last-ride-banner" /> }));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const NAV_LABELS = ['Bike Garage', 'Coach', 'Calendar', 'Analysis', 'Maintenance', 'Activities', 'Checklist'];

describe('Sidebar', () => {
  beforeEach(() => {
    authState.user = { id: 1, name: 'Dmitrii', strava_id: 42, avatar: null };
    authState.isLoading = false;
    authState.logout.mockReset();
    authState.refreshProfile.mockReset();
    startStravaLink.mockReset().mockResolvedValue(null);
  });

  it('lists every section as a link in the main navigation', () => {
    renderAt('/garage');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/garage', '/coach', '/calendar', '/analysis', '/maintenance', '/trainings', '/checklist',
    ]);
    NAV_LABELS.forEach((label) => expect(within(nav).getByRole('link', { name: new RegExp(label) })).toBeInTheDocument());
  });

  it.each([
    ['/garage', 'Bike Garage'],
    ['/coach/c/abc', 'Coach'],
    ['/goals/7', 'Coach'],
    ['/calendar', 'Calendar'],
    ['/trainings', 'Activities'],
  ])('marks %s as the current page under "%s"', (path, label) => {
    renderAt(path);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const current = within(nav).getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent(label);
  });

  it('does not treat a shared prefix as a match (/goalsX is not /goals)', () => {
    renderAt('/goalsmith');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).queryAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page')).toHaveLength(0);
  });

  it('shows the coach hint on the garage and the last-ride banner elsewhere', () => {
    const { unmount } = renderAt('/garage');
    expect(screen.getByText(/Go to the/)).toHaveTextContent('Coach');
    expect(screen.queryByTestId('last-ride-banner')).not.toBeInTheDocument();
    unmount();

    renderAt('/analysis');
    expect(screen.getByTestId('last-ride-banner')).toBeInTheDocument();
    expect(screen.queryByText(/Go to the/)).not.toBeInTheDocument();
  });

  it('opens the mobile drawer with aria-expanded, focuses the first link, and closes on Escape', () => {
    renderAt('/analysis');
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', screen.getByTestId('sidebar').id);

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Bike Garage' }));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the drawer when a navigation link is followed', () => {
    renderAt('/analysis');
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(screen.getByRole('link', { name: 'Calendar' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/calendar');
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('logs out and goes to /login', () => {
    renderAt('/garage');
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(authState.logout).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
  });

  it('shows the user block for a Strava-linked rider and opens the profile from it', () => {
    renderAt('/garage');
    const userButton = screen.getByRole('button', { name: /Dmitrii/ });
    expect(within(userButton).getByText('D')).toBeInTheDocument(); // initial, no avatar
    fireEvent.click(userButton);
    expect(screen.getByTestId('location')).toHaveTextContent('/profile');
  });

  it('offers Connect Strava when the profile has no Strava id', async () => {
    authState.user = { id: 1, name: 'Dmitrii', strava_id: null };
    renderAt('/garage');
    expect(screen.queryByRole('button', { name: /Dmitrii/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Connect Strava' }));
    await act(async () => {});
    expect(startStravaLink).toHaveBeenCalledTimes(1);
  });

  it('shows a loading placeholder while the profile is still loading', () => {
    authState.isLoading = true;
    authState.user = null;
    renderAt('/garage');
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect Strava' })).not.toBeInTheDocument();
  });

  it('re-reads the profile when the Strava link popup reports success', () => {
    renderAt('/garage');
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'strava-linked' }, origin: window.location.origin }));
    });
    expect(authState.refreshProfile).toHaveBeenCalledTimes(1);

    // Messages from other origins are ignored.
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'strava-linked' }, origin: 'https://evil.example' }));
    });
    expect(authState.refreshProfile).toHaveBeenCalledTimes(1);
  });
});
