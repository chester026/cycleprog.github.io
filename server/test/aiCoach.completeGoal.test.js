// complete_goal coach tool: delegates to services/goals.completeMetaGoal (the
// SQL and validation live there — covered on real Postgres by
// test/integration/metaGoalRides.test.js) and shapes the result for the app's
// ChatMessageBubble (`tc.name === 'complete_goal' && tc.result?.completed`).
// Same stubbing convention as aiCoach.memory.test.js: patch the service
// module's property before requiring aiCoach.
const goalsService = require('../services/goals');
const completeMetaGoalMock = vi.fn();
goalsService.completeMetaGoal = completeMetaGoalMock;

const { ApiError } = require('../lib/apiError');
const createCoachModule = require('../aiCoach');

describe('aiCoach complete_goal', () => {
  let coach;
  const userId = 7;

  beforeEach(() => {
    vi.clearAllMocks();
    coach = createCoachModule({
      pool: { query: vi.fn() },
      activitiesCache: { get: vi.fn() },
      bikesCache: { get: vi.fn() },
      getBikeComponents: () => [],
    });
  });

  it('is offered to the model and update_goal points at it', () => {
    const names = coach.TOOLS.map((t) => t.function.name);
    expect(names).toContain('complete_goal');
    const update = coach.TOOLS.find((t) => t.function.name === 'update_goal');
    expect(update.function.description).toContain('complete_goal');
  });

  it('completes the goal with the ride ids and returns {completed, goal, rides}', async () => {
    const rides = [{ strava_id: 501, name: 'Garda loop', distance: 142000 }];
    completeMetaGoalMock.mockResolvedValue({
      id: 3, user_id: userId, title: 'Half of Island', status: 'completed', target_date: '2026-10-03',
      completed_at: '2026-10-03T05:00:00.000Z', ai_context: 'x', rides,
    });

    const result = await coach.executeTool('complete_goal', { goal_id: 3, activity_ids: [501] }, { userId });

    expect(completeMetaGoalMock).toHaveBeenCalledWith(userId, 3, { activity_ids: [501] });
    expect(result).toEqual({
      completed: true,
      goal: { id: 3, title: 'Half of Island', status: 'completed', target_date: '2026-10-03', completed_at: '2026-10-03T05:00:00.000Z' },
      rides,
    });
  });

  it('returns {error} instead of throwing when the service rejects the ride or goal', async () => {
    completeMetaGoalMock.mockRejectedValue(new ApiError(400, 'UNKNOWN_ACTIVITY', 'Not your synced rides: 999'));
    const result = await coach.executeTool('complete_goal', { goal_id: 3, activity_ids: [999] }, { userId });
    expect(result).toEqual({ error: 'Not your synced rides: 999' });
    expect(result.completed).toBeUndefined();
  });

  it('rethrows unexpected failures and requires goal_id', async () => {
    completeMetaGoalMock.mockRejectedValue(new Error('db down'));
    await expect(coach.executeTool('complete_goal', { goal_id: 3 }, { userId })).rejects.toThrow('db down');
    await expect(coach.executeTool('complete_goal', {}, { userId })).rejects.toThrow('goal_id is required');
  });
});
