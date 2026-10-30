import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityRow } from './ActivityRow';

describe('ActivityRow', () => {
  it('formats distance, speed, heart rate and elevation from raw Strava units', () => {
    const activity = {
      id: 1,
      name: 'Coast loop',
      start_date: '2026-10-03T07:30:00Z',
      distance: 42195,
      average_speed: 8.33,
      average_heartrate: 141.6,
      total_elevation_gain: 512.4,
    };
    render(<ActivityRow activity={activity} onAnalyze={() => {}} />);

    expect(screen.getByText('Coast loop')).toBeInTheDocument();
    expect(screen.getByText('03/10/2026')).toBeInTheDocument();
    expect(screen.getByText('42.2 km')).toBeInTheDocument();
    expect(screen.getByText('30.0 km/h')).toBeInTheDocument();
    expect(screen.getByText(/142$/)).toBeInTheDocument();
    expect(screen.getByText(/512$/)).toBeInTheDocument();
  });

  it('falls back to placeholders for a ride with no metrics', () => {
    render(<ActivityRow activity={{ id: 2 }} onAnalyze={() => {}} />);
    expect(screen.getByText('No name')).toBeInTheDocument();
    expect(screen.getByText('- km')).toBeInTheDocument();
    expect(screen.getByText('- km/h')).toBeInTheDocument();
  });

  it('hands the activity to onAnalyze', () => {
    const onAnalyze = vi.fn();
    const activity = { id: 3, name: 'Hills' };
    render(<ActivityRow activity={activity} onAnalyze={onAnalyze} />);
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    expect(onAnalyze).toHaveBeenCalledWith(activity);
  });
});
