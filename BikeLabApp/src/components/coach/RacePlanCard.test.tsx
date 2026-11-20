import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { RacePlanCardModel } from '@bikelab/shared/types';
import { RacePlanCard } from './RacePlanCard';
import {
  climbMarkers,
  climbMinutes,
  climbRows,
  flatRange,
  formatRaceTime,
  profileShape,
} from './racePlanLib';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key} ${JSON.stringify(opts)}` : key,
  }),
}));

const segment = (
  over: Partial<RacePlanCardModel['segments'][number]>,
): RacePlanCardModel['segments'][number] => ({
  kind: 'flat',
  startM: 0,
  distanceM: 8000,
  gradePct: 0.3,
  lowW: 130,
  highW: 145,
  pctFtp: 76,
  durationS: 1080,
  startS: 0,
  eased: false,
  ...over,
});

const model: RacePlanCardModel = {
  courseId: 12,
  name: 'Lefkara Classic',
  distanceM: 74500,
  gainM: 1135,
  durationS: 12024,
  avgSpeedKmh: 22.3,
  npW: 152,
  intensityFactor: 0.83,
  tss: 231,
  carbsPerHour: 80,
  fluidPerHour: 500,
  drafting: false,
  profile: [
    [0, 100],
    [8000, 120],
    [14000, 440],
    [18000, 280],
    [74500, 110],
  ],
  segments: [
    segment({}),
    segment({
      kind: 'climb',
      startM: 8000,
      distanceM: 6100,
      gradePct: 5.3,
      lowW: 165,
      highW: 185,
      durationS: 1680,
      eased: true,
    }),
    segment({
      kind: 'descent',
      startM: 14100,
      distanceM: 3900,
      gradePct: -4,
      lowW: 80,
      highW: 85,
    }),
    segment({ startM: 18000, distanceM: 10000, lowW: 125, highW: 140 }),
    segment({
      kind: 'climb',
      startM: 28000,
      distanceM: 9050,
      gradePct: 6.4,
      lowW: 155,
      highW: 175,
      durationS: 3060,
    }),
  ],
  feeds: [
    { atS: 1020, atM: 7600, carbsG: 27, fluidMl: 170 },
    { atS: 2760, atM: 14100, carbsG: 27, fluidMl: 170 },
  ],
};

describe('RacePlanCard', () => {
  it('shows the predicted time, the course, the climbs with their watts, the flats and the fuel', () => {
    render(<RacePlanCard model={model} />);
    expect(screen.getByTestId('race-plan-time').props.children).toBe('3:20');
    expect(screen.getByText('Lefkara Classic')).toBeTruthy();
    expect(screen.getByText('75 km')).toBeTruthy();
    expect(
      screen.getByText('coach.racePlan.solo', { exact: false }),
    ).toBeTruthy();
    expect(screen.getByTestId('race-plan-profile')).toBeTruthy();
    expect(screen.getByText('152 W')).toBeTruthy();
    expect(screen.getByText('0.83')).toBeTruthy();
    expect(screen.getByTestId('race-plan-climb-8000')).toBeTruthy();
    // Where the climb is and what it is, on one grey line; its time in whole minutes.
    expect(screen.getByText(/coach\.racePlan\.climbAt \{"km":8\} · 6\.1 km · 5\.3%/)).toBeTruthy();
    expect(screen.getAllByText(/coach\.racePlan\.climbTime/)).toHaveLength(2);
    // The climbs are numbered in riding order, in the list and on the profile.
    expect(screen.getByTestId('race-plan-marker-1')).toBeTruthy();
    expect(screen.getByTestId('race-plan-marker-2')).toBeTruthy();
    expect(screen.getByText(/coach\.racePlan\.eased/)).toBeTruthy();
    expect(screen.getByTestId('race-plan-flats')).toBeTruthy();
    expect(screen.getByTestId('race-plan-fuel').props.children).toBe(
      'coach.racePlan.fuelLine {"carbs":80,"fluid":500}',
    );
    expect(screen.getByText('coach.racePlan.feeds {"count":2}')).toBeTruthy();
  });

  it('a short flat race in a bunch: no profile, no climbs, nothing to eat', () => {
    render(
      <RacePlanCard
        model={{
          ...model,
          name: null,
          drafting: true,
          durationS: 2880,
          profile: [],
          segments: [segment({})],
          feeds: [],
        }}
      />,
    );
    expect(screen.getByTestId('race-plan-time').props.children).toBe('48 min');
    expect(
      screen.getByText('coach.racePlan.bunch', { exact: false }),
    ).toBeTruthy();
    expect(screen.queryByTestId('race-plan-profile')).toBeNull();
    expect(screen.getByTestId('race-plan-flats')).toBeTruthy();
    expect(screen.queryByTestId('race-plan-climb-8000')).toBeNull();
    expect(screen.getByText('coach.racePlan.noFeeds')).toBeTruthy();
  });
});

describe('racePlanLib', () => {
  it('formats the race time', () => {
    expect(formatRaceTime(12024)).toBe('3:20');
    expect(formatRaceTime(3600)).toBe('1:00');
    expect(formatRaceTime(2880)).toBe('48 min');
  });

  it('lists the longest climbs in riding order and counts the rest', () => {
    expect(climbRows(model).rows.map(c => c.startM)).toEqual([8000, 28000]);
    expect(climbRows(model).more).toBe(0);
    const many = {
      ...model,
      segments: Array.from({ length: 7 }, (_, i) =>
        segment({
          kind: 'climb',
          startM: i * 10000,
          distanceM: 1000 + i * 100,
        }),
      ),
    };
    const { rows, more } = climbRows(many);
    expect(rows.map(c => c.startM)).toEqual([
      10000, 20000, 30000, 40000, 50000, 60000,
    ]);
    expect(more).toBe(1);
  });

  it('takes the range most flat kilometres are planned at', () => {
    expect(flatRange(model)).toEqual({ low: 125, high: 140, metres: 18000 });
    expect(
      flatRange({
        ...model,
        segments: model.segments.filter(s => s.kind !== 'flat'),
      }),
    ).toBeNull();
  });

  it('numbers the listed climbs on the profile, dropping one a line when two are close', () => {
    const rows = climbRows(model).rows;
    const markers = climbMarkers(model, rows, 300);
    expect(markers.map(m => m.n)).toEqual([1, 2]);
    expect(markers[0].x).toBeGreaterThan(32);
    expect(markers[0].x).toBeLessThan(57);
    expect(markers.every(m => m.lane === 0)).toBe(true);
    // Two climbs a kilometre apart on a 75 km course: the second steps down.
    const close = [segment({ kind: 'climb', startM: 16000, distanceM: 1200 }), segment({ kind: 'climb', startM: 18000, distanceM: 1700 }), segment({ kind: 'climb', startM: 50000, distanceM: 2800 })];
    expect(climbMarkers(model, close, 300).map(m => m.lane)).toEqual([0, 1, 0]);
    expect(climbMarkers({ ...model, profile: [] }, rows, 300)).toEqual([]);
  });

  it('says a climb\'s time in whole minutes, never zero', () => {
    expect(climbMinutes(264)).toBe(4);
    expect(climbMinutes(1861)).toBe(31);
    expect(climbMinutes(20)).toBe(1);
  });

  it('draws the profile with the climbs and the feeds placed along it', () => {
    const shape = profileShape(model, 300, 64);
    expect(shape?.line.startsWith('M0,')).toBe(true);
    expect(shape?.area.endsWith('L300,64 L0,64 Z')).toBe(true);
    expect(shape?.climbs).toHaveLength(2);
    expect(shape?.climbs[0].x).toBeCloseTo(32.2, 1);
    expect(shape?.climbs[0].width).toBeCloseTo(24.6, 1);
    expect(shape?.feeds).toEqual([30.6, 56.8]);
    expect(profileShape({ ...model, profile: [[0, 100]] }, 300, 64)).toBeNull();
    // a dead-flat profile still draws
    expect(
      profileShape(
        {
          ...model,
          profile: [
            [0, 100],
            [0, 100],
          ],
        },
        300,
        64,
      )?.line,
    ).toBe('M0,60 L0,60');
  });
});
