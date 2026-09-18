// Unit test for the pure grouping helper aiCoach.js extracted out of
// get_goals_progress's N+1 fix (S-35, docs/audit/00-AUDIT-AND-PLAN.md):
// what used to be one `SELECT * FROM goals WHERE meta_goal_id = $1` per
// meta-goal is now a single `= ANY($1::int[])` query, grouped back into
// per-meta-goal arrays by this function. No database needed here — the
// full tool-call path (real Postgres, real grouping + priority ordering)
// is covered by test/integration/coach.test.js.
const createCoachModule = require('../aiCoach');
const { groupGoalsByMetaGoal } = createCoachModule;

describe('aiCoach groupGoalsByMetaGoal', () => {
  it('groups a flat goals result set by meta_goal_id, preserving row order within each group', () => {
    const rows = [
      { id: 1, meta_goal_id: 10, priority: 1 },
      { id: 2, meta_goal_id: 10, priority: 2 },
      { id: 3, meta_goal_id: 20, priority: 1 },
      { id: 4, meta_goal_id: 10, priority: 3 },
    ];
    const grouped = groupGoalsByMetaGoal(rows);
    expect(grouped.get(10).map((g) => g.id)).toEqual([1, 2, 4]);
    expect(grouped.get(20).map((g) => g.id)).toEqual([3]);
    expect(grouped.has(30)).toBe(false);
  });

  it('returns an empty map for no rows', () => {
    expect(groupGoalsByMetaGoal([]).size).toBe(0);
    expect(groupGoalsByMetaGoal(undefined).size).toBe(0);
  });

  it('a meta-goal with no sub-goals is simply absent from the map (caller falls back to [])', () => {
    const grouped = groupGoalsByMetaGoal([{ id: 1, meta_goal_id: 10, priority: 1 }]);
    expect(grouped.get(999)).toBeUndefined();
  });
});
