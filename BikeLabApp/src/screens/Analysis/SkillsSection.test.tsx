import React from 'react';
import {render, screen} from '@testing-library/react-native';
import {SkillsSection} from './SkillsSection';

jest.mock('../../components/SkillsRadarChart', () => {
  const {Text} = require('react-native');
  return {
    __esModule: true,
    default: ({skills}: {skills: unknown}) => <Text>radar-{skills ? 'loaded' : 'empty'}</Text>,
  };
});

describe('SkillsSection', () => {
  it('passes skills/riderProfile/trend through to SkillsRadarChart', () => {
    render(
      <SkillsSection
        skills={{climbing: 1, sprint: 1, endurance: 1, tempo: 1, power: 1, consistency: 1}}
        riderProfile={{profile: 'climber', description: 'x', emoji: '🚵'}}
        skillsTrend={null}
        onHelpPress={() => {}}
      />,
    );
    expect(screen.getByText('radar-loaded')).toBeTruthy();
  });

  it('renders the chart even with no skills yet (loading state)', () => {
    render(
      <SkillsSection skills={null} riderProfile={null} onHelpPress={() => {}} />,
    );
    expect(screen.getByText('radar-empty')).toBeTruthy();
  });
});
