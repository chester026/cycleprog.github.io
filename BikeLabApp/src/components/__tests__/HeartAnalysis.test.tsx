import React from 'react';
import {render, screen} from '@testing-library/react-native';
import {HeartAnalysis} from '../HeartAnalysis';

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
  average_heartrate: 140 + i,
  max_heartrate: 170 + i,
  average_speed: 7 + i * 0.1,
  moving_time: 3600,
}));

describe('HeartAnalysis', () => {
  it('renders the stat cards for a small activity fixture', () => {
    render(<HeartAnalysis activities={activities} userProfile={{max_hr: 190, resting_hr: 50}} />);
    expect(screen.getByText('heartAnalysis.title')).toBeTruthy();
    expect(screen.getByText('heartAnalysis.avgHR')).toBeTruthy();
    expect(screen.getByText('heartAnalysis.minHR')).toBeTruthy();
    expect(screen.getByText('heartAnalysis.maxHR')).toBeTruthy();
    // avg of 140..144 = 142
    expect(screen.getByText('142')).toBeTruthy();
    expect(screen.getByText('140')).toBeTruthy();
    expect(screen.getByText('144')).toBeTruthy();
  });

  it('renders the empty state when there are no rides', () => {
    render(<HeartAnalysis activities={[]} userProfile={{}} />);
    expect(screen.getByText('heartAnalysis.title')).toBeTruthy();
    expect(screen.getByText('heartAnalysis.noData')).toBeTruthy();
  });
});
