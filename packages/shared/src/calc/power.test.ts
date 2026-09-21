import { describe, expect, it } from 'vitest';
import { calculateAirDensity, estimateRidePower, powerStatsForActivities, ridePowerWatts } from './power.js';

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

describe('calculateAirDensity', () => {
  it('uses the given temperature (converted to Kelvin) and elevation (barometric formula)', () => {
    // tempK = 20+273.15 = 293.15, pressureAtHeight = 101325*exp(-1000/7400), R=287.05.
    const expected = (101325 * Math.exp(-1000 / 7400)) / (287.05 * 293.15);
    expect(calculateAirDensity(20, 1000)).toBeCloseTo(expected, 10);
  });

  it('defaults temperature to 15C and elevation to 0 when both are null/undefined', () => {
    const expected = 101325 / (287.05 * 288.15);
    expect(calculateAirDensity(null, null)).toBeCloseTo(expected, 10);
    expect(calculateAirDensity(undefined, undefined)).toBeCloseTo(expected, 10);
  });

  it('treats temperatureC: 0 as a real (falsy but non-null) value, not "missing"', () => {
    const expected = 101325 / (287.05 * 273.15);
    expect(calculateAirDensity(0, 0)).toBeCloseTo(expected, 10);
  });
});

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

  it('returns null when the computed power is not physically plausible (e.g. an absurd speed)', () => {
    // distance/time combination implies an enormous average speed, which
    // cubes into an aero term far above MAX_PLAUSIBLE_WATTS (10000W).
    const activity = flatActivity({ distance: 1_000_000, moving_time: 1, total_elevation_gain: 0 });
    const result = estimateRidePower(activity, baseParams);
    expect(result.avgWatts).toBeNull();
    expect(result.confidence).toBe('low');
    expect(result.method).toBe('estimated');
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

  it('leaves trend null with fewer than 4 estimated activities', () => {
    const activities = [
      { id: 1, distance: 20000, moving_time: 2400, total_elevation_gain: 0 },
      { id: 2, distance: 20000, moving_time: 2400, total_elevation_gain: 0 },
      { id: 3, distance: 20000, moving_time: 2400, total_elevation_gain: 0 },
    ] as any;
    const result = powerStatsForActivities(activities, baseParams);
    expect(result.trend).toBeNull();
  });

  it('computes trend (newer half avg - older half avg) once there are >=4 estimated activities', () => {
    // 4 identical flat rides -> newer-half avg === older-half avg -> trend 0.
    const activities = Array.from({ length: 4 }, (_, i) => ({
      id: i + 1,
      distance: 20000,
      moving_time: 2400,
      total_elevation_gain: 0,
    })) as any;
    const result = powerStatsForActivities(activities, baseParams);
    expect(result.trend).toBe(0);
  });

  it('computes a nonzero trend when newer activities differ from older ones', () => {
    const activities = [
      { id: 1, distance: 20000, moving_time: 2400, total_elevation_gain: 0, average_watts: 300, device_watts: true },
      { id: 2, distance: 20000, moving_time: 2400, total_elevation_gain: 0, average_watts: 300, device_watts: true },
      { id: 3, distance: 20000, moving_time: 2400, total_elevation_gain: 0, average_watts: 200, device_watts: true },
      { id: 4, distance: 20000, moving_time: 2400, total_elevation_gain: 0, average_watts: 200, device_watts: true },
    ] as any;
    const result = powerStatsForActivities(activities, baseParams);
    // newer half (idx 0-1): avg 300; older half (idx 2-3): avg 200 -> trend +100.
    expect(result.trend).toBe(100);
  });
});

describe('ridePowerWatts', () => {
  it('prefers the persisted estimate, whether measured or estimated', () => {
    expect(ridePowerWatts({ estimated_power: { avgWatts: 210, method: 'estimated', confidence: 'medium' }, average_watts: 90 })).toBe(210);
    expect(ridePowerWatts({ estimated_power: { avgWatts: 245, method: 'measured', confidence: 'high' }, average_watts: 245 })).toBe(245);
  });

  it('falls back to weighted, then raw watts, only when there is no estimate', () => {
    expect(ridePowerWatts({ weighted_average_watts: 180, average_watts: 150 })).toBe(180);
    expect(ridePowerWatts({ average_watts: 150 })).toBe(150);
  });

  it('treats a null/zero estimate as absent rather than as 0 W', () => {
    expect(ridePowerWatts({ estimated_power: { avgWatts: null, method: 'estimated', confidence: 'low' }, average_watts: 150 })).toBe(150);
    expect(ridePowerWatts({ estimated_power: { avgWatts: 0, method: 'estimated', confidence: 'low' }, average_watts: 150 })).toBe(150);
  });

  it('returns null when the ride has no power of any kind', () => {
    expect(ridePowerWatts({})).toBeNull();
    expect(ridePowerWatts({ average_watts: 0 })).toBeNull();
    expect(ridePowerWatts(null)).toBeNull();
    expect(ridePowerWatts(undefined)).toBeNull();
  });
});
