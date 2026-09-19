// GET /api/admin/ai-usage — per-user OpenAI token usage report (T-4.4,
// audit S-31). New file (not part of routes/admin.js) so this task doesn't
// touch that shared file; mount it in server.js alongside the other admin
// routes — see the report for the exact line.
const express = require('express');
const router = express.Router();
const logger = require('../lib/logger');
const { authMiddleware, requireAdmin } = require('../middleware/auth');
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const aiBudgetRepo = require('../repositories/aiBudget');
const { contract: c } = require('@bikelab/shared/api');
const { contract } = require('../middleware/contract');
patchAsyncRoutes(router);

router.get('/admin/ai-usage', authMiddleware, requireAdmin, contract(c.admin.aiUsage), async (req, res) => {
  try {
    const requestedDays = parseInt(req.query.days, 10);
    const days = Number.isInteger(requestedDays) && requestedDays > 0 ? Math.min(requestedDays, 90) : 7;
    const users = await aiBudgetRepo.getUserTotals(days);
    res.json({ days, users });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching AI usage report:');
    res.status(500).json({ error: 'Failed to fetch AI usage report', code: 'INTERNAL' });
  }
});

module.exports = router;
