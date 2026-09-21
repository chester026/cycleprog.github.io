// Meta-goals routes (T-4.1 domain extraction): `/api/meta-goals`,
// `/api/meta-goals/:id`, `/api/meta-goals/ai-generate`. Extracted from
// server.js — see services/goals.js (progress helpers) and
// repositories/goals.js (SQL). Personal goals live in routes/goals.js.
const express = require('express');
const router = express.Router();
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const logger = require('../lib/logger');
const { authMiddleware } = require('../middleware/auth');
const { contract: c } = require('@bikelab/shared/api');
const { contract } = require('../middleware/contract');
const { requireAiBudget } = require('../services/aiBudget');
const { aiLimiter } = require('../middleware/rateLimits');
const goalCalculator = require('../goalCalculator');
const { calculateVO2maxForPeriod } = require('../services/analytics');
const stravaTokens = require('../services/strava/tokens');
const stravaActivities = require('../services/strava/activities');
// Namespace import (not destructured) so tests can `vi.spyOn(aiGoals,
// 'generateGoalsWithAI')` — a destructured binding is captured at require
// time and wouldn't see the spy patch the module's own export property.
const aiGoals = require('../aiGoals');
const goalsRepo = require('../repositories/goals');
const {
  loadGoalProgressContext,
  withGoalProgress,
  persistGoalCurrentValues,
} = require('../services/goals');
const { withTransaction } = require('../db');
patchAsyncRoutes(router);

// Get all meta goals for current user
router.get('/', authMiddleware, contract(c.metaGoals.list), async (req, res) => {
  try {
    const userId = req.user.userId;

    const metaGoals = await goalsRepo.listMetaGoals(userId);

    // Sub-goals (with server-computed current_value/percent/pace) inline for
    // every meta-goal — one GET /api/goals-worth of work total, not one per
    // card client-side (T-3.4, docs/audit/layers/03-react-spa.md W-33
    // "MetaGoalRow N+1", docs/audit/layers/02-bikelabapp.md A-13 "each card
    // loads all goals"). Uses the same universal calculator as GET /api/goals
    // and GET /api/meta-goals/:id so all three surfaces agree.
    const allGoals = await goalsRepo.listGoalsOrderedByPriority(userId);
    const ctx = await loadGoalProgressContext(userId);
    const toPersist = [];
    const subGoalsByMeta = new Map();
    for (const g of allGoals) {
      if (g.meta_goal_id == null) continue;
      const withProgress = withGoalProgress(g, ctx);
      const isClientOrCoachOwned = ['health', 'coach', 'manual'].includes(goalCalculator.goalProgressSource(g));
      if (!isClientOrCoachOwned && Number(withProgress.current_value) !== Number(g.current_value)) {
        toPersist.push({ id: g.id, current_value: withProgress.current_value });
      }
      if (!subGoalsByMeta.has(g.meta_goal_id)) subGoalsByMeta.set(g.meta_goal_id, []);
      subGoalsByMeta.get(g.meta_goal_id).push(withProgress);
    }
    await persistGoalCurrentValues(userId, toPersist);

    const metaGoalsWithTrainings = metaGoals.map(metaGoal => {
      let trainingTypes = [];

      if (metaGoal.ai_context) {
        try {
          const aiContext = typeof metaGoal.ai_context === 'string'
            ? JSON.parse(metaGoal.ai_context)
            : metaGoal.ai_context;

          trainingTypes = aiContext.trainingTypes || [];
        } catch (e) {
          // Old format — no trainingTypes
        }
      }

      let tier = metaGoal.tier || 'base';

      return {
        ...metaGoal,
        tier: tier || 'base',
        trainingTypes,
        sub_goals: subGoalsByMeta.get(metaGoal.id) || [],
      };
    });

    res.json(metaGoalsWithTrainings);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching meta goals:');
    res.status(500).json({ error: 'Failed to fetch meta goals', code: 'INTERNAL' });
  }
});

