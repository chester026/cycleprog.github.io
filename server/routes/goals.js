// Personal goals routes (T-4.1 domain extraction): `/api/goals`,
// `/api/goals/:id`, `/api/goals/recalc-vo2max/:id`, `/api/goals/update-current`
// and `/api/goals/:goalId/recommendations`. Extracted from server.js —
// see services/goals.js (progress helpers, updateUserGoals) and
// repositories/goals.js (SQL). Meta-goals live in routes/metaGoals.js.
const express = require('express');
const router = express.Router();
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const logger = require('../lib/logger');
const { authMiddleware, requireAdmin } = require('../middleware/auth');
const { contract: c } = require('@bikelab/shared/api');
const { contract } = require('../middleware/contract');
const goalCalculator = require('../goalCalculator');
const { pool } = require('../db');
const { computeAnalyticsSummary, calculateVO2maxForPeriod } = require('../services/analytics');
const { getGoalSpecificRecommendations } = require('../recommendations');
const goalsRepo = require('../repositories/goals');
const {
  loadGoalProgressContext,
  withGoalProgress,
  persistGoalCurrentValues,
} = require('../services/goals');
patchAsyncRoutes(router);

// Get all goals for current user
router.get('/', authMiddleware, contract(c.goals.list), async (req, res) => {
  const userId = req.user.userId;

  const goals = await goalsRepo.listGoals(userId);

  // Progress is computed fresh here now (goalCalculator.js), not read
  // stale off the current_value column — same universal calculator used by
  // the coach's get_goals_progress tool, so both surfaces agree. Clients no
  // longer recompute this themselves (T-3.4, docs/audit/layers/04-cross-layer.md
  // §4.2, docs/audit/layers/03-react-spa.md W-08) — this route (and
  // GET /api/meta-goals/:id, which uses the same calculator) is now the only
  // place current_value/percent/pace get computed, and this route is the
  // only writer of goals.current_value: it persists the freshly computed
  // value back to the row below so PUT/other readers see a value that
  // matches what was last shown, not a stale one from before the goal's
  // activities/skills changed. 'health'/'coach'-source goals are skipped —
  // their current_value is either client-owned (Apple Health, computed
  // on-device — see goalCalculator.js's header) or coach-owned (moved via
  // update_goal), never something this route should overwrite.
  const ctx = await loadGoalProgressContext(userId);

  const toPersist = [];
  const goalsWithProgress = goals.map((g) => {
    const withProgress = withGoalProgress(g, ctx);
    const isClientOrCoachOwned = ['health', 'coach', 'manual'].includes(goalCalculator.goalProgressSource(g));
    if (!isClientOrCoachOwned && Number(withProgress.current_value) !== Number(g.current_value)) {
      toPersist.push({ id: g.id, current_value: withProgress.current_value });
    }
    return withProgress;
  });

  await persistGoalCurrentValues(userId, toPersist);

  res.json(goalsWithProgress);
});

// Add a new goal for current user
router.post('/', authMiddleware, contract(c.goals.create), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { title, description, target_value, current_value, unit, goal_type, period, hr_threshold, duration_threshold, meta_goal_id } = req.body;

    logger.debug('📝 Creating goal for user:', userId);
    logger.debug('📝 Received meta_goal_id:', meta_goal_id);

    // Валидация числовых полей - конвертируем пустые строки в 0 для создания
    const validatedTargetValue = (target_value === '' || target_value === null || target_value === undefined) ? 0 : Number(target_value);
    const validatedCurrentValue = (current_value === '' || current_value === null || current_value === undefined) ? 0 : Number(current_value);
    const validatedHrThreshold = (hr_threshold === '' || hr_threshold === null || hr_threshold === undefined) ? 160 : Number(hr_threshold);
    const validatedDurationThreshold = (duration_threshold === '' || duration_threshold === null || duration_threshold === undefined) ? 120 : Number(duration_threshold);
    const validatedMetaGoalId = meta_goal_id || null;

    logger.debug('✅ Validated meta_goal_id:', validatedMetaGoalId);

    // A goal must only be attached to a meta-goal the caller actually owns —
    // otherwise any user could dangle a goal off someone else's meta-goal id.
    if (validatedMetaGoalId) {
      const owned = await goalsRepo.metaGoalOwnedByUser(userId, validatedMetaGoalId);
      if (!owned) {
        return res.status(403).json({ error: 'Meta goal not found', code: 'META_GOAL_NOT_FOUND' });
      }
    }

    // Вычисляем VO2max для FTP целей
    let vo2maxValue = null;
    if (goal_type === 'ftp_vo2max') {
      vo2maxValue = await calculateVO2maxForPeriod(userId, period || '4w');
      // Saving FTP goal with calculated VO2max
    }

    const goal = await goalsRepo.insertGoal(userId, {
      title, description, target_value: validatedTargetValue, current_value: validatedCurrentValue,
      unit, goal_type, period: period || '4w', hr_threshold: validatedHrThreshold,
      duration_threshold: validatedDurationThreshold, vo2max_value: vo2maxValue, meta_goal_id: validatedMetaGoalId,
    });
    res.json(goal);
  } catch (error) {
    logger.error({ err: error }, 'Error creating goal:');
    res.status(500).json({ error: 'Failed to create goal', code: 'INTERNAL' });
  }
});

