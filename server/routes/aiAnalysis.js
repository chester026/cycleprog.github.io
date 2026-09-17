// AI analysis route (T-4.1 domain extraction): `POST /api/ai-analysis`.
// Extracted from server.js. Not scoped to a single activity (no `:id`), so
// it's mounted at `/api` rather than living under routes/activities.js
// (mounted at `/api/activities`) — see that file for the per-activity
// activities routes this domain also covers.
const express = require('express');
const router = express.Router();
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const logger = require('../lib/logger');
const { authMiddleware } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimits');
// Required as the module object (not destructured) so tests can
// `vi.spyOn(aiAnalysis, 'analyzeTraining')` and have that spy actually
// observed here.
const aiAnalysis = require('../aiAnalysis');
const { pool } = require('../db');
patchAsyncRoutes(router);

// Auth moved to the shared authMiddleware (was a manual jwt.verify here) —
// the 401 body on a missing/invalid token is now `{ error: 'No token' }` /
// `{ error: 'Invalid token' }` instead of `{ error: 'Authorization required' }`
// (see docs/audit/00-AUDIT-AND-PLAN.md T-1.1; noted as an acceptable change).
router.post('/ai-analysis', aiLimiter, authMiddleware, async (req, res) => {
  try {
    const summary = req.body.summary;
    if (!summary) return res.status(400).json({ error: 'No summary provided', code: 'BAD_REQUEST' });
    const userId = req.user.userId;
    const analysis = await aiAnalysis.analyzeTraining(summary, pool, userId);
    res.json({ analysis });
  } catch (e) {
    logger.error({ err: e }, 'AI analysis error:');
    res.status(500).json({ error: 'AI analysis failed', code: 'INTERNAL' });
  }
});

module.exports = router;
