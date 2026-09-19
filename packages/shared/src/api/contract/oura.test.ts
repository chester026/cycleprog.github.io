import { describe, it, expect } from 'vitest';
import { oura } from './oura.js';

describe('oura contract', () => {
  it('status: accepts connected=false with latest=null', () => {
    expect(oura.status.response.safeParse({ connected: false, ouraUserId: null, latest: null }).success).toBe(true);
  });

  it('status: accepts a full latest day with coerced-to-number NUMERIC fields', () => {
    const r = oura.status.response.safeParse({
      connected: true,
      ouraUserId: 'oura-user-1',
      latest: {
        day: '2026-01-01',
        readiness_score: 70,
        sleep_score: 80,
        activity_score: 90,
        total_sleep_hours: 7,
        average_hrv: 55,
        resting_heart_rate: 50,
        min_heart_rate: 45,
        stress_high_seconds: 100,
        stress_recovery_high_seconds: 200,
        stress_day_summary: 'normal',
        resilience_level: 'solid',
        resilience_sleep_recovery: 1.2,
        resilience_daytime_recovery: 3.4,
        resilience_stress: 5.6,
        spo2_average: 97.5,
        breathing_disturbance_index: 1,
      },
    });
    expect(r.success).toBe(true);
  });

  it('sync: accepts the not-connected short-circuit and the normal batch result', () => {
    expect(oura.sync.response.safeParse({ synced: 0, note: 'Oura not connected' }).success).toBe(true);
    expect(oura.sync.response.safeParse({ synced: 3, days: ['2026-01-01', '2026-01-02', '2026-01-03'] }).success).toBe(true);
  });

  it('connectState/unlink: accept their small payloads', () => {
    expect(oura.connectState.response.safeParse({ authUrl: 'https://cloud.ouraring.com/oauth/authorize?x=1' }).success).toBe(true);
    expect(oura.unlink.response.safeParse({ ok: true }).success).toBe(true);
  });
});