// Update a goal
router.put('/:id', authMiddleware, contract(c.goals.update), async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const { title, description, target_value, current_value, unit, goal_type, period, hr_threshold, duration_threshold } = req.body;

  // Логирование для avg_hr_hills (только при отладке)
  // if (goal_type === 'avg_hr_hills') {
  //   logger.debug('🟡 API PUT /api/goals/:id - Saving avg_hr_hills:', {
  //     goalId: id,
  //     current_value,
  //     userId
  //   });
  // }

  try {
    // Получаем текущую цель из базы данных
    const currentGoal = await goalsRepo.getGoal(userId, id);

    if (!currentGoal) {
      return res.status(404).json({ error: 'Goal not found', code: 'GOAL_NOT_FOUND' });
    }

    // Clients no longer own current_value for computed goals (T-3.4,
    // docs/audit/layers/04-cross-layer.md §4.2, docs/audit/layers/03-react-spa.md
    // W-08) — GET /api/goals is the only writer for activity/skills/legacy
    // goals now. Only 'manual' (no metric, unmapped goal_type — e.g.
    // AddGoalModal.jsx's "custom" option) and 'health' (client-only Apple
    // Health data the server can never compute) sources may still set it
    // directly here.
    const source = goalCalculator.goalProgressSource(currentGoal);
    const canSetCurrentValue = source === 'manual' || source === 'health';
    if (current_value !== undefined && !canSetCurrentValue) {
      logger.debug(`[goals] ignoring client-supplied current_value for goal ${id} (source=${source})`);
    }
    const clientCanSetValue = canSetCurrentValue && current_value !== undefined;

    // Собираем данные для обновления, используя существующие значения как fallback
    const updateData = {
      title: title !== undefined ? title : currentGoal.title,
      description: description !== undefined ? description : currentGoal.description,
      target_value: target_value !== undefined ? (target_value === '' || target_value === null ? 0 : Number(target_value)) : currentGoal.target_value,
      current_value: clientCanSetValue ? (current_value === '' || current_value === null ? 0 : Number(current_value)) : currentGoal.current_value,
      unit: unit !== undefined ? unit : currentGoal.unit,
      goal_type: goal_type !== undefined ? goal_type : currentGoal.goal_type,
      period: period !== undefined ? period : currentGoal.period,
      hr_threshold: hr_threshold !== undefined ? (hr_threshold === '' || hr_threshold === null ? 160 : Number(hr_threshold)) : currentGoal.hr_threshold,
      duration_threshold: duration_threshold !== undefined ? (duration_threshold === '' || duration_threshold === null ? 120 : Number(duration_threshold)) : currentGoal.duration_threshold
    };

    // Пересчитываем VO2max для FTP целей при обновлении
    let vo2maxValue = currentGoal.vo2max_value; // По умолчанию оставляем старое значение

    if (updateData.goal_type === 'ftp_vo2max') {
      // Пересчитываем VO2max если изменился период или если его не было
      const periodChanged = updateData.period !== currentGoal.period;
      const noExistingVO2max = !currentGoal.vo2max_value;

      if (periodChanged || noExistingVO2max) {
        vo2maxValue = await calculateVO2maxForPeriod(userId, updateData.period);
        // VO2max recalculated for updated FTP goal
      }
    } else {
      // Если тип цели изменился с FTP на другой, очищаем VO2max
      if (currentGoal.goal_type === 'ftp_vo2max') {
        vo2maxValue = null;
        logger.debug(`🗑️ Clearing VO2max value - goal type changed from ftp_vo2max to ${updateData.goal_type}`);
      }
    }

    const goal = await goalsRepo.updateGoal(userId, id, { ...updateData, vo2max_value: vo2maxValue });

    res.json(goal);
  } catch (err) {
    logger.error({ err }, 'Error updating goal:');
    res.status(500).json({ error: 'Failed to update goal', code: 'INTERNAL' });
  }
});

