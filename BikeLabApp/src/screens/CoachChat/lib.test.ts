import {buildWelcomeSuggestions, buildQuickStartSuggestions} from './lib';

describe('suggestion builders', () => {
  const t = (key: string) => key;

  it('buildWelcomeSuggestions returns 4 fixed chips', () => {
    const items = buildWelcomeSuggestions(t);
    expect(items).toHaveLength(4);
    expect(items.map(i => i.label)).toEqual([
      'coach.suggestProgress',
      'coach.suggestGoal',
      'coach.suggestLastRide',
      'coach.suggestWeekPlan',
    ]);
  });

  it('buildQuickStartSuggestions attaches an explicit `prompt` only to the total-stats chip', () => {
    const items = buildQuickStartSuggestions(t);
    const totalStats = items.find(i => i.label === 'coach.suggestTotalStats');
    expect(totalStats?.prompt).toBe('coach.suggestTotalStatsPrompt');
    expect(items.filter(i => i.prompt).length).toBe(1);
  });
});
