const { bootstrap } = require('./setup');

// S-36 (docs/audit/00-AUDIT-AND-PLAN.md): migrations/1758000000005_indexes.sql
// adds the indexes the audit found missing for hot lookups (see that
// migration's header for which existing indexes were checked and why they
// don't already cover these column pairs). `bootstrap()` runs every real
// migration against the scratch DB before returning, so by the time this
// test runs these indexes exist exactly like they would in any other
// environment migrate.js has touched — this just confirms pg_indexes agrees.
describe('S-36 indexes (migrations/1758000000005_indexes.sql)', () => {
  let pool;

  beforeAll(async () => {
    ({ pool } = await bootstrap());
  }, 30000);

  it.each([
    ['users', 'idx_users_verification_token'],
    ['activity_meta_goals_progress', 'idx_activity_meta_progress_user_activity'],
    ['analytics_snapshots', 'idx_analytics_snapshots_user_last_activity'],
  ])('%s has index %s', async (tablename, indexname) => {
    const res = await pool.query(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1 AND indexname = $2`,
      [tablename, indexname]
    );
    expect(res.rows).toHaveLength(1);
  });

  it('idx_activity_meta_progress_user_activity actually indexes (user_id, activity_id) — not just present by name', async () => {
    const res = await pool.query(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
      ['idx_activity_meta_progress_user_activity']
    );
    expect(res.rows[0].indexdef).toMatch(/\(user_id, activity_id\)/);
  });

  it('idx_analytics_snapshots_user_last_activity actually indexes (user_id, last_activity_id)', async () => {
    const res = await pool.query(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
      ['idx_analytics_snapshots_user_last_activity']
    );
    expect(res.rows[0].indexdef).toMatch(/\(user_id, last_activity_id\)/);
  });

  it('idx_users_verification_token actually indexes (verification_token)', async () => {
    const res = await pool.query(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
      ['idx_users_verification_token']
    );
    expect(res.rows[0].indexdef).toMatch(/\(verification_token\)/);
  });
});
