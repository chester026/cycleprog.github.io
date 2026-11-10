import { describe, expect, it } from 'vitest';
import { garmin, GarminHomeResponseSchema, GARMIN_BLOCK_KINDS, GARMIN_TARGET_UNITS } from './garmin.js';

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
  it('week: from is a date; days carry sessions with a positional profile', () => {
    expect(garmin.week.query.safeParse({ from: '2026-11-10' }).success).toBe(true);
    expect(garmin.week.query.safeParse({ from: '10.11.2026' }).success).toBe(false);
    expect(garmin.week.query.safeParse({}).success).toBe(false);

    const week = {
      v: 1,
      from: '2026-11-10',
      days: [
        {
          d: '2026-11-11',
          ev: [
            { id: 812, t: '25 min threshold @ 170–180 W', min: 65, done: false, u: 'a1b2c3d4', b: [[900, 2, 0], [1500, 4, 1], [600, 1, 0]] },
            { id: 813, t: 'Easy spin', min: 0, done: true, u: '00000000', b: [] },
          ],
        },
      ],
    };
    expect(garmin.week.response.safeParse(week).success).toBe(true);
    expect(garmin.week.response.safeParse({ v: 1, from: '2026-11-10', days: [] }).success).toBe(true);
    // A null inside a block would shift positions on the device.
    const broken = structuredClone(week) as any;
    broken.days[0].ev[0].b[0] = [900, null, 0];
    expect(garmin.week.response.safeParse(broken).success).toBe(false);
  });

  it('session: numeric id; blocks are eleven positional values with no nulls', () => {
    expect(garmin.session.params.safeParse({ id: '812' }).data).toEqual({ id: 812 });
    expect(garmin.session.params.safeParse({ id: 'abc' }).success).toBe(false);
    expect(GARMIN_BLOCK_KINDS.indexOf('recovery')).toBe(2);
    expect(GARMIN_TARGET_UNITS.indexOf('bpm')).toBe(2);

    const session = {
      v: 1,
      id: 812,
      t: '3×8′ @ 240–250 W',
      d: '2026-11-11',
      min: 61,
      done: false,
      u: 'a1b2c3d4',
      b: [
        [900, 2, 0, 0, 0, 0, 0, 0, 0, 0, 'Easy spin.'],
        [480, 4, 1, 1, 3, 1, 240, 250, 85, 95, 'Hold the watts.'],
        [240, 1, 2, 1, 3, 0, 0, 0, 0, 0, ''],
      ],
    };
    expect(garmin.session.response.safeParse(session).success).toBe(true);
    const broken = structuredClone(session) as any;
    broken.b[2][10] = null;
    expect(garmin.session.response.safeParse(broken).success).toBe(false);
  });
});
