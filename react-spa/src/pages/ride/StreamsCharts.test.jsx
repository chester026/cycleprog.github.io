import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// recharts' ResponsiveContainer measures a real layout box, which jsdom
// does not have — the chart body is swapped for a marker so the card's
// header values (what the user reads) can be asserted.
vi.mock('../../components/charts/TrendChart', () => ({
  default: ({ data, series }) => <div data-testid="trend-chart" data-points={data.length} data-name={series[0].name} />,
}));

import StreamsCharts from './StreamsCharts';

const activity = { id: 1, total_elevation_gain: 320 };

describe('StreamsCharts', () => {
  it('renders a skeleton while loading and nothing without streams', () => {
    const { unmount } = render(<StreamsCharts streams={null} isLoading activity={activity} />);
    expect(screen.getByTestId('streams-loading')).toBeInTheDocument();
    unmount();

    const { container } = render(<StreamsCharts streams={null} isLoading={false} activity={activity} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows an error state when the streams request failed', () => {
    render(<StreamsCharts streams={null} isLoading={false} error={new Error('x')} activity={activity} />);
    expect(screen.getByText('Could not load ride streams')).toBeInTheDocument();
  });

  it('renders a chart per available stream, with averaged header values', () => {
    render(
      <StreamsCharts
        streams={{
          time: { data: [0, 1, 2] },
          velocity_smooth: { data: [1, 2, 3] }, // *3.6 -> avg 7.2 -> "7"
          heartrate: { data: [140, 150, 160] },
          cadence: { data: [0, 80, 90] }, // zeros excluded -> avg 85
        }}
        isLoading={false}
        activity={activity}
      />,
    );

    expect(screen.getByText('Speed')).toBeInTheDocument();
    expect(screen.getByText('Heart Rate')).toBeInTheDocument();
    expect(screen.getByText('Cadence')).toBeInTheDocument();
    expect(screen.queryByText('Power')).not.toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('85')).toBeInTheDocument();
    const charts = screen.getAllByTestId('trend-chart');
    expect(charts).toHaveLength(3);
    expect(charts[0]).toHaveAttribute('data-points', '3');
  });

  it('shows total elevation gain (not an average) for the elevation chart', () => {
    render(<StreamsCharts streams={{ altitude: { data: [100, 120, 110] } }} isLoading={false} activity={activity} />);
    expect(screen.getByText('320')).toBeInTheDocument();
    expect(screen.getByText('m gain')).toBeInTheDocument();
  });

  it('renders nothing when the streams carry none of the charted keys', () => {
    const { container } = render(<StreamsCharts streams={{ time: { data: [0, 1] } }} isLoading={false} activity={activity} />);
    expect(container).toBeEmptyDOMElement();
  });
});
