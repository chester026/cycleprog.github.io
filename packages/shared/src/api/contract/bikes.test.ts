import { describe, expect, it } from 'vitest';
import { bikes } from './bikes.js';

describe('bikes contract', () => {
  it('list: response accepts a real GET /api/bikes array', () => {
    const r = bikes.list.response.safeParse([
      { id: 'b1234', name: 'Tarmac', distance: 5000000, distanceKm: 5000, primary: true, activitiesCount: 42 },
    ]);
    expect(r.success).toBe(true);
  });

  it('list: response accepts [] (Strava not linked)', () => {
    expect(bikes.list.response.safeParse([]).success).toBe(true);
  });

  it('health: response accepts a real handler payload, including the description-less riderProfile fallback', () => {
    const r = bikes.health.response.safeParse({
      bikeId: 'b1234',
      totalKm: 5000,
      riderWeight: 75,
      ridingStyle: { climbing: 0, sprint: 0, power: 0 },
      riderProfile: { profile: 'Unknown', emoji: '❓' }, // no `description` — see route fallback
      components: [
        {
          id: 'chain',
          healthPercent: 80,
          kmSinceReset: 500,
          effectiveKm: 500,
          baseLifecycle: 3000,
          remainingKm: 2500,
          status: 'good',
          weightFactor: 1,
          styleFactor: 1,
          lastResetAt: new Date('2026-01-01T00:00:00Z'),
          lastResetKm: 0,
        },
      ],
      overallHealth: 80,
      nextService: { component: 'chain', inKm: 2500 },
      onboardingCompleted: true,
      groupLabels: { wheels: 'Hunt' },
      componentLabels: { tires: 'Conti GP5000' },
    });
    expect(r.success).toBe(true);
  });

  it('updateLabels: body rejects an invalid target_type', () => {
    const r = bikes.updateLabels.body.safeParse({
      labels: [{ target_type: 'wheelset', target_key: 'wheels', custom_name: 'Hunt' }],
    });
    expect(r.success).toBe(false);
  });

  it('resetComponent: response accepts { success, component, resetKm }', () => {
    expect(
      bikes.resetComponent.response.safeParse({ success: true, component: 'chain', resetKm: 1200 }).success
    ).toBe(true);
  });
});
