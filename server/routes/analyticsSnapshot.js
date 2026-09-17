// ========================================
// ANALYTICS SNAPSHOTS API
// ========================================
// T-3.3 (docs/audit/00-AUDIT-AND-PLAN.md T-3.3, docs/audit/layers/04-cross-
// layer.md §5.4): previously written by clients with their own numbers
// (react-spa's `buildSnapshotPayload`, the mobile app) — the server now
// writes this itself from `GET /api/skills` (services/analyticsSnapshot.js),
// so this becomes an admin-only manual/debug fallback, additive rather than
// removed.
const express = require('express');
const router = express.Router();
const logger = require('../lib/logger');
const { authMiddleware, requireAdmin } = require('../middleware/auth');
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const { pool } = require('../db');
patchAsyncRoutes(router);

router.post('/', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const userId = req.user.userId;
    logger.warn({ userId: req.user.userId }, '[analytics-snapshot] admin manual POST /api/analytics-snapshot');
    const { lastActivityId, power, heart, speed, cadence, vo2max, activitiesCount } = req.body;

    if (!lastActivityId) {
      return res.status(400).json({ error: 'lastActivityId is required', code: 'VALIDATION_ERROR' });
    }

    const existing = await pool.query(
      'SELECT id FROM analytics_snapshots WHERE user_id = $1 AND last_activity_id = $2',
      [userId, lastActivityId]
    );
    if (existing.rows.length > 0) {
      return res.json({ saved: false, reason: 'no_new_data' });
    }

    await pool.query(
      `INSERT INTO analytics_snapshots (
        user_id, snapshot_date, last_activity_id,
        avg_power, max_power, min_power,
        avg_hr, max_hr, min_hr,
        avg_speed, max_speed, min_speed,
        avg_cadence, max_cadence, min_cadence,
        vo2max, activities_count
      ) VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (user_id, snapshot_date) DO UPDATE SET
        last_activity_id = EXCLUDED.last_activity_id,
        avg_power = EXCLUDED.avg_power, max_power = EXCLUDED.max_power, min_power = EXCLUDED.min_power,
        avg_hr = EXCLUDED.avg_hr, max_hr = EXCLUDED.max_hr, min_hr = EXCLUDED.min_hr,
        avg_speed = EXCLUDED.avg_speed, max_speed = EXCLUDED.max_speed, min_speed = EXCLUDED.min_speed,
        avg_cadence = EXCLUDED.avg_cadence, max_cadence = EXCLUDED.max_cadence, min_cadence = EXCLUDED.min_cadence,
        vo2max = EXCLUDED.vo2max, activities_count = EXCLUDED.activities_count,
        created_at = NOW()`,
      [
        userId, lastActivityId,
        power?.avg || null, power?.max || null, power?.min || null,
        heart?.avg || null, heart?.max || null, heart?.min || null,
        speed?.avg || null, speed?.max || null, speed?.min || null,
        cadence?.avg || null, cadence?.max || null, cadence?.min || null,
        vo2max || null, activitiesCount || 0
      ]
    );

    // Same principle as skills_history: we only ever compare "latest vs
    // previous", so there's no reason to keep more than 2 rows per user —
    // trim right after every successful save.
    await pool.query(
      `DELETE FROM analytics_snapshots
       WHERE user_id = $1
         AND id NOT IN (
           SELECT id FROM analytics_snapshots
           WHERE user_id = $1
           ORDER BY snapshot_date DESC
           LIMIT 2
         )`,
      [userId]
    );

    logger.debug(`📸 Analytics snapshot saved for user ${userId}, activity ${lastActivityId}, keeping last 2 snapshots`);
    res.json({ saved: true });
  } catch (err) {
    logger.error({ err }, 'Error saving analytics snapshot:');
    res.status(500).json({ error: 'Failed to save snapshot', code: 'INTERNAL' });
  }
});

router.get('/latest', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await pool.query(
      'SELECT * FROM analytics_snapshots WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 1',
      [userId]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    logger.error({ err }, 'Error fetching latest snapshot:');
    res.status(500).json({ error: 'Failed to fetch snapshot', code: 'INTERNAL' });
  }
});

router.get('/history', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = Math.min(parseInt(req.query.limit) || 12, 52);
    const result = await pool.query(
      'SELECT * FROM analytics_snapshots WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT $2',
      [userId, limit]
    );
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, 'Error fetching snapshot history:');
    res.status(500).json({ error: 'Failed to fetch history', code: 'INTERNAL' });
  }
});

module.exports = router;
