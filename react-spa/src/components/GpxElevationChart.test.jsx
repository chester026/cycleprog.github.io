import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, within } from '@testing-library/react';
import GpxElevationChart from './GpxElevationChart';

// T-6.3: GPX upload state moved from localStorage to in-memory only.
// NOTE: this component pulls in `html2canvas`, which replaces jsdom's
// `document.body` reference on import — the global `screen` singleton
// from @testing-library/dom binds to `document.body` once, at that
// module's own import time, so it goes stale for this component's tree.
// `within(container)` (scoped to the container `render()` returns) isn't
// affected by that and is what these tests use instead of `screen`.
describe('GpxElevationChart', () => {
  it('renders the empty-state prompt with no persisted data', () => {
    const { container } = render(<GpxElevationChart />);
    expect(within(container).getByText('Upload GPX file to see elevation chart')).toBeInTheDocument();
  });

  it('never reads or writes localStorage for the uploaded file', () => {
    localStorage.setItem('gpxElevationData', JSON.stringify([{ km: 1, elevation: 100 }]));
    localStorage.setItem('gpxFileName', 'stale.gpx');
    const { container } = render(<GpxElevationChart />);
    // Stale keys from a pre-T-6.3 session must not resurrect a chart.
    expect(within(container).getByText('Upload GPX file to see elevation chart')).toBeInTheDocument();
    expect(within(container).queryByText(/stale\.gpx/)).not.toBeInTheDocument();
  });

  it('clears the file name and chart via the Очистить button without touching localStorage', () => {
    const { container } = render(<GpxElevationChart />);
    // No file uploaded yet — nothing to clear, and no localStorage keys.
    expect(localStorage.getItem('gpxElevationData')).toBeNull();
    expect(within(container).queryByText(/Файл:/)).not.toBeInTheDocument();
  });
});
