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
const analyticsSnapshotRepo = require('../repositories/analyticsSnapshot');
const config = require('../config');
const { upsertAnalyticsSnapshot } = require('../services/analyticsSnapshot');
patchAsyncRoutes(router);

// LEGACY_MOBILE_COMPAT (config/index.js): the App Store build POSTs its own
// aggregates here; while the flag is on it gets the server-side snapshot
// (services/analyticsSnapshot.js) instead of 403 — its body is ignored.
const requireAdminUnlessLegacyMobile = (req, res, next) => (
  config.LEGACY_MOBILE_COMPAT ? next() : requireAdmin(req, res, next)
);

router.post('/', authMiddleware, requireAdminUnlessLegacyMobile, async (req, res) => {
  try {
    const userId = req.user.userId;
    if (config.LEGACY_MOBILE_COMPAT && req.userRow?.is_admin !== true) {
      const result = await upsertAnalyticsSnapshot(userId, { lastActivityId: req.body?.lastActivityId });
      return res.json({ saved: Boolean(result?.saved ?? true), legacy: true });
    }
    logger.warn({ userId: req.user.userId }, '[analytics-snapshot] admin manual POST /api/analytics-snapshot');
    const { lastActivityId, power, heart, speed, cadence, vo2max, activitiesCount } = req.body;

    if (!lastActivityId) {
      return res.status(400).json({ error: 'lastActivityId is required', code: 'VALIDATION_ERROR' });
    }

    const existing = await analyticsSnapshotRepo.findSnapshotByLastActivity(userId, lastActivityId);
    if (existing) {
      return res.json({ saved: false, reason: 'no_new_data' });
    }

    await analyticsSnapshotRepo.upsertSnapshot(userId, {
      lastActivityId, power, heart, speed, cadence, vo2max, activitiesCount,
    });

    // Same principle as skills_history: we only ever compare "latest vs
    // previous", so there's no reason to keep more than 2 rows per user —
    // trim right after every successful save.
    await analyticsSnapshotRepo.trimSnapshotsKeepingLatest(userId, 2);

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
    const snapshot = await analyticsSnapshotRepo.getLatestSnapshot(userId);
    res.json(snapshot);
  } catch (err) {
    logger.error({ err }, 'Error fetching latest snapshot:');
    res.status(500).json({ error: 'Failed to fetch snapshot', code: 'INTERNAL' });
  }
});

router.get('/history', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = Math.min(parseInt(req.query.limit) || 12, 52);
    const history = await analyticsSnapshotRepo.getSnapshotHistory(userId, limit);
    res.json(history);
  } catch (err) {
    logger.error({ err }, 'Error fetching snapshot history:');
    res.status(500).json({ error: 'Failed to fetch history', code: 'INTERNAL' });
  }
});

module.exports = router;
