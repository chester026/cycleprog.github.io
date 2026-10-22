import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SkillsRadarChart from './SkillsRadarChart';

const skills = { climbing: 61.4, sprint: 40, endurance: 70, tempo: 50, power: 0, consistency: 80 };

describe('SkillsRadarChart', () => {
  it('shows the empty state when the server has no skills yet', () => {
    render(<SkillsRadarChart skills={null} />);
    expect(screen.getByText('Not enough data to analyze skills')).toBeInTheDocument();
  });

  it('lists the rounded server skills, hides Power without a power meter and shows the rider profile', () => {
    render(
      <SkillsRadarChart
        skills={skills}
        riderProfile={{ profile: 'Climber', description: 'Thrives on long ascents' }}
        skillsTrend={{ climbing: 4, consistency: -2, sprint: 0 }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Skills' })).toBeInTheDocument();
    expect(screen.getByText('Climbing')).toBeInTheDocument();
    expect(screen.getByText('61')).toBeInTheDocument();
    expect(screen.getByText('+4')).toBeInTheDocument();
    expect(screen.getByText('Discipline')).toBeInTheDocument();
    expect(screen.getByText('-2')).toBeInTheDocument();
    expect(screen.queryByText('Power')).not.toBeInTheDocument();
    // Zero trend → no badge next to Sprint/Attack.
    expect(screen.queryByText('0')).not.toBeInTheDocument();

    expect(screen.getByText('Climber')).toBeInTheDocument();
    expect(screen.getByText('Thrives on long ascents')).toBeInTheDocument();
    // Overall = mean of (61, 40, 70, 50, 80) = 60.2 → 60.
    expect(screen.getByText('Overall').previousSibling).toHaveTextContent('60');
  });

  it('includes Power once a power meter contributed', () => {
    render(<SkillsRadarChart skills={{ ...skills, power: 55 }} />);
    expect(screen.getByText('Power')).toBeInTheDocument();
    expect(screen.getByText('Average watts from power meter')).toBeInTheDocument();
    expect(screen.queryByText('Overall')).not.toBeInTheDocument();
  });
});
