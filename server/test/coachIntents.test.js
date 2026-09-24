const { isReadinessIntent } = require('../lib/coachIntents');

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
