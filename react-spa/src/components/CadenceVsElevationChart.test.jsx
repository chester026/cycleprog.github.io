import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CadenceVsElevationChart from './CadenceVsElevationChart';

const rides = [
  { type: 'Ride', start_date: '2024-01-01T10:00:00Z', total_elevation_gain: 150, average_cadence: 85 },
  { type: 'Ride', start_date: '2024-01-02T10:00:00Z', total_elevation_gain: 300, average_cadence: 90 },
];

describe('CadenceVsElevationChart', () => {
  it('shows the empty state with no activities', () => {
    render(<CadenceVsElevationChart activities={[]} />);
    expect(screen.getByText('Not enough data to show cadence vs elevation')).toBeInTheDocument();
  });

  it('renders the title with data', () => {
    render(<CadenceVsElevationChart activities={rides} />);
    expect(screen.getByText('Avg Cadence vs Elevation Gain')).toBeInTheDocument();
  });
});
