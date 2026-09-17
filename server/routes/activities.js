// Activities routes (T-4.1 domain extraction): `/api/activities`,
// `/api/activities/:id`, `/api/activities/:id/streams`,
// `/api/activities/:id/ftp-analysis`, `/api/activities/cache/clear`,
// `/api/activities/:id/ai-analysis` and
// `/api/activities/:id/meta-goals-progress`. Extracted from server.js — see
// services/activities.js (getActivityDetails, meta-goals-progress
// computation) and repositories/activities.js (SQL). `POST /api/ai-analysis`
// (no `:id`, not scoped to one activity) lives in routes/aiAnalysis.js
// instead, mounted at `/api`.
//
// Route order preserved from server.js: GET '/', GET '/:id', GET
// '/:id/streams', GET '/:id/ftp-analysis', POST '/cache/clear', GET
// '/:id/ai-analysis', GET '/:id/meta-goals-progress'.
const express = require('express');
const router = express.Router();
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const logger = require('../lib/logger');
const { authMiddleware } = require('../middleware/auth');
const stravaTokens = require('../services/strava/tokens');
const stravaActivities = require('../services/strava/activities');
const ftpAnalysisService = require('../services/ftpAnalysis');
const { downsampleStreamsResponse, parseDownsampleParam } = require('../lib/downsampleStreams');
const { stravaErrorResponse } = require('../lib/stravaErrors');
// Required as the module object (not destructured) so tests can
// `vi.spyOn(aiAnalysis, 'analyzeTraining')` and have that spy actually
// observed here.
const aiAnalysis = require('../aiAnalysis');
const { evaluateAchievements } = require('../achievements');
const { pool } = require('../db');
const { getMetaGoalsProgressForActivity } = require('../services/activities');
patchAsyncRoutes(router);

// --- Новый эндпоинт: Strava activities только для текущего пользователя ---
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    let allActivities;
    try {
      allActivities = await stravaActivities.getActivities(userId);
    } catch (err) {
      if (err instanceof stravaTokens.StravaNotLinkedError) return res.json([]);
      throw err;
    }

    // Пересчитываем ачивки в фоне (не блокируем ответ)
    evaluateAchievements(pool, userId, allActivities).then(result => {
      if (result.newly_unlocked.length > 0) {
        logger.debug(`🏆 New achievements for user ${userId}:`, result.newly_unlocked.map(a => a.name).join(', '));
      }
    }).catch(err => logger.error({ err: err.message }, 'Achievement eval error:'));

    res.json(allActivities);
  } catch (err) {
    stravaErrorResponse(res, err, 'Failed to fetch activities');
  }
});

// Эндпоинт для получения детальной информации об активности
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const activity = await stravaActivities.getActivity(userId, id);
    res.json(activity);
  } catch (err) {
    if (err instanceof stravaTokens.StravaNotLinkedError) {
      return res.status(401).json({ error: 'Strava token not found', code: 'STRAVA_NOT_LINKED' });
    }
    logger.error({ err: err.response?.data || err.message }, 'Error fetching activity details:');
    if (err.response?.status === 404) {
      res.status(404).json({ error: 'Activity not found', code: 'ACTIVITY_NOT_FOUND' });
    } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      res.status(503).json({ error: 'Strava API timeout', code: 'UPSTREAM_ERROR' });
    } else {
      res.status(500).json({ error: 'Failed to fetch activity details', code: 'INTERNAL' });
    }
  }
});

// Новый эндпоинт для получения streams (временных рядов) по id активности.
// `?downsample=<n>` (T-3.6, docs/audit/layers/02-bikelabapp.md A-04)
// reduces every stream to at most n points via bucket-average (bucket-first
// for latlng) — for chart-only consumers. Omit it for the full-resolution
// response (needed by anything doing per-second analysis, e.g. FTP interval
// detection — see GET /api/activities/:id/ftp-analysis below, which never
// downsamples).
router.get('/:id/streams', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const streams = await stravaActivities.getStreams(userId, id);
    const targetPoints = parseDownsampleParam(req.query.downsample);
    res.json(targetPoints ? downsampleStreamsResponse(streams, targetPoints) : streams);
  } catch (err) {
    if (err instanceof stravaTokens.StravaNotLinkedError) {
      return res.status(401).json({ error: 'Strava token not found', code: 'STRAVA_NOT_LINKED' });
    }
    logger.error(err.response?.data || err);
    if (err.response && err.response.data) {
      const status = err.response.status || 500;
      res.status(status).json({ error: err.response.data.message || err.response.data || 'Failed to fetch streams', code: 'UPSTREAM_ERROR' });
    } else {
      res.status(500).json({ error: err.message || 'Failed to fetch streams', code: 'INTERNAL' });
    }
  }
});

