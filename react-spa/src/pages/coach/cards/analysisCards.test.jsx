import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RideScoreCard from './RideScoreCard';
import RecoveryCard from './RecoveryCard';
import MetricComparisonCard from './MetricComparisonCard';
import SkillsDeltaCard from './SkillsDeltaCard';
import OvertrainingTrendCard from './OvertrainingTrendCard';
import ProgressRing from './ProgressRing';

describe('ProgressRing', () => {
  it('offsets the dash by the unfilled share and clamps out-of-range values', () => {
    const { rerender } = render(<ProgressRing value={50} colors={['#000', '#fff']} gradientId="g" size={82} strokeWidth={6} />);
    const circumference = 2 * Math.PI * 38;
    expect(Number(screen.getByTestId('progress-ring-value').getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference / 2, 5);
    rerender(<ProgressRing value={150} colors={['#000', '#fff']} gradientId="g" />);
    expect(Number(screen.getByTestId('progress-ring-value').getAttribute('stroke-dashoffset'))).toBe(0);
  });
});

describe('RideScoreCard', () => {
  it('shows the score over 100 and the shared effort bucket label', () => {
    render(<RideScoreCard score={63} />);
    const card = screen.getByTestId('ride-score-card');
    expect(card).toHaveTextContent('63');
    expect(card).toHaveTextContent('/100');
    expect(card).toHaveTextContent('Effort Score');
    expect(card).toHaveTextContent('Tempo ride');
  });

  it('buckets the extremes (recovery / exhausted)', () => {
    const { rerender } = render(<RideScoreCard score={10} />);
    expect(screen.getByText('Recovery ride')).toBeInTheDocument();
    rerender(<RideScoreCard score={99} />);
    expect(screen.getByText('Exhausted ride')).toBeInTheDocument();
  });
});

describe('RecoveryCard', () => {
  const oura = {
    recovery_score: 82,
    resting_hr_bpm: 48,
    resting_hr_baseline_bpm: null,
    hrv_ms: 61.4,
    hrv_baseline_ms: null,
    sleep_hours: 7.25,
    sleep_deep_pct: null,
    weight_kg: null,
    weight_trend_30d_kg: null,
    vo2max: null,
    data_freshness: '2026-10-15',
  };

  it('shows the score, its bucket and the Sleep / Resting HR / HRV rows', () => {
    render(<RecoveryCard context={oura} />);
    const card = screen.getByTestId('recovery-card');
    expect(card).toHaveTextContent('Recovery Score');
    expect(card).toHaveTextContent('82');
    expect(card).toHaveTextContent('Good');
    expect(screen.getByText('Sleep').nextSibling).toHaveTextContent('7.3h');
    expect(screen.getByText('Resting HR').nextSibling).toHaveTextContent('48 bpm');
    expect(screen.getByText('HRV').nextSibling).toHaveTextContent('61 ms');
  });

  it('appends deep-sleep share and baselines when present', () => {
    render(<RecoveryCard context={{ ...oura, sleep_deep_pct: 22.4, resting_hr_baseline_bpm: 50.6, hrv_baseline_ms: 55 }} />);
    expect(screen.getByText('Sleep').nextSibling).toHaveTextContent('7.3h · 22% deep');
    expect(screen.getByText('Resting HR').nextSibling).toHaveTextContent('48 bpm (baseline 51)');
    expect(screen.getByText('HRV').nextSibling).toHaveTextContent('61 ms (baseline 55)');
  });

  it('shows a neutral dash and "Not enough data yet" without a score, and no rows without metrics', () => {
    render(<RecoveryCard context={{ ...oura, recovery_score: null, sleep_hours: null, resting_hr_bpm: null, hrv_ms: null }} />);
    const card = screen.getByTestId('recovery-card');
    expect(card).toHaveTextContent('—');
    expect(card).toHaveTextContent('Not enough data yet');
    expect(card.querySelector('dl')).toBeNull();
  });
});

describe('MetricComparisonCard', () => {
  it('renders title, subtitle and old → new rows, highlighting positive ones', () => {
    render(
      <MetricComparisonCard
        title="vs Your Average"
        subtitle="Oct 1"
        rows={[
          { label: 'Avg Speed', oldValue: '27.1 km/h', newValue: '29.3 km/h', isPositive: true },
          { label: 'Heart Rate', oldValue: '148 bpm', newValue: '152 bpm', isPositive: false },
        ]}
      />,
    );
    expect(screen.getByText('vs Your Average')).toBeInTheDocument();
    expect(screen.getByText('Oct 1')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Avg Speed27.1 km/h→29.3 km/h');
    expect(screen.getByText('29.3 km/h').className).toMatch(/pillPositive/);
    expect(screen.getByText('152 bpm').className).not.toMatch(/pillPositive/);
  });

  it('renders nothing without rows', () => {
    const { container } = render(<MetricComparisonCard title="x" rows={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('SkillsDeltaCard', () => {
  it('renders one tile per skill with a signed delta badge', () => {
    render(
      <SkillsDeltaCard
        changes={[
          { name: 'Climbing', previous: 61, current: 64, diff: 3 },
          { name: 'Sprint/Attack', previous: 40, current: 38, diff: -2 },
        ]}
      />,
    );
    expect(screen.getByText('Skills changed')).toBeInTheDocument();
    const tiles = screen.getAllByRole('listitem');
    expect(tiles[0]).toHaveTextContent('Climbing61 → 64+3');
    expect(tiles[1]).toHaveTextContent('Sprint/Attack40 → 38-2');
    expect(screen.getByText('-2').className).toMatch(/badgeNegative/);
  });

  it('renders nothing without changes', () => {
    const { container } = render(<SkillsDeltaCard changes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('OvertrainingTrendCard', () => {
  // m/s speeds; HR climbing while speed drops across the recent window.
  const ride = (i, hr, speedKmh) => ({
    id: i,
    type: 'Ride',
    start_date: `2026-10-${String(i + 1).padStart(2, '0')}T08:00:00Z`,
    average_heartrate: hr,
    average_speed: speedKmh / 3.6,
  });
  const fatigued = [ride(0, 140, 30), ride(1, 142, 30), ride(2, 141, 29.5), ride(3, 143, 29.5), ride(4, 155, 26), ride(5, 158, 25.5), ride(6, 160, 25), ride(7, 162, 24.5)];

  it('draws both lines and labels the shared risk bucket, with the fatigue note when detected', () => {
    render(<OvertrainingTrendCard activities={fatigued} />);
    const card = screen.getByTestId('overtraining-trend-card');
    expect(card).toHaveTextContent('Heart Rate vs Speed Trend');
    expect(card).toHaveTextContent(/Overtraining risk 100% · High/);
    expect(card).toHaveTextContent('Fatigue signal — HR rising while speed drops');
    expect(screen.getByTestId('trend-hr-line').getAttribute('d')).toMatch(/^M 0 /);
    expect(screen.getByTestId('trend-speed-line').getAttribute('d')).toMatch(/^M 0 /);
    expect(card).toHaveTextContent('Avg HR');
    expect(card).toHaveTextContent('Avg Speed (km/h)');
  });

  it('shows the chart without a risk pill for 2–3 rides, and nothing for fewer than two', () => {
    const { container, rerender } = render(<OvertrainingTrendCard activities={fatigued.slice(0, 3)} />);
    expect(screen.getByTestId('overtraining-trend-card')).not.toHaveTextContent('Overtraining risk');
    rerender(<OvertrainingTrendCard activities={[fatigued[0], { ...fatigued[1], type: 'Run' }]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
