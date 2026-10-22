import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PlanFactHero } from './PlanFactHero';

vi.mock('../../components/BlobOrb', () => ({ default: () => null }));
vi.mock('../../components/PartnersLogo', () => ({ default: () => null }));

const NO_INTERVALS = { count: 0, min: 0, label: 'Low', color: '#bdbdbd' };

// Two rides in the same ISO week → one 4-week period.
const RIDES = [
  { id: 1, start_date: '2026-10-13T08:00:00Z', distance: 60000, moving_time: 7200 },
  { id: 2, start_date: '2026-10-15T08:00:00Z', distance: 20000, moving_time: 3000 },
];

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderHero(props = {}) {
  return render(
    <MemoryRouter initialEntries={['/analysis']}>
      <Routes>
        <Route path="/analysis" element={<PlanFactHero activities={RIDES} userProfile={null} lastRealIntervals={NO_INTERVALS} {...props} />} />
        <Route path="/profile" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PlanFactHero', () => {
  it('compares the current 4-week period against the default intermediate plan', () => {
    renderHero();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Here's how your training's been going");
    expect(screen.getByText('Balanced intermediate plan')).toBeInTheDocument();
    expect(screen.getByText(/5h\/week · 3 rides\/week/)).toBeInTheDocument();

    // 2 rides / 12 → 17 %, 80 km / 400 → 20 %, one ride over 50 km / 4 → 25 %.
    expect(screen.getByText('17%')).toBeInTheDocument();
    expect(screen.getByText('2 / 12')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getByText('80 / 400')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('1 / 4')).toBeInTheDocument();
    expect(screen.queryByText(/No Data/)).not.toBeInTheDocument();
  });

  it('scales the plan from the profile', () => {
    renderHero({ userProfile: { experience_level: 'advanced', time_available: 5 } });
    expect(screen.getByText('Intense advanced plan')).toBeInTheDocument();
    expect(screen.getByText('2 / 16')).toBeInTheDocument();
    expect(screen.getByText('80 / 600')).toBeInTheDocument();
  });

  it('shows the empty-period message when there are no rides', () => {
    renderHero({ activities: [] });
    expect(screen.getByText('No Data. Rides are waiting for you!')).toBeInTheDocument();
    expect(screen.queryByText('Workouts')).not.toBeInTheDocument();
  });

  it('links "change a plan" to the profile training tab', () => {
    renderHero();
    fireEvent.click(screen.getByRole('button', { name: 'change a plan' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/profile?tab=training');
  });
});
