import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react-native';
import LinearGradient from 'react-native-linear-gradient';
import type {Workout, WorkoutStep} from '@bikelab/shared/types';
import {WorkoutBlocks} from './WorkoutBlocks';
import {blockRadius, WorkoutProfile} from './WorkoutProfile';
import {blockHeightFraction} from './workoutLib';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${Object.values(opts).join('/')}` : key),
  }),
}));

const step = (overrides: Partial<WorkoutStep>): WorkoutStep => ({
  kind: 'work',
  duration_s: 480,
  zone: 4,
  target: null,
  cadence: null,
  cue: null,
  rep: null,
  reps: null,
  ...overrides,
});

// 3×8′ with 4′ recovery, warm-up and cool-down — as the server stores it.
const effort = (rep: number) =>
  step({rep, reps: 3, target: {unit: 'w', low: 240, high: 250}, cadence: {low: 85, high: 95}, cue: 'Hold the watts to the end.'});
const rest = (rep: number) => step({kind: 'recovery', duration_s: 240, zone: 1, rep, reps: 3, cue: 'Keep the legs turning.'});
const workout: Workout = {
  version: 1,
  duration_s: 61 * 60,
  steps: [
    step({kind: 'warmup', duration_s: 900, zone: 2, target: {unit: 'w', low: 110, high: 130}, cue: 'Easy spin.'}),
    effort(1),
    rest(1),
    effort(2),
    rest(2),
    effort(3),
    rest(3),
    step({kind: 'cooldown', duration_s: 600, zone: 1}),
  ],
};

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...(Array.isArray(style) ? style.flat(Infinity).filter(Boolean) : [style]));

describe('WorkoutBlocks (event sheet)', () => {
  it('starts with the summary and a hint, one tappable block per step', () => {
    render(<WorkoutBlocks workout={workout} />);
    expect(screen.getByText('calendar.workout.summary:8/1 common.h 1 common.min')).toBeTruthy();
    expect(screen.getByText('calendar.workout.tapHint')).toBeTruthy();
    expect(screen.queryByTestId('workout-block-detail')).toBeNull();
    for (let i = 0; i < 8; i += 1) {
      expect(screen.getByTestId(`workout-profile-block-${i}`)).toBeTruthy();
    }
  });

  it('tapping a block shows what to do in it: place in the set, numbers, start time, cadence, cue', () => {
    render(<WorkoutBlocks workout={workout} />);
    fireEvent.press(screen.getByTestId('workout-profile-block-3'));

    expect(screen.getByText('calendar.workout.kinds.work calendar.workout.repOf:2/3')).toBeTruthy();
    expect(screen.getByText('calendar.workout.blockOf:4/8')).toBeTruthy();
    expect(screen.getByText('8 common.min · 240–250 common.watts · calendar.workout.zone:4')).toBeTruthy();
    // Warm-up 15′ + effort 8′ + recovery 4′ = 27:00 in.
    expect(screen.getByText('calendar.workout.startsAt:27:00 · 85–95 common.rpm')).toBeTruthy();
    expect(screen.getByText('Hold the watts to the end.')).toBeTruthy();
    expect(screen.queryByText('calendar.workout.tapHint')).toBeNull();
  });

  it('a block with no target, cadence or cue shows only what it has', () => {
    render(<WorkoutBlocks workout={workout} />);
    fireEvent.press(screen.getByTestId('workout-profile-block-7'));
    expect(screen.getByText('calendar.workout.kinds.cooldown')).toBeTruthy();
    expect(screen.getByText('10 common.min · calendar.workout.zone:1')).toBeTruthy();
    expect(screen.getByText('calendar.workout.startsAt:51:00')).toBeTruthy();
  });

  it('moves between blocks, and tapping the selected one again goes back to the summary', () => {
    render(<WorkoutBlocks workout={workout} />);
    fireEvent.press(screen.getByTestId('workout-profile-block-0'));
    expect(screen.getByText('Easy spin.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('workout-profile-block-2'));
    expect(screen.getByText('Keep the legs turning.')).toBeTruthy();
    expect(screen.queryByText('Easy spin.')).toBeNull();
    fireEvent.press(screen.getByTestId('workout-profile-block-2'));
    expect(screen.getByText('calendar.workout.tapHint')).toBeTruthy();
  });

  it('a different session in the same sheet starts with nothing selected', () => {
    const {rerender} = render(<WorkoutBlocks workout={workout} />);
    fireEvent.press(screen.getByTestId('workout-profile-block-1'));
    expect(screen.getByTestId('workout-block-detail')).toBeTruthy();
    rerender(<WorkoutBlocks workout={{version: 1, duration_s: 3600, steps: [step({kind: 'steady', duration_s: 3600, zone: 2})]}} />);
    expect(screen.queryByTestId('workout-block-detail')).toBeNull();
    expect(screen.getByText('calendar.workout.summary:1/1 common.h')).toBeTruthy();
  });
});

describe('WorkoutProfile', () => {
  it('draws each block as wide as it is long and as tall as it is hard', () => {
    render(<WorkoutProfile steps={workout.steps} height={100} onSelect={() => {}} testID="p" />);
    const warmup = flat(screen.getByTestId('p-block-0').props.style);
    const work = flat(screen.getByTestId('p-block-1').props.style);
    const recovery = flat(screen.getByTestId('p-block-2').props.style);
    expect([warmup.flexGrow, work.flexGrow, recovery.flexGrow]).toEqual([900, 480, 240]);
    expect(work.height).toBe(Math.round(100 * blockHeightFraction(4)));
    expect(recovery.height).toBe(Math.round(100 * blockHeightFraction(1)));
    expect(work.height as number).toBeGreaterThan(warmup.height as number);
    expect(warmup.height as number).toBeGreaterThan(recovery.height as number);
    // Same zone, same colour; different zones differ.
    expect(work.backgroundColor).toBe(flat(screen.getByTestId('p-block-3').props.style).backgroundColor);
    expect(work.backgroundColor).not.toBe(recovery.backgroundColor);
  });

  it('keeps colour for the efforts: warm-up, recoveries and cool-down are one flat grey', () => {
    render(<WorkoutProfile steps={workout.steps} height={76} onSelect={() => {}} testID="p" />);
    const colour = (i: number) => flat(screen.getByTestId(`p-block-${i}`).props.style).backgroundColor;
    // The warm-up is ridden in zone 2 and is still grey, like the recovery and the cool-down.
    expect(new Set([colour(0), colour(2), colour(7)]).size).toBe(1);
    expect(colour(1)).not.toBe(colour(0));
    // The downward fade sits on the three efforts only.
    expect(screen.UNSAFE_getAllByType(LinearGradient)).toHaveLength(3);
    expect(screen.getByTestId('p-block-1').findAllByType(LinearGradient)).toHaveLength(1);
    expect(screen.getByTestId('p-block-0').findAllByType(LinearGradient)).toHaveLength(0);
  });

  it('rounds blocks more on the tall profile than on the calendar row', () => {
    expect([22, 44, 76, 200].map(blockRadius)).toEqual([4, 6, 8, 8]);
    render(<WorkoutProfile steps={workout.steps} height={44} onSelect={() => {}} testID="p" />);
    expect(flat(screen.getByTestId('p-block-1').props.style).borderRadius).toBe(6);
  });

  it('fades every block but the selected one', () => {
    render(<WorkoutProfile steps={workout.steps} height={60} selectedIndex={1} onSelect={() => {}} testID="p" />);
    expect(flat(screen.getByTestId('p-block-1').props.style).opacity ?? 1).toBe(1);
    expect(flat(screen.getByTestId('p-block-0').props.style).opacity).toBe(0.3);
    expect(screen.getByTestId('p-block-1').props.accessibilityState).toEqual({selected: true});
  });

  it('is a plain picture without onSelect, greyed for a finished session', () => {
    const onSelect = jest.fn();
    const {rerender} = render(<WorkoutProfile steps={workout.steps} height={22} testID="mini" />);
    expect(screen.getByTestId('mini')).toBeTruthy();
    expect(screen.queryByTestId('mini-block-0')).toBeNull();

    rerender(<WorkoutProfile steps={workout.steps} height={22} muted onSelect={onSelect} testID="mini" />);
    const colours = new Set([0, 1, 2].map(i => flat(screen.getByTestId(`mini-block-${i}`).props.style).backgroundColor));
    expect(colours.size).toBe(1);
    expect(screen.UNSAFE_queryAllByType(LinearGradient)).toHaveLength(0);
    fireEvent.press(screen.getByTestId('mini-block-2'));
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});
