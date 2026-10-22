import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PeriodSummary } from './PeriodSummary';
import { SkillsSection } from './SkillsSection';
import { MetricSection } from './MetricSection';

// Each lazy-mounted section's job is to gate a heavy chart behind
// `useInView` and hand it the right props. jsdom has no
// IntersectionObserver, so useInView falls back to "in view" and the
// charts (mocked to probes, they have their own tests) mount at once.
vi.mock('../../components/ProgressChart', () => ({
  default: ({ data }) => <div data-testid="progress-chart">{data ? `${data.length} blocks` : 'no data'}</div>,
}));
vi.mock('../../components/SkillsRadarChart', () => ({
  default: ({ skills }) => <div data-testid="skills-radar">{skills ? 'skills' : 'no skills'}</div>,
}));
vi.mock('../../components/FTPAnalysis', () => ({
  default: ({ selectedPeriod }) => <div data-testid="ftp">{selectedPeriod}</div>,
}));
vi.mock('../../components/PowerAnalysis', () => ({
  default: ({ trend, summary }) => <div data-testid="power">trend:{String(trend)} summary:{summary?.avg ?? 'none'}</div>,
}));
vi.mock('../../components/HeartRateVsSpeedChart', () => ({ default: ({ trend }) => <div data-testid="hr-speed">trend:{String(trend)}</div> }));
vi.mock('../../components/AverageHeartRateTrendChart', () => ({ default: () => <div data-testid="hr-trend" /> }));
vi.mock('../../components/MinMaxHeartRateBarChart', () => ({ default: () => <div data-testid="hr-minmax" /> }));
vi.mock('../../components/HeartRateVsElevationChart', () => ({ default: () => <div data-testid="hr-elev" /> }));
vi.mock('../../components/HeartRateZonesChart', () => ({ default: ({ profile }) => <div data-testid="hr-zones">{profile?.id}</div> }));
vi.mock('../../components/CadenceStandardsAnalysis', () => ({ default: ({ trend }) => <div data-testid="cad-standards">trend:{String(trend)}</div> }));
vi.mock('../../components/CadenceVsSpeedChart', () => ({ default: () => <div data-testid="cad-speed" /> }));
vi.mock('../../components/AverageCadenceTrendChart', () => ({ default: () => <div data-testid="cad-trend" /> }));
vi.mock('../../components/CadenceVsElevationChart', () => ({ default: () => <div data-testid="cad-elev" /> }));

const RIDES = [
  { id: 1, start_date: '2026-10-13T08:00:00Z', distance: 60000, moving_time: 7200, average_speed: 8 },
  { id: 2, start_date: '2026-09-01T08:00:00Z', distance: 20000, moving_time: 3000, average_speed: 7 },
];

describe('PeriodSummary', () => {
  it('feeds one summary row per 4-week block into the progress chart', () => {
    render(<PeriodSummary activities={RIDES} userProfile={null} />);
    expect(screen.getByTestId('progress-chart')).toHaveTextContent('2 blocks');
  });

  it('passes null through when there are no activities', () => {
    render(<PeriodSummary activities={[]} userProfile={null} />);
    expect(screen.getByTestId('progress-chart')).toHaveTextContent('no data');
  });
});

describe('SkillsSection', () => {
  it('renders nothing at all without activities', () => {
    const { container } = render(<SkillsSection activities={[]} selectedPeriod="4w" apiSkills={{ climbing: 1 }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mounts the radar and the FTP analysis once activities exist', () => {
    render(<SkillsSection activities={RIDES} selectedPeriod="4w" apiSkills={{ climbing: 50 }} userProfile={{}} summary={{}} />);
    expect(screen.getByTestId('skills-radar')).toHaveTextContent('skills');
    expect(screen.getByTestId('ftp')).toHaveTextContent('4w');
  });
});

describe('MetricSection', () => {
  it('renders the three groups with their headings and routes the right trend to each', () => {
    render(
      <MetricSection
        activities={RIDES}
        userProfile={{ id: 42 }}
        summary={{ power: { avg: 210 } }}
        metricsTrend={{ avg_power: 4, avg_hr: -2, avg_cadence: 1 }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Power' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Heart' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cadence' })).toBeInTheDocument();

    expect(screen.getByTestId('power')).toHaveTextContent('trend:4 summary:210');
    expect(screen.getByTestId('hr-speed')).toHaveTextContent('trend:-2');
    expect(screen.getByTestId('hr-zones')).toHaveTextContent('42');
    expect(screen.getByTestId('cad-standards')).toHaveTextContent('trend:1');
    for (const id of ['hr-trend', 'hr-minmax', 'hr-elev', 'cad-speed', 'cad-trend', 'cad-elev']) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  it('tolerates a missing summary and trend', () => {
    render(<MetricSection activities={RIDES} userProfile={null} />);
    expect(screen.getByTestId('power')).toHaveTextContent('trend:undefined summary:none');
  });
});
