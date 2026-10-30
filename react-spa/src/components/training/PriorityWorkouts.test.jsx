import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PriorityWorkouts } from './PriorityWorkouts';

const grouped = {
  mostRecommended: {
    day: 'monday', trainingType: 'tempo', name: 'Tempo blocks', recommendation: 'Hold threshold',
    details: { intensity: '90% FTP', duration: '60' },
  },
  priority: [
    { day: 'wednesday', trainingType: 'sprint', name: 'Sprints', recommendation: 'Go hard', details: { intensity: '150% FTP', duration: '45' } },
    { day: 'friday', trainingType: 'endurance', name: 'Long ride', recommendation: 'Go long', details: {} },
  ],
  all: [],
};

describe('PriorityWorkouts', () => {
  it('renders the most-recommended card first, then the priority cards with their badges', () => {
    const onHowToRide = vi.fn();
    render(<PriorityWorkouts grouped={grouped} onHowToRide={onHowToRide} onOpenLibrary={() => {}} />);

    expect(screen.getByText('Most Recommended')).toBeInTheDocument();
    expect(screen.getAllByText('Recommended')).toHaveLength(2);
    const tempo = screen.getByRole('heading', { name: 'Tempo blocks' }).closest('.training-card');
    expect(tempo).toHaveTextContent('Hold threshold');
    expect(tempo).toHaveTextContent('90% FTP');
    expect(tempo).toHaveTextContent('60 min');

    fireEvent.click(within(tempo).getByRole('button', { name: /How to train/ }));
    expect(onHowToRide).toHaveBeenCalledWith(grouped.mostRecommended);

    const sprints = screen.getByRole('heading', { name: 'Sprints' }).closest('.training-card');
    fireEvent.click(within(sprints).getByRole('button', { name: /How to train/ }));
    expect(onHowToRide).toHaveBeenLastCalledWith(grouped.priority[0]);
  });

  it('copes with an empty week (no recommended card at all)', () => {
    render(<PriorityWorkouts grouped={{ mostRecommended: null, priority: [], all: [] }} onHowToRide={() => {}} onOpenLibrary={() => {}} />);
    expect(screen.queryByText('Most Recommended')).not.toBeInTheDocument();
    // The static secondary section always renders.
    expect(screen.getByRole('heading', { name: 'Recovery Strategy' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recovery Ride' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Group Ride' })).toBeInTheDocument();
  });

  it('opens the static preferable workouts with their built-in details', () => {
    const onHowToRide = vi.fn();
    render(<PriorityWorkouts grouped={grouped} onHowToRide={onHowToRide} onOpenLibrary={() => {}} />);
    const recovery = screen.getByRole('heading', { name: 'Recovery Ride' }).closest('.training-card');
    fireEvent.click(within(recovery).getByRole('button', { name: /How to train/ }));
    expect(onHowToRide).toHaveBeenCalledWith(expect.objectContaining({ type: 'recovery', details: expect.objectContaining({ hr_zones: 'Z1-Z2' }) }));
  });

  it('opens the library from the "More Trainings" card by click or keyboard', () => {
    const onOpenLibrary = vi.fn();
    render(<PriorityWorkouts grouped={grouped} onHowToRide={() => {}} onOpenLibrary={onOpenLibrary} />);
    const more = screen.getByRole('button', { name: /More Trainings/ });
    fireEvent.click(more);
    fireEvent.keyDown(more, { key: 'Enter' });
    expect(onOpenLibrary).toHaveBeenCalledTimes(2);
  });
});
