import React from 'react';
import {render, screen} from '@testing-library/react-native';
import {SpeedAnalysis} from '../SpeedAnalysis';

jest.mock('react-native-gifted-charts', () => {
  const {View} = require('react-native');
  return {LineChart: View, BarChart: View};
});
jest.mock('react-native-haptic-feedback', () => ({trigger: jest.fn()}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));

const activities = Array.from({length: 5}, (_, i) => ({
  id: `${i}`,
  type: 'Ride',
  start_date: `2025-05-0${i + 1}`,
  average_speed: 7 + i * 0.2, // m/s
  max_speed: 12 + i * 0.2,
}));

describe('SpeedAnalysis', () => {
  it('renders the stat cards for a small activity fixture', () => {
    render(<SpeedAnalysis activities={activities} />);
    expect(screen.getByText('speedAnalysis.title')).toBeTruthy();
    expect(screen.getByText('speedAnalysis.avgSpeed')).toBeTruthy();
    expect(screen.getByText('speedAnalysis.maxSpeed')).toBeTruthy();
    expect(screen.getByText('speedAnalysis.totalWorkouts')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('renders the empty state when there are no rides', () => {
    render(<SpeedAnalysis activities={[]} />);
    expect(screen.getByText('speedAnalysis.title')).toBeTruthy();
    expect(screen.getByText('speedAnalysis.noData')).toBeTruthy();
  });
});
