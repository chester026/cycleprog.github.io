// Bikes + garage health (T-4.1 domain extraction). Moved verbatim from
// server.js — see services/bikes.js (BIKE_COMPONENTS, health computation)
// and repositories/bikes.js (SQL).
const express = require('express');
const router = express.Router();
const logger = require('../lib/logger');
const { authMiddleware } = require('../middleware/auth');
const { contract: c } = require('@bikelab/shared/api');
const { contract } = require('../middleware/contract');
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const { determineRiderProfile } = require('@bikelab/shared/calc');
const stravaTokens = require('../services/strava/tokens');
const stravaClient = require('../services/strava/client');
const stravaActivities = require('../services/strava/activities');
const { bikesCache } = stravaActivities;
const bikesService = require('../services/bikes');
const bikesRepo = require('../repositories/bikes');
const { withTransaction } = require('../db');
patchAsyncRoutes(router);

// Small per-process cache for the /gear/:id Strava fallback in the health
// route below (S-35, docs/audit/00-AUDIT-AND-PLAN.md): getBikes()'s
// bikesCache already caches each bike's distance, but that cache can be
// cold (user hasn't opened the bikes screen yet this TTL window) while the
// health route below still needs *some* gear distance to compute wear from.
// Without a cache of its own here, every health-check request in that
// situation re-hits Strava's /gear/:id — even though a bike's total
// distance changes at most once per ride, nowhere near once per health
// check. BoundedCache (services/strava/activities.js) isn't exported, so
// this is a small dedicated Map with the same TTL as bikesCache.
const GEAR_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const gearDistanceCache = new Map(); // `${userId}:${bikeId}` -> { km, ts }

function getCachedGearKm(userId, bikeId) {
  const key = `${userId}:${bikeId}`;
  const entry = gearDistanceCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > GEAR_CACHE_TTL_MS) {
    gearDistanceCache.delete(key);
    return undefined;
  }
  return entry.km;
}

function setCachedGearKm(userId, bikeId, km) {
  gearDistanceCache.set(`${userId}:${bikeId}`, { km, ts: Date.now() });
}

// === Получение информации о велосипедах пользователя из Strava ===
router.get('/', authMiddleware, contract(c.bikes.list), async (req, res) => {
  try {
    const userId = req.user.userId;
    const formattedBikes = await stravaActivities.getBikes(userId);
    res.json(formattedBikes);
  } catch (err) {
    if (err instanceof stravaTokens.StravaNotLinkedError) {
      return res.json([]);
    }
    if (err instanceof stravaClient.StravaRateLimitError) {
      return res
        .status(429)
        .json({ error: 'Strava API rate limit reached. Try again later.', code: 'RATE_LIMITED', retryAfter: err.retryAfterSec || 900 });
    }
    logger.error({ err: err.response?.data || err }, 'Error fetching bikes:');
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      res.status(503).json({ error: 'Strava API timeout. Please try again later.', code: 'UPSTREAM_ERROR' });
    } else {
      res.status(500).json({ error: err.message || 'Failed to fetch bikes', code: 'INTERNAL' });
    }
  }
});

