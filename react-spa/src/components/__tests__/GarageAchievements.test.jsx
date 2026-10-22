import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GarageAchievements from '../GarageAchievements';

const achievements = [
  { id: 1, name: 'Century', tier: 'gold', metric: 'distance', threshold: 100, unlocked: true },
  { id: 2, name: 'Everest', tier: 'rare_steel', metric: 'total_elevation_gain', threshold: 8848, unlocked: false, progress_pct: 42.6 },
  { id: 3, name: 'Overshoot', tier: 'unknown-tier', metric: 'weekly_streak', threshold: 4, unlocked: false, progress_pct: 250 },
];

describe('GarageAchievements', () => {
  it('renders nothing for an empty list', () => {
    const { container } = render(<GarageAchievements achievements={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the badge value/unit per metric, a NEW pill for unlocked and clamped progress for locked', () => {
    render(<GarageAchievements achievements={achievements} />);

    expect(screen.getByText('Century')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('km')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();

    expect(screen.getByText('Everest')).toBeInTheDocument();
    expect(screen.getByText('9k')).toBeInTheDocument();
    expect(screen.getByText('meters')).toBeInTheDocument();
    expect(screen.getByText('43%')).toBeInTheDocument();

    // Progress over 100 is clamped; unknown tiers still render (silver medal).
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('weeks')).toBeInTheDocument();
    // Medal images are decorative.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('offers "View All" only when a handler is given', () => {
    const onViewAll = vi.fn();
    const { rerender } = render(<GarageAchievements achievements={achievements} />);
    expect(screen.queryByRole('button', { name: 'View All' })).not.toBeInTheDocument();

    rerender(<GarageAchievements achievements={achievements} onViewAll={onViewAll} />);
    fireEvent.click(screen.getByRole('button', { name: 'View All' }));
    expect(onViewAll).toHaveBeenCalledTimes(1);
  });
});
