// ========================================
// ACHIEVEMENTS API
// ========================================
const express = require('express');
const router = express.Router();
const logger = require('../lib/logger');
const { authMiddleware } = require('../middleware/auth');
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const { pool } = require('../db');
const stravaTokens = require('../services/strava/tokens');
const stravaActivities = require('../services/strava/activities');
const { evaluateAchievements, getUserAchievements, getAllAchievements } = require('../achievements');
patchAsyncRoutes(router);

// GET /api/achievements — все определения ачивок (каталог)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const achievements = await getAllAchievements(pool);
    res.json(achievements);
  } catch (err) {
    logger.error({ err }, 'Error fetching achievements:');
    res.status(500).json({ error: 'Failed to fetch achievements', code: 'INTERNAL' });
  }
});

// GET /api/achievements/me — ачивки пользователя с прогрессом
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const achievements = await getUserAchievements(pool, userId);
    const unlocked = achievements.filter(a => a.unlocked).length;
    res.json({
      achievements,
      stats: {
        total: achievements.length,
        unlocked,
        progress_pct: Math.round((unlocked / achievements.length) * 100),
      },
    });
  } catch (err) {
    logger.error({ err }, 'Error fetching user achievements:');
    res.status(500).json({ error: 'Failed to fetch user achievements', code: 'INTERNAL' });
  }
});

// POST /api/achievements/evaluate — пересчитать ачивки
router.post('/evaluate', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get activities (cache/DB/Strava)
    let activities = [];
    try {
      activities = await stravaActivities.getActivities(userId);
    } catch (err) {
      if (!(err instanceof stravaTokens.StravaNotLinkedError)) throw err;
    }

    const result = await evaluateAchievements(pool, userId, activities);
    logger.debug(`🏆 Achievements evaluated for user ${userId}: ${result.total_unlocked}/${result.total_achievements} unlocked, ${result.newly_unlocked.length} new`);
    res.json(result);
  } catch (err) {
    logger.error({ err }, 'Error evaluating achievements:');
    res.status(500).json({ error: 'Failed to evaluate achievements', code: 'INTERNAL' });
  }
});

module.exports = router;
