import { describe, expect, it } from 'vitest';
import { garmin, GarminHomeResponseSchema } from './garmin.js';

describe('garmin contract', () => {
  it('pairStart: body requires device_id, device_name optional', () => {
    expect(garmin.pairStart.body.safeParse({}).success).toBe(false);
    expect(garmin.pairStart.body.safeParse({ device_id: 'abc' }).success).toBe(true);
    expect(garmin.pairStart.body.safeParse({ device_id: 'abc', device_name: 'Edge 1040' }).success).toBe(true);
  });

  it('pairStart: response is a 6-digit code + poll_key + expires_in', () => {
    expect(garmin.pairStart.response.safeParse({ code: '482913', poll_key: 'k', expires_in: 600 }).success).toBe(true);
    expect(garmin.pairStart.response.safeParse({ code: '4829', poll_key: 'k', expires_in: 600 }).success).toBe(false);
  });

  it('pairConfirm: trims and requires 6 digits', () => {
    expect(garmin.pairConfirm.body.safeParse({ code: ' 482913 ' }).success).toBe(true);
    expect(garmin.pairConfirm.body.safeParse({ code: '48291' }).success).toBe(false);
    expect(garmin.pairConfirm.body.safeParse({ code: 'abcdef' }).success).toBe(false);
  });

  it('pairPoll: response is pending or ok+token', () => {
    expect(garmin.pairPoll.response.safeParse({ status: 'pending' }).success).toBe(true);
    expect(garmin.pairPoll.response.safeParse({ status: 'ok', token: 'jwt' }).success).toBe(true);
    expect(garmin.pairPoll.response.safeParse({ status: 'ok' }).success).toBe(false);
  });

  it('home: accepts a full payload and a user with no last ride', () => {
    const full = {
      v: 1,
      at: '2026-10-22T09:12:00.000Z',
      goals: [
        {
          id: 12,
          t: 'Everest this season',
          pct: 41,
          days: 38,
          ok: true,
          subs: [{ t: 'Elevation', cur: 3400, tgt: 8848, u: 'm', pct: 38, d: -9 }],
        },
      ],
      last: {
        id: '123',
        n: 'Morning Ride',
        d: '2026-10-21',
        km: 42.3,
        m: 850,
        min: 95,
        impact: [{ id: 12, pct: 41, gain: 4, c: [{ l: 'Elevation', v: '+850 m' }] }],
      },
    };
    expect(GarminHomeResponseSchema.safeParse(full).success).toBe(true);
    const withBike = {
      ...full,
      bike: {
        n: 'Canyon Aeroad',
        km: 8420,
        r: 214,
        h: 71,
        next: { c: 'Chain', km: 420 },
        parts: [{ c: 'Chain', pct: 7, km: 420, s: 'critical' }],
      },
    };
    expect(GarminHomeResponseSchema.safeParse(withBike).success).toBe(true);
    expect(GarminHomeResponseSchema.safeParse({ ...full, bike: null }).success).toBe(true);
    expect(GarminHomeResponseSchema.safeParse({ v: 1, at: 'x', goals: [], last: null }).success).toBe(true);
    expect(GarminHomeResponseSchema.safeParse({ v: 2, at: 'x', goals: [], last: null }).success).toBe(false);
  });

  it('device-only endpoints are marked auth and have no body', () => {
    expect(garmin.home.auth).toBe(true);
    expect(garmin.unpair.auth).toBe(true);
    expect(garmin.pairStart.auth).toBe(false);
    expect(garmin.pairPoll.auth).toBe(false);
  });
});
