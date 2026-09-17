import { describe, expect, it } from 'vitest';
import { BIKE_COMPONENTS, COMPONENT_GROUPS, COMPONENT_LABELS, GROUP_LABELS } from './bikeComponents.js';

describe('BIKE_COMPONENTS', () => {
  it('has the 12 components from server.js with their base lifecycle in km', () => {
    expect(BIKE_COMPONENTS).toHaveLength(12);
    expect(BIKE_COMPONENTS.find((c) => c.id === 'chain')?.baseLifecycle).toBe(6000);
    expect(BIKE_COMPONENTS.find((c) => c.id === 'saddle')?.baseLifecycle).toBe(25000);
  });

  it('has unique ids', () => {
    const ids = BIKE_COMPONENTS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('COMPONENT_LABELS / COMPONENT_GROUPS', () => {
  it('has a label for every component', () => {
    for (const c of BIKE_COMPONENTS) {
      expect(COMPONENT_LABELS[c.id]).toBeTruthy();
    }
  });

  it('groups every component exactly once', () => {
    const grouped = COMPONENT_GROUPS.flatMap((g) => g.ids);
    expect(grouped.sort()).toEqual(BIKE_COMPONENTS.map((c) => c.id).sort());
    for (const g of COMPONENT_GROUPS) {
      expect(GROUP_LABELS[g.key]).toBeTruthy();
    }
  });
});
