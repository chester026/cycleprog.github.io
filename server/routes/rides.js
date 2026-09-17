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
const ridesRepo = require('../repositories/rides');
patchAsyncRoutes(router);

// Get all rides for current user
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const rows = await ridesRepo.listRides(userId);
  res.json(rows);
});

// Add a ride for current user
router.post('/', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const { title, location, locationLink, details, start } = req.body;
  const row = await ridesRepo.createRide(userId, { title, location, locationLink, details, start });

  // Автоматически обновляем цели после добавления поездки
  await updateUserGoals(userId);

  res.json(row);
});

// Update a ride
router.put('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const { title, location, locationLink, details, start } = req.body;
  const row = await ridesRepo.updateRide(id, userId, { title, location, locationLink, details, start });
  if (!row) return res.status(404).json({ error: 'Ride not found', code: 'RIDE_NOT_FOUND' });
  res.json(row);
});

// Delete a ride
router.delete('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;
  const row = await ridesRepo.deleteRide(id, userId);
  if (!row) return res.status(404).json({ error: 'Ride not found', code: 'RIDE_NOT_FOUND' });
  res.json({ success: true });
});

// (Optional) Import rides for current user
router.post('/import', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const ridesToImport = req.body;
  if (!Array.isArray(ridesToImport)) {
    return res.status(400).json({ error: 'Expected array of rides', code: 'BAD_REQUEST' });
  }
  let imported = 0;
  for (const ride of ridesToImport) {
    await ridesRepo.importRide(userId, {
      title: ride.title,
      location: ride.location,
      locationLink: ride.locationLink,
      details: ride.details,
      start: ride.start,
    });
    imported++;
  }

  // Автоматически обновляем цели после импорта поездок
  await updateUserGoals(userId);

  res.json({ success: true, imported });
});

module.exports = router;
