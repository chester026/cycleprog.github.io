import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TrainingDetailsModal from '../TrainingDetailsModal';

const training = {
  type: 'intervals',
  details: {
    hr_zones: 'Z5',
    intensity: '110% FTP',
    duration: '60 min',
    cadence: '95 rpm',
    structure: { warmup: '20 min easy', main: '5 x 3 min', cooldown: '10 min spin' },
  },
};

describe('TrainingDetailsModal', () => {
  it('renders nothing without a training', () => {
    const { container } = render(<TrainingDetailsModal isOpen onClose={() => {}} training={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the type-specific advice, the ride parameters and the workout structure', () => {
    render(<TrainingDetailsModal isOpen onClose={() => {}} training={training} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Interval Training' })).toBeInTheDocument();
    expect(screen.getByText('Heart Rate Zones:').parentElement).toHaveTextContent('Z5');
    expect(screen.getByText('Intensity:').parentElement).toHaveTextContent('110% FTP');
    expect(screen.getByText('Duration:').parentElement).toHaveTextContent('60 min');
    expect(screen.getByText('Cadence:').parentElement).toHaveTextContent('95 rpm');

    expect(screen.getByText('Warm-up:').parentElement).toHaveTextContent('20 min easy');
    expect(screen.getByText('Main Part:').parentElement).toHaveTextContent('5 x 3 min');
    expect(screen.getByText('Cool-down:').parentElement).toHaveTextContent('10 min spin');

    expect(screen.getByText('Technical Aspects:')).toBeInTheDocument();
    expect(screen.getByText('Mandatory 30-40 minute warm-up')).toBeInTheDocument();
    expect(screen.getByText('Common Mistakes:')).toBeInTheDocument();
  });

  it('falls back to endurance advice for an unknown type and omits the params block without details', () => {
    render(<TrainingDetailsModal isOpen onClose={() => {}} training={{ type: 'mystery' }} />);
    expect(screen.getByText('Maintain steady pace throughout the entire workout')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Endurance Training' })).not.toBeInTheDocument();
    expect(screen.queryByText('Workout Structure:')).not.toBeInTheDocument();
  });

  it('closes from the × button and from Escape', () => {
    const onClose = vi.fn();
    render(<TrainingDetailsModal isOpen onClose={onClose} training={training} />);
    fireEvent.click(screen.getByRole('button', { name: '×' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
