import { describe, expect, it } from 'vitest';
import { computeRideFeasibility, type FeasibilityActivity } from './rideFeasibility.js';

const NOW = new Date('2026-10-08T12:00:00Z');
const DAY_MS = 86_400_000;

function ride(
  daysAgo: number,
  km: number,
  elevationM: number,
  extra: Partial<FeasibilityActivity> & { hours?: number } = {}
): FeasibilityActivity {
  const { hours = km / 25, ...rest } = extra;
  return {
    start_date: new Date(NOW.getTime() - daysAgo * DAY_MS - 3600_000).toISOString(),
    distance: km * 1000,
    moving_time: hours * 3600,
    total_elevation_gain: elevationM,
    average_heartrate: 140,
    average_speed: 7,
    name: `ride ${daysAgo}d`,
    ...rest,
  };
}

const target = { distanceKm: 160, elevationM: 3000, date: '2026-10-09' };

describe('computeRideFeasibility', () => {
  it('returns the unknown shape without activities', () => {
    const r = computeRideFeasibility([], target, NOW);
    expect(r).toEqual({
      target,
      comparableRides: [],
      personalBests: null,
      capability: {
        level: 'unknown',
        ratioDistance: null,
        ratioElevation: null,
        longRides90d: 0,
        bigClimbRides90d: 0,
      },
      load: {
        last7d: { km: 0, hours: 0, elevationM: 0, rides: 0 },
        last28d: { km: 0, hours: 0, elevationM: 0, rides: 0 },
        chronicWeeklyAvg: { km: 0, hours: 0, elevationM: 0 },
        acuteChronicRatio: null,
        daysSinceLastLongRide: null,
        daysSinceLastRide: null,
      },
      freshness: 'unknown',
    });
  });

  it('ignores future rides, zero-distance rides and unparsable dates', () => {
    const r = computeRideFeasibility(
      [ride(-2, 50, 500), ride(1, 0, 0), ride(1, 30, 100, { start_date: 'not a date' })],
      target,
      NOW
    );
    expect(r.capability.level).toBe('unknown');
    expect(r.freshness).toBe('unknown');
  });

  it('defaults the target date to today and accepts Date start dates', () => {
    const r = computeRideFeasibility(
      [{ ...ride(0, 40, 300), start_date: new Date('2026-10-08T07:00:00Z') }, ride(3, 50, 300)],
      { distanceKm: 40, elevationM: 300 },
      NOW
    );
    expect(r.target.date).toBe('2026-10-08');
    // today's ride is on the target date, so it is not part of the load
    expect(r.load.last7d.rides).toBe(1);
    expect(r.personalBests?.longestRide.date).toBe('2026-10-05');
  });

  it('ranks comparable rides by distance AND elevation, keeping three', () => {
    const rides = [
      ride(10, 160, 800, { name: 'flat long' }),
      ride(20, 120, 2900, { name: 'hilly medium' }),
      ride(30, 150, 2800, { name: 'closest' }),
      ride(40, 60, 500, { name: 'short' }),
      ride(400, 160, 3000, { name: 'too old' }),
    ];
    const r = computeRideFeasibility(rides, target, NOW);
    expect(r.comparableRides.map((c) => c.name)).toEqual(['closest', 'hilly medium', 'flat long']);
    expect(r.comparableRides[0]).toEqual({
      date: '2026-09-08',
      name: 'closest',
      distanceKm: 150,
      elevationM: 2800,
      movingTimeH: 6,
      avgHr: 140,
      avgSpeedKmh: 25.2,
      similarity: 0.91,
      daysAgo: 30,
    });
    // distance error 0.0625, elevation error 0.0667
    expect(r.comparableRides[0].similarity).toBeCloseTo(1 - Math.hypot(10 / 160, 200 / 3000), 2);
  });

  it('breaks similarity ties by recency and clamps similarity at 0', () => {
    const r = computeRideFeasibility(
      [ride(50, 100, 1000), ride(5, 100, 1000), ride(20, 5, 0, { name: undefined })],
      target,
      NOW
    );
    expect(r.comparableRides.map((c) => c.daysAgo)).toEqual([5, 50, 20]);
    expect(r.comparableRides[2]).toMatchObject({ name: null, similarity: 0, elevationM: 0 });
  });

  it('scores distance only when the target has no climbing, and tolerates a zero target', () => {
    const r = computeRideFeasibility(
      [ride(5, 100, 2500, { name: 'hilly' }), ride(6, 90, 0, { name: 'flat' })],
      { distanceKm: 90, elevationM: 0, date: '2026-10-09' },
      NOW
    );
    expect(r.comparableRides[0]).toMatchObject({ name: 'flat', similarity: 1 });
    expect(r.capability.ratioElevation).toBe(0);
    const zero = computeRideFeasibility([ride(5, 0.5, 0)], { distanceKm: 0, elevationM: 0 }, NOW);
    expect(zero.comparableRides[0].similarity).toBe(0.5);
  });

  it('computes personal bests over the whole history', () => {
    const r = computeRideFeasibility(
      [
        ride(500, 200, 1500, { hours: 9 }),
        ride(12, 142.34, 2410, { hours: 8.5 }),
        ride(3, 60, 3100, { hours: 5, average_heartrate: null }),
      ],
      target,
      NOW
    );
    expect(r.personalBests).toEqual({
      longestRide: { distanceKm: 200, elevationM: 1500, date: '2025-05-26', daysAgo: 500 },
      biggestClimb: { elevationM: 3100, distanceKm: 60, date: '2026-10-05', daysAgo: 3 },
      longestTimeH: 9,
    });
    expect(r.comparableRides.find((c) => c.daysAgo === 3)?.avgHr).toBeNull();
  });

  describe('capability', () => {
    it('is done when a recent ride covers 95% of both distance and climbing', () => {
      const r = computeRideFeasibility([ride(30, 155, 2900)], target, NOW);
      expect(r.capability.level).toBe('done');
      expect(r.capability.ratioDistance).toBe(1.03);
      expect(r.capability.ratioElevation).toBe(1.03);
    });

    it('is not done by a ride older than a year, but may still be near from the bests', () => {
      const r = computeRideFeasibility([ride(400, 160, 3000), ride(10, 40, 300)], target, NOW);
      expect(r.capability.level).toBe('near');
    });

    it('is near when both ratios are within 125% of the bests (bests from different rides)', () => {
      const r = computeRideFeasibility([ride(40, 142, 1500), ride(60, 90, 2410)], target, NOW);
      expect(r.capability).toMatchObject({ level: 'near', ratioDistance: 1.13, ratioElevation: 1.24 });
    });

    it('is beyond when either ratio is over 125%', () => {
      expect(computeRideFeasibility([ride(40, 142, 1000)], target, NOW).capability.level).toBe('beyond');
      expect(computeRideFeasibility([ride(40, 100, 3000)], target, NOW).capability.level).toBe('beyond');
    });

    it('reports a null elevation ratio for a rider who never climbed', () => {
      const r = computeRideFeasibility([ride(40, 100, 0)], target, NOW);
      expect(r.capability).toMatchObject({ level: 'beyond', ratioElevation: null });
    });

    it('counts 100+ km and 2000+ m rides in the last 90 days only', () => {
      const r = computeRideFeasibility(
        [ride(10, 100, 2000), ride(80, 120, 500), ride(89, 99, 2100), ride(95, 150, 3000), ride(5, 30, 1999)],
        target,
        NOW
      );
      expect(r.capability).toMatchObject({ longRides90d: 2, bigClimbRides90d: 2 });
    });
  });

  describe('load and freshness', () => {
    it('sums 7/28-day windows and the 84-day weekly average', () => {
      const r = computeRideFeasibility(
        [ride(1, 40, 400, { hours: 2 }), ride(10, 100, 1200, { hours: 4 }), ride(60, 84, 840, { hours: 3 }), ride(90, 50, 500, { hours: 2 })],
        target,
        NOW
      );
      expect(r.load.last7d).toEqual({ km: 40, hours: 2, elevationM: 400, rides: 1 });
      expect(r.load.last28d).toEqual({ km: 140, hours: 6, elevationM: 1600, rides: 2 });
      expect(r.load.chronicWeeklyAvg).toEqual({ km: 18.7, hours: 0.8, elevationM: 203 });
      expect(r.load.acuteChronicRatio).toBe(2.67);
      expect(r.load.daysSinceLastRide).toBe(1);
      expect(r.load.daysSinceLastLongRide).toBe(10);
    });

    it('has no ratio when nothing was ridden in the last 84 days', () => {
      const r = computeRideFeasibility([ride(100, 50, 500)], target, NOW);
      expect(r.load.acuteChronicRatio).toBeNull();
      expect(r.load.daysSinceLastRide).toBe(100);
      expect(r.load.daysSinceLastLongRide).toBeNull();
      expect(r.freshness).toBe('normal');
    });

    it('leaves rides on or after the target date out of the load', () => {
      const r = computeRideFeasibility(
        [ride(0, 80, 800), ride(2, 50, 500)],
        { ...target, date: '2026-10-08' },
        NOW
      );
      expect(r.load.last7d.rides).toBe(1);
      expect(r.load.daysSinceLastRide).toBe(2);
      const onlyTargetDay = computeRideFeasibility([ride(0, 80, 800)], { ...target, date: '2026-10-08' }, NOW);
      expect(onlyTargetDay.load.daysSinceLastRide).toBeNull();
      expect(onlyTargetDay.freshness).toBe('normal');
      expect(onlyTargetDay.capability.level).not.toBe('unknown');
    });

    it('is fresh with a low acute/chronic ratio and 2+ days of rest', () => {
      const rides = [ride(3, 20, 100, { hours: 1 }), ...[10, 17, 24, 31, 38, 45, 52, 59].map((d) => ride(d, 60, 600, { hours: 3 }))];
      const r = computeRideFeasibility(rides, target, NOW);
      expect(r.load.acuteChronicRatio).toBeLessThan(0.8);
      expect(r.freshness).toBe('fresh');
    });

    it('is not fresh when the last ride was yesterday, even with a low ratio', () => {
      const rides = [ride(1, 10, 100, { hours: 0.5 }), ride(5, 20, 100, { hours: 1 }), ...[10, 17, 24, 31, 38, 45, 52, 59, 66, 73].map((d) => ride(d, 60, 600, { hours: 3 }))];
      const r = computeRideFeasibility(rides, target, NOW);
      expect(r.load.acuteChronicRatio).toBeLessThan(0.8);
      expect(r.freshness).toBe('normal');
    });

    it('is loaded when the acute/chronic ratio is above 1.3 and the spike is still fresh', () => {
      const rides = [ride(1, 100, 1000, { hours: 4 }), ride(6, 100, 1000, { hours: 4 }), ride(20, 50, 500, { hours: 2 }), ride(50, 50, 500, { hours: 2 })];
      const r = computeRideFeasibility(rides, target, NOW);
      expect(r.load.acuteChronicRatio).toBeGreaterThan(1.3);
      expect(r.freshness).toBe('loaded');
    });

    it('is loaded when the last 3 days hold more than half of the 7-day hours', () => {
      const rides = [ride(1, 100, 1000, { hours: 5 }), ride(5, 50, 500, { hours: 2 }), ...[12, 19, 26, 33, 40, 47, 54, 61, 68, 75].map((d) => ride(d, 60, 600, { hours: 6 }))];
      const r = computeRideFeasibility(rides, target, NOW);
      expect(r.load.acuteChronicRatio).toBeLessThanOrEqual(1.3);
      expect(r.freshness).toBe('loaded');
    });

    it('one big ride followed by four rest days is normal, not loaded, despite a high ACR', () => {
      const rides = [ride(5, 200, 2500, { hours: 9 }), ...[12, 19, 26, 33, 40, 47, 54, 61, 68, 75].map((d) => ride(d, 40, 300, { hours: 2 }))];
      const r = computeRideFeasibility(rides, target, NOW);
      expect(r.load.acuteChronicRatio).toBeGreaterThan(1.3);
      expect(r.load.daysSinceLastRide).toBe(5);
      expect(r.freshness).toBe('normal');
    });

    it('a lone short ride yesterday after a quiet week is fresh, not loaded', () => {
      const rides = [ride(2, 30, 200, { hours: 1.5 }), ...[12, 19, 26, 33, 40, 47, 54, 61, 68, 75].map((d) => ride(d, 60, 600, { hours: 6 }))];
      const r = computeRideFeasibility(rides, target, NOW);
      expect(r.load.acuteChronicRatio).toBeLessThan(0.8);
      expect(r.freshness).toBe('fresh');
    });

    it('is normal in between', () => {
      const rides = [ride(2, 40, 300, { hours: 2 }), ride(6, 40, 300, { hours: 2 }), ...[13, 20, 27, 34, 41, 48, 55, 62, 69, 76, 80].map((d) => ride(d, 40, 300, { hours: 4 }))];
      expect(computeRideFeasibility(rides, target, NOW).freshness).toBe('normal');
    });

    it('treats missing numeric fields as zero', () => {
      const r = computeRideFeasibility(
        [{ ...ride(4, 30, 0), total_elevation_gain: NaN, moving_time: 0, average_speed: 0 }],
        target,
        NOW
      );
      expect(r.comparableRides[0]).toMatchObject({ elevationM: 0, movingTimeH: 0, avgSpeedKmh: 0 });
    });
  });
});