// Get single meta goal with sub-goals
router.get('/:id', authMiddleware, contract(c.metaGoals.detail), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    // Получаем мета-цель
    const metaGoal = await goalsRepo.getMetaGoal(userId, id);

    if (!metaGoal) {
      return res.status(404).json({ error: 'Meta goal not found', code: 'META_GOAL_NOT_FOUND' });
    }

    // Получаем подцели
    const subGoals = await goalsRepo.listSubGoals(userId, id);

    // Свежий progress через тот же universal calculator, что и /api/goals и
    // get_goals_progress — иначе GoalDetailsScreen (читает этот endpoint) и
    // MetaGoalCard (читает sub_goals из /api/meta-goals) будут показывать
    // разные числа.
    const ctx = await loadGoalProgressContext(userId);

    const toPersist = [];
    const subGoalsWithProgress = subGoals.map((g) => {
      const withProgress = withGoalProgress(g, ctx);
      const isClientOrCoachOwned = ['health', 'coach', 'manual'].includes(goalCalculator.goalProgressSource(g));
      if (!isClientOrCoachOwned && Number(withProgress.current_value) !== Number(g.current_value)) {
        toPersist.push({ id: g.id, current_value: withProgress.current_value });
      }
      return withProgress;
    });
    await persistGoalCurrentValues(userId, toPersist);

    // Парсим ai_context для извлечения trainingTypes
    let trainingTypes = [];

    if (metaGoal.ai_context) {
      try {
        // Пытаемся распарсить как JSON (новый формат)
        const aiContext = typeof metaGoal.ai_context === 'string'
          ? JSON.parse(metaGoal.ai_context)
          : metaGoal.ai_context;

        trainingTypes = aiContext.trainingTypes || [];
      } catch (e) {
        // Старый формат (просто строка) - игнорируем, trainingTypes = []
        // Это нормально для целей, созданных до обновления
      }
    }

    const readyToComplete = subGoalsWithProgress.length > 0
      && subGoalsWithProgress.every(g => Number(g.current_value) >= Number(g.target_value) * 0.98)
      && metaGoal.status === 'active';

    res.json({
      metaGoal: {
        ...metaGoal,
        trainingTypes,
        readyToComplete,
      },
      subGoals: subGoalsWithProgress
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching meta goal:');
    res.status(500).json({ error: 'Failed to fetch meta goal', code: 'INTERNAL' });
  }
});

// Create meta goal manually
router.post('/', authMiddleware, contract(c.metaGoals.create), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { title, description, target_date, ai_generated = false, ai_context = null } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required', code: 'VALIDATION_ERROR' });
    }

    const metaGoal = await goalsRepo.insertMetaGoal(userId, { title, description, target_date, ai_generated, ai_context });

    logger.debug('✅ Meta goal created:', metaGoal.id, title);
    res.json(metaGoal);
  } catch (error) {
    logger.error({ err: error }, 'Error creating meta goal:');
    res.status(500).json({ error: 'Failed to create meta goal', code: 'INTERNAL' });
  }
});

