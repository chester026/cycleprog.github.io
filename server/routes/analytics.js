// Analytics routes (T-4.1): `/api/analytics/summary`, `/api/analytics/ftp`
// and `/api/analytics/activity/:id`. Extracted from server.js —
// `computeAnalyticsSummary`/`calculateVO2maxForPeriod` live in
// `services/analytics.js` and are also called directly (in-process) by
// goals/meta-goals code that stayed in server.js.
const express = require('express');
const router = express.Router();
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const logger = require('../lib/logger');
const { authMiddleware } = require('../middleware/auth');
const stravaTokens = require('../services/strava/tokens');
const stravaActivities = require('../services/strava/activities');
const ftpAnalysisService = require('../services/ftpAnalysis');
const { computeAnalyticsSummary } = require('../services/analytics');
patchAsyncRoutes(router);

router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await computeAnalyticsSummary(userId, req.query);
    res.json(result);
  } catch (err) {
    logger.error({ err }, 'Ошибка аналитики:');
    res.status(500).json({ error: 'Ошибка аналитики', code: 'INTERNAL' });
  }
});

// Batch FTP / high-intensity-interval analysis across this user's rides in
// a date window (T-3.6, docs/audit/00-AUDIT-AND-PLAN.md T-3.6,
// docs/audit/layers/02-bikelabapp.md A-04) — what FTPAnalysis.tsx/.jsx
// actually render, replacing their old client-side download-every-ride's-
// streams-and-analyze-locally approach. Bounded to
// ftpAnalysisService.MAX_UNCACHED_STREAM_FETCHES new stream fetches per
// call; the rest are picked up on a later call once cached.
router.get('/ftp', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const days = Math.max(1, parseInt(req.query.days, 10) || 28);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let activities = [];
    try {
      activities = await stravaActivities.getActivities(userId);
    } catch (err) {
      if (!(err instanceof stravaTokens.StravaNotLinkedError)) throw err;
    }
    const filtered = activities.filter((a) => new Date(a.start_date) > since);

    const result = await ftpAnalysisService.analyzeActivities(userId, filtered);
    res.json({ ...result, days });
  } catch (err) {
    logger.error({ err: err.message }, 'Error computing FTP batch analysis:');
    res.status(500).json({ error: 'Failed to compute FTP analysis', code: 'INTERNAL' });
  }
});

// === Анализ отдельной активности: тип и рекомендации ===
router.get('/activity/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Получаем активности пользователя (кэш/БД/Strava)
    let activities = [];
    try {
      activities = await stravaActivities.getActivities(userId);
    } catch (error) {
      if (!(error instanceof stravaTokens.StravaNotLinkedError)) {
        logger.error({ err: error }, 'Error fetching activities for analysis:');
      }
    }

    // Находим нужную активность
    const activity = activities.find(a => String(a.id) === String(id));
    if (!activity) return res.status(404).json({ error: 'Activity not found', code: 'ACTIVITY_NOT_FOUND' });

    // Анализ активности (логика с фронта)
    let type = 'Regular';
    if (activity.distance && activity.distance/1000 > 60) type = 'Long';
    else if (activity.average_speed && activity.average_speed*3.6 < 20 && activity.moving_time && activity.moving_time/60 < 60) type = 'Recovery';
    else if (activity.total_elevation_gain && activity.total_elevation_gain > 800) type = 'Mountain';
    else if ((activity.name||'').toLowerCase().includes('интервал') || (activity.type||'').toLowerCase().includes('interval')) type = 'Interval';

    const recommendations = [];
    if (activity.average_speed && activity.average_speed*3.6 < 25) {
      recommendations.push({
        title: 'Average speed below 25 km/h',
        advice: 'To improve speed, include interval training (e.g., 4×4 min with 4 min rest, Z4-Z5), work on pedal technique (cadence 90–100), pay attention to your body position on the bike, and aerodynamics.'
      });
    }
    if (activity.average_heartrate && activity.average_heartrate > 155) {
      recommendations.push({
        title: 'Heart rate above 155 bpm',
        advice: 'This may indicate high intensity or insufficient recovery. Check your sleep quality, stress level, add recovery training, pay attention to hydration and nutrition.'
      });
    }
    if (activity.total_elevation_gain && activity.total_elevation_gain > 500 && activity.average_speed*3.6 < 18) {
      recommendations.push({
        title: 'Mountain training with low speed',
        advice: 'To improve results, add strength training off the bike and intervals in ascents (e.g., 5×5 min in Z4).'
      });
    }
    if (!activity.average_heartrate) {
      recommendations.push({
        title: 'No heart rate data',
        advice: 'Add a heart rate monitor for more accurate intensity control and recovery.'
      });
    }
    if (!activity.distance || activity.distance/1000 < 30) {
      recommendations.push({
        title: 'Short distance',
        advice: 'To develop endurance, plan at least one long ride (60+ km) per week. Gradually increase the distance, remembering to eat and hydrate on the road.'
      });
    }
    if (type === 'Recovery') {
      recommendations.push({
        title: 'Recovery training',
        advice: 'Great! Don\'t forget to alternate such training with intervals and long rides for progress.'
      });
    }
    if (type === 'Interval' && activity.average_heartrate && activity.average_heartrate < 140) {
      recommendations.push({
        title: 'Interval training with low heart rate',
        advice: 'Intervals should be performed with greater intensity (Z4-Z5) to get the maximum training effect.'
      });
    }
    if (!activity.average_cadence) {
      recommendations.push({
        title: 'No cadence data',
        advice: 'Using a cadence sensor will help track pedal technique and avoid excessive fatigue.'
      });
    }
    if (recommendations.length === 0) {
      recommendations.push({
        title: 'Great training!',
        advice: 'Training completed perfectly! Continue in the same spirit and gradually increase the load for further progress.'
      });
    }
    res.json({ type, recommendations });
  } catch (err) {
    logger.error({ err }, 'Ошибка анализа активности:');
    res.status(500).json({ error: err.message || 'Ошибка анализа активности', code: 'INTERNAL' });
  }
});

module.exports = router;
