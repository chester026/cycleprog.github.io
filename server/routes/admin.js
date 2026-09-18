// Admin-only routes: Strava diagnostics/limits + user management (T-4.1).
// Moved verbatim out of server.js. Mounted at `/api` (paths here include the
// full `/admin/...` or `/strava/...` sub-path since this domain has no
// single shared prefix) in place of the first extracted block,
// `GET /api/admin/strava/sync-status`.
const express = require('express');
const router = express.Router();
const logger = require('../lib/logger');
const { authMiddleware, requireAdmin } = require('../middleware/auth');
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const adminRepo = require('../repositories/admin');
const stravaClient = require('../services/strava/client');
const stravaOAuth = require('../services/strava/oauth');
const stravaActivities = require('../services/strava/activities');
const stravaTokens = require('../services/strava/tokens');
const { activitiesCache, bikesCache } = stravaActivities;
patchAsyncRoutes(router);

// Новый эндпоинт для получения лимитов Strava
// Diagnostics for the Postgres-first activities store: how much is mirrored,
// how many legacy rows still lack raw JSON (→ degraded objects without map/gear),
// and the current Strava rate-limit budget. Admin only.
router.get('/admin/strava/sync-status', authMiddleware, requireAdmin, async (req, res) => {
  const perUser = await adminRepo.getStravaSyncStatusPerUser();
  const totals = await adminRepo.getStravaSyncStatusTotals();
  res.json({ totals, users: perUser, strava_limits: await stravaClient.getLimits() });
});

router.get('/strava/limits', authMiddleware, requireAdmin, async (req, res) => {
  try {
    res.json((await stravaClient.getLimits()) || {
      limit15min: null,
      limitDay: null,
      usage15min: null,
      usageDay: null,
      lastUpdate: null
    });
  } catch (error) {
    logger.error({ err: error }, 'Error getting Strava limits:');
    res.status(500).json({
      error: 'Failed to get Strava limits',
      code: 'INTERNAL',
      limits: {
        limit15min: null,
        limitDay: null,
        usage15min: null,
        usageDay: null,
        lastUpdate: null
      }
    });
  }
});

// Принудительно обновить лимиты Strava (обновлено для многопользовательской архитектуры)
router.post('/strava/limits/refresh', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const userId = req.user.userId;
    logger.debug('🔄 Refreshing Strava limits for user:', userId);

    // Делаем тестовый запрос для получения лимитов — stravaClient reads the
    // rate-limit headers off every response it makes, so this GET /athlete
    // is enough to refresh stravaRateLimits.
    await stravaClient.stravaGet(userId, '/athlete', {});
    logger.debug('✅ Strava limits updated:', await stravaClient.getLimits());

    res.json({
      success: true,
      message: 'Лимиты обновлены',
      limits: await stravaClient.getLimits()
    });
  } catch (err) {
    if (err instanceof stravaTokens.StravaNotLinkedError) {
      logger.debug('❌ No Strava token found for user:', req.user.userId);
      return res.status(400).json({ error: 'Нет Strava токена для пользователя', code: 'STRAVA_NOT_LINKED' });
    }
    logger.error({ err: err.message }, '❌ Error refreshing Strava limits:');
    res.status(500).json({
      error: err.response?.data?.message || err.message || 'Failed to refresh limits',
      code: 'INTERNAL'
    });
  }
});

// --- ADMIN USERS MANAGEMENT ---

// Получение списка всех пользователей (только для админа)
router.get('/admin/users', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const users = await adminRepo.listUsersForAdmin();

    res.json({ users });
  } catch (error) {
    logger.error({ err: error }, 'Error getting users:');
    res.status(500).json({ error: 'Failed to get users', code: 'INTERNAL' });
  }
});

// Unlink Strava для конкретного пользователя (только для админа)
router.post('/admin/users/:userId/unlink-strava', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Деавторизуем атлета в Strava
    const stravaAccessToken = await adminRepo.getUserStravaAccessToken(userId);
    if (stravaAccessToken) {
      await stravaOAuth.deauthorize(stravaAccessToken);
    }

    await adminRepo.clearStravaLinkForUser(userId);
    await stravaActivities.invalidate(userId);
    await stravaActivities.invalidateBikes(userId);

    res.json({ success: true, message: 'Strava отключен от пользователя' });
  } catch (error) {
    logger.error({ err: error }, 'Error unlinking Strava:');
    res.status(500).json({ error: 'Failed to unlink Strava', code: 'INTERNAL' });
  }
});

// Удаление пользователя со всеми связанными данными (только для админа)
router.delete('/admin/users/:userId', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Деавторизуем атлета в Strava перед удалением
    const stravaAccessToken = await adminRepo.getUserStravaAccessToken(userId);
    if (stravaAccessToken) {
      await stravaOAuth.deauthorize(stravaAccessToken);
    }

    const deletedRecords = await adminRepo.deleteUserCascade(userId);

    // Очищаем серверные кэши
    await activitiesCache.delete(userId);
    await bikesCache.delete(userId);

    res.json({
      success: true,
      message: 'Пользователь удален',
      deletedRecords
    });
  } catch (error) {
    if (error instanceof adminRepo.AdminUserNotFoundError) {
      return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }
    logger.error({ err: error }, 'Error deleting user:');
    res.status(500).json({ error: 'Failed to delete user', code: 'INTERNAL' });
  }
});

module.exports = router;
