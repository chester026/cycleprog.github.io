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
const { pool } = require('../db');
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
  const perUser = await pool.query(`
    SELECT u.id AS user_id, u.email,
           COUNT(sa.strava_id)::int AS activities,
           COUNT(sa.strava_id) FILTER (WHERE sa.raw IS NULL)::int AS without_raw,
           MAX(sa.start_date) AS last_activity,
           MAX(sa.synced_at) AS last_synced_at
      FROM users u
      LEFT JOIN synced_activities sa ON sa.user_id = u.id
     WHERE u.strava_id IS NOT NULL
     GROUP BY u.id, u.email
     ORDER BY u.id`);
  const totals = await pool.query(`
    SELECT COUNT(*)::int AS activities,
           COUNT(*) FILTER (WHERE raw IS NULL)::int AS without_raw,
           pg_size_pretty(pg_total_relation_size('synced_activities')) AS table_size
      FROM synced_activities`);
  res.json({ totals: totals.rows[0], users: perUser.rows, strava_limits: stravaClient.getLimits() });
});

router.get('/strava/limits', authMiddleware, requireAdmin, (req, res) => {
  try {
    res.json(stravaClient.getLimits() || {
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
    logger.debug('✅ Strava limits updated:', stravaClient.getLimits());

    res.json({
      success: true,
      message: 'Лимиты обновлены',
      limits: stravaClient.getLimits()
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
    const users = await pool.query(`
      SELECT
        u.id,
        u.email,
        u.email_verified,
        u.strava_id,
        u.strava_access_token IS NOT NULL as has_strava_token,
        u.created_at,
        p.experience_level,
        (SELECT COUNT(*) FROM rides r WHERE r.user_id = u.id) as rides_count,
        (SELECT COUNT(*) FROM goals g WHERE g.user_id = u.id) as goals_count,
        (SELECT COUNT(*) FROM events e WHERE e.user_id = u.id) as events_count
      FROM users u
      LEFT JOIN user_profiles p ON u.id = p.user_id
      ORDER BY u.created_at DESC
    `);

    res.json({ users: users.rows });
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
    const userResult = await pool.query('SELECT strava_access_token FROM users WHERE id = $1', [userId]);
    if (userResult.rows[0]?.strava_access_token) {
      await stravaOAuth.deauthorize(userResult.rows[0].strava_access_token);
    }

    await pool.query(`
      UPDATE users
      SET
        strava_access_token = NULL,
        strava_refresh_token = NULL,
        strava_expires_at = NULL,
        strava_id = NULL
      WHERE id = $1
    `, [userId]);
    await pool.query('DELETE FROM synced_activities WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM synced_bikes WHERE user_id = $1', [userId]);
    stravaActivities.invalidate(userId);
    stravaActivities.invalidateBikes(userId);

    res.json({ success: true, message: 'Strava отключен от пользователя' });
  } catch (error) {
    logger.error({ err: error }, 'Error unlinking Strava:');
    res.status(500).json({ error: 'Failed to unlink Strava', code: 'INTERNAL' });
  }
});

// Удаление пользователя со всеми связанными данными (только для админа)
router.delete('/admin/users/:userId', authMiddleware, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { userId } = req.params;

    // Деавторизуем атлета в Strava перед удалением
    const userResult = await pool.query('SELECT strava_access_token FROM users WHERE id = $1', [userId]);
    if (userResult.rows[0]?.strava_access_token) {
      await stravaOAuth.deauthorize(userResult.rows[0].strava_access_token);
    }

    await client.query('BEGIN');

    const deleteQueries = [
      'DELETE FROM activity_meta_goals_progress WHERE user_id = $1',
      'DELETE FROM custom_training_plans WHERE user_id = $1',
      'DELETE FROM generated_weekly_plans WHERE user_id = $1',
      'DELETE FROM checklist WHERE user_id = $1',
      'DELETE FROM ai_analysis_cache WHERE user_id = $1',
      'DELETE FROM bike_component_resets WHERE user_id = $1',
      'DELETE FROM rides WHERE user_id = $1',
      'DELETE FROM goals WHERE user_id = $1',
      'DELETE FROM meta_goals WHERE user_id = $1',
      'DELETE FROM events WHERE user_id = $1',
      'DELETE FROM user_images WHERE user_id = $1',
      'DELETE FROM user_profiles WHERE user_id = $1',
      'DELETE FROM skills_history WHERE user_id = $1',
      'DELETE FROM analytics_snapshots WHERE user_id = $1',
      'DELETE FROM user_achievements WHERE user_id = $1',
      'DELETE FROM users WHERE id = $1'
    ];

    let deletedRecords = {};

    // As in DELETE /api/account: any failure must propagate to the outer
    // catch (ROLLBACK), not be swallowed per-statement.
    for (const query of deleteQueries) {
      const result = await client.query(query, [userId]);
      const tableName = query.split('FROM ')[1].split(' WHERE')[0];
      deletedRecords[tableName] = result.rowCount;
    }

    if (!deletedRecords.users) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }

    await client.query('COMMIT');

    // Очищаем серверные кэши
    activitiesCache.delete(userId);
    bikesCache.delete(userId);

    res.json({
      success: true,
      message: 'Пользователь удален',
      deletedRecords
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error({ err: error }, 'Error deleting user:');
    res.status(500).json({ error: 'Failed to delete user', code: 'INTERNAL' });
  } finally {
    client.release();
  }
});

module.exports = router;
