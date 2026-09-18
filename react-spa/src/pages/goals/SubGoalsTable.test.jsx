import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SubGoalsTable from './SubGoalsTable';

describe('SubGoalsTable', () => {
  it('groups sub-goals into skill columns and renders server-computed numbers as-is', () => {
    const subGoals = [
      {
        id: 1,
        title: 'Distance goal',
        goal_type: 'distance',
        current_value: 150,
        target_value: 300,
        percent: 50,
        unit: 'km',
      },
      {
        id: 2,
        title: 'Elevation goal',
        goal_type: 'elevation',
        current_value: 800,
        target_value: 1000,
        percent: 80,
        unit: 'm',
        pace: { onTrack: false, percentDelta: -5 },
      },
    ];

    render(<SubGoalsTable subGoals={subGoals} />);

    expect(screen.getByText('Endurance')).toBeInTheDocument();
    expect(screen.getByText('Climbing')).toBeInTheDocument();

    expect(screen.getByText('Distance goal')).toBeInTheDocument();
    expect(screen.getByText('150.0 km')).toBeInTheDocument();
    expect(screen.getByText('300.0 km')).toBeInTheDocument();
    // The server's `percent` is rendered verbatim — never (current/target)*100.
    expect(screen.getByText('50%')).toBeInTheDocument();

    expect(screen.getByText('Elevation goal')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('Behind schedule')).toBeInTheDocument();
  });

  it('renders nothing when there are no sub-goals', () => {
    const { container } = render(<SubGoalsTable subGoals={[]} />);
    expect(container.querySelector('.goal-board-column')).not.toBeInTheDocument();
  });
});
