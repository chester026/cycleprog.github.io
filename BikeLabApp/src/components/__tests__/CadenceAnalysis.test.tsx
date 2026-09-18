import React from 'react';
import {render, screen} from '@testing-library/react-native';
import {CadenceAnalysis} from '../CadenceAnalysis';

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
  average_cadence: 80 + i,
  average_speed: 7 + i * 0.1,
}));

describe('CadenceAnalysis', () => {
  it('renders the stat cards for a small activity fixture', () => {
    render(<CadenceAnalysis activities={activities} />);
    expect(screen.getByText('cadenceAnalysis.title')).toBeTruthy();
    expect(screen.getByText('cadenceAnalysis.avgCadence')).toBeTruthy();
    // avg of 80..84 = 82
    expect(screen.getByText('82')).toBeTruthy();
    expect(screen.getByText('80')).toBeTruthy();
    expect(screen.getByText('84')).toBeTruthy();
  });

  it('renders the empty state when there are no rides', () => {
    render(<CadenceAnalysis activities={[]} />);
    expect(screen.getByText('cadenceAnalysis.title')).toBeTruthy();
    expect(screen.getByText('cadenceAnalysis.noData')).toBeTruthy();
  });
});
