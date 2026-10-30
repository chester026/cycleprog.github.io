import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HR_ZONE_COLORS } from '@bikelab/shared/constants';
import RideStats from './RideStats';

const activity = { id: 1, name: 'Morning Ride', distance: 30000, moving_time: 3600, average_heartrate: 145 };

const contribution = (label) => ({ type: 'distance', label, value: '+1 km' });
const goal = (id, title, contributions = []) => ({
  id,
  status: 'active',
  title,
  progress: 40,
  progressGain: 2,
  contributions,
});

function renderStats(props = {}) {
  return render(
    <RideStats
      activity={activity}
      rideQuality={null}
      hrZoneDistribution={[]}
      metaGoals={[]}
      goalsState="ready"
      onOpenGoal={vi.fn()}
      {...props}
    />,
  );
}

describe('RideStats', () => {
  it('renders the ride quality block, metrics, HR zones and goal cards', () => {
    renderStats({
      rideQuality: { quality: 72, band: 'wellDone', label: 'Well done', advice: 'Strong ride. Keep pushing!' },
      hrZoneDistribution: [
        { zone: 'Z1', minutes: 5, percent: 10, color: HR_ZONE_COLORS.zone1, rangeMin: 0, rangeMax: 120 },
        { zone: 'Z2', minutes: 20, percent: 40, color: HR_ZONE_COLORS.zone2, rangeMin: 120, rangeMax: 140 },
      ],
      metaGoals: [{ id: 'g1', status: 'active', title: 'Endurance base', progress: 55, progressGain: 3, contributions: [] }],
    });

    expect(screen.getByText('Well done')).toBeInTheDocument();
    expect(screen.getByText(/Ride Quality: 72/)).toBeInTheDocument();
    expect(screen.getByText('Strong ride. Keep pushing!')).toBeInTheDocument();
    expect(screen.getByText('30.0 km')).toBeInTheDocument();
    expect(screen.getByText('145 bpm')).toBeInTheDocument();
    expect(screen.getByText(/Z1\s*0-120/)).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('Endurance base')).toBeInTheDocument();
    expect(screen.getByText('55%')).toBeInTheDocument();
    expect(screen.getByText('+3%')).toBeInTheDocument();
  });

  it('hides the quality block and zones without data, and shows the empty-goals placeholder', () => {
    renderStats();
    expect(screen.queryByText(/Ride Quality/)).not.toBeInTheDocument();
    expect(screen.queryByText('HR Zones')).not.toBeInTheDocument();
    expect(screen.getByText('No active goals found')).toBeInTheDocument();
  });

  it('shows loading and error states for goal progress', () => {
    const { unmount } = renderStats({ goalsState: 'loading' });
    expect(screen.getByText('Loading goals…')).toBeInTheDocument();
    unmount();
    renderStats({ goalsState: 'error' });
    expect(screen.getByText('Could not load goal progress')).toBeInTheDocument();
  });

  it("shows each goal's tier in the card footer, falling back to base", () => {
    renderStats({ metaGoals: [{ ...goal('a', 'Alpha'), tier: 'epic' }, goal('b', 'Beta')] });
    expect(screen.getByText('Epic')).toBeInTheDocument();
    expect(screen.getByText('Base')).toBeInTheDocument();
  });

  it('renders a card per goal — none are dropped', () => {
    renderStats({ metaGoals: [goal('a', 'Alpha'), goal('b', 'Beta'), goal('c', 'Gamma'), goal('d', 'Delta')] });
    for (const title of ['Alpha', 'Beta', 'Gamma', 'Delta']) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it('shows at most three contributions per card, then a "more" row', () => {
    renderStats({
      metaGoals: [goal('a', 'Alpha', [contribution('Elevation'), contribution('Power'), contribution('Speed'), contribution('Volume')])],
    });
    expect(screen.getByText('Speed')).toBeInTheDocument();
    expect(screen.queryByText('Volume')).not.toBeInTheDocument();
    expect(screen.getByText(/\+1 more/)).toBeInTheDocument();
  });

  it('has no "more" row when every contribution already fits', () => {
    renderStats({ metaGoals: [goal('a', 'Alpha', [contribution('Elevation')])] });
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });

  it('opens a goal when its card is clicked', () => {
    const onOpenGoal = vi.fn();
    renderStats({ metaGoals: [goal('a', 'Alpha')], onOpenGoal });
    fireEvent.click(screen.getByRole('button', { name: /Alpha/ }));
    expect(onOpenGoal).toHaveBeenCalledWith('a');
  });

  it('renders the charts slot between metrics and zones', () => {
    renderStats({ chartsSlot: <div data-testid="charts-slot" /> });
    expect(screen.getByTestId('charts-slot')).toBeInTheDocument();
  });
});
