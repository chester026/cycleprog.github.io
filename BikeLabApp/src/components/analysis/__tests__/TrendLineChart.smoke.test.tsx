import React from 'react';
import {render, screen} from '@testing-library/react-native';
import {useChartOverlay} from '../../../hooks/useChartOverlay';

// react-native-gifted-charts ships ESM and needs a jest transformIgnorePatterns
// change to parse for real — out of scope for this task (shared
// jest.config.js). A factory mock sidesteps that: Jest never loads/transforms
// the real module when a mock factory is supplied.
jest.mock('react-native-gifted-charts', () => {
  const {View} = require('react-native');
  return {LineChart: View, BarChart: View};
});
jest.mock('react-native-haptic-feedback', () => ({trigger: jest.fn()}));

import {TrendLineChart, SimpleChartDetail} from '../TrendLineChart';

function Wrapper() {
  const overlay = useChartOverlay();
  return <TrendLineChart title="Test chart" data={[1, 2, 3]} color="#4CAF50" overlay={overlay} />;
}

describe('TrendLineChart (smoke)', () => {
  it('renders the title row without crashing', () => {
    render(<Wrapper />);
    expect(screen.getByText('Test chart')).toBeTruthy();
  });
});

describe('SimpleChartDetail', () => {
  it('renders title and value pills', () => {
    render(<SimpleChartDetail color="#4CAF50" title="Week 34" primaryValue={28.4} primaryLabel="km/h" />);
    expect(screen.getByText('Week 34')).toBeTruthy();
    expect(screen.getByText('28.4')).toBeTruthy();
    expect(screen.getByText('km/h')).toBeTruthy();
  });
});
