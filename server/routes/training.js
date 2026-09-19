// Training-plan endpoints (T-4.1). Extracted from server.js's "API ЭНДПОИНТЫ
// ДЛЯ ТРЕНИРОВОЧНЫХ РЕКОМЕНДАЦИЙ" region (`/api/training-plan`) and its
// second, later region (`/api/training-types*`, `/api/training-plan/stats`,
// `/api/training-plan/custom*`). Mounted at `/api` in server.js so the full
// sub-paths below (not sharing one common prefix) stay unchanged. Business
// logic/SQL live in services/training.js + repositories/training.js.
const express = require('express');
const router = express.Router();
const logger = require('../lib/logger');
const { authMiddleware } = require('../middleware/auth');
const { contract: c } = require('@bikelab/shared/api');
const { contract } = require('../middleware/contract');
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const trainingService = require('../services/training');
patchAsyncRoutes(router);

// Получение персонализированного плана тренировок
router.get('/training-plan', authMiddleware, contract(c.training.plan), async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const plan = await trainingService.generatePersonalizedPlan(userId);
    res.json(plan);
  } catch (error) {
    logger.error({ err: error }, 'Error generating training plan:');
    res.status(500).json({ error: 'Failed to generate training plan', code: 'INTERNAL' });
  }
});

// Получение информации о типе тренировки
router.get('/training-types/:type', authMiddleware, contract(c.training.typeDetail), async (req, res) => {
  try {
    const trainingType = req.params.type;
    const details = trainingService.getTrainingTypeDetails(trainingType);

    if (!details) {
      return res.status(404).json({ error: 'Training type not found', code: 'TRAINING_TYPE_NOT_FOUND' });
    }

    res.json(details);
  } catch (error) {
    logger.error({ err: error }, 'Error getting training type details:');
    res.status(500).json({ error: 'Failed to get training type details', code: 'INTERNAL' });
  }
});

// Получение всех доступных типов тренировок
router.get('/training-types', authMiddleware, contract(c.training.types), async (req, res) => {
  try {
    const trainingTypes = trainingService.getAllTrainingTypes();
    res.json(trainingTypes);
  } catch (error) {
    logger.error({ err: error }, 'Error getting training types:');
    res.status(500).json({ error: 'Failed to get training types', code: 'INTERNAL' });
  }
});

// Получение статистики выполнения планов
router.get('/training-plan/stats', authMiddleware, contract(c.training.stats), async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const stats = await trainingService.getPlanExecutionStats(userId);
    res.json(stats);
  } catch (error) {
    logger.error({ err: error }, 'Error getting plan execution stats:');
    res.status(500).json({ error: 'Failed to get plan execution stats', code: 'INTERNAL' });
  }
});

// Сохранение кастомной тренировки
router.post('/training-plan/custom', authMiddleware, contract(c.training.saveCustom), async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { dayKey, training } = req.body;

    if (!dayKey || !training) {
      return res.status(400).json({ error: 'Missing required fields', code: 'VALIDATION_ERROR' });
    }

    const result = await trainingService.saveCustomTrainingPlan(userId, dayKey, training);
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error saving custom training:');
    res.status(500).json({ error: 'Failed to save custom training', code: 'INTERNAL' });
  }
});

// Удаление кастомной тренировки
router.delete('/training-plan/custom/:dayKey', authMiddleware, contract(c.training.deleteCustom), async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { dayKey } = req.params;

    const result = await trainingService.deleteCustomTraining(userId, dayKey);
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error deleting custom training:');
    res.status(500).json({ error: 'Failed to delete custom training', code: 'INTERNAL' });
  }
});

module.exports = router;
