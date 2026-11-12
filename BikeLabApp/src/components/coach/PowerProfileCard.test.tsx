import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PowerProfileCard } from './PowerProfileCard';
import { RidePowerCard } from './RidePowerCard';
import { RideIntervalsCard } from './RideIntervalsCard';
import {
  durationLabelKey,
  formatClock,
  formatEffortDate,
  formatKm,
  pacingTone,
  intervalsPill,
} from './powerCardLib';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key} ${JSON.stringify(opts)}` : key,
  }),
}));

describe('powerCardLib', () => {
  it('labels, dates, clocks, distances and pacing tone', () => {
    expect([5, 60, 300, 1200, 3600].map(durationLabelKey)).toEqual([
      'coach.powerDuration.5s',
      'coach.powerDuration.1m',
      'coach.powerDuration.5m',
      'coach.powerDuration.20m',
      'coach.powerDuration.1h',
    ]);
    expect(formatEffortDate('2026-10-14')).toMatch(/14/);
    expect(formatEffortDate('2026-10-14T08:00:00Z')).toMatch(/14/);
    expect(formatEffortDate('nope')).toBe('nope');
    expect(formatClock(3800)).toBe('1:03:20');
    expect(formatClock(130)).toBe('2:10');
    expect(formatKm(3200)).toBe('3.2 km');
    expect(formatKm(12000)).toBe('12 km');
    expect(pacingTone(1.0, null)).toBeNull();
    expect(pacingTone(1.0, -11)).toBe('faded');
    expect(pacingTone(1.0, 6)).toBe('negative');
    expect(pacingTone(1.2, 0)).toBe('surgy');
    expect(pacingTone(1.05, 0)).toBe('even');
  });
});

describe('PowerProfileCard', () => {
  it('shows FTP, W/kg, the method and one bar per effort', () => {
    render(
      <PowerProfileCard
        model={{
          weeks: 12,
          ftpWatts: 249,
          ftpMethod: 'ftp20',
          ftpDate: '2026-10-14',
          ftpEstimatedWatts: null,
          wPerKg: 3.56,
          ridesWithPower: 14,
          efforts: [
            { seconds: 5, watts: 812, date: '2026-10-01' },
            { seconds: 1200, watts: 262, date: '2026-10-14' },
          ],
        }}
      />,
    );
    expect(screen.getByText(/^249/)).toBeTruthy();
    expect(screen.getByText('3.6 W/kg')).toBeTruthy();
    expect(screen.getByText(/coach\.powerProfile\.method\.ftp20/)).toBeTruthy();
    expect(screen.getByTestId('power-profile-row-5')).toBeTruthy();
    expect(screen.getByTestId('power-profile-row-1200')).toBeTruthy();
    expect(screen.getByText('812 W')).toBeTruthy();
    expect(
      screen.getByText('coach.powerProfile.footnote {"count":14}'),
    ).toBeTruthy();
  });

  it('a rider-set FTP shows "set by you" with the estimate beside it', () => {
    render(
      <PowerProfileCard
        model={{
          weeks: 12,
          ftpWatts: 177,
          ftpMethod: 'manual',
          ftpDate: '2026-11-06',
          ftpEstimatedWatts: 160,
          wPerKg: 2.5,
          ridesWithPower: 9,
          efforts: [{ seconds: 5, watts: 600 }],
        }}
      />,
    );
    expect(
      screen.getByText(
        /coach\.powerProfile\.method\.manual.*coach\.powerProfile\.estimated \{"watts":160\}/,
      ),
    ).toBeTruthy();
  });

  it('without an FTP says so instead of a number', () => {
    render(
      <PowerProfileCard
        model={{
          weeks: 4,
          ftpWatts: null,
          ftpMethod: null,
          ftpDate: null,
          ftpEstimatedWatts: null,
          wPerKg: null,
          ridesWithPower: 2,
          efforts: [{ seconds: 5, watts: 600 }],
        }}
      />,
    );
    expect(screen.getByText('coach.powerProfile.noFtp')).toBeTruthy();
    expect(screen.queryByText(/W\/kg/)).toBeNull();
  });
});

describe('RidePowerCard', () => {
  const model = {
    activityId: 7,
    npW: 221,
    avgW: 198,
    maxW: 740,
    intensityFactor: 0.89,
    tss: 119,
    vi: 1.12,
    ftpWatts: 249,
    efforts: [
      { seconds: 5, watts: 740 },
      { seconds: 1200, watts: 245 },
    ],
    climbs: [
      {
        distanceM: 3200,
        gradePct: 6.1,
        avgW: 280,
        avgHr: 168,
        avgSpeedKmh: 12.8,
        durationS: 900,
        startS: 1500,
      },
    ],
    fadePct: -11.4,
    coastingPct: 9,
    intervals: null,
  };

  it('shows NP, the tiles, the ride efforts, climbs and a faded pacing pill', () => {
    render(<RidePowerCard model={model} />);
    expect(screen.getByText(/^221/)).toBeTruthy();
    expect(screen.getByText('IF')).toBeTruthy();
    expect(screen.getByText('0.89')).toBeTruthy();
    expect(screen.getByText('119')).toBeTruthy();
    expect(screen.getByText('1.12')).toBeTruthy();
    expect(screen.getByText('9%')).toBeTruthy();
    expect(screen.getByTestId('ride-power-effort-1200')).toBeTruthy();
    expect(screen.getByTestId('ride-power-climb-1500')).toBeTruthy();
    expect(screen.getByText('3.2 km · 6.1%')).toBeTruthy();
    expect(screen.getByText('coach.ridePower.pacing.faded')).toBeTruthy();
    expect(
      screen.getByText('coach.ridePower.halves {"pct":"−11%"}'),
    ).toBeTruthy();
  });

  it('without an FTP, efforts, climbs or fade it stays a compact NP card', () => {
    render(
      <RidePowerCard
        model={{
          ...model,
          intensityFactor: null,
          tss: null,
          efforts: [],
          climbs: [],
          fadePct: null,
          coastingPct: null,
        }}
      />,
    );
    expect(screen.queryByText('IF')).toBeNull();
    expect(screen.queryByText('coach.ridePower.bestEfforts')).toBeNull();
    expect(screen.queryByText('coach.ridePower.climbs')).toBeNull();
    expect(screen.queryByText(/coach\.ridePower\.pacing/)).toBeNull();
    expect(screen.getByText('1.12')).toBeTruthy();
  });

  const intervals = {
    blocks: [
      {
        index: 1,
        startS: 300,
        durationS: 600,
        avgW: 150,
        avgHr: 130,
        inTargetPct: 0,
        vsTarget: 'below' as const,
        inSet: false,
      },
      {
        index: 2,
        startS: 1200,
        durationS: 480,
        avgW: 182,
        avgHr: 150,
        inTargetPct: 92,
        vsTarget: 'in' as const,
        inSet: true,
      },
      {
        index: 3,
        startS: 1920,
        durationS: 480,
        avgW: 178,
        avgHr: 154,
        inTargetPct: 90,
        vsTarget: 'in' as const,
        inSet: true,
      },
    ],
    set: {
      reps: 2,
      durationS: 480,
      restS: 240,
      avgW: 180,
      fadePct: -2.2,
      hits: 2,
    },
    target: { low: 170, high: 190, source: 'name' as const },
  };

  it('an interval session: the set, the verdict, the target and a row per block', () => {
    render(<RideIntervalsCard intervals={intervals} />);
    expect(screen.getByTestId('ride-intervals-card')).toBeTruthy();
    expect(
      screen.getByText('rideAnalytics.power.intervals.title'),
    ).toBeTruthy();
    expect(screen.getByTestId('ride-intervals-headline').props.children).toBe(
      '2 × 8:00',
    );
    expect(
      screen.getByText(
        'rideAnalytics.power.intervals.inTarget {"hits":2,"reps":2}',
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('ride-intervals-target').props.children).toBe(
      'rideAnalytics.power.intervals.target {"low":170,"high":190}',
    );
    expect(screen.getByTestId('ride-intervals-block-2')).toBeTruthy();
    expect(screen.getAllByText('8:00')).toHaveLength(2);
    expect(screen.getByTestId('ride-intervals-legend').props.children).toBe(
      'rideAnalytics.power.intervals.legendSet {"watts":180,"pct":"−2.2%","rest":"4:00"}',
    );
  });

  it('without a target there is no pill; efforts without a set get a count and the longest', () => {
    render(
      <RideIntervalsCard
        intervals={{
          ...intervals,
          target: null,
          set: { ...intervals.set, hits: null, fadePct: -6 },
        }}
      />,
    );
    expect(screen.queryByTestId('ride-intervals-verdict')).toBeNull();
    expect(screen.queryByTestId('ride-intervals-target')).toBeNull();

    render(
      <RideIntervalsCard
        intervals={{ ...intervals, set: null, target: null }}
      />,
    );
    expect(
      screen.getByText('rideAnalytics.power.intervals.effortsTitle'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'rideAnalytics.power.intervals.effortsCount {"count":3}',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'rideAnalytics.power.intervals.legendEfforts {"duration":"10:00","watts":150}',
      ),
    ).toBeTruthy();
  });

  it('an effort above the target is rewarded: the pill says so', () => {
    render(
      <RideIntervalsCard
        intervals={{
          ...intervals,
          blocks: intervals.blocks.map(x =>
            x.index === 3 ? { ...x, avgW: 198, vsTarget: 'above' as const } : x,
          ),
        }}
      />,
    );
    expect(
      screen.getByText(
        'rideAnalytics.power.intervals.overTarget {"hits":2,"reps":2}',
      ),
    ).toBeTruthy();
  });

  it('the ride-power card itself carries no intervals', () => {
    render(<RidePowerCard model={{ ...model, fadePct: null, intervals }} />);
    expect(screen.queryByTestId('ride-intervals-card')).toBeNull();
    expect(screen.queryByText(/coach\.ridePower\.halves/)).toBeNull();
  });
});

describe('intervalsPill', () => {
  const target = { low: 170, high: 190, source: 'plan' as const };
  const set = {
    reps: 3,
    durationS: 480,
    restS: 240,
    avgW: 180,
    fadePct: 0,
    hits: 3,
  };
  const b = (vsTarget: 'below' | 'in' | 'above') => ({
    index: 1,
    startS: 0,
    durationS: 480,
    avgW: 180,
    avgHr: null,
    inTargetPct: null,
    vsTarget,
    inSet: true,
  });

  it('counts the efforts in or above the target', () => {
    expect(
      intervalsPill({ blocks: [b('in'), b('in'), b('in')], set, target }),
    ).toEqual({ hits: 3, reps: 3, tone: 'good' });
    expect(
      intervalsPill({ blocks: [b('in'), b('in'), b('above')], set, target }),
    ).toEqual({ hits: 3, reps: 3, tone: 'over' });
    expect(
      intervalsPill({ blocks: [b('below'), b('in'), b('in')], set, target })
        ?.tone,
    ).toBe('neutral');
    expect(
      intervalsPill({
        blocks: [b('below'), b('below'), b('below')],
        set,
        target,
      })?.tone,
    ).toBe('bad');
  });

  it('is null without a target or a set', () => {
    expect(intervalsPill({ blocks: [b('in')], set, target: null })).toBeNull();
    expect(intervalsPill({ blocks: [b('in')], set: null, target })).toBeNull();
  });
});
