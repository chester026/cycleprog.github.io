// --- Manual rides -----------------------------------------------------------
// User-entered/imported rides (as opposed to Strava activities). Separate
// from /api/calendar (routes/calendar.js) — see the calendar_events table
// comment in the startup migration for why the two coexist. Extracted from
// server.js (T-4.1).
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const { updateUserGoals } = require('../services/goals');
const { withTransaction } = require('../db');
const ridesRepo = require('../repositories/rides');
const { contract: c } = require('@bikelab/shared/api');
const { contract } = require('../middleware/contract');
patchAsyncRoutes(router);

// Get all rides for current user
router.get('/', authMiddleware, contract(c.rides.list), async (req, res) => {
  const userId = req.user.userId;
  const rows = await ridesRepo.listRides(userId);
  res.json(rows);
});

// Add a ride for current user
router.post('/', authMiddleware, contract(c.rides.create), async (req, res) => {
  const userId = req.user.userId;
  const { title, location, locationLink, details, start } = req.body;
  const row = await ridesRepo.createRide(userId, { title, location, locationLink, details, start });

  // Автоматически обновляем цели после добавления поездки
  await updateUserGoals(userId);

  res.json(row);
});

// Update a ride
router.put('/:id', authMiddleware, contract(c.rides.update), async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const { title, location, locationLink, details, start } = req.body;
  const row = await ridesRepo.updateRide(id, userId, { title, location, locationLink, details, start });
  if (!row) return res.status(404).json({ error: 'Ride not found', code: 'RIDE_NOT_FOUND' });
  res.json(row);
});

// Delete a ride
router.delete('/:id', authMiddleware, contract(c.rides.remove), async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const row = await ridesRepo.deleteRide(id, userId);
  if (!row) return res.status(404).json({ error: 'Ride not found', code: 'RIDE_NOT_FOUND' });
  res.json({ success: true });
});

// (Optional) Import rides for current user
router.post('/import', authMiddleware, contract(c.rides.import), async (req, res) => {
  const userId = req.user.userId;
  const ridesToImport = req.body;
  if (!Array.isArray(ridesToImport)) {
    return res.status(400).json({ error: 'Expected array of rides', code: 'BAD_REQUEST' });
  }

  // Validate every row up front — a batch import must not partially land
  // (S-28): previously N single INSERTs meant a bad row midway through the
  // array left every earlier row already committed. `start` is the one
  // field the `rides` table can't do without (everything else renders fine
  // as NULL) and the column is TIMESTAMPTZ, so a missing/unparseable one is
  // rejected here rather than surfacing as an opaque cast error mid-INSERT.
  for (const ride of ridesToImport) {
    if (!ride || typeof ride !== 'object' || !ride.start || Number.isNaN(Date.parse(ride.start))) {
      return res.status(400).json({ error: 'Each ride requires a valid start date', code: 'VALIDATION_ERROR' });
    }
  }

  // One UNNEST insert inside withTransaction instead of N single INSERTs —
  // a mid-batch DB-level failure (a case the pre-check above doesn't catch)
  // rolls back the whole import instead of leaving it partially applied.
  const imported = ridesToImport.length === 0
    ? 0
    : await withTransaction((client) => ridesRepo.importRidesBatch(userId, ridesToImport, client));

  // Автоматически обновляем цели после импорта поездок
  await updateUserGoals(userId);

  res.json({ success: true, imported });
});

module.exports = router;
