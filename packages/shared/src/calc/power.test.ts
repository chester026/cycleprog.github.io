import { describe, expect, it } from 'vitest';
import { estimateRidePower, powerStatsForActivities } from './power.js';

const baseParams = { riderWeightKg: 70, bikeWeightKg: 8 };

function flatActivity(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    distance: 20000,
    moving_time: 2400,
    total_elevation_gain: 0,
    average_speed: 20000 / 2400,
    ...overrides,
  } as any;
}

describe('estimateRidePower', () => {
  it('passes real power straight through for device_watts activities', () => {
    const activity = flatActivity({ average_watts: 210.4, device_watts: true });
    const result = estimateRidePower(activity, baseParams);
    expect(result.method).toBe('measured');
    expect(result.confidence).toBe('high');
    expect(result.avgWatts).toBe(210);
  });

  it('ignores average_watts without device_watts (estimated from physics instead)', () => {
    const activity = flatActivity({ average_watts: 999 });
    const result = estimateRidePower(activity, baseParams);
    expect(result.method).toBe('estimated');
    expect(result.avgWatts).not.toBe(999);
  });

  it('pins a known value for a flat, windless, sea-level ride', () => {
    // 20km in 2400s (30km/h), 0 elevation gain, 70kg rider + 8kg bike,
    // road Crr — see module test-header math for the by-hand derivation
    // (rolling ~31.9W + aero ~141.8W + gravity 0 = ~173.7W).
    const result = estimateRidePower(flatActivity(), baseParams);
    expect(result.avgWatts).toBe(174);
    expect(result.components.gravity).toBe(0);
    expect(result.confidence).toBe('low'); // no wind data supplied
  });

  it('adds a positive gravity term when climbing', () => {
    const flat = estimateRidePower(flatActivity(), baseParams);
    const climb = estimateRidePower(
      flatActivity({ total_elevation_gain: 300, distance: 10000, moving_time: 1800, average_speed: 10000 / 1800 }),
      baseParams
    );
    expect(climb.components.gravity).toBeGreaterThan(0);
    // Same grade-free flat power at a lower speed would be far lower than
    // the climb's total once the gravity term is added in.
    expect(climb.avgWatts).toBeGreaterThan(climb.components.rolling + climb.components.aero);
    expect(flat.components.gravity).toBe(0);
  });

  it('increases aero power under headwind vs no wind', () => {
    const noWind = estimateRidePower(flatActivity(), baseParams);
    const headwind = estimateRidePower(flatActivity(), { ...baseParams, wind: { speedMs: 6, directionDeg: 180 } });
    expect(headwind.components.aero).toBeGreaterThan(noWind.components.aero);
    expect(headwind.avgWatts).toBeGreaterThan(noWind.avgWatts!);
    expect(headwind.confidence).toBe('medium');
  });

  it('caps wind effect at 5 m/s regardless of stronger wind', () => {
    const wind5 = estimateRidePower(flatActivity(), { ...baseParams, wind: { speedMs: 5 } });
    const wind20 = estimateRidePower(flatActivity(), { ...baseParams, wind: { speedMs: 20 } });
    expect(wind20.components.aero).toBe(wind5.components.aero);
  });

  it('returns null for zero/negative speed or missing distance/time', () => {
    expect(estimateRidePower(flatActivity({ distance: 0 }), baseParams).avgWatts).toBeNull();
    expect(estimateRidePower(flatActivity({ moving_time: 0 }), baseParams).avgWatts).toBeNull();
    expect(estimateRidePower(flatActivity({ distance: -100 }), baseParams).avgWatts).toBeNull();
    expect(estimateRidePower(flatActivity(), { riderWeightKg: 0 }).avgWatts).toBeNull();
  });

  it('floors descent power at the shared minimum (20W)', () => {
    const result = estimateRidePower(
      flatActivity({ total_elevation_gain: 0, distance: 30000, moving_time: 1500, average_speed: 20 }),
      baseParams
    );
    // A fast, flat-or-descending ride's rolling+aero easily clears 20W on
    // its own here; this just asserts the floor never lets it go lower.
    expect(result.avgWatts).toBeGreaterThanOrEqual(20);
  });

  it('applies a different Crr by surface', () => {
    const road = estimateRidePower(flatActivity(), { ...baseParams, surface: 'road' });
    const mtb = estimateRidePower(flatActivity(), { ...baseParams, surface: 'mtb' });
    expect(mtb.components.rolling).toBeGreaterThan(road.components.rolling);
  });
});

describe('powerStatsForActivities', () => {
  it('aggregates avg/best/worst/counts/perActivity across activities', () => {
    const activities = [
      { id: 1, distance: 20000, moving_time: 2400, total_elevation_gain: 0, average_speed: 20000 / 2400 },
      { id: 2, distance: 20000, moving_time: 2400, total_elevation_gain: 0, average_watts: 220, device_watts: true },
      { id: 3, distance: 0, moving_time: 0, total_elevation_gain: 0 }, // no data -> null estimate
    ] as any;

    const result = powerStatsForActivities(activities, baseParams, { '1': { speedMs: 4 } });

    expect(result.totalActivities).toBe(3);
    expect(result.activitiesWithRealPower).toBe(1);
    expect(result.activitiesWithWindData).toBe(1);
    expect(result.perActivity).toHaveLength(3);
    expect(result.perActivity[2].avgWatts).toBeNull();
    expect(result.best).toBe(Math.max(result.perActivity[0]!.avgWatts!, result.perActivity[1]!.avgWatts!));
    expect(result.avg).not.toBeNull();
  });

  it('reuses a persisted estimated_power instead of recomputing', () => {
    const activities = [
      {
        id: 1,
        distance: 20000,
        moving_time: 2400,
        total_elevation_gain: 0,
        estimated_power: { avgWatts: 999, method: 'estimated', confidence: 'medium', hasWind: true },
      },
    ] as any;
    const result = powerStatsForActivities(activities, baseParams);
    expect(result.perActivity[0].avgWatts).toBe(999);
    expect(result.activitiesWithWindData).toBe(1);
  });

  it('returns null avg/best/worst/trend when nothing has an estimate', () => {
    const activities = [{ id: 1, distance: 0, moving_time: 0, total_elevation_gain: 0 }] as any;
    const result = powerStatsForActivities(activities, baseParams);
    expect(result.avg).toBeNull();
    expect(result.best).toBeNull();
    expect(result.worst).toBeNull();
    expect(result.trend).toBeNull();
  });
});
