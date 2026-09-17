// --- Calendar (CALENDAR_SPEC.md §2) -----------------------------------------
// Coach-managed calendar: planned rides, rest days, maintenance, purchases,
// races, notes. Separate from /api/rides (server.js) — see the
// calendar_events table comment in the startup migration for why the two
// coexist. Extracted from server.js (T-4.1).
const express = require('express');
const router = express.Router();
const logger = require('../lib/logger');
const { authMiddleware } = require('../middleware/auth');
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const { validateBody } = require('../middleware/validate');
const { CalendarEventCreateSchema, CalendarEventUpdateSchema } = require('@bikelab/shared/types');
const calendarRepo = require('../repositories/calendar');
patchAsyncRoutes(router);

// All four handlers below are wrapped in try/catch — they weren't before,
// which meant any DB error (a genuinely transient one, or a migration that
// hadn't finished/landed yet, e.g. the goal_id column rollout) surfaced as
// an unhandled promise rejection. Node terminates the whole process on an
// unhandled rejection by default (since Node 15) rather than just failing
// that one request, which took the entire server down over what should
// have been a single 500 response.
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const to = req.query.to || new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0];
    const rows = await calendarRepo.listEvents(userId, {
      goalId: req.query.goal_id,
      from,
      to,
      type: req.query.type,
    });
    res.json(rows);
  } catch (err) {
    logger.error({ err: err.message }, '[calendar] GET failed:');
    res.status(500).json({ error: 'Failed to load calendar events', code: 'INTERNAL' });
  }
});

router.post('/', authMiddleware, validateBody(CalendarEventCreateSchema), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { title, start_date } = req.body;
    if (!title || !start_date) {
      return res.status(400).json({ error: 'title and start_date are required', code: 'VALIDATION_ERROR' });
    }
    const row = await calendarRepo.createEvent(userId, req.body);
    res.json(row);
  } catch (err) {
    logger.error({ err: err.message }, '[calendar] POST failed:');
    res.status(500).json({ error: 'Failed to create calendar event', code: 'INTERNAL' });
  }
});

router.put('/:id', authMiddleware, validateBody(CalendarEventUpdateSchema), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { noFields, row } = await calendarRepo.updateEvent(id, userId, req.body);
    if (noFields) return res.status(400).json({ error: 'No fields to update', code: 'BAD_REQUEST' });
    if (!row) return res.status(404).json({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    res.json(row);
  } catch (err) {
    logger.error({ err: err.message }, '[calendar] PUT failed:');
    res.status(500).json({ error: 'Failed to update calendar event', code: 'INTERNAL' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const deleted = await calendarRepo.deleteEvent(id, userId);
    if (!deleted) return res.status(404).json({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    // Events backfilled from the legacy `rides` table (migrated_from_ride_id
    // set) must also drop the source row — otherwise the startup migration's
    // `WHERE NOT EXISTS (... migrated_from_ride_id ...)` backfill guard sees
    // no calendar_events row referencing that ride on the next server restart
    // and silently recreates the "deleted" event from `rides`.
    const migratedRideId = deleted.migrated_from_ride_id;
    if (migratedRideId) {
      try {
        await calendarRepo.deleteMigratedRide(migratedRideId, userId);
      } catch (e) {
        logger.error({ err: e.message }, '[calendar] Failed to delete source rides row:');
      }
    }
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err.message }, '[calendar] DELETE failed:');
    res.status(500).json({ error: 'Failed to delete calendar event', code: 'INTERNAL' });
  }
});

module.exports = router;
