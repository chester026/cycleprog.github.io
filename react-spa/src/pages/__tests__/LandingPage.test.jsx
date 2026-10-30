import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LandingPage from '../LandingPage';
import { startStravaLogin } from '../../utils/strava';

vi.mock('../../utils/strava', () => ({ startStravaLogin: vi.fn() }));

function renderPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

describe('LandingPage', () => {
  beforeEach(() => {
    startStravaLogin.mockReset().mockResolvedValue(undefined);
  });

  it('exposes the landmarks: section nav, main, footer and one labelled section per feature', () => {
    renderPage();
    const nav = screen.getByRole('navigation', { name: 'Section navigation' });
    const dots = within(nav).getAllByRole('link');
    expect(dots.map((a) => a.getAttribute('aria-label'))).toEqual([
      'Home', 'Garage', 'AI Coach', 'Analytics', 'Calendar', 'Sharing', 'Components', 'Integrations', 'Testimonials', 'FAQ',
    ]);
    expect(within(nav).getByRole('link', { name: 'Garage' })).toHaveAttribute('href', '#features');

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo', { name: 'Site footer' })).toBeInTheDocument();
    for (const name of ['Hero introduction']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('region', { name: /Get Bikelab on your phone/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /Questions, answered/ })).toBeInTheDocument();
  });

  it('starts the Strava login from the hero CTA and links to the web login', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Strava' }));
    await waitFor(() => expect(startStravaLogin).toHaveBeenCalledTimes(1));

    const loginLinks = screen.getAllByRole('link', { name: /Continue with login|or continue on web/ });
    expect(loginLinks.length).toBeGreaterThanOrEqual(2);
    loginLinks.forEach((link) => expect(link).toHaveAttribute('href', '/login'));
  });

  it('opens one FAQ answer at a time with aria-expanded kept in sync', () => {
    renderPage();
    const first = screen.getByRole('button', { name: /Do I need Strava to use Bikelab\?/ });
    const second = screen.getByRole('button', { name: /Is there an Android version\?/ });
    // The first question starts open.
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Yes, for now\./)).toBeInTheDocument();
    expect(second).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(second);
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(second).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByText(/Yes, for now\./)).not.toBeInTheDocument();
    expect(screen.getByText(/currently iOS only/)).toBeInTheDocument();

    fireEvent.click(second);
    expect(second).toHaveAttribute('aria-expanded', 'false');
  });

  it('points the App Store badge at the store in a new tab', () => {
    renderPage();
    const badges = screen.getAllByRole('link', { name: 'Download on the App Store' });
    badges
      .filter((a) => a.getAttribute('href')?.startsWith('https://'))
      .forEach((a) => {
        expect(a).toHaveAttribute('href', 'https://apps.apple.com/us/app/bikelab-ride-wisely/id6758635138');
        expect(a).toHaveAttribute('rel', 'noopener noreferrer');
      });
  });
});