router.get('/:bikeId/health', authMiddleware, contract(c.bikes.health), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { bikeId } = req.params;

    // 1. Get rider weight from profile
    const riderWeight = (await bikesRepo.getRiderWeight(userId)) ?? 75;

    // 2. Get all activities, filter by gear_id
    let activities = [];
    try {
      activities = await stravaActivities.getActivities(userId);
    } catch (err) {
      if (!(err instanceof stravaTokens.StravaNotLinkedError)) throw err;
    }

    const bikeActivities = activities.filter(a => a.gear_id === bikeId);
    const totalKm = bikeActivities.reduce((s, a) => s + (a.distance || 0), 0) / 1000;

    // 3. Get riding style from skills_history (actual computed values)
    let ridingStyle = { climbing: 0, sprint: 0, power: 0 };
    let riderProfile = { profile: 'Unknown', emoji: '❓' };
    const latestSkills = await bikesRepo.getLatestSkills(userId);
    if (latestSkills) {
      const allSkills = {
        climbing: latestSkills.climbing || 0,
        sprint: latestSkills.sprint || 0,
        endurance: latestSkills.endurance || 0,
        tempo: latestSkills.tempo || 0,
        power: latestSkills.power || 0,
        consistency: latestSkills.consistency || 0,
      };

      // Determine dominant skills for wear factors
      ridingStyle = { climbing: allSkills.climbing, sprint: allSkills.sprint, power: allSkills.power };

      // Determine rider profile (same logic as client skillsCalculator)
      riderProfile = determineRiderProfile(allSkills);
    }

    // 4. Get latest resets for each component
    const { resets, hasAny: onboardingCompleted } = await bikesRepo.getComponentResets(userId, bikeId);

    // 4b. Custom gear labels (see bike_component_labels table comment above)
    const { groupLabels, componentLabels } = await bikesRepo.getComponentLabels(userId, bikeId);

    // 5. Get totalKm — prefer Strava gear distance (more accurate than summing activities)
    let gearTotalKm = totalKm;
    const cachedBikes = await bikesCache.get(userId);
    if (cachedBikes && Array.isArray(cachedBikes.data)) {
      const bikeData = cachedBikes.data.find(b => b.id === bikeId);
      if (bikeData && bikeData.distanceKm > 0) {
        gearTotalKm = bikeData.distanceKm;
      }
    }
    // If no cached distance and we have a Strava token, fetch gear details
    // directly — but check our own gear cache first (see gearDistanceCache
    // above) so repeated health calls for the same bike don't re-hit Strava.
    if (gearTotalKm === 0) {
      const cachedGearKm = getCachedGearKm(userId, bikeId);
      if (cachedGearKm !== undefined) {
        gearTotalKm = cachedGearKm;
      } else {
        try {
          const gearResp = await stravaClient.stravaGet(userId, `/gear/${bikeId}`, {});
          if (gearResp.data && gearResp.data.distance) {
            gearTotalKm = Math.round(gearResp.data.distance / 1000 * 100) / 100;
            setCachedGearKm(userId, bikeId, gearTotalKm);
          }
        } catch (gearErr) {
          logger.warn('Could not fetch gear distance from Strava:', gearErr.message);
        }
      }
    }

    // 6. Calculate wear per component
    logger.debug(`[BikeHealth] bikeId=${bikeId}, gearTotalKm=${gearTotalKm}, bikeActivities=${bikeActivities.length}, ridingStyle=`, ridingStyle);
    const { components, overallHealth, nextService } = bikesService.computeComponentHealth({
      gearTotalKm,
      riderWeight,
      ridingStyle,
      resets,
    });

    res.json({
      bikeId,
      totalKm: Math.round(gearTotalKm),
      riderWeight,
      ridingStyle,
      riderProfile,
      components,
      overallHealth,
      nextService,
      onboardingCompleted,
      groupLabels,
      componentLabels,
    });
  } catch (err) {
    logger.error({ err }, 'Error computing bike health:');
    res.status(500).json({ error: 'Failed to compute bike health', code: 'INTERNAL' });
  }
});

