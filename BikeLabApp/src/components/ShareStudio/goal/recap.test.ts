import {
  computeGoalRecap,
  goalRecapWindow,
  formatBigNumber,
  formatRecapKm,
  formatRecapHours,
  formatMultiplier,
  pickHeroMetric,
  isCyclingActivity,
} from './recap';
import type {Activity} from '../../../types/activity';

const ride = (start_date: string, km: number, elev = 0, movingMin = 60, type = 'Ride'): Activity => ({
  id: Math.floor(Math.random() * 1e9),
  name: 'r',
  type,
  start_date,
  distance: km * 1000,
  moving_time: movingMin * 60,
  elapsed_time: movingMin * 60,
  total_elevation_gain: elev,
  average_speed: 7,
  max_speed: 10,
});

// Local-time ISO strings (no Z) so the tests don't depend on the TZ of the
// machine running them.
const now = new Date('2026-09-23T12:00:00');

describe('goalRecapWindow', () => {
  it('runs from the created day to completed_at', () => {
    const w = goalRecapWindow(
      {created_at: '2026-08-01T15:30:00', status: 'completed', completed_at: '2026-09-10T18:00:00', target_date: '2026-09-30'},
      now,
    );
    expect(w.start).toEqual(new Date(2026, 7, 1));
    expect(w.end).toEqual(new Date('2026-09-10T18:00:00'));
  });

  it('falls back to updated_at when the server sends no completed_at', () => {
    const w = goalRecapWindow({created_at: '2026-08-01T10:00:00', status: 'completed', updated_at: '2026-09-02T09:00:00'}, now);
    expect(w.end).toEqual(new Date('2026-09-02T09:00:00'));
  });

  it('caps a late completion at the end of the target day', () => {
    const w = goalRecapWindow(
      {created_at: '2026-08-01T10:00:00', status: 'completed', completed_at: '2026-09-20T10:00:00', target_date: '2026-09-05'},
      now,
    );
    expect(w.end).toEqual(new Date(2026, 8, 5, 23, 59, 59, 999));
  });

  it('runs to now for a goal that is still active', () => {
    const w = goalRecapWindow({created_at: '2026-09-01T10:00:00', status: 'active', target_date: '2026-12-01'}, now);
    expect(w.end).toEqual(now);
  });
});

describe('computeGoalRecap', () => {
  const goal = {
    created_at: '2026-08-01T15:00:00',
    status: 'completed' as const,
    completed_at: '2026-08-31T20:00:00',
    target_date: null,
  };

  it('sums only cycling activities inside the window', () => {
    const activities = [
      ride('2026-07-31T08:00:00', 100, 900), // before the window
      ride('2026-08-01T07:00:00', 50, 400, 120), // created later that day — still counts
      ride('2026-08-10T07:00:00', 120, 1500, 240, 'VirtualRide'),
      ride('2026-08-10T18:00:00', 30, 100, 60),
      ride('2026-08-15T07:00:00', 10, 0, 60, 'Run'), // not a ride
      ride('2026-09-01T07:00:00', 80, 800), // after completion
    ];
    const r = computeGoalRecap(goal, activities, now);
    expect(r.rides).toBe(3);
    expect(r.distanceKm).toBeCloseTo(200);
    expect(r.elevationM).toBe(2000);
    expect(r.movingHours).toBeCloseTo(7);
    expect(r.activeDays).toBe(2);
    expect(r.longestRideKm).toBeCloseTo(120);
    expect(r.days).toBe(31);
    expect(r.everests).toBeCloseTo(2000 / 8849);
  });

  it('handles no activities', () => {
    const r = computeGoalRecap(goal, undefined, now);
    expect(r.rides).toBe(0);
    expect(r.distanceKm).toBe(0);
    expect(r.days).toBe(31);
  });
});

describe('formatting', () => {
  it('groups thousands with a thin space', () => {
    expect(formatBigNumber(12480.4)).toBe('12 480');
    expect(formatBigNumber(999)).toBe('999');
    expect(formatBigNumber(NaN)).toBe('0');
  });

  it('formats km and hours', () => {
    expect(formatRecapKm(1240.2)).toBe('1240');
    expect(formatRecapKm(12400)).toBe('12\u2009400');
    expect(formatRecapKm(42.66)).toBe('42.7');
    expect(formatRecapKm(0)).toBe('0');
    expect(formatRecapHours(61.4)).toBe('61');
    expect(formatRecapHours(3.26)).toBe('3.3');
    expect(formatRecapHours(0)).toBe('0');
  });

  it('formats multipliers', () => {
    expect(formatMultiplier(1.63)).toBe('×1.6');
    expect(formatMultiplier(2.02)).toBe('×2');
  });

});

describe('pickHeroMetric', () => {
  it('prefers distance, then rides, then days', () => {
    expect(pickHeroMetric({distanceKm: 12, rides: 2})).toBe('distance');
    expect(pickHeroMetric({distanceKm: 0.2, rides: 1})).toBe('rides');
    expect(pickHeroMetric({distanceKm: 0, rides: 0})).toBe('days');
  });
});

describe('isCyclingActivity', () => {
  it('accepts ride sport types', () => {
    expect(isCyclingActivity({type: 'Ride'})).toBe(true);
    expect(isCyclingActivity({type: 'Workout', sport_type: 'GravelRide'})).toBe(true);
    expect(isCyclingActivity({type: 'Run'})).toBe(false);
  });
});
