import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AverageCadenceTrendChart from './AverageCadenceTrendChart';

const rides = [
  { type: 'Ride', start_date: '2024-01-01T10:00:00Z', average_cadence: 85 },
  { type: 'Ride', start_date: '2024-01-02T10:00:00Z', average_cadence: 90 },
];

describe('AverageCadenceTrendChart', () => {
  it('shows the empty state with no activities', () => {
    render(<AverageCadenceTrendChart activities={[]} />);
    expect(screen.getByText('Not enough data to show cadence trend')).toBeInTheDocument();
  });

  it('renders the title with data', () => {
    render(<AverageCadenceTrendChart activities={rides} />);
    expect(screen.getByText('Average Cadence Trend (Weekly)')).toBeInTheDocument();
  });
});
