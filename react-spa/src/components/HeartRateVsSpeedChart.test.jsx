import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HeartRateVsSpeedChart from './HeartRateVsSpeedChart';

const rides = Array.from({ length: 5 }, (_, i) => ({
  type: 'Ride',
  start_date: `2024-01-0${i + 1}T10:00:00Z`,
  average_heartrate: 130 + i,
  average_speed: 8,
}));

describe('HeartRateVsSpeedChart', () => {
  it('shows the empty state with no activities', () => {
    render(<HeartRateVsSpeedChart activities={[]} />);
    expect(screen.getByText('Not enough data to show heart rate vs speed')).toBeInTheDocument();
  });

  it('shows the title, stat grid and trend with data', () => {
    render(<HeartRateVsSpeedChart activities={rides} />);
    expect(screen.getByText('Avg Heart Rate vs Avg Speed')).toBeInTheDocument();
    expect(screen.getByText('Average Heart Rate (bpm)')).toBeInTheDocument();
    expect(screen.getByText('Total Workouts')).toBeInTheDocument();
  });
});
