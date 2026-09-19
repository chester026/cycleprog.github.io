// DELETE /api/account (T-4.1 domain extraction). Moved verbatim from
// server.js.
const express = require('express');
const router = express.Router();
const logger = require('../lib/logger');
const { authMiddleware } = require('../middleware/auth');
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const stravaOAuth = require('../services/strava/oauth');
const stravaActivities = require('../services/strava/activities');
const { activitiesCache, bikesCache } = stravaActivities;
const accountRepo = require('../repositories/account');
const { contract: c } = require('@bikelab/shared/api');
const { contract } = require('../middleware/contract');

patchAsyncRoutes(router);

// --- Endpoint для удаления аккаунта пользователем ---
router.delete('/', authMiddleware, contract(c.account.remove), async (req, res) => {
  const userId = req.user.userId;
  try {
    // Деавторизуем атлета в Strava (освобождаем квоту)
    const stravaAccessToken = await accountRepo.getStravaAccessToken(userId);
    if (stravaAccessToken) {
      await stravaOAuth.deauthorize(stravaAccessToken);
    }

    await accountRepo.deleteAccountCascade(userId);

    // Очищаем серверные кэши
    await activitiesCache.delete(userId);
    await bikesCache.delete(userId);

    logger.debug(`🗑️ Account deleted: userId=${userId}`);
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    if (error instanceof accountRepo.AccountNotFoundError) {
      return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }
    logger.error({ err: error }, 'Error deleting account:');
    res.status(500).json({ error: 'Failed to delete account', code: 'INTERNAL' });
  }
});

module.exports = router;
