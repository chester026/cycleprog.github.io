import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CadenceVsSpeedChart from './CadenceVsSpeedChart';

const rides = [
  { type: 'Ride', start_date: '2024-01-01T10:00:00Z', average_cadence: 85, average_speed: 8 },
  { type: 'Ride', start_date: '2024-01-02T10:00:00Z', average_cadence: 90, average_speed: 9 },
];

describe('CadenceVsSpeedChart', () => {
  it('shows the empty state with no activities', () => {
    render(<CadenceVsSpeedChart activities={[]} />);
    expect(screen.getByText('Not enough data to show cadence vs speed')).toBeInTheDocument();
  });

  it('renders the title with data', () => {
    render(<CadenceVsSpeedChart activities={rides} />);
    expect(screen.getByText('Avg Cadence vs Avg Speed')).toBeInTheDocument();
  });
});