// FTP / high-intensity-interval analysis for a single activity (T-3.6,
// docs/audit/00-AUDIT-AND-PLAN.md T-3.6, docs/audit/layers/04-cross-
// layer.md §4.6). Runs @bikelab/shared's analyzeHighIntensityTime over this
// activity's full-resolution streams and caches the result in
// `activity_analysis` (services/ftpAnalysis.js) — a repeat call for the
// same activity never re-fetches its streams from Strava.
router.get('/:id/ftp-analysis', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { result, fromCache } = await ftpAnalysisService.analyzeActivity(userId, id);
    res.json({ ...result, fromCache });
  } catch (err) {
    if (err instanceof stravaTokens.StravaNotLinkedError) {
      return res.status(401).json({ error: 'Strava token not found', code: 'STRAVA_NOT_LINKED' });
    }
    logger.error({ err: err.response?.data || err.message }, 'Error computing FTP analysis:');
    res.status(500).json({ error: 'Failed to compute FTP analysis', code: 'INTERNAL' });
  }
});

// 🧹 Сброс кэша активностей (для обновления после изменений фильтров)
// TODO(T-4.1): this POST route was registered AFTER GET '/:id' in the
// original server.js (routes are matched by method+path together, so the
// two never actually collided) — kept in that exact original order here
// rather than moved ahead of '/:id', per the extraction guide's
// route-order-preservation rule.
router.post('/cache/clear', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    stravaActivities.invalidate(userId);
    res.json({
      success: true,
      message: 'Activities cache cleared. Reload the page to fetch fresh data including VirtualRide activities.'
    });
  } catch (err) {
    logger.error({ err }, 'Error clearing cache:');
    res.status(500).json({ error: err.message, code: 'INTERNAL' });
  }
});

// AI анализ для конкретной активности (для RN)
router.get('/:id/ai-analysis', authMiddleware, async (req, res) => {
  const startTime = Date.now();
  try {
    const activityId = req.params.id;
    logger.debug(`\n🚀 AI Analysis API request - Activity ID: ${activityId}`);
    const userId = req.user.userId || req.user.id;
    logger.debug(`👤 User ID: ${userId}`);

    // Получаем детали активности из Strava
    let activity;
    try {
      activity = await stravaActivities.getActivity(userId, activityId);
    } catch (err) {
      if (err instanceof stravaTokens.StravaNotLinkedError) {
        return res.status(404).json({ error: 'Strava token not found. Please reconnect your Strava account.', code: 'STRAVA_NOT_LINKED' });
      }
      throw err;
    }

    // Формируем summary для AI
    const summary = {
      name: activity.name,
      date: activity.start_date,
      distance_km: (activity.distance / 1000).toFixed(2),
      moving_time_min: Math.round(activity.moving_time / 60),
      elapsed_time_min: Math.round(activity.elapsed_time / 60),
      average_speed_kmh: (activity.average_speed * 3.6).toFixed(1),
      max_speed_kmh: (activity.max_speed * 3.6).toFixed(1),
      average_heartrate: activity.average_heartrate ? Math.round(activity.average_heartrate) : null,
      max_heartrate: activity.max_heartrate ? Math.round(activity.max_heartrate) : null,
      average_cadence: activity.average_cadence ? Math.round(activity.average_cadence) : null,
      average_temp: activity.average_temp,
      total_elevation_gain_m: activity.total_elevation_gain,
      max_elevation_m: activity.elev_high,
      real_average_power_w: activity.average_watts ? Math.round(activity.average_watts) : null,
      real_max_power_w: activity.max_watts ? Math.round(activity.max_watts) : null,
    };

    // Получаем AI анализ
    const analysis = await aiAnalysis.analyzeTraining(summary, pool, userId);

    const duration = Date.now() - startTime;
    logger.debug(`⏱️  Total request time: ${duration}ms\n`);

    res.json({ analysis });
  } catch (e) {
    const duration = Date.now() - startTime;
    logger.error({ err: e.message }, `❌ AI analysis error (${duration}ms):`);
    if (e.response && e.response.status === 401) {
      return res.status(401).json({ error: 'Strava token expired', code: 'STRAVA_TOKEN_EXPIRED' });
    }
    res.status(500).json({ error: 'AI analysis failed', code: 'INTERNAL' });
  }
});

// Get or calculate meta-goals progress for specific activity
router.get('/:id/meta-goals-progress', authMiddleware, async (req, res) => {
  try {
    const activityId = req.params.id;
    const userId = req.user.userId;

    const result = await getMetaGoalsProgressForActivity(userId, activityId);
    if (result === null) {
      return res.status(404).json({ error: 'Activity not found', code: 'ACTIVITY_NOT_FOUND' });
    }
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error calculating meta-goals progress:');
    res.status(500).json({ error: 'Failed to calculate progress', code: 'INTERNAL' });
  }
});

module.exports = router;