// === Bike gear labels — custom names for a component group or a single
// component card (see bike_component_labels table comment). Body:
// { labels: [{ target_type: 'group'|'component', target_key, custom_name }, ...] }
// Accepts several at once since one rider statement can set both
// ("wheels are Hunt, tires are Conti GP5000" -> group 'wheels' + component
// 'tires' in the same call).
router.put('/:bikeId/labels', authMiddleware, contract(c.bikes.updateLabels), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { bikeId } = req.params;
    const { labels } = req.body;

    if (!Array.isArray(labels) || labels.length === 0) {
      return res.status(400).json({ error: 'labels array is required', code: 'VALIDATION_ERROR' });
    }

    const validGroupKeys = ['drivetrain', 'brakes', 'wheels', 'contact'];
    const validComponentIds = bikesService.BIKE_COMPONENTS.map((c) => c.id);

    const cleanWithDupes = labels
      .filter((l) => {
        if (!l || typeof l.custom_name !== 'string' || !l.custom_name.trim()) return false;
        if (l.target_type === 'group') return validGroupKeys.includes(l.target_key);
        if (l.target_type === 'component') return validComponentIds.includes(l.target_key);
        return false;
      })
      .map((l) => ({ target_type: l.target_type, target_key: l.target_key, custom_name: l.custom_name.trim().slice(0, 64) }));

    if (cleanWithDupes.length === 0) {
      return res.status(400).json({ error: 'No valid labels provided', code: 'BAD_REQUEST' });
    }

    // De-dupe by (target_type, target_key), keeping the LAST occurrence —
    // same "last one wins" semantics as the old per-label upsert loop. The
    // batched UNNEST upsert below is a single INSERT statement, and Postgres
    // rejects an ON CONFLICT DO UPDATE that would affect the same row twice
    // in one statement, so a duplicate key in the request body must be
    // collapsed before it reaches the batch.
    const byKey = new Map();
    for (const l of cleanWithDupes) byKey.set(`${l.target_type}:${l.target_key}`, l);
    const clean = Array.from(byKey.values());

    // One UNNEST upsert inside withTransaction instead of N single upserts
    // (S-28) — a mid-batch failure now leaves the previously-saved labels
    // intact instead of half-applying the new set.
    await withTransaction((client) => bikesRepo.upsertComponentLabelsBatch(userId, bikeId, clean, client));

    res.json({ success: true, count: clean.length });
  } catch (err) {
    logger.error({ err }, 'Error saving bike gear labels:');
    res.status(500).json({ error: 'Failed to save labels', code: 'INTERNAL' });
  }
});

// === Bike component reset (mark as replaced) ===
router.post('/:bikeId/components/:component/reset', authMiddleware, contract(c.bikes.resetComponent), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { bikeId, component } = req.params;

    const validComponents = bikesService.BIKE_COMPONENTS.map(c => c.id);
    if (!validComponents.includes(component)) {
      return res.status(400).json({ error: 'Invalid component', code: 'VALIDATION_ERROR' });
    }

    // Get current bike mileage
    let currentKm = 0;
    const cachedBikes = await bikesCache.get(userId);
    if (cachedBikes && Array.isArray(cachedBikes.data)) {
      const bikeData = cachedBikes.data.find(b => b.id === bikeId);
      if (bikeData) currentKm = bikeData.distanceKm;
    }

    await bikesRepo.insertComponentReset(userId, bikeId, component, currentKm);

    res.json({ success: true, component, resetKm: currentKm });
  } catch (err) {
    logger.error({ err }, 'Error resetting component:');
    res.status(500).json({ error: 'Failed to reset component', code: 'INTERNAL' });
  }
});

// === Bike onboarding — bulk initial component setup ===
router.post('/:bikeId/onboarding', authMiddleware, contract(c.bikes.onboarding), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { bikeId } = req.params;
    const { resets } = req.body;

    if (!Array.isArray(resets) || resets.length === 0) {
      return res.status(400).json({ error: 'resets array is required', code: 'VALIDATION_ERROR' });
    }

    const validIds = bikesService.BIKE_COMPONENTS.map(c => c.id);
    const clean = resets.filter((r) => validIds.includes(r.component));

    if (clean.length === 0) {
      return res.status(400).json({ error: 'No valid components provided', code: 'BAD_REQUEST' });
    }

    const count = await bikesRepo.insertOnboardingResets(userId, bikeId, clean);

    res.json({ success: true, count });
  } catch (err) {
    logger.error({ err }, 'Error saving bike onboarding:');
    res.status(500).json({ error: 'Failed to save bike onboarding', code: 'INTERNAL' });
  }
});

module.exports = router;