// Recalculate VO2max for specific FTP goal
router.post('/recalc-vo2max/:id', authMiddleware, contract(c.goals.recalcVo2max), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { period } = req.body;

    // Проверяем, что цель существует и принадлежит пользователю
    const goal = await goalsRepo.getGoal(userId, id);

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found', code: 'GOAL_NOT_FOUND' });
    }

    // Проверяем, что это FTP цель
    if (goal.goal_type !== 'ftp_vo2max') {
      return res.status(400).json({ error: 'This endpoint is only for FTP/VO2max goals', code: 'BAD_REQUEST' });
    }

    // Пересчитываем VO₂max

    const newVO2max = await calculateVO2maxForPeriod(userId, period || goal.period);

    if (newVO2max === null) {
      logger.error(`❌ VO₂max calculation returned null for user ${userId}, goal ${id}, period: ${period || goal.period}`);
      return res.status(500).json({ error: 'Failed to calculate VO₂max', code: 'INTERNAL' });
    }



    // Обновляем значение в базе данных
    const updatedGoal = await goalsRepo.updateGoalVO2max(userId, id, newVO2max);



    res.json({
      success: true,
      goal_id: id,
      old_vo2max: goal.vo2max_value,
      vo2max_value: newVO2max,
      updated_goal: updatedGoal
    });

  } catch (error) {
    logger.error({ err: error }, 'Error recalculating VO₂max:');
    res.status(500).json({ error: 'Failed to recalculate VO₂max', code: 'INTERNAL' });
  }
});

// Delete a goal
router.delete('/:id', authMiddleware, contract(c.goals.remove), async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;

  const deleted = await goalsRepo.deleteGoal(userId, id);
  if (!deleted) return res.status(404).json({ error: 'Goal not found', code: 'GOAL_NOT_FOUND' });
  res.json({ success: true });
});

// Update goals with current values from analytics — admin-only manual/debug
// fallback now (T-3.4, docs/audit/00-AUDIT-AND-PLAN.md T-3.4): no client
// calls this anymore (GET /api/goals recomputes and persists current_value
// on every read), so it's additive rather than something regular users hit.
router.post('/update-current', authMiddleware, requireAdmin, contract(c.goals.updateCurrent), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { summary: analytics } = await computeAnalyticsSummary(userId, {});

    if (!analytics) {
      return res.status(400).json({ error: 'No analytics data available', code: 'BAD_REQUEST' });
    }

    // Получаем все цели пользователя
    const goals = await goalsRepo.listGoals(userId);

    const batchUpdates = [];

    for (const goal of goals) {
      let newCurrentValue = goal.current_value;

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
      }
    }

    // One batched UPDATE ... FROM UNNEST round-trip instead of N single
    // UPDATEs (S-35 "UPDATE каждой sub-goal в цикле").
    const updatedGoals = await goalsRepo.batchUpdateGoalCurrentValues(userId, batchUpdates);

    res.json({
      success: true,
      updated: updatedGoals.length,
      goals: updatedGoals
    });
  } catch (err) {
    logger.error({ err }, 'Error updating goals:');
    res.status(500).json({ error: 'Failed to update goals', code: 'INTERNAL' });
  }
});

// Получение рекомендаций для конкретной цели
router.get('/:goalId/recommendations', authMiddleware, contract(c.goals.recommendations), async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const goalId = parseInt(req.params.goalId);

    if (isNaN(goalId)) {
      return res.status(400).json({ error: 'Invalid goal ID', code: 'VALIDATION_ERROR' });
    }

    const recommendations = await getGoalSpecificRecommendations(pool, userId, goalId);
    res.json(recommendations);
  } catch (error) {
    logger.error({ err: error }, 'Error getting goal recommendations:');
    if (error.message === 'Goal not found') {
      res.status(404).json({ error: 'Goal not found', code: 'GOAL_NOT_FOUND' });
    } else {
      res.status(500).json({ error: 'Failed to get goal recommendations', code: 'INTERNAL' });
    }
  }
});

module.exports = router;
