import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GoalCard from '../GoalCard';

const distanceGoal = {
  id: 1, title: 'Ride 300 km', description: 'Monthly volume', goal_type: 'distance', period: '4w',
  current_value: '187.456', target_value: '300', percent: 62.49, unit: 'km',
};

describe('GoalCard', () => {
  it('renders the server percent and formatted values for a metric goal', () => {
    render(<GoalCard goal={distanceGoal} />);
    expect(screen.getByText('Ride 300 km')).toBeInTheDocument();
    expect(screen.getByText('Monthly volume')).toBeInTheDocument();
    expect(screen.getByText('4 weeks')).toBeInTheDocument();
    // `percent` comes from the server and is only rounded, never recomputed.
    expect(screen.getByText('62%')).toBeInTheDocument();
    expect(screen.getByText('187.46 / 300.00 km')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('formats speed to one decimal and counts as integers', () => {
    const { rerender } = render(<GoalCard goal={{ ...distanceGoal, goal_type: 'speed_flat', current_value: '27.46', target_value: '30', unit: 'km/h', period: 'year' }} />);
    expect(screen.getByText('27.5 / 30.0 km/h')).toBeInTheDocument();
    expect(screen.getByText('Year')).toBeInTheDocument();

    rerender(<GoalCard goal={{ ...distanceGoal, goal_type: 'cadence', current_value: '84.6', target_value: '90', unit: 'RPM', period: 'all' }} />);
    expect(screen.getByText('85 / 90 RPM')).toBeInTheDocument();
    expect(screen.getByText('All time')).toBeInTheDocument();
  });

  it('renders the FTP card with the stored VO2max, level and criterion', () => {
    render(
      <GoalCard
        goal={{ id: 2, title: 'FTP work', goal_type: 'ftp_vo2max', period: '3m', target_value: '95', current_value: '14', vo2max_value: 54, hr_threshold: 165, duration_threshold: 90 }}
      />,
    );
    expect(screen.getByText('54')).toBeInTheDocument();
    expect(screen.getByText('VO₂max')).toBeInTheDocument();
    expect(screen.getByText('FTP workouts: Good')).toBeInTheDocument();
    expect(screen.getByText('95 min / 14 ints')).toBeInTheDocument();
    expect(screen.getByText(/pulse ≥165 for at least 90 seconds/)).toBeInTheDocument();
    expect(screen.getByText('3 months')).toBeInTheDocument();
  });

  it('falls back to the legacy vo2maxValue prop and default thresholds', () => {
    render(<GoalCard goal={{ id: 3, title: 'FTP', goal_type: 'ftp_vo2max', target_value: '10', current_value: '0' }} vo2maxValue={48} />);
    expect(screen.getByText('48')).toBeInTheDocument();
    expect(screen.getByText('FTP workouts: Low')).toBeInTheDocument();
    expect(screen.getByText(/pulse ≥160 for at least 120 seconds/)).toBeInTheDocument();
  });

  it('exposes edit/delete actions only when asked, wired to the callbacks', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<GoalCard goal={distanceGoal} showActions onEdit={onEdit} onDelete={onDelete} />);
    fireEvent.click(screen.getByTitle('Edit goal'));
    expect(onEdit).toHaveBeenCalledWith(distanceGoal);
    fireEvent.click(screen.getByTitle('Delete goal'));
    expect(onDelete).toHaveBeenCalledWith(1);
  });
});
