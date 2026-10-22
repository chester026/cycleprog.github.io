import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GarageWidgets from '../GarageWidgets';

const monthly = [
  { label: 'Aug', speed: 24.2 },
  { label: 'Sep', speed: 27.6 },
  { label: 'Oct', speed: 0 },
];

describe('GarageWidgets', () => {
  it('prefers the primary bike and shows brand + model when both are known', () => {
    render(
      <GarageWidgets
        bikes={[
          { id: 1, name: 'Old steel', primary: false, distanceKm: 100 },
          { id: 2, name: 'Race', brand_name: 'Canyon', model_name: 'Ultimate', primary: true, distanceKm: 5441.9, activitiesCount: 47 },
        ]}
        metrics={{}}
      />,
    );
    expect(screen.getByText('Canyon Ultimate')).toBeInTheDocument();
    expect(screen.getByText('47 rides')).toBeInTheDocument();
    expect(screen.getByText((5441.9).toLocaleString())).toBeInTheDocument();
    expect(screen.getByText('All bikes →')).toBeInTheDocument();
  });

  it('renders the bike card as a button only when there is something to open', () => {
    const onOpenBikes = vi.fn();
    const { rerender } = render(<GarageWidgets bikes={[{ id: 1, name: 'Solo', distanceKm: 10 }]} metrics={{}} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(<GarageWidgets bikes={[{ id: 1, name: 'Solo', distanceKm: 10 }]} metrics={{}} onOpenBikes={onOpenBikes} />);
    fireEvent.click(screen.getByRole('button', { name: /Solo/ }));
    expect(onOpenBikes).toHaveBeenCalledTimes(1);
  });

  it('shows the peak monthly speed and a tooltip on hover', () => {
    render(<GarageWidgets monthly={monthly} metrics={{}} />);
    expect(screen.getByText('28 km/h')).toBeInTheDocument();
    expect(screen.getByText('Best avg. speed')).toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByText('Sep').parentElement);
    expect(screen.getByText('27.6 km/h')).toBeInTheDocument();
    fireEvent.mouseLeave(screen.getByText('Sep').parentElement);
    expect(screen.queryByText('27.6 km/h')).not.toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByText('Oct').parentElement);
    expect(screen.getByText('No rides')).toBeInTheDocument();
  });

  it('renders rounded metric cards with max sub-values and trend badges, hiding zero trends', () => {
    render(
      <GarageWidgets
        metrics={{ avg_power: 181.4, max_power: 400.6, avg_hr: 142.5, avg_cadence: 84.2, vo2max: 51.7 }}
        metricsTrend={{ avg_power: 5, avg_hr: -3, avg_cadence: 0 }}
      />,
    );
    expect(screen.getByText('Avg Power')).toBeInTheDocument();
    expect(screen.getByText('181')).toBeInTheDocument();
    expect(screen.getByText('max 401')).toBeInTheDocument();
    expect(screen.getByText('+5')).toBeInTheDocument();
    expect(screen.getByText('Avg Heart Rate')).toBeInTheDocument();
    expect(screen.getByText('143')).toBeInTheDocument();
    expect(screen.getByText('-3')).toBeInTheDocument();
    expect(screen.getByText('Avg Cadence')).toBeInTheDocument();
    expect(screen.getByText('VO2max')).toBeInTheDocument();
    expect(screen.getByText('52')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('explains the empty metric grid when no sensor data exists', () => {
    render(<GarageWidgets metrics={{}} />);
    expect(screen.getByText(/No power, heart rate or cadence data/)).toBeInTheDocument();
    expect(screen.queryByText('Avg Power')).not.toBeInTheDocument();
  });
});
