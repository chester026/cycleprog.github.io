import React from 'react';
import {render, screen} from '@testing-library/react-native';
import type {Activity} from '../../types/activity';

// react-native-gifted-charts ships ESM and needs a jest
// transformIgnorePatterns change to parse for real (shared jest.config.js,
// out of this task's file ownership) — a factory mock sidesteps that, same
// approach as src/components/analysis/__tests__/TrendLineChart.smoke.test.tsx.
jest.mock('react-native-gifted-charts', () => {
  const {View} = require('react-native');
  return {LineChart: View};
});
jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));

import {StreamsCharts} from './StreamsCharts';

const activity = {
  id: 1,
  total_elevation_gain: 320,
} as unknown as Activity;

describe('StreamsCharts', () => {
  it('renders nothing while loading or without streams', () => {
    const {toJSON} = render(<StreamsCharts streams={null} loading={false} activity={activity} />);
    expect(toJSON()).toBeNull();

    const {toJSON: toJSON2} = render(
      <StreamsCharts streams={{heartrate: {data: [1, 2]}}} loading activity={activity} />,
    );
    expect(toJSON2()).toBeNull();
  });

  it('renders a mini chart per available stream, with averaged header values', () => {
    render(
      <StreamsCharts
        streams={{
          velocity_smooth: {data: [1, 2, 3]}, // *3.6 -> avg 2.4*3.6 = 8.64 -> "9"
          heartrate: {data: [140, 150, 160]},
          cadence: {data: [0, 80, 90]}, // zeros excluded -> avg 85
        }}
        loading={false}
        activity={activity}
      />,
    );

    expect(screen.getByText('common.speed')).toBeTruthy();
    expect(screen.getByText('common.heartRate')).toBeTruthy();
    expect(screen.getByText('common.cadence')).toBeTruthy();
    expect(screen.getByText(/150/)).toBeTruthy(); // avg heartrate
    expect(screen.getByText(/85/)).toBeTruthy(); // avg cadence, zeros excluded
  });

  it('shows total elevation gain (not an average) for the elevation chart', () => {
    render(
      <StreamsCharts
        streams={{altitude: {data: [100, 120, 110]}}}
        loading={false}
        activity={activity}
      />,
    );
    expect(screen.getByText(/320/)).toBeTruthy();
  });
});
