import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PowerInsights, PowerInsightsLoading } from './PowerInsights';
import type { RidePowerBreakdownResponse } from '@bikelab/shared/api';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key} ${JSON.stringify(opts)}` : key,
  }),
}));

const effort = (
  seconds: number,
  over: Partial<
    RidePowerBreakdownResponse['insights'] extends infer I
      ? I extends { efforts: (infer R)[] }
        ? R
        : never
      : never
  >,
) => ({
  seconds,
  watts: 200,
  best_watts: 250,
  best_activity_id: 1,
  best_date: '2026-10-01',
  rank: 4,
  total: 10,
  pct_of_best: 80,
  gap_w: 50,
  is_pr: false,
  ...over,
});

function data(
  over: Partial<RidePowerBreakdownResponse['breakdown']> = {},
  insightsOver: Partial<
    NonNullable<RidePowerBreakdownResponse['insights']>
  > = {},
): RidePowerBreakdownResponse {
  return {
    breakdown: {
      activity_id: 1,
      ftp_w: 250,
      source: 'meter',
      duration_s: 3600,
      avg_w: 210,
      np_w: 225,
      max_w: 700,
      vi: 1.07,
      if_: 0.9,
      tss: 81,
      best_efforts_w: {},
      zones_s: [],
      segments: [
        {
          kind: 'flat',
          start_s: 0,
          duration_s: 1200,
          distance_m: 9000,
          grade_pct: 0.2,
          avg_w: 190,
          avg_hr: 140,
          avg_speed_kmh: 27,
          avg_cadence: 90,
        },
        {
          kind: 'climb',
          start_s: 1200,
          duration_s: 900,
          distance_m: 3200,
          grade_pct: 6.1,
          avg_w: 280,
          avg_hr: 168,
          avg_speed_kmh: 12.8,
          avg_cadence: 75,
          profile: [100, 120, 150, 190, 230, 260, 295],
        },
        {
          kind: 'climb',
          start_s: 2400,
          duration_s: 300,
          distance_m: 1100,
          grade_pct: 4.5,
          avg_w: 255,
          avg_hr: 160,
          avg_speed_kmh: 13.2,
          avg_cadence: 78,
        },
      ],
      fade: { first_half_w: 220, second_half_w: 200, pct: -9.1 },
      coasting_pct: 8,
      ...over,
    },
    insights: {
      intensity: 'threshold',
      ftp: { watts: 250, w_per_kg: 3.6, delta_w: 4 },
      highlight: { seconds: 1200, rank: 1, total: 10 },
      efforts: [
        effort(5, {
          watts: 700,
          best_watts: 820,
          rank: 5,
          pct_of_best: 85,
          gap_w: 120,
        }),
        effort(60, {
          watts: 450,
          best_watts: 470,
          rank: 2,
          pct_of_best: 96,
          gap_w: 20,
        }),
        effort(300, {}),
        effort(1200, {
          watts: 250,
          best_watts: 250,
          rank: 1,
          pct_of_best: 100,
          gap_w: 0,
          is_pr: true,
        }),
        effort(3600, {
          watts: null,
          rank: null,
          pct_of_best: null,
          gap_w: null,
          total: 3,
        }),
      ],
      recent: {
        default_seconds: 1200,
        options: [
          {
            seconds: 1200,
            reason: 'highlight',
            rides: [
              { activity_id: 1, date: '2026-08-10', watts: 230 },
              { activity_id: 2, date: '2026-09-07', watts: 240 },
              { activity_id: 3, date: '2026-10-26', watts: 245 },
            ],
            ride_w: 250,
            avg_prev_w: 238,
            vs_avg_pct: 5,
            rank: 1,
            total: 4,
          },
          {
            seconds: 3600,
            reason: 'intensity',
            rides: [
              { activity_id: 1, date: '2026-08-10', watts: 200 },
              { activity_id: 2, date: '2026-09-07', watts: 210 },
              { activity_id: 3, date: '2026-10-26', watts: 215 },
            ],
            ride_w: 190,
            avg_prev_w: 208,
            vs_avg_pct: -8.7,
            rank: 4,
            total: 4,
          },
        ],
      },
      pacing: { vi: 1.07, fade_pct: -9.1, kind: 'faded' },
      weeks: 12,
      partial: false,
      ...insightsOver,
    },
  };
}

describe('PowerInsights', () => {
  it('renders nothing for a ride without a power meter', () => {
    render(
      <PowerInsights data={{ ...data({ source: 'none' }), insights: null }} />,
    );
    expect(screen.queryByTestId('power-insights')).toBeNull();
  });

  it('shows the best-of-window headline, stats, badges per row, trend and climbs', () => {
    render(<PowerInsights data={data()} />);
    expect(screen.getByTestId('power-headline').props.children).toMatch(
      /rideAnalytics\.power\.headline\.pr .*"duration":"rideAnalytics\.power\.duration\.20m".*"weeks":12/,
    );
    // the intensity band is in the effort score above; no chip here
    expect(
      screen.queryByText('rideAnalytics.power.intensity.threshold'),
    ).toBeNull();
    expect(screen.getByText('IF')).toBeTruthy();
    expect(screen.getByText('0.90')).toBeTruthy();
    expect(screen.getByText('81')).toBeTruthy();
    expect(screen.getByText('VI')).toBeTruthy();
    expect(
      screen.getByText(/250 W · rideAnalytics\.power\.wkg \{"value":"3\.6"\}/),
    ).toBeTruthy();
    expect(
      screen.getByText('rideAnalytics.power.ftpDelta {"delta":"+4 W"}'),
    ).toBeTruthy();
    expect(screen.getByText('rideAnalytics.power.coasting')).toBeTruthy();

    // 20 min: BEST pill; 1 min: "#2 of 10"; 5 s (rank 5 on a threshold ride): gap to best; 1 h: too short
    expect(screen.getByTestId('power-badge-pr')).toBeTruthy();
    expect(
      screen.getByText('rideAnalytics.power.rank {"rank":2,"total":10}'),
    ).toBeTruthy();
    expect(
      screen.getByText('rideAnalytics.power.gap {"watts":120}'),
    ).toBeTruthy();
    expect(screen.getByText('rideAnalytics.power.tooShort')).toBeTruthy();

    expect(screen.getByTestId('power-recent')).toBeTruthy();
    expect(screen.getByTestId('power-recent-ride')).toBeTruthy();
    expect(
      screen.getByText('rideAnalytics.power.recentRankOf {"total":4}'),
    ).toBeTruthy();
    expect(screen.getByText('#1')).toBeTruthy();
    // the toggle switches to the hour: below-average → the red verdict
    fireEvent.press(screen.getByTestId('power-recent-toggle-1h'));
    expect(screen.getByText('−8.7%')).toBeTruthy();
    expect(
      screen.getByText('rideAnalytics.power.recentVsAvg {"count":3,"avg":208}'),
    ).toBeTruthy();

    // climbs: longest first, both listed, the flat one not
    expect(screen.getByTestId('power-climb-1200')).toBeTruthy();
    expect(screen.getByTestId('power-climb-2400')).toBeTruthy();
    expect(screen.queryByTestId('power-climb-0')).toBeNull();
    expect(
      screen.getByText(/^3\.2 km · 6\.1%.*climbAt \{"time":"20:00"\}/),
    ).toBeTruthy();
    // the profile is drawn for a climb that has one, skipped for one cached without it
    expect(screen.getByTestId('climb-1200-profile')).toBeTruthy();
    expect(screen.queryByTestId('climb-2400-profile')).toBeNull();
    expect(screen.getByTestId('power-headline-banner')).toBeTruthy();
    expect(screen.getByText('280 W')).toBeTruthy();
    // pacing is coach-only now — no line on the ride screen
    expect(screen.queryByText(/rideAnalytics\.power\.pacing/)).toBeNull();
  });

  it('on an endurance ride hides sprint gaps, shows no headline, and notes a partial history', () => {
    render(
      <PowerInsights
        data={data(
          { if_: 0.72, tss: 60 },
          {
            intensity: 'endurance',
            highlight: null,
            efforts: [effort(5, { rank: 6 }), effort(1200, { rank: 2 })],
            recent: {
              default_seconds: 3600,
              options: [
                {
                  seconds: 3600,
                  reason: 'intensity',
                  rides: [
                    { activity_id: 1, date: '2026-08-10', watts: 150 },
                    { activity_id: 2, date: '2026-09-07', watts: 160 },
                    { activity_id: 3, date: '2026-10-26', watts: 170 },
                  ],
                  ride_w: 140,
                  avg_prev_w: 160,
                  vs_avg_pct: -12.5,
                  rank: 4,
                  total: 4,
                },
              ],
            },
            pacing: null,
            partial: true,
          },
        )}
      />,
    );
    expect(screen.queryByTestId('power-headline')).toBeNull();
    expect(screen.queryByText(/rideAnalytics\.power\.gap/)).toBeNull();
    expect(
      screen.getByText('rideAnalytics.power.rank {"rank":2,"total":10}'),
    ).toBeTruthy();
    expect(screen.getByText('rideAnalytics.power.partial')).toBeTruthy();

    expect(
      screen.getByText('rideAnalytics.power.recentVsAvg {"count":3,"avg":160}'),
    ).toBeTruthy();
  });

  it('without an FTP the IF/TSS tiles are left out', () => {
    render(
      <PowerInsights
        data={data(
          { ftp_w: null, if_: null, tss: null },
          { intensity: null, highlight: null },
        )}
      />,
    );
    expect(screen.queryByText('IF')).toBeNull();
    expect(screen.queryByText('TSS')).toBeNull();
    expect(screen.queryByTestId('power-headline')).toBeNull();
  });

  const intervals = {
    threshold_w: 150,
    target: { low: 170, high: 190, source: 'name' as const },
    blocks: [1, 2, 3].map(index => ({
      index,
      start_s: index * 720,
      duration_s: 480,
      avg_w: 184 - index * 2,
      max_w: 220,
      avg_hr: 150,
      max_hr: 160,
      avg_cadence: 90,
      cv_pct: 4,
      pct_ftp: 72,
      in_target_pct: 95,
      vs_target: 'in' as const,
      rest_after_s: index < 3 ? 240 : null,
      rest_after_w: index < 3 ? 90 : null,
    })),
    set: {
      reps: 3,
      blocks: [1, 2, 3],
      duration_s: 480,
      rest_s: 240,
      avg_w: 180,
      first_w: 182,
      last_w: 178,
      fade_pct: -2.2,
      spread_pct: 2.2,
      hits: 3,
    },
    work_s: 1440,
    work_avg_w: 180,
  };

  it('an interval session shows its blocks against the target', () => {
    render(<PowerInsights data={data({ intervals, fade: null })} />);
    expect(screen.getByTestId('power-intervals')).toBeTruthy();
    expect(screen.getByTestId('power-intervals-headline').props.children).toBe(
      '3 × 8:00',
    );
    expect(screen.getByTestId('power-intervals-target').props.children).toBe(
      'rideAnalytics.power.intervals.target {"low":170,"high":190}',
    );
    expect(
      screen.getByText(
        'rideAnalytics.power.intervals.inTarget {"hits":3,"reps":3}',
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('power-interval-zone-2')).toBeTruthy();
    expect(screen.getByTestId('power-interval-2')).toBeTruthy();
    expect(screen.getByTestId('power-intervals-legend').props.children).toBe(
      'rideAnalytics.power.intervals.legendSet {"watts":180,"pct":"−2.2%","rest":"4:00"}',
    );
  });

  it('efforts that form no set: a count, no pill, the longest in the legend; nothing for a steady ride', () => {
    render(
      <PowerInsights
        data={data({ intervals: { ...intervals, set: null, target: null } })}
      />,
    );
    expect(screen.getByTestId('power-intervals-headline').props.children).toBe(
      'rideAnalytics.power.intervals.effortsCount {"count":3}',
    );
    expect(screen.queryByTestId('power-intervals-verdict')).toBeNull();
    expect(screen.queryByTestId('power-interval-zone-2')).toBeNull();
    expect(screen.getByTestId('power-intervals-legend').props.children).toBe(
      'rideAnalytics.power.intervals.legendEfforts {"duration":"8:00","watts":182}',
    );
  });

  it('no Intervals card on a ride ridden at one level', () => {
    render(<PowerInsights data={data({ intervals: null })} />);
    expect(screen.queryByTestId('power-intervals')).toBeNull();
  });

  it('an effort above the target is rewarded: the pill says so', () => {
    render(
      <PowerInsights
        data={data({
          intervals: {
            ...intervals,
            blocks: intervals.blocks.map(x =>
              x.index === 3
                ? { ...x, avg_w: 198, vs_target: 'above' as const }
                : x,
            ),
          },
        })}
      />,
    );
    expect(
      screen.getByText(
        'rideAnalytics.power.intervals.overTarget {"hits":3,"reps":3}',
      ),
    ).toBeTruthy();
  });

  it('without a target there is no pill; last vs first stays in the legend', () => {
    render(
      <PowerInsights
        data={data({
          intervals: {
            ...intervals,
            target: null,
            set: { ...intervals.set, hits: null, fade_pct: -6.4 },
          },
        })}
      />,
    );
    expect(screen.queryByTestId('power-intervals-verdict')).toBeNull();
    expect(screen.getByTestId('power-intervals-legend').props.children).toBe(
      'rideAnalytics.power.intervals.legendSet {"watts":180,"pct":"−6.4%","rest":"4:00"}',
    );
  });
});

describe('PowerInsightsLoading', () => {
  it('keeps the title in place and says the ride is being read', () => {
    render(<PowerInsightsLoading />);
    expect(screen.getByTestId('power-insights-loading')).toBeTruthy();
    expect(screen.getByText('rideAnalytics.power.title')).toBeTruthy();
    expect(screen.getByText('rideAnalytics.power.loading')).toBeTruthy();
  });

  it('says so when the analysis could not be built', () => {
    render(<PowerInsightsLoading failed />);
    expect(screen.getByText('rideAnalytics.power.loadFailed')).toBeTruthy();
    expect(screen.queryByText('rideAnalytics.power.loading')).toBeNull();
  });
});
