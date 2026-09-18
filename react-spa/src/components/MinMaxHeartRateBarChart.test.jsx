import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MinMaxHeartRateBarChart from './MinMaxHeartRateBarChart';

const rides = [
  { type: 'Ride', start_date: '2024-01-01T10:00:00Z', max_heartrate: 160 },
  { type: 'Ride', start_date: '2024-01-02T10:00:00Z', max_heartrate: 175 },
];

describe('MinMaxHeartRateBarChart', () => {
  it('shows the empty state with no activities', () => {
    render(<MinMaxHeartRateBarChart activities={[]} />);
    expect(screen.getByText('Not enough data to show max heart rate')).toBeInTheDocument();
  });

  it('renders the title with data', () => {
    render(<MinMaxHeartRateBarChart activities={rides} />);
    expect(screen.getByText('Max Heart Rate per Week')).toBeInTheDocument();
  });
});
