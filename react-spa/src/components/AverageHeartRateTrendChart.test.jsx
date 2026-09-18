import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AverageHeartRateTrendChart from './AverageHeartRateTrendChart';

const rides = [
  { type: 'Ride', start_date: '2024-01-01T10:00:00Z', average_heartrate: 140 },
  { type: 'Ride', start_date: '2024-01-02T10:00:00Z', average_heartrate: 150 },
];

describe('AverageHeartRateTrendChart', () => {
  it('shows the empty state with no activities', () => {
    render(<AverageHeartRateTrendChart activities={[]} />);
    expect(screen.getByText('Not enough data to show heart rate trend')).toBeInTheDocument();
  });

  it('renders the title with data', () => {
    render(<AverageHeartRateTrendChart activities={rides} />);
    expect(screen.getByText('Average Heart Rate Trend (Weekly)')).toBeInTheDocument();
  });
});
