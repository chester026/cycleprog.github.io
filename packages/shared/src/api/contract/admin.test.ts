import { describe, it, expect } from 'vitest';
import { admin } from './admin.js';

describe('admin contract', () => {
  it('syncStatus: accepts totals + per-user rows + strava_limits', () => {
    const r = admin.syncStatus.response.safeParse({
      totals: { activities: 10, without_raw: 2, table_size: '128 kB' },
      users: [{ user_id: 1, email: 'a@b.com', activities: 5, without_raw: 0, last_activity: '2026-01-01', last_synced_at: '2026-01-02' }],
      strava_limits: { limit15min: 100, limitDay: 1000, usage15min: 1, usageDay: 2, lastUpdate: '2026-01-01T00:00:00.000Z' },
    });
    expect(r.success).toBe(true);
  });

  it('stravaLimits: accepts the always-present shape', () => {
    expect(
      admin.stravaLimits.response.safeParse({ limit15min: null, limitDay: null, usage15min: null, usageDay: null, lastUpdate: null }).success
    ).toBe(true);
  });

  it('listUsers: accepts admin-listed user rows', () => {
    const r = admin.listUsers.response.safeParse({
      users: [{ id: 1, email: 'a@b.com', email_verified: true, strava_id: null, has_strava_token: false, created_at: '2026-01-01' }],
    });
    expect(r.success).toBe(true);
  });

  it('unlinkUserStrava/removeUser: coerce a string :userId route param to a number', () => {
    expect(admin.unlinkUserStrava.params!.safeParse({ userId: '42' })).toEqual(
      expect.objectContaining({ success: true, data: { userId: 42 } })
    );
    expect(admin.removeUser.response.safeParse({ success: true, message: 'Пользователь удален', deletedRecords: { users: 1, rides: 3 } }).success).toBe(
      true
    );
  });

  it('aiUsage: accepts {days, users[]} and coerces the days query', () => {
    expect(admin.aiUsage.response.safeParse({ days: 7, users: [{ user_id: 1, total_tokens: 500 }] }).success).toBe(true);
    expect(admin.aiUsage.query!.safeParse({ days: '30' })).toEqual(expect.objectContaining({ success: true, data: { days: 30 } }));
  });
});
