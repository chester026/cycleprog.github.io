const express = require('express');
const logger = require('../lib/logger');
const router = express.Router();
const { authMiddleware, requireAdmin } = require('../middleware/auth');
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const skillsRepo = require('../repositories/skills');
const config = require('../config');
const skillsService = require('../services/skills');
const { contract: c } = require('@bikelab/shared/api');
const { contract } = require('../middleware/contract');
patchAsyncRoutes(router);

// authMiddleware (shared with server.js) sets req.user/req.userId and
// returns the same 401 bodies this file used to produce itself. This extra
// step keeps this file's additional behaviour: reject a request where the
// caller explicitly asks for a different user's data than their own token.
const authenticateUser = (req, res, next) => {
  const requestedUserId = req.query.user_id || req.body?.user_id;
  if (requestedUserId && parseInt(requestedUserId) !== req.userId) {
    return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
  }
  next();
};

// GET /api/skills-history/last
// Получить последний сохраненный снимок навыков
router.get('/last', authMiddleware, contract(c.skills.historyLast), authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;

    const snapshot = await skillsRepo.getLastSnapshot(userId);

    if (!snapshot) {
      return res.status(404).json({
        error: 'No snapshots found',
        code: 'NOT_FOUND'
      });
    }

    res.json(snapshot);
  } catch (err) {
    logger.error({ err }, 'Error fetching last snapshot:');
    res.status(500).json({ 
      error: 'Server error', 
      code: 'INTERNAL' 
    });
  }
});

// GET /api/skills-history/compare
// Получить снимок на определенную дату (или ближайший к ней)
router.get('/compare', authMiddleware, contract(c.skills.historyCompare), authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ 
        error: 'Date parameter is required', 
        code: 'VALIDATION_ERROR' 
      });
    }

    // Проверка формата даты
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({ 
        error: 'Invalid date format. Use YYYY-MM-DD', 
        code: 'VALIDATION_ERROR' 
      });
    }

    const snapshot = await skillsRepo.getSnapshotAtOrBefore(userId, date);

    if (!snapshot) {
      return res.status(404).json({
        error: 'No snapshots found for the given date',
        code: 'NOT_FOUND'
      });
    }

    res.json(snapshot);
  } catch (err) {
    logger.error({ err }, 'Error fetching comparison snapshot:');
    res.status(500).json({ 
      error: 'Server error', 
      code: 'INTERNAL' 
    });
  }
});

// POST /api/skills-history
// Сохранить новый снимок навыков
// Логика: храним только 2 последних снепшота на юзера (текущий + предыдущий для сравнения)
//
// T-3.3 (docs/audit/00-AUDIT-AND-PLAN.md T-3.3, docs/audit/layers/03-react-
// spa.md W-44): clients no longer compute skills themselves, so this is no
// longer a normal client write path — `GET /api/skills` (routes/skills.js)
// is what creates snapshots now, with the canonical shared formula. Kept
// (not deleted — additive rule) as an admin-only manual/debug tool instead.
// LEGACY_MOBILE_COMPAT (config/index.js): the App Store build still POSTs
// its own client-computed skills here. Instead of 403 it gets the canonical
// server computation (same as GET /api/skills) — its numbers are discarded.
const requireAdminUnlessLegacyMobile = (req, res, next) => (
  config.LEGACY_MOBILE_COMPAT ? next() : requireAdmin(req, res, next)
);

router.post('/', authMiddleware, requireAdminUnlessLegacyMobile, contract(c.skills.historyCreate), authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;
    if (config.LEGACY_MOBILE_COMPAT && req.userRow?.is_admin !== true) {
      const { skills, lastActivityId } = await skillsService.computeSkills(userId);
      // saveSnapshot itself no-ops when a row for this lastActivityId exists.
      await skillsService.saveSnapshot(userId, skills, { lastActivityId });
      return res.json({ success: true, legacy: true, ...skills });
    }
    logger.warn({ userId: req.user?.userId }, '[skills-history] admin manual POST /api/skills-history');
    const { climbing, sprint, endurance, tempo, power, consistency, last_activity_id } = req.body;

    // Валидация
    const skills = { climbing, sprint, endurance, tempo, power, consistency };
    
    for (const [key, value] of Object.entries(skills)) {
      if (value === undefined || value === null) {
        return res.status(400).json({ 
          error: `Missing required field: ${key}`, 
          code: 'VALIDATION_ERROR' 
        });
      }
      
      if (typeof value !== 'number' || value < 0 || value > 100) {
        return res.status(400).json({ 
          error: `Invalid value for ${key}. Must be a number between 0 and 100`, 
          code: 'VALIDATION_ERROR' 
        });
      }
    }

    // 1. Вставляем новый снепшот (при конфликте по дате — обновляем существующий)
    const inserted = await skillsRepo.upsertManualSnapshot(userId, {
      climbing, sprint, endurance, tempo, power, consistency, last_activity_id,
    });

    // 2. Удаляем старые снепшоты, оставляя только 2 последних
    await skillsRepo.pruneToLastTwo(userId);

    logger.debug(`📸 Skills snapshot saved for user ${userId}, keeping last 2 snapshots`);

    res.json({
      success: true,
      ...inserted
    });
  } catch (err) {
    logger.error({ err }, 'Error saving snapshot:');
    res.status(500).json({ 
      error: 'Server error', 
      code: 'INTERNAL' 
    });
  }
});

