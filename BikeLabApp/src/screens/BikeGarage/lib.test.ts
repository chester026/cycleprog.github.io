import {
  computeCardWidth,
  resolveComponentGroups,
  bikeDisplayName,
  rankRidingStyle,
  STATUS_TINT,
  GAUGE_CIRCUMFERENCE,
  MAX_INITIAL_KM,
  parseInitialKm,
} from './lib';
import type {ComponentHealth} from './types';

function comp(id: string, overrides: Partial<ComponentHealth> = {}): ComponentHealth {
  return {
    id,
    healthPercent: 80,
    kmSinceReset: 100,
    effectiveKm: 100,
    baseLifecycle: 1000,
    remainingKm: 900,
    status: 'good',
    weightFactor: 1,
    styleFactor: 1,
    lastResetAt: null,
    lastResetKm: 0,
    initialKm: 0,
    ...overrides,
  };
}

describe('computeCardWidth', () => {
  it('divides available width (minus padding/gaps) into 3 equal cards', () => {
    // (390 - 32 - 6*2) / 3
    expect(computeCardWidth(390)).toBeCloseTo((390 - 32 - 12) / 3);
  });
});

describe('resolveComponentGroups', () => {
  it('resolves each group to the matching components, preserving group order', () => {
    const components = [comp('tires'), comp('chain'), comp('rotors')];
    const groups = resolveComponentGroups(components);
    expect(groups.map(g => g.key)).toEqual(['drivetrain', 'brakes', 'wheels']);
    expect(groups[0].items.map(c => c.id)).toEqual(['chain']);
    expect(groups[1].items.map(c => c.id)).toEqual(['rotors']);
    expect(groups[2].items.map(c => c.id)).toEqual(['tires']);
  });

  it('drops groups with no matching components', () => {
    const groups = resolveComponentGroups([comp('chain')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('drivetrain');
  });

  it('returns an empty array when nothing matches', () => {
    expect(resolveComponentGroups([])).toEqual([]);
  });
});

describe('bikeDisplayName', () => {
  it('prefers "brand model" when both are set', () => {
    expect(bikeDisplayName({brand_name: 'Trek', model_name: 'Domane', name: 'My bike'})).toBe(
      'Trek Domane',
    );
  });

  it('falls back to name when brand or model is missing', () => {
    expect(bikeDisplayName({brand_name: null, model_name: null, name: 'My bike'})).toBe('My bike');
    expect(bikeDisplayName({brand_name: 'Trek', model_name: null, name: 'My bike'})).toBe(
      'My bike',
    );
  });
});

describe('rankRidingStyle', () => {
  it('sorts highest value first', () => {
    const ranked = rankRidingStyle(
      {climbing: 40, sprint: 90, power: 60},
      {climbing: 'Climbing', sprint: 'Sprint', power: 'Power'},
    );
    expect(ranked.map(r => r.key)).toEqual(['sprint', 'power', 'climbing']);
  });
});

describe('constants', () => {
  it('STATUS_TINT covers every status', () => {
    expect(Object.keys(STATUS_TINT).sort()).toEqual(
      ['attention', 'critical', 'good', 'warning'].sort(),
    );
  });

  it('GAUGE_CIRCUMFERENCE is 2*pi*radius', () => {
    expect(GAUGE_CIRCUMFERENCE).toBeGreaterThan(0);
  });
});

describe('parseInitialKm', () => {
  it('reads plain and grouped numbers', () => {
    expect(parseInitialKm('15000')).toBe(15000);
    expect(parseInitialKm('15 000')).toBe(15000);
    expect(parseInitialKm('1,250')).toBe(1250);
  });

  it('treats blank, negative and garbage as 0', () => {
    expect(parseInitialKm('')).toBe(0);
    expect(parseInitialKm('-5')).toBe(0);
    expect(parseInitialKm('abc')).toBe(0);
  });

  it('is not capped by the bike total, only by the API bound', () => {
    expect(parseInitialKm('150000')).toBe(150000);
    expect(parseInitialKm('999999')).toBe(MAX_INITIAL_KM);
  });
});
