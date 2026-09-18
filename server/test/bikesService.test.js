// Unit tests for services/bikes.js (T-4.1 domain extraction) — pure
// functions moved verbatim out of server.js's bike-health route. Fixed
// inputs -> fixed outputs, snapshotting the current math (not re-deriving
// it) per the extraction guide.
const bikesService = require('../services/bikes');

describe('services/bikes computeRidingStyle', () => {
  it('returns all-zero for no activities', () => {
    expect(bikesService.computeRidingStyle([])).toEqual({ climbing: 0, sprint: 0, power: 0 });
    expect(bikesService.computeRidingStyle(null)).toEqual({ climbing: 0, sprint: 0, power: 0 });
  });

  it('computes climbing/sprint/power scores for a fixed set of activities', () => {
    const activities = [
      { total_elevation_gain: 800, distance: 40000, average_speed: 6, max_speed: 10, average_watts: 150 },
      { total_elevation_gain: 1200, distance: 50000, average_speed: 7, max_speed: 11, average_watts: 180 },
      { total_elevation_gain: 100, distance: 30000, average_speed: 9, max_speed: 18, average_watts: 220 },
      { total_elevation_gain: 50, distance: 25000, average_speed: 10, max_speed: 20, average_watts: 250 },
    ];

    expect(bikesService.computeRidingStyle(activities)).toEqual({ climbing: 64, sprint: 100, power: 55 });
  });
});

describe('services/bikes computeStyleFactor', () => {
  const ridingStyle = { climbing: 40, sprint: 60, power: 50 };

  it('returns the fixed per-component formula for known components', () => {
    expect(bikesService.computeStyleFactor('chain', ridingStyle)).toBeCloseTo(1.22);
    expect(bikesService.computeStyleFactor('cassette', ridingStyle)).toBeCloseTo(1.45);
    expect(bikesService.computeStyleFactor('chainrings', ridingStyle)).toBeCloseTo(1.27);
    expect(bikesService.computeStyleFactor('brake_pads', ridingStyle)).toBeCloseTo(1.32);
    expect(bikesService.computeStyleFactor('rotors', ridingStyle)).toBeCloseTo(1.2);
    expect(bikesService.computeStyleFactor('tires', ridingStyle)).toBeCloseTo(1.06);
    expect(bikesService.computeStyleFactor('wheel_bearings', ridingStyle)).toBeCloseTo(1.09);
  });

  it('defaults to 1.0 for components with no style factor (bar_tape, saddle, unknown)', () => {
    expect(bikesService.computeStyleFactor('bar_tape', ridingStyle)).toBe(1.0);
    expect(bikesService.computeStyleFactor('saddle', ridingStyle)).toBe(1.0);
    expect(bikesService.computeStyleFactor('unknown_component', ridingStyle)).toBe(1.0);
  });
});

describe('services/bikes getHealthStatus', () => {
  it('buckets health percent into the 4 fixed statuses', () => {
    expect(bikesService.getHealthStatus(100)).toBe('good');
    expect(bikesService.getHealthStatus(41)).toBe('good');
    expect(bikesService.getHealthStatus(40)).toBe('warning');
    expect(bikesService.getHealthStatus(26)).toBe('warning');
    expect(bikesService.getHealthStatus(25)).toBe('attention');
    expect(bikesService.getHealthStatus(16)).toBe('attention');
    expect(bikesService.getHealthStatus(15)).toBe('critical');
    expect(bikesService.getHealthStatus(0)).toBe('critical');
  });
});

describe('services/bikes computeComponentHealth', () => {
  it('computes per-component wear, overall health and next service for a fixed scenario', () => {
    const result = bikesService.computeComponentHealth({
      gearTotalKm: 3000,
      riderWeight: 75,
      ridingStyle: { climbing: 40, sprint: 60, power: 50 },
      resets: {
        chain: { resetAt: '2026-01-01T00:00:00Z', resetKm: 1000 },
      },
    });

    expect(result.components).toHaveLength(bikesService.BIKE_COMPONENTS.length);

    const chain = result.components.find((c) => c.id === 'chain');
    expect(chain).toMatchObject({
      id: 'chain',
      kmSinceReset: 2000,
      weightFactor: 1,
      styleFactor: 1.22,
      lastResetKm: 1000,
    });
    expect(chain.effectiveKm).toBe(Math.round(2000 * 1 * 1.22));
    expect(chain.healthPercent).toBe(
      Math.max(0, Math.round(100 - (chain.effectiveKm / chain.baseLifecycle) * 100))
    );
    expect(chain.status).toBe(bikesService.getHealthStatus(chain.healthPercent));

    const saddle = result.components.find((c) => c.id === 'saddle');
    expect(saddle.kmSinceReset).toBe(3000); // no reset for this component
    expect(saddle.styleFactor).toBe(1);
    expect(saddle.lastResetKm).toBe(0);
    expect(saddle.lastResetAt).toBeNull();

    expect(result.overallHealth).toBe(
      Math.round(result.components.reduce((s, c) => s + c.healthPercent, 0) / result.components.length)
    );
    const nearest = result.components.reduce((min, c) => (c.remainingKm < min.remainingKm ? c : min), result.components[0]);
    expect(result.nextService).toEqual({ component: nearest.id, inKm: nearest.remainingKm });
  });
});
