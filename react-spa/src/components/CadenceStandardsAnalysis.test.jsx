import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CadenceStandardsAnalysis from './CadenceStandardsAnalysis';

const activities = [
  { type: 'Ride', start_date: '2024-06-01T10:00:00Z', average_cadence: 82, average_speed: 25 / 3.6, total_elevation_gain: 50 },
  { type: 'Ride', start_date: '2024-06-02T10:00:00Z', average_cadence: 88, average_speed: 25 / 3.6, total_elevation_gain: 50 },
];

describe('CadenceStandardsAnalysis', () => {
  it('shows the empty state without cadence data', () => {
    render(<CadenceStandardsAnalysis activities={[]} />);
    expect(screen.getByText('Not enough cadence data to analyze')).toBeInTheDocument();
  });

  it('shows overall stats and a per-workout-type comparison chart', () => {
    render(<CadenceStandardsAnalysis activities={activities} />);
    expect(screen.getByText('Cadence Standards Analysis')).toBeInTheDocument();
    expect(screen.getByText('Average Cadence (rpm)')).toBeInTheDocument();
    // 25 km/h categorizes as roadRacing (see cadenceStandards.js thresholds).
    expect(screen.getByText('Road Racing')).toBeInTheDocument();
  });
});
