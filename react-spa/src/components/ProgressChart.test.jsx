import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ProgressChart from './ProgressChart';

const data = [
  { avg: 40, all: [10, 20, 30, 40, 50], start: '2026-08-03', end: '2026-08-30' },
  { avg: 72.5, all: [60, 70, 80, 90, 100], start: '2026-08-31', end: '2026-09-27' },
];

const originalWidth = window.innerWidth;

function setViewport(width) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

describe('ProgressChart', () => {
  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalWidth });
  });

  it('shows the empty state without data', () => {
    render(<ProgressChart data={[]} />);
    expect(screen.getByText('No data to display')).toBeInTheDocument();
  });

  it('shows the latest effort rate, its category and the delta against the previous block', () => {
    setViewport(1200);
    render(<ProgressChart data={data} />);
    expect(screen.getByText(/^72\.5/)).toBeInTheDocument();
    expect(screen.getByText('efr')).toBeInTheDocument();
    expect(screen.getByText('Good')).toBeInTheDocument();
    expect(screen.getByText(/▲ 32\.5%/)).toBeInTheDocument();
  });

  it('reveals the effort-rate scale legend on hover', () => {
    setViewport(1200);
    render(<ProgressChart data={data} />);
    expect(screen.queryByText('Effort Rate Scale:')).not.toBeInTheDocument();
    const badge = screen.getByText('Good');
    fireEvent.mouseEnter(badge);
    expect(screen.getByText('Effort Rate Scale:')).toBeInTheDocument();
    fireEvent.mouseLeave(badge);
    expect(screen.queryByText('Effort Rate Scale:')).not.toBeInTheDocument();
  });

  it('switches to the compact layout below 900px with the period shown', () => {
    setViewport(600);
    render(<ProgressChart data={data} />);
    expect(screen.getByText('72.5')).toBeInTheDocument();
    expect(screen.getByText('Effort rate Good')).toBeInTheDocument();
    expect(screen.getByText(/Period: 31\/08\/2026 – 27\/09\/2026/)).toBeInTheDocument();
    expect(screen.queryByText('Effort Rate Scale:')).not.toBeInTheDocument();
  });

  it('labels a single block as Off-plan with no delta', () => {
    setViewport(1200);
    render(<ProgressChart data={[{ avg: 12, all: [1, 2, 3, 4, 5], start: '2026-08-03', end: '2026-08-30' }]} />);
    expect(screen.getByText('Off-plan')).toBeInTheDocument();
    expect(screen.queryByText(/[▲▼]/)).not.toBeInTheDocument();
  });
});