// AI Generate meta goal and sub-goals
router.post('/ai-generate', authMiddleware, aiLimiter, requireAiBudget, contract(c.metaGoals.aiGenerate), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { userGoalDescription } = req.body;

    if (!userGoalDescription) {
      return res.status(400).json({ error: 'Goal description is required', code: 'VALIDATION_ERROR' });
    }

    logger.debug('🤖 AI Generation started for user:', userId);
    logger.debug('📝 Goal description:', userGoalDescription);

    // Получаем профиль пользователя
    const userProfile = (await goalsRepo.getRawUserProfile(userId)) || {};

    // Получаем активности (кэш/БД/Strava)
    let activities = [];
    try {
      activities = await stravaActivities.getActivities(userId);
      logger.debug(`📊 Using ${activities.length} activities`);
    } catch (stravaError) {
      if (!(stravaError instanceof stravaTokens.StravaNotLinkedError)) {
        logger.warn('Could not load activities from Strava:', stravaError.message);
      }
    }

    // Фильтруем только последние 3 месяца
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const recentActivities = activities.filter(a => {
      const activityDate = new Date(a.start_date);
      return activityDate >= threeMonthsAgo;
    });

    // Вычисляем статистику
    const recentStats = aiGoals.calculateRecentStats(recentActivities, '3m');

    // 📈 Анализируем тренды и производительность (локально, без API calls)
    const trends = aiGoals.analyzePerformanceTrends(recentActivities);
    const analysis = aiGoals.identifyStrengthsAndWeaknesses(recentActivities, userProfile);

    logger.debug('📊 User stats:', {
      experience: userProfile.experience_level,
      workouts: userProfile.workouts_per_week,
      avgDistance: recentStats.avgDistance,
      totalRides: recentStats.totalRides,
      distanceTrend: trends.distanceTrend?.direction,
      strengthsCount: analysis.strengths?.length,
      weaknessesCount: analysis.weaknesses?.length
    });

    // Existing active goals — fed into the prompt so the model doesn't
    // propose a near-duplicate sub-goal under a new meta-goal (advisory
    // only, see aiGoals.js's existingGoalsBlock).
    const existingGoals = await goalsRepo.getExistingActiveGoalsForAI(userId);

    // Генерируем цели через AI с расширенным контекстом
    const aiResponse = await aiGoals.generateGoalsWithAI(
      userGoalDescription,
      userProfile,
      recentStats,
      trends,
      analysis,
      existingGoals,
      userId // T-4.4: records token usage into ai_usage_daily
    );

    logger.debug('✅ AI generated:', {
      metaGoalTitle: aiResponse.metaGoal.title,
      subGoalsCount: aiResponse.subGoals.length,
      trainingTypesCount: aiResponse.metaGoal.trainingTypes?.length || 0
    });

    // Подготавливаем AI context с trainingTypes
    const aiContext = JSON.stringify({
      userGoal: userGoalDescription,
      trainingTypes: aiResponse.metaGoal.trainingTypes || []
    });

    const aiTier = aiResponse.metaGoal?.tier || aiResponse.tier;
    const tier = ['legendary', 'epic', 'grand', 'base'].includes(aiTier) ? aiTier : 'base';
    logger.debug(`🏷️ Tier classification: AI returned "${aiTier}" (metaGoal.tier=${aiResponse.metaGoal?.tier}, root.tier=${aiResponse.tier}), stored as "${tier}"`);

    // Валидация/подготовка подцелей — FTP целям нужен async VO2max расчёт
    // (calculateVO2maxForPeriod) до вставки, поэтому это резолвится здесь, до
    // открытия транзакции ниже; сама транзакция делает только записи.
    const subGoalRows = [];
    for (const subGoal of aiResponse.subGoals) {
      if (subGoal.goal_type === 'ftp_vo2max') {
        const vo2maxValue = await calculateVO2maxForPeriod(userId, subGoal.period || '4w');
        subGoalRows.push(goalsRepo.ftpSubGoalRow(subGoal, { targetValue: 0, vo2maxValue }));
      } else {
        // Обычные цели — новые несут `metric`/`source` вместо
        // goal_type/period (см. md/GOALS_REDESIGN_PLAN_FINAL.md).
        // goal_type/period оставляем NULL для новых целей — goalCalculator.js
        // ветвится по `metric IS NULL`, а не по наличию goal_type/period.
        // Дат у подцели нет: окно она берёт у мета-цели (services/goals.js).
        subGoalRows.push(goalsRepo.metricSubGoalRow(subGoal, { targetValue: subGoal.target_value }));
      }
    }

    const skillsSnapshotForNewGoals = await goalsRepo.getLatestSkillsSnapshot(userId);

    // INSERT meta_goals + N× INSERT goals + N× UPDATE current_value all run
    // on one connection/BEGIN now (S-28) — previously these were unrelated
    // round-trips with no atomicity: a crash/error partway through (e.g. the
    // sub-goals insert failing) left an orphan meta_goals row with no
    // sub-goals. The N sub-goal inserts are one UNNEST batch
    // (insertAiSubGoalsBatch) and the N progress UPDATEs are one UNNEST
    // batch (batchUpdateGoalCurrentValues) instead of a loop of single
    // statements.
    const { metaGoal } = await withTransaction(async (client) => {
      const metaGoal = await goalsRepo.insertAiMetaGoal(userId, {
        title: aiResponse.metaGoal.title,
        description: aiResponse.metaGoal.description,
        target_date: aiResponse.metaGoal.target_date || null,
        ai_context: aiContext,
        tier,
      }, client);

      logger.debug('✅ Meta goal created:', metaGoal.id);

      const createdSubGoals = await goalsRepo.insertAiSubGoalsBatch(userId, metaGoal.id, subGoalRows, client);

      logger.debug(`✅ Created ${createdSubGoals.length} sub-goals`);

      // Пересчитываем прогресс для созданных целей — goalCalculator.js
      // (backed by @bikelab/shared/calc) покрывает новые metric-based цели и
      // содержит свой собственный legacy fallback для целей без metric. A
      // per-goal calc failure is logged and simply leaves that goal's
      // current_value at its inserted 0 (same tolerance as before batching).
      logger.debug('🔄 Recalculating progress for newly created goals...');
      const progressUpdates = [];
      for (const goal of createdSubGoals) {
        try {
          // Окно — мета-цели, а не подцели (services/goals.js's goalWindow).
          // Мета-цель только что создана, так что start = сегодня.
          const currentValue = goalCalculator.calculateProgress(
            { ...goal, start_date: metaGoal.created_at, end_date: metaGoal.target_date },
            { activities, skillsSnapshot: skillsSnapshotForNewGoals, userProfile }
          );
          progressUpdates.push({ id: goal.id, current_value: currentValue || 0 });
          logger.debug(`✅ Computed progress for goal "${goal.title}": ${currentValue}`);
        } catch (progressError) {
          logger.warn(`⚠️ Could not calculate progress for goal ${goal.id}:`, progressError.message);
        }
      }
      if (progressUpdates.length > 0) {
        await goalsRepo.batchUpdateGoalCurrentValues(userId, progressUpdates, client);
      }

      return { metaGoal, createdSubGoals };
    });

    // Перезагружаем цели с обновленным прогрессом
    const updatedGoals = await goalsRepo.listSubGoalsByMetaGoalPriority(userId, metaGoal.id);

    // Возвращаем полный результат
    res.json({
      metaGoal,
      subGoals: updatedGoals,
      timeline: aiResponse.timeline,
      mainFocus: aiResponse.mainFocus
    });

  } catch (error) {
    logger.error({ err: error }, '❌ Error in AI goal generation:');
    res.status(500).json({ error: 'Failed to generate goals', code: 'INTERNAL' });
  }
});

// Update meta goal
router.put('/:id', authMiddleware, contract(c.metaGoals.update), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { title, description, target_date, status } = req.body;

    const metaGoal = await goalsRepo.updateMetaGoal(userId, id, { title, description, target_date, status });

    if (!metaGoal) {
      return res.status(404).json({ error: 'Meta goal not found', code: 'META_GOAL_NOT_FOUND' });
    }

    res.json(metaGoal);
  } catch (error) {
    logger.error({ err: error }, 'Error updating meta goal:');
    res.status(500).json({ error: 'Failed to update meta goal', code: 'INTERNAL' });
  }
});

// Delete meta goal (cascade deletes sub-goals)
router.delete('/:id', authMiddleware, contract(c.metaGoals.remove), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const metaGoal = await goalsRepo.deleteMetaGoal(userId, id);

    if (!metaGoal) {
      return res.status(404).json({ error: 'Meta goal not found', code: 'META_GOAL_NOT_FOUND' });
    }

    logger.debug('🗑️ Meta goal deleted:', id);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting meta goal:');
    res.status(500).json({ error: 'Failed to delete meta goal', code: 'INTERNAL' });
  }
});

module.exports = router;
