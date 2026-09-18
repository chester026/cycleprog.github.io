import React from 'react';
import {Text} from 'react-native';
import {render, screen} from '@testing-library/react-native';
import {MetricAnalysisSection} from '../MetricAnalysisSection';

describe('MetricAnalysisSection', () => {
  it('renders title, subtitle and children', () => {
    render(
      <MetricAnalysisSection title="POWER" subtitle="Last 50 activities">
        <Text>child content</Text>
      </MetricAnalysisSection>,
    );
    expect(screen.getByText('POWER')).toBeTruthy();
    expect(screen.getByText('Last 50 activities')).toBeTruthy();
    expect(screen.getByText('child content')).toBeTruthy();
  });

  it('shows the empty-state text instead of children when isEmpty', () => {
    render(
      <MetricAnalysisSection title="HEART" isEmpty emptyText="Not enough data">
        <Text>should not render</Text>
      </MetricAnalysisSection>,
    );
    expect(screen.getByText('Not enough data')).toBeTruthy();
    expect(screen.queryByText('should not render')).toBeNull();
  });
});
