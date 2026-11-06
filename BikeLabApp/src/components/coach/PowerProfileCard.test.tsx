import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PowerProfileCard } from './PowerProfileCard';
import { RidePowerCard } from './RidePowerCard';
import {
  durationLabelKey,
  formatClock,
  formatEffortDate,
  formatKm,
  pacingTone,
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
    expect(screen.getByText('coach.ridePower.halves {"pct":-11}')).toBeTruthy();
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
});
