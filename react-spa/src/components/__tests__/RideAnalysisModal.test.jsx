import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RideAnalysisModal from '../RideAnalysisModal';

const ride = {
  name: 'Evening ride',
  start_date: '2024-05-01T18:00:00Z',
  distance: 42000,
  moving_time: 5400,
  average_speed: 8,
  average_heartrate: 150,
  average_cadence: 88,
};

describe('RideAnalysisModal', () => {
  it('renders nothing when closed', () => {
    render(<RideAnalysisModal open={false} onClose={() => {}} lastRide={ride} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a "no data" message when there is no ride', () => {
    render(<RideAnalysisModal open onClose={() => {}} lastRide={null} />);
    expect(screen.getByText('No data for analysis')).toBeInTheDocument();
  });

  it('renders the ride metrics and advice, as a dialog', () => {
    render(<RideAnalysisModal open onClose={() => {}} lastRide={ride} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Ride Analysis')).toBeInTheDocument();
    expect(screen.getByText('42.0 km')).toBeInTheDocument();
    expect(screen.getByText('What to improve:')).toBeInTheDocument();
  });

  it('calls onClose from the close button and Escape', () => {
    const onClose = vi.fn();
    render(<RideAnalysisModal open onClose={onClose} lastRide={ride} />);
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
