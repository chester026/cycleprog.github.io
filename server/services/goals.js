// Goals + meta-goals business logic (T-4.1 domain extraction). Moved
// verbatim from server.js — see routes/goals.js, routes/metaGoals.js and
// repositories/goals.js for the routes/SQL that use these.
const { pool } = require('../db');
const logger = require('../lib/logger');
const goalCalculator = require('../goalCalculator');
const stravaActivities = require('./strava/activities');
const stravaTokens = require('./strava/tokens');
const { computeAnalyticsSummary } = require('./analytics');
const goalsRepo = require('../repositories/goals');

// Shared by GET /api/goals, GET /api/meta-goals and GET /api/meta-goals/:id
// (T-3.4) — all three compute progress via the same universal calculator and
// need the same three inputs (activities, profile, latest skills snapshot),
// loaded once per request rather than once per route inline.
async function loadGoalProgressContext(userId) {
  let activities = [];
  try {
    activities = await stravaActivities.getActivities(userId);
  } catch (err) {
    if (!(err instanceof stravaTokens.StravaNotLinkedError)) {
      logger.warn('[goals] could not load activities:', err.message);
    }
  }
  const [profileResult, skillsResult, metaGoalsResult] = await Promise.all([
    pool.query('SELECT * FROM user_profiles WHERE user_id = $1', [userId]),
    pool.query('SELECT * FROM skills_history WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 1', [userId]),
    // The window every sub-goal is measured over (see goalWindow below).
    // `created_at::date` rather than the raw timestamp: a goal created at
    // 14:00 should still count that morning's ride.
    pool.query('SELECT id, created_at::date AS window_start, target_date FROM meta_goals WHERE user_id = $1', [userId]),
  ]);
  return {
    activities,
    userProfile: profileResult.rows[0] || null,
    skillsSnapshot: skillsResult.rows[0] || null,
    metaWindows: new Map(
      metaGoalsResult.rows.map((r) => [Number(r.id), { start: r.window_start, end: r.target_date }])
    ),
  };
}

// A sub-goal is a metric OF its meta-goal and shares its deadline: the
// window is [meta.created_at, meta.target_date], not per-sub-goal columns.
// Those columns (goals.start_date/end_date) were the metric-model
// replacement for the old `period` enum and are gone as of
// 1758000000009_goal-window-on-meta.sql — two independent deadlines meant
// extending a goal moved only one of them, and progress silently kept using
// the old one (owner decision, 21.09).
function goalWindow(g, ctx) {
  const w = g.meta_goal_id != null ? ctx.metaWindows?.get(Number(g.meta_goal_id)) : null;
  return { start_date: w?.start ?? null, end_date: w?.end ?? null };
}

// Computes current_value/percent/pace for one goal row via goalCalculator,
// given a loadGoalProgressContext() result. The window is injected here for
// the calculator and for pace; it is not part of the goal row, so it isn't
// echoed back in the response.
function withGoalProgress(g, ctx) {
  const windowed = { ...g, ...goalWindow(g, ctx) };
  const current_value = goalCalculator.calculateProgress(windowed, ctx);
  const target = Number(g.target_value) || 1;
  return {
    ...g,
    current_value,
    percent: Math.round(Math.min((Number(current_value) / target) * 100, 100)),
    pace: goalCalculator.addPaceData({ ...windowed, current_value }),
  };
}

// Writes back a batch of recomputed current_value's (see GET /api/goals'
// comment — this is the only writer of goals.current_value now). One
// batched UPDATE ... FROM UNNEST round-trip (S-35 "UPDATE каждой sub-goal в
// цикле") instead of N single UPDATEs. Never throws: a failed write-back
// shouldn't fail the read, since the response already carries the fresh,
// correct numbers either way.
async function persistGoalCurrentValues(userId, updates) {
  if (!updates || updates.length === 0) return;
  try {
    await goalsRepo.batchUpdateGoalCurrentValues(userId, updates);
  } catch (err) {
    logger.warn('[goals] could not persist recomputed current_value:', err.message);
  }
}

// Функция для обновления целей пользователя
async function updateUserGoals(userId) {
  try {
    // Считаем аналитику напрямую (T-3.4, S-26) — раньше это был HTTP-запрос
    // самого сервера к самому себе (`axios.get('http://localhost:${PORT}/api
    // /analytics/summary', ...)`), требовавший протаскивать сюда авторизацию
    // вызывающего запроса и тративший лишний сетевой round-trip на данные,
    // уже доступные in-process.
    const { summary: analytics } = await computeAnalyticsSummary(userId, {});

    if (!analytics) {
      return;
    }

    // Получаем все цели пользователя
    const goals = await goalsRepo.listGoals(userId);

    const updatedGoals = [];
    const batchUpdates = [];

    for (const goal of goals) {
      let newCurrentValue = goal.current_value;

      // Логирование для avg_hr_hills (только при отладке)
      // if (goal.goal_type === 'avg_hr_hills') {
      //   logger.debug('🔴 updateUserGoals processing avg_hr_hills:', {
      //     goalId: goal.id,
      //     currentValue: goal.current_value,
      //     willSkip: 'YES - avg_hr_hills is in continue list'
      //   });
      // }

      // Обновляем значения на основе типа цели
      // Для distance целей НЕ обновляем current_value - они считаются на фронтенде
      switch (goal.goal_type) {
        case 'vo2max':
          newCurrentValue = analytics.vo2max || 0;
          break;
        case 'ftp':
          newCurrentValue = analytics.ftp || 0;
          break;
        case 'rides':
          newCurrentValue = analytics.totalRides || 0;
          break;
        case 'distance':
        case 'time':
        case 'elevation':
        case 'pulse':
        case 'avg_hr_flat':
        case 'avg_hr_hills':
        case 'avg_power':
        case 'cadence':
        case 'long_rides':
        case 'intervals':
        case 'recovery':
        case 'ftp_vo2max':
          // Для этих целей оставляем current_value как есть - они считаются на фронтенде
          continue; // Пропускаем обновление этих целей
        case 'avg_per_week':
          newCurrentValue = analytics.avgPerWeek || 0;
          break;
      }

      // Обновляем цель только если значение изменилось
      if (newCurrentValue !== goal.current_value) {
        batchUpdates.push({ id: goal.id, current_value: newCurrentValue });
        updatedGoals.push({ id: goal.id, title: goal.title, oldValue: goal.current_value, newValue: newCurrentValue });
      }
    }

    // One batched UPDATE ... FROM UNNEST round-trip instead of N single
    // UPDATEs (S-35 "UPDATE каждой sub-goal в цикле").
    if (batchUpdates.length > 0) {
      await goalsRepo.batchUpdateGoalCurrentValues(userId, batchUpdates);
    }

    return updatedGoals;
  } catch (err) {
    logger.error({ err }, 'Error auto-updating goals:');
  }
}

module.exports = {
  loadGoalProgressContext,
  goalWindow,
  withGoalProgress,
  persistGoalCurrentValues,
  updateUserGoals,
};
