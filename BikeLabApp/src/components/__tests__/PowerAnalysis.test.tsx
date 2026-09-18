import React from 'react';
import {render, screen} from '@testing-library/react-native';
import {PowerAnalysis} from '../PowerAnalysis';

// react-native-gifted-charts ships ESM (needs a jest transformIgnorePatterns
// change outside this task's scope to parse for real); react-native-haptic-
// feedback needs a native module jest doesn't provide by default. Both are
// swapped for plain Views/no-ops — irrelevant to what these assertions check.
jest.mock('react-native-gifted-charts', () => {
  const {View} = require('react-native');
  return {LineChart: View, BarChart: View};
});
jest.mock('react-native-haptic-feedback', () => ({trigger: jest.fn()}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));
jest.mock('../../i18n/dateLocale', () => ({getDateLocale: () => 'en-US'}));

const activities = Array.from({length: 5}, (_, i) => ({
  id: `${i}`,
  name: `Ride ${i}`,
  start_date: `2025-05-0${i + 1}`,
  distance: 20000,
  moving_time: 3600,
  estimated_power: {avgWatts: 200 + i * 10, method: i === 0 ? 'measured' : 'estimated', hasWind: i === 1},
}));

describe('PowerAnalysis', () => {
  it('renders the stat cards and the top-5 list for a small activity fixture', () => {
    render(<PowerAnalysis activities={activities} />);
    expect(screen.getByText('powerAnalysis.title')).toBeTruthy();
    expect(screen.getByText('powerAnalysis.avgPower')).toBeTruthy();
    expect(screen.getByText('powerAnalysis.maxPower')).toBeTruthy();
    expect(screen.getByText('powerAnalysis.minPower')).toBeTruthy();
    // avg of 200,210,220,230,240 = 220; max 240; min 200
    expect(screen.getByText('220')).toBeTruthy();
    expect(screen.getByText('240')).toBeTruthy();
    expect(screen.getByText('200')).toBeTruthy();
    // Top-5 list renders every activity's wattage
    expect(screen.getByText('240W')).toBeTruthy();
    expect(screen.getByText('200W')).toBeTruthy();
    expect(screen.getByText('powerAnalysis.top5')).toBeTruthy();
  });

  it('renders nothing when there is no usable data', () => {
    const {toJSON} = render(<PowerAnalysis activities={[]} />);
    expect(toJSON()).toBeNull();
  });
});