// GET /api/skills-history/range
// Получить последние N снимков или снимки за период
router.get('/range', authMiddleware, contract(c.skills.historyRange), authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;
    const { start_date, end_date, limit } = req.query;

    // Если указан limit - возвращаем последние N снимков
    if (limit) {
      // S-34: `limit` used to go straight into `parseInt(limit)` with no
      // upper bound — an arbitrarily large `?limit=` returned an
      // arbitrarily large result set, and a non-numeric one
      // (`parseInt('abc')` is NaN) couldn't be bound as a bigint and threw,
      // surfacing as a 500. Validate it's a positive integer (400
      // VALIDATION_ERROR otherwise) and clamp it to [1, 500] — the query
      // never fetches more than 500 rows for one user's chart regardless of
      // what the client asks for (repositories/skills.js's getRecentSnapshots
      // clamps again as a second line of defense).
      const parsedLimit = Number(limit);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
        return res.status(400).json({
          error: 'limit must be a positive integer',
          code: 'VALIDATION_ERROR',
        });
      }
      const clampedLimit = Math.min(parsedLimit, skillsRepo.MAX_RANGE_LIMIT);

      const rows = await skillsRepo.getRecentSnapshots(userId, clampedLimit);
      return res.json(rows);
    }

    // Иначе возвращаем снимки за период
    const snapshots = await skillsRepo.getSnapshotsInRange(userId, start_date, end_date);

    res.json({
      user_id: userId,
      snapshots
    });
  } catch (err) {
    logger.error({ err }, 'Error fetching snapshot range:');
    res.status(500).json({ 
      error: 'Server error', 
      code: 'INTERNAL' 
    });
  }
});

// DELETE /api/skills-history/cleanup-month
// Очистка старых снимков: оставляем только последний снимок за предыдущий месяц
//
// T-3.3: previously called from a client-side effect on the 1st of the
// month (docs/audit/layers/03-react-spa.md W-44) — deleting history from a
// client effect is exactly the kind of client-writes-derived-data pattern
// this task removes. Admin-only now; snapshot retention (2 rows/user) is
// otherwise handled by services/skills.js's saveSnapshot on every write.
router.delete('/cleanup-month', authMiddleware, requireAdmin, contract(c.skills.historyCleanupMonth), authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;
    logger.warn({ userId: req.user?.userId }, '[skills-history] admin manual DELETE /api/skills-history/cleanup-month');

    // Получаем все снимки за предыдущий месяц
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    
    // Находим последний снимок предыдущего месяца
    const lastSnapshotId = await skillsRepo.getLastSnapshotIdInWindow(userId, lastMonth, lastMonthEnd);

    if (!lastSnapshotId) {
      return res.json({
        message: 'No snapshots to clean up',
        deleted: 0
      });
    }

    // Удаляем все снимки предыдущего месяца КРОМЕ последнего
    const deleted = await skillsRepo.deleteSnapshotsInWindowExcept(userId, lastMonth, lastMonthEnd, lastSnapshotId);

    res.json({
      message: 'Cleanup successful',
      deleted,
      kept_snapshot_id: lastSnapshotId
    });
  } catch (err) {
    logger.error({ err }, 'Error cleaning up snapshots:');
    res.status(500).json({ 
      error: 'Server error', 
      code: 'INTERNAL' 
    });
  }
});

// Kept as a function-returning-router (rather than exporting `router`
// directly) so server.js's `require('./routes/skillsHistory')(pool)` mount
// call doesn't need to change — all SQL now goes through repositories/
// skills.js's own `pool` import instead of this injected one.
module.exports = function() {
  return router;
};

