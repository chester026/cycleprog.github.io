import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import AnalysisPage from '../AnalysisPage';
import { call } from '../../data/api';
import { queryClient, resetTestQueryClient } from '../../data/hooks/__tests__/testUtils';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual('../../data/api');
  return { ...actual, call: vi.fn() };
});

vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 1 }, isAuthenticated: true, isLoading: false }),
}));

// The page's sections (pages/analysis/*) and the charts they mount have
// their own tests; here they are probes that echo the data the page hands
// them, so this file tests the page's loading/error gates and wiring.
vi.mock('../analysis/PlanFactHero', () => ({
  PlanFactHero: ({ activities }) => <div data-testid="hero">hero:{activities.length}</div>,
}));
vi.mock('../analysis/PeriodSummary', () => ({
  PeriodSummary: ({ activities }) => <div data-testid="period">period:{activities.length}</div>,
}));
vi.mock('../analysis/SkillsSection', () => ({
  SkillsSection: ({ apiSkills, riderProfile, skillsTrend, summary }) => (
    <div data-testid="skills">
      {apiSkills ? `climbing:${apiSkills.climbing}` : 'no-skills'} profile:{riderProfile?.profile ?? 'none'} trend:
      {skillsTrend?.climbing ?? 'none'} vo2:{summary?.vo2max ?? 'none'}
    </div>
  ),
}));
vi.mock('../analysis/MetricSection', () => ({
  MetricSection: ({ metricsTrend, summary }) => (
    <div data-testid="metrics">
      power-trend:{String(metricsTrend?.avg_power)} power-avg:{summary?.power?.avg ?? 'none'}
    </div>
  ),
}));
vi.mock('../../components/Footer', () => ({ default: () => null }));

function renderPage() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AnalysisPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const RIDES = [{ id: 1, start_date: '2026-10-13T08:00:00Z', distance: 60000 }];

function mockApi({ activities = RIDES, failActivities = false, pending = false, history = [] } = {}) {
  call.mockImplementation((def) => {
    switch (def.path) {
      case '/api/activities':
        if (pending) return new Promise(() => {});
        if (failActivities) return Promise.reject(new Error('Strava unavailable'));
        return Promise.resolve(activities);
      case '/api/user-profile':
        return Promise.resolve({ id: 1, experience_level: 'intermediate' });
      case '/api/analytics/summary':
        return Promise.resolve({ summary: { vo2max: 55, power: { avg: 210 } } });
      case '/api/skills':
        return Promise.resolve({
          skills: { climbing: 61, sprint: 40, endurance: 70, tempo: 50, power: 0, consistency: 80 },
          riderProfile: { profile: 'Climber', description: 'Likes hills' },
          trend: { climbing: 3 },
        });
      case '/api/analytics-snapshot/history':
        return Promise.resolve(history);
      default:
        return Promise.resolve([]);
    }
  });
}

describe('AnalysisPage', () => {
  beforeEach(() => {
    resetTestQueryClient();
    call.mockReset();
  });

  afterEach(() => {
    resetTestQueryClient();
  });

  it('shows the loading overlay and no sections while activities load', () => {
    mockApi({ pending: true });
    renderPage();
    expect(screen.getByText('Analyzing activities & Preparing charts...')).toBeInTheDocument();
    expect(screen.queryByTestId('hero')).not.toBeInTheDocument();
    expect(screen.queryByTestId('metrics')).not.toBeInTheDocument();
  });

  it('hands activities, skills, summary and the snapshot trend to each section once loaded', async () => {
    mockApi({
      history: [
        { avg_power: 220, avg_hr: 140, avg_cadence: 85 },
        { avg_power: 210, avg_hr: 142, avg_cadence: 85 },
      ],
    });
    renderPage();

    expect(await screen.findByTestId('hero')).toHaveTextContent('hero:1');
    expect(screen.getByTestId('period')).toHaveTextContent('period:1');
    expect(screen.getByTestId('skills')).toHaveTextContent('climbing:61 profile:Climber trend:3 vo2:55');
    expect(screen.getByTestId('metrics')).toHaveTextContent('power-trend:10 power-avg:210');
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/analytics-snapshot/history' }),
      { query: { limit: 2 } },
    );
  });

  it('shows the error message instead of the metric charts when activities fail', async () => {
    mockApi({ failActivities: true });
    renderPage();
    expect(await screen.findByText('Strava unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('metrics')).not.toBeInTheDocument();
    // The hero still renders (with no activities) so the page isn't blank.
    expect(screen.getByTestId('hero')).toHaveTextContent('hero:0');
  });
});
