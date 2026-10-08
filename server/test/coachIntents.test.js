const { isReadinessIntent, isRideFeasibilityIntent, coachIntent, forcedToolChoice } = require('../lib/coachIntents');

// Regex classifier backing routes/coach.js's forced analyze_readiness
// tool_choice (Problem A, coach-readiness-budget task) — see coachIntents.js
// for the "recover my password" exclusion decision this documents.
describe('isReadinessIntent', () => {
  it.each([
    'Проверь мою готовность к тренировкам',
    'Как мое восстановление после вчерашней тренировки?',
    'Я сегодня устал, стоит ли тренироваться?',
    'Не перетренировался ли я на этой неделе?',
    'Отдохнул ли я достаточно для интервалов?',
    'Покажи график пульс против скорости',
    'Как мое самочувствие сегодня?',
    'Check my training readiness',
    'Am I recovered enough for a hard ride?',
    'How is my fatigue this week?',
    'Is there any sign of overtraining?',
    'Show me the hr vs speed chart',
    'Show me the heart rate vs speed trend',
    'Am I ready to train hard today?',
    'Should I ride hard today?',
    'How tired am I?',
    'How rested am I?',
  ])('matches a readiness-shaped message: %s', (message) => {
    expect(isReadinessIntent(message)).toBe(true);
  });

  it.each([
    'Analyze last ride',
    'Create a goal to ride 200km',
    'What tires should I buy?',
    'Plan my week',
    'How much elevation have I climbed this year?',
    '',
    '   ',
  ])('does not match an unrelated message: %s', (message) => {
    expect(isReadinessIntent(message)).toBe(false);
  });

  // Documented decision (see coachIntents.js header): a password/account
  // recovery request never forces the training-readiness tool, even though
  // it contains the bare word "recover".
  it('does not match "recover my password" (account recovery, not training readiness)', () => {
    expect(isReadinessIntent('I forgot my password, help me recover my account')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isReadinessIntent('CHECK MY TRAINING READINESS')).toBe(true);
  });

  it('ignores non-string input rather than throwing', () => {
    expect(isReadinessIntent(undefined)).toBe(false);
    expect(isReadinessIntent(null)).toBe(false);
    expect(isReadinessIntent(42)).toBe(false);
  });
});

// Bug 07.10.2026: "Стоит мне завтра ехать 160км 3000 набора?" forced analyze_readiness (Apple
// Health/Oura only) for a rider with neither.
describe('isRideFeasibilityIntent', () => {
  it.each([
    'Стоит мне завтра ехать 160км 3000набора?',
    'Потяну ли 200 км в субботу?',
    'Can I do a 160 km ride with 3000 m tomorrow?',
    'Смогу ли я проехать 120 км с набором 2000 м?',
    'Осилю 250 км за день?',
    'Am I ready for 200 km this weekend?',
    'Should I ride 100 km tomorrow?',
    'Is it ok to do 140.5 km on Sunday?',
    'Готов ли я к 160 км?',
    '160 km with 3000 m?',
    '160 км, 3000 м набора?',
    'завтра 180км и 2500м набора?',
  ])('matches a described ride + question: %s', (message) => {
    expect(isRideFeasibilityIntent(message)).toBe(true);
  });

  it.each([
    'How much did I ride this week?',
    'сколько км я проехал в этом месяце',
    'I want to prepare for a 120 km gran fondo in 8 weeks, build me a plan',
    'Построй план к гранфондо на 120 км',
    'I rode 160 km with 3000 m yesterday',
    'Can I change my FTP?',
    'Должен ли я взять 3 м кабель?',
    '',
  ])('does not match: %s', (message) => {
    expect(isRideFeasibilityIntent(message)).toBe(false);
  });

  it('ignores non-string input', () => {
    expect(isRideFeasibilityIntent(undefined)).toBe(false);
    expect(isRideFeasibilityIntent(160)).toBe(false);
  });
});

describe('coachIntent / forcedToolChoice', () => {
  it('prefers feasibility over readiness vocabulary', () => {
    expect(coachIntent('Am I recovered enough for 160 km tomorrow? Should I go?')).toBe('feasibility');
    expect(coachIntent('Стоит мне завтра ехать 160км 3000набора?')).toBe('feasibility');
  });

  it('keeps readiness for readiness-shaped messages', () => {
    expect(coachIntent('Проверь мою готовность к тренировкам')).toBe('readiness');
  });

  it('is null for plans and totals', () => {
    expect(coachIntent('I want to prepare for a 120 km gran fondo in 8 weeks, build me a plan')).toBeNull();
    expect(coachIntent('сколько км я проехал в этом месяце')).toBeNull();
  });

  it('maps the intent to the forced tool', () => {
    expect(forcedToolChoice('Потяну ли 200 км в субботу?')).toEqual({ type: 'function', name: 'assess_ride_feasibility' });
    expect(forcedToolChoice('Check my training readiness')).toEqual({ type: 'function', name: 'analyze_readiness' });
    expect(forcedToolChoice('What tires should I buy?')).toBe('auto');
  });
});
