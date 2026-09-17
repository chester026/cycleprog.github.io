// Proves the app resolves @bikelab/shared (built dist via node_modules symlink)
// under Jest, and that shared calc helpers behave as the app expects.
import {msToKmh} from '@bikelab/shared/calc';
import {computeHrZones, zoneForHr} from '@bikelab/shared/calc';

describe('@bikelab/shared from the app', () => {
  it('converts m/s to km/h', () => {
    expect(msToKmh(10)).toBeCloseTo(36);
  });

  it('computes 5 contiguous HR zones with Karvonen when max and resting HR are known', () => {
    const z = computeHrZones({max_hr: 190, resting_hr: 50});
    expect(z.method).toBe('karvonen');
    expect(z.zones).toHaveLength(5);
    expect(z.zones[0].min).toBeLessThan(z.zones[4].min);
    expect(zoneForHr(z.zones, 140)).toBeGreaterThanOrEqual(1);
  });
});
