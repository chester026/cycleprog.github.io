import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HrZonesCard from './HrZonesCard';

function renderCard(profile, errors = {}) {
  const onChange = vi.fn();
  render(<HrZonesCard profile={profile} errors={errors} onChange={onChange} />);
  return { onChange };
}

describe('HrZonesCard', () => {
  it('asks for an age when neither max HR nor age is known', () => {
    renderCard({});
    expect(screen.getByText(/Enter your age in Personal Information/)).toBeInTheDocument();
    expect(screen.queryByText('Current Heart Rate Zones:')).not.toBeInTheDocument();
  });

  it('previews Karvonen zones from the entered max/resting HR with the shared calc', () => {
    renderCard({ max_hr: '190', resting_hr: '65' });
    expect(screen.getByText('Zone 1 (Recovery):')).toBeInTheDocument();
    expect(screen.getByText('128 - 140 bpm')).toBeInTheDocument();
    expect(screen.getByText('Zone 5 (VO2 Max):')).toBeInTheDocument();
    expect(screen.getByText('178 - 190+ bpm')).toBeInTheDocument();
    expect(screen.getByText('Zones calculated using Karvonen formula (HR Reserve)')).toBeInTheDocument();
    expect(screen.getByText(/Max HR:/).parentElement).not.toHaveTextContent('(estimated)');
  });

  it('estimates max HR from age and resting HR from the experience level when they are blank', () => {
    renderCard({ age: '30', experience_level: 'beginner' });
    // 220 - 30 = 190 max; beginner → 75 bpm resting.
    expect(screen.getByText(/Max HR:/).parentElement).toHaveTextContent('190 bpm (estimated)');
    expect(screen.getByText(/Resting HR:/).parentElement).toHaveTextContent('75 bpm (estimated)');
  });

  it('switches to lactate-threshold zones when a threshold is entered', () => {
    renderCard({ max_hr: '190', resting_hr: '50', lactate_threshold: '170' });
    expect(screen.getByText('Zones calculated based on lactate threshold HR')).toBeInTheDocument();
    expect(screen.getByText(/Lactate Threshold:/).parentElement).toHaveTextContent('170 bpm');
    expect(screen.getByText('175 - 190+ bpm')).toBeInTheDocument();
  });

  it('forwards edits and shows field errors', () => {
    const { onChange } = renderCard({ max_hr: '190' }, { resting_hr: 'Resting HR must be between 40 and 100 bpm' });
    expect(screen.getByText('Resting HR must be between 40 and 100 bpm')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Maximum Heart Rate (bpm)'), { target: { value: '185' } });
    expect(onChange).toHaveBeenCalledWith('max_hr', '185');
    fireEvent.change(screen.getByLabelText('Lactate Threshold HR (bpm)'), { target: { value: '168' } });
    expect(onChange).toHaveBeenCalledWith('lactate_threshold', '168');
  });
});
