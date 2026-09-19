// ===============================
// EVENTS MANAGEMENT ENDPOINTS
// ===============================
// Extracted from server.js (T-4.1). Distinct from /api/calendar
// (routes/calendar.js) — see repositories/events.js's header.
const express = require('express');
const router = express.Router();
const logger = require('../lib/logger');
const { authMiddleware } = require('../middleware/auth');
const { patchAsyncRoutes } = require('../lib/asyncRoutes');
const eventsRepo = require('../repositories/events');
const { contract: c } = require('@bikelab/shared/api');
const { contract } = require('../middleware/contract');
patchAsyncRoutes(router);

const colorRegex = /^#[0-9A-Fa-f]{6}$/;

// GET /api/events - Получить все события пользователя
router.get('/', authMiddleware, contract(c.events.list), async (req, res) => {
  try {
    const userId = req.user.userId;
    const rows = await eventsRepo.listEvents(userId);
    res.json(rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching events:');
    res.status(500).json({ error: 'Failed to fetch events', code: 'INTERNAL' });
  }
});

// POST /api/events - Создать новое событие
router.post('/', authMiddleware, contract(c.events.create), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { title, start_date, background_color } = req.body;

    // Валидация
    if (!title || !start_date) {
      return res.status(400).json({ error: 'Title and start_date are required', code: 'VALIDATION_ERROR' });
    }

    // Проверяем цвет (должен быть hex формата)
    if (background_color && !colorRegex.test(background_color)) {
      return res.status(400).json({ error: 'Invalid background_color format', code: 'VALIDATION_ERROR' });
    }

    const row = await eventsRepo.createEvent(userId, req.body);
    res.status(201).json(row);
  } catch (error) {
    logger.error({ err: error }, 'Error creating event:');
    res.status(500).json({ error: 'Failed to create event', code: 'INTERNAL' });
  }
});

// PUT /api/events/:id - Обновить событие
router.put('/:id', authMiddleware, contract(c.events.update), async (req, res) => {
  try {
    const userId = req.user.userId;
    const eventId = req.params.id;
    const { title, start_date, background_color } = req.body;

    // Проверяем что событие принадлежит пользователю
    const existingEvent = await eventsRepo.getEvent(eventId, userId);

    if (!existingEvent) {
      return res.status(404).json({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    }

    // Валидация
    if (!title || !start_date) {
      return res.status(400).json({ error: 'Title and start_date are required', code: 'VALIDATION_ERROR' });
    }

    // Проверяем цвет
    if (background_color && !colorRegex.test(background_color)) {
      return res.status(400).json({ error: 'Invalid background_color format', code: 'VALIDATION_ERROR' });
    }

    const row = await eventsRepo.updateEvent(eventId, userId, req.body);
    res.json(row);
  } catch (error) {
    logger.error({ err: error }, 'Error updating event:');
    res.status(500).json({ error: 'Failed to update event', code: 'INTERNAL' });
  }
});

// DELETE /api/events/:id - Удалить событие
router.delete('/:id', authMiddleware, contract(c.events.remove), async (req, res) => {
  try {
    const userId = req.user.userId;
    const eventId = req.params.id;

    const deleted = await eventsRepo.deleteEvent(eventId, userId);

    if (!deleted) {
      return res.status(404).json({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    }

    res.json({ message: 'Event deleted successfully', event: deleted });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting event:');
    res.status(500).json({ error: 'Failed to delete event', code: 'INTERNAL' });
  }
});

module.exports = router;
