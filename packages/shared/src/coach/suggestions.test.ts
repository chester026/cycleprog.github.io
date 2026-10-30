import { describe, expect, it } from 'vitest';
import { QUICK_START_SUGGESTION_KEYS, WELCOME_SUGGESTION_KEYS } from './suggestions.js';

describe('suggestion key sets', () => {
  it('welcome has 4 fixed chips', () => {
    expect(WELCOME_SUGGESTION_KEYS).toEqual([
      'coach.suggestProgress',
      'coach.suggestGoal',
      'coach.suggestLastRide',
      'coach.suggestWeekPlan',
    ]);
  });

  it('quick start attaches an explicit prompt only to the total-stats chip', () => {
    const withPrompt = QUICK_START_SUGGESTION_KEYS.filter((s) => s.promptKey);
    expect(withPrompt).toEqual([{ labelKey: 'coach.suggestTotalStats', promptKey: 'coach.suggestTotalStatsPrompt' }]);
    expect(QUICK_START_SUGGESTION_KEYS).toHaveLength(6);
  });
});
