import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HeartRateVsElevationChart from './HeartRateVsElevationChart';

const rides = [
  { type: 'Ride', start_date: '2024-01-01T10:00:00Z', total_elevation_gain: 150, average_heartrate: 140 },
  { type: 'Ride', start_date: '2024-01-02T10:00:00Z', total_elevation_gain: 300, average_heartrate: 150 },
];

describe('HeartRateVsElevationChart', () => {
  it('shows the empty state with no activities', () => {
    render(<HeartRateVsElevationChart activities={[]} />);
    expect(screen.getByText('Not enough data to show heart rate vs elevation')).toBeInTheDocument();
  });

  it('renders the title with data', () => {
    render(<HeartRateVsElevationChart activities={rides} />);
    expect(screen.getByText('Avg Heart Rate vs Elevation Gain')).toBeInTheDocument();
  });
});
