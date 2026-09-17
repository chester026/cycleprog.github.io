// GET /api/skills (T-3.3, docs/audit/00-AUDIT-AND-PLAN.md T-3.3) — computes
// this user's 6-scale skills + rider profile server-side from the canonical
// shared formula, snapshots it into `skills_history` (idempotent per
// last_activity_id — see services/skills.js), and also refreshes this
// user's `analytics_snapshots` row (previously written by clients with
// their own numbers — docs/audit/layers/03-react-spa.md W-44,
// docs/audit/layers/04-cross-layer.md §5.4). Clients only ever read this
// route now; `POST /api/skills-history` and `POST /api/analytics-snapshot`
// are admin-only fallbacks (see routes/skillsHistory.js, server.js).
const express = require('express');
const router = express.Router();
const logger = require('../lib/logger');
const { authMiddleware } = require('../middleware/auth');
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const skillsService = require('../services/skills');
const { upsertAnalyticsSnapshot } = require('../services/analyticsSnapshot');
const { pool } = require('../db');
patchAsyncRoutes(router);

router.get('/', authMiddleware, async (req, res) => {
  const userId = req.userId;

  const { skills, riderProfile, confidence, sampleSize, lastActivityId } = await skillsService.computeSkills(userId);

  const previousBeforeSave = await skillsService.getLastSnapshot(userId);
  const alreadyUpToDate = previousBeforeSave && String(previousBeforeSave.last_activity_id) === String(lastActivityId);

  let previous = alreadyUpToDate ? null : previousBeforeSave;
  if (!alreadyUpToDate) {
    await skillsService.saveSnapshot(userId, skills, { lastActivityId });
  } else {
    // Nothing new to snapshot — "previous" for the trend badge is whatever
    // was already saved the time before this one, not the just-matched row.
    const rows = await pool.query(
      'SELECT * FROM skills_history WHERE user_id = $1 ORDER BY snapshot_date DESC OFFSET 1 LIMIT 1',
      [userId]
    );
    previous = rows.rows[0] || null;
  }

  const trend = skillsService.computeTrend(skills, previous);

  // Best-effort: analytics_snapshots is a supporting/derived table for
  // garage widgets, not this route's own contract — never fail the request
  // over it.
  try {
    await upsertAnalyticsSnapshot(userId, { lastActivityId });
  } catch (err) {
    logger.warn({ err: err.message, userId }, '[skills] analytics snapshot refresh failed:');
  }

  res.json({
    skills,
    riderProfile,
    confidence,
    sampleSize,
    lastActivityId,
    previous,
    trend,
  });
});

module.exports = router;
