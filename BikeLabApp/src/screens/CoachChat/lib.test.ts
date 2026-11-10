import {buildWelcomeSuggestions, buildQuickStartSuggestions, resolveSuggestionPress, suggestionLanguage} from './lib';

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

describe('resolveSuggestionPress', () => {
  it('sends a plain chip\'s label as the message', () => {
    expect(resolveSuggestionPress({label: 'Training tips'})).toEqual({kind: 'send', text: 'Training tips'});
  });

  it('a detail chip also says which analysis card to reveal', () => {
    expect(resolveSuggestionPress({label: 'Compare to average', detail: 'vs_baseline'})).toEqual({
      kind: 'send',
      text: 'Compare to average',
      revealDetail: 'vs_baseline',
    });
  });

  it('action chips act in the app instead of sending their label', () => {
    expect(resolveSuggestionPress({label: 'Connect Apple Health', action: 'connect_health'})).toEqual({kind: 'open_apple_health'});
    expect(resolveSuggestionPress({label: 'Get Garmin health data', action: 'refresh_garmin_health'})).toEqual({
      kind: 'refresh_garmin_health',
    });
  });

  it('an action this build does not know falls back to sending the label', () => {
    expect(resolveSuggestionPress({label: 'Something new', action: 'open_settings'} as any)).toEqual({
      kind: 'send',
      text: 'Something new',
    });
  });
});

describe('suggestionLanguage', () => {
  it('follows the chip label, whatever the app locale is', () => {
    expect(suggestionLanguage('Получить данные Garmin Health')).toBe('ru');
    expect(suggestionLanguage('Get Garmin health data')).toBe('en');
    expect(suggestionLanguage('')).toBe('en');
  });
});
